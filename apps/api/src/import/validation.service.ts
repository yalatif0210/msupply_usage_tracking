import { Injectable } from '@nestjs/common';
import type { AnomalieImport } from '@dqa/contracts';
import type { ClasseurLu } from './lecture-classeur.js';
import { COMPTEURS_METADATA, JEUX, NATURES, type DefinitionJeu } from './contrat-jeux.js';

export interface ContexteMois {
  cyclePaqd: string;
  moisPaqd: string; // 'AAAA-MM' résolu depuis mois_debut
  moisDebut: string;
  moisFin: string;
}

export interface ResultatValidation {
  anomalies: AnomalieImport[];
  bloquant: boolean;
  contexte: ContexteMois | null;
}

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MOIS_CYCLE: Record<string, number[]> = {
  '1': [1, 2, 3, 4],
  '2': [5, 6, 7, 8],
  '3': [9, 10, 11, 12],
};

function ano(
  partial: Omit<AnomalieImport, 'ligneSource' | 'valeurBrute'> &
    Partial<Pick<AnomalieImport, 'ligneSource' | 'valeurBrute'>>,
): AnomalieImport {
  return { ligneSource: null, valeurBrute: null, ...partial };
}

function dernierJourDuMois(annee: number, mois: number): string {
  const d = new Date(Date.UTC(annee, mois, 0));
  return `${annee}-${String(mois).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

@Injectable()
export class ValidationService {
  valider(classeur: ClasseurLu, maintenant: Date = new Date()): ResultatValidation {
    const anomalies: AnomalieImport[] = [];

    anomalies.push(...this.reglesMois(classeur, maintenant));
    anomalies.push(...this.reglesOngletsEtColonnes(classeur));
    anomalies.push(...this.reglesCompteurs(classeur));
    anomalies.push(...this.reglesFormats(classeur));
    anomalies.push(...this.reglesReferencesCroisees(classeur));
    anomalies.push(...this.reglesRequisitions(classeur));

    const bloquant = anomalies.some((a) => a.gravite === 'erreur');
    return { anomalies, bloquant, contexte: bloquant ? null : this.contexte(classeur) };
  }

  // ── R3/R4 : mois PAQD et bornes ──────────────────────────────────────────
  private reglesMois(classeur: ClasseurLu, maintenant: Date): AnomalieImport[] {
    const m = classeur.metadata;
    const cycle = m.get('cycle_paqd')?.trim() ?? '';
    const rang = m.get('mois_paqd')?.trim() ?? '';
    const debut = m.get('mois_debut')?.trim() ?? '';
    const fin = m.get('mois_fin')?.trim() ?? '';
    const out: AnomalieImport[] = [];

    const cy = /^(\d{4})-C([123])$/.exec(cycle);
    const rg = /^M\+([1-4])$/.exec(rang);
    if (!cy) {
      out.push(ano({ onglet: 'METADATA', gravite: 'erreur', code: 'CYCLE_PAQD_INVALIDE',
        message: `cycle_paqd absent ou mal formé (attendu AAAA-CN) : « ${cycle} »` }));
    }
    if (!rg) {
      out.push(ano({ onglet: 'METADATA', gravite: 'erreur', code: 'MOIS_PAQD_INVALIDE',
        message: `mois_paqd absent ou mal formé (attendu M+1..M+4) : « ${rang} »` }));
    }
    if (!cy || !rg) return out;

    const annee = Number(cy[1]);
    const moisAttendu = MOIS_CYCLE[cy[2] ?? '']![Number(rg[1]) - 1]!;
    const attenduDebut = `${annee}-${String(moisAttendu).padStart(2, '0')}-01`;
    const attenduFin = dernierJourDuMois(annee, moisAttendu);

    if (!RE_DATE.test(debut) || debut !== attenduDebut) {
      out.push(ano({ onglet: 'METADATA', gravite: 'erreur', code: 'BORNES_MOIS_INCOHERENTES',
        message: `mois_debut « ${debut} » incohérent avec ${cycle} ${rang} (attendu ${attenduDebut})` }));
    }
    if (!RE_DATE.test(fin) || fin !== attenduFin) {
      out.push(ano({ onglet: 'METADATA', gravite: 'erreur', code: 'BORNES_MOIS_INCOHERENTES',
        message: `mois_fin « ${fin} » incohérent avec ${cycle} ${rang} (attendu ${attenduFin})` }));
    }

    // pas dans le futur, pas plus ancien que le mois précédent l'extraction
    const ancre = this.dateExtraction(classeur) ?? maintenant;
    const moisAncre = ancre.getUTCFullYear() * 12 + ancre.getUTCMonth();
    const moisCible = annee * 12 + (moisAttendu - 1);
    if (moisCible > moisAncre) {
      out.push(ano({ onglet: 'METADATA', gravite: 'erreur', code: 'MOIS_PAQD_FUTUR',
        message: `le mois mesuré (${attenduDebut.slice(0, 7)}) est postérieur à l'extraction` }));
    } else if (moisAncre - moisCible > 1) {
      out.push(ano({ onglet: 'METADATA', gravite: 'erreur', code: 'MOIS_PAQD_TROP_ANCIEN',
        message: `le mois mesuré (${attenduDebut.slice(0, 7)}) est antérieur au mois précédant l'extraction` }));
    }
    return out;
  }

  // ── R2 : onglets et colonnes ─────────────────────────────────────────────
  private reglesOngletsEtColonnes(classeur: ClasseurLu): AnomalieImport[] {
    const out: AnomalieImport[] = [];
    for (const def of JEUX) {
      const onglet = classeur.onglets.get(def.onglet);
      if (!onglet) {
        out.push(ano({ onglet: def.onglet, gravite: 'erreur', code: 'ONGLET_MANQUANT',
          message: `onglet obligatoire « ${def.onglet} » absent du classeur` }));
        continue;
      }
      const presentes = new Set(onglet.entetes.filter((e) => e !== ''));
      for (const col of def.colonnes) {
        if (!presentes.has(col)) {
          out.push(ano({ onglet: def.onglet, ligneSource: 5, gravite: 'erreur', code: 'COLONNE_MANQUANTE',
            message: `colonne « ${col} » absente ou renommée en ligne 5`, valeurBrute: onglet.entetes.join(', ') }));
        }
      }
    }
    return out;
  }

  // ── R1 : compteurs METADATA ──────────────────────────────────────────────
  private reglesCompteurs(classeur: ClasseurLu): AnomalieImport[] {
    const out: AnomalieImport[] = [];
    for (const [nomJeu, champCompteur] of Object.entries(COMPTEURS_METADATA)) {
      const onglet = classeur.onglets.get(nomJeu);
      if (!onglet) continue; // déjà signalé par R2
      const declare = classeur.metadata.get(champCompteur);
      const reel = onglet.lignes.length;
      if (declare === undefined || declare.trim() === '') {
        out.push(ano({ onglet: 'METADATA', gravite: 'erreur', code: 'COMPTEUR_METADATA_MANQUANT',
          message: `compteur « ${champCompteur} » absent ou vide dans METADATA` }));
      } else if (Number(declare) !== reel) {
        out.push(ano({ onglet: nomJeu, gravite: 'erreur', code: 'COMPTEUR_METADATA',
          message: `${declare} ligne(s) déclarée(s) dans METADATA, ${reel} reçue(s)`,
          valeurBrute: declare }));
      }
    }
    return out;
  }

  // ── R6/R7 : formats de champ et vocabulaire nature ──────────────────────
  private reglesFormats(classeur: ClasseurLu): AnomalieImport[] {
    const out: AnomalieImport[] = [];
    const naturesConnues = new Set<string>(NATURES);
    for (const def of JEUX) {
      const onglet = classeur.onglets.get(def.onglet);
      if (!onglet) continue;
      for (const ligne of onglet.lignes) {
        for (const col of def.requis) {
          if ((ligne.valeurs[col] ?? '') === '') {
            out.push(ano({ onglet: def.onglet, ligneSource: ligne.ligneSource, gravite: 'avertissement',
              code: 'CHAMP_REQUIS_VIDE', message: `« ${col} » vide` }));
          }
        }
        for (const col of def.dates ?? []) {
          const v = ligne.valeurs[col] ?? '';
          if (v !== '' && !RE_DATE.test(v)) {
            out.push(ano({ onglet: def.onglet, ligneSource: ligne.ligneSource, gravite: 'avertissement',
              code: 'DATE_MAL_FORMEE', message: `« ${col} » n'est pas au format AAAA-MM-JJ`, valeurBrute: v }));
          }
        }
        for (const col of def.nombres ?? []) {
          const v = ligne.valeurs[col] ?? '';
          if (v !== '' && !Number.isFinite(Number(v))) {
            out.push(ano({ onglet: def.onglet, ligneSource: ligne.ligneSource, gravite: 'avertissement',
              code: 'NOMBRE_INVALIDE', message: `« ${col} » n'est pas un nombre`, valeurBrute: v }));
          }
        }
        for (const col of def.booleens ?? []) {
          const v = (ligne.valeurs[col] ?? '').toUpperCase();
          if (v !== '' && v !== 'OUI' && v !== 'NON') {
            out.push(ano({ onglet: def.onglet, ligneSource: ligne.ligneSource, gravite: 'avertissement',
              code: 'BOOLEEN_INVALIDE', message: `« ${col} » attendu OUI/NON`, valeurBrute: ligne.valeurs[col] ?? '' }));
          }
        }
        if (def.onglet === 'TRANSACTIONS') {
          const n = ligne.valeurs['nature'] ?? '';
          if (n !== '' && !naturesConnues.has(n)) {
            out.push(ano({ onglet: 'TRANSACTIONS', ligneSource: ligne.ligneSource, gravite: 'avertissement',
              code: 'NATURE_INCONNUE', message: `nature « ${n} » hors vocabulaire`, valeurBrute: n }));
          }
        }
      }
    }
    return out;
  }

  // ── R5 : références croisées ─────────────────────────────────────────────
  private reglesReferencesCroisees(classeur: ClasseurLu): AnomalieImport[] {
    const out: AnomalieImport[] = [];
    const cles = new Map<string, Set<string>>(); // `${jeu}.${cle}` -> valeurs présentes
    const ensembleCle = (jeu: string, cle: string): Set<string> => {
      const k = `${jeu}.${cle}`;
      let s = cles.get(k);
      if (!s) {
        s = new Set<string>();
        const onglet = classeur.onglets.get(jeu);
        for (const l of onglet?.lignes ?? []) {
          const v = l.valeurs[cle] ?? '';
          if (v !== '') s.add(v);
        }
        cles.set(k, s);
      }
      return s;
    };

    for (const def of JEUX) {
      const onglet = classeur.onglets.get(def.onglet);
      if (!onglet || !def.references) continue;
      for (const ref of def.references) {
        const refset = ensembleCle(ref.jeu, ref.cle);
        for (const ligne of onglet.lignes) {
          const v = ligne.valeurs[ref.colonne] ?? '';
          if (v !== '' && !refset.has(v)) {
            out.push(ano({ onglet: def.onglet, ligneSource: ligne.ligneSource, gravite: 'avertissement',
              code: 'REFERENCE_CROISEE', message: `${ref.colonne} « ${v} » absent de ${ref.jeu}`, valeurBrute: v }));
          }
        }
      }
    }
    return out;
  }

  // ── R8 : mois couvert des réquisitions ──────────────────────────────────
  // Une réquisition couvre le mois de son inventaire de référence de fin de
  // mois (`mois_couvert_debut`). La fenêtre d'extraction est glissante (45
  // jours) et déborde volontairement du mois mesuré : un même classeur peut
  // légitimement porter des réquisitions du mois PAQD et des deux mois
  // précédents (rattrapage), y compris à cheval sur deux cycles. On accepte
  // donc `mois_couvert_debut` dans [mois PAQD - 2, mois PAQD] ; en dehors (ou
  // absent / mal formé), on signale sans bloquer : la ligne est écartée de la
  // promotion, l'import reste valide.
  private reglesRequisitions(classeur: ClasseurLu): AnomalieImport[] {
    const onglet = classeur.onglets.get('REQUISITIONS');
    if (!onglet) return []; // absence d'onglet déjà signalée par R2
    const moisDebut = classeur.metadata.get('mois_debut')?.trim() ?? '';
    const md = /^(\d{4})-(\d{2})-\d{2}$/.exec(moisDebut);
    if (!md) return []; // bornes du mois elles-mêmes invalides → déjà bloquant (R4)
    const idxPaqd = Number(md[1]) * 12 + Number(md[2]) - 1;
    const out: AnomalieImport[] = [];
    for (const ligne of onglet.lignes) {
      const v = ligne.valeurs['mois_couvert_debut'] ?? '';
      const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(v);
      if (!m) {
        out.push(ano({ onglet: 'REQUISITIONS', ligneSource: ligne.ligneSource, gravite: 'avertissement',
          code: 'MOIS_COUVERT_INVALIDE',
          message: `mois_couvert_debut absent ou mal formé (attendu AAAA-MM-JJ) : « ${v} »`,
          valeurBrute: v || null }));
        continue;
      }
      const idxCouvert = Number(m[1]) * 12 + Number(m[2]) - 1;
      if (idxCouvert > idxPaqd || idxCouvert < idxPaqd - 2) {
        out.push(ano({ onglet: 'REQUISITIONS', ligneSource: ligne.ligneSource, gravite: 'avertissement',
          code: 'MOIS_COUVERT_INVALIDE',
          message: `mois_couvert_debut « ${v} » hors de la fenêtre d'extraction (au plus 2 mois avant ${moisDebut.slice(0, 7)})`,
          valeurBrute: v }));
      }
    }
    return out;
  }

  private dateExtraction(classeur: ClasseurLu): Date | null {
    const v = classeur.metadata.get('date_extraction')?.trim() ?? '';
    if (!RE_DATE.test(v)) return null;
    return new Date(`${v}T00:00:00Z`);
  }

  private contexte(classeur: ClasseurLu): ContexteMois | null {
    const m = classeur.metadata;
    const debut = m.get('mois_debut')?.trim() ?? '';
    if (!RE_DATE.test(debut)) return null;
    return {
      cyclePaqd: m.get('cycle_paqd')?.trim() ?? '',
      moisPaqd: debut.slice(0, 7),
      moisDebut: debut,
      moisFin: m.get('mois_fin')?.trim() ?? '',
    };
  }
}
