import type { LigneStock, StatutStock } from '@dqa/contracts';

/**
 * Arborescence du suivi des stocks, à deux lectures : site, puis programme,
 * puis produit ; ou programme, puis site, puis produit. Les lignes arrivent
 * de l'API triées par site, programme, produit, avec leur statut ; on ne fait
 * que les regrouper et les mettre en forme, sans recalcul.
 */
export type LectureStocks = 'site' | 'programme';

/** Second niveau : un programme d'un site, ou un site d'un programme. */
export interface SousGroupeStocks {
  cle: string;
  titre: string;
  sousTitre: string | null;
  produits: LigneStock[];
}

/** Premier niveau, dépliable : un site, ou un programme. */
export interface GroupeStocks {
  cle: string;
  titre: string;
  sousTitre: string | null;
  sousGroupes: SousGroupeStocks[];
  nbProduits: number;
  /** Nombre de produits par statut, pour le résumé replié. */
  parStatut: Record<StatutStock, number>;
  /** Rupture à venir la plus proche (signalée ou à surveiller). */
  premiereRupture: string | null;
}

export const PROGRAMME_NON_RENSEIGNE = 'Programme non renseigné';

const compteurVide = (): Record<StatutStock, number> => ({
  en_rupture: 0, rupture_signalee: 0, a_surveiller: 0, sans_risque: 0, non_calculable: 0,
});

const localisation = (l: LigneStock): string =>
  `${l.district ?? 'District non renseigné'} · ${l.region ?? 'Région non renseignée'}`;

const site = (l: LigneStock) => ({ cle: l.siteId, titre: l.siteNom, sousTitre: localisation(l) });
const programme = (l: LigneStock) => ({
  cle: l.programmeId ?? '', titre: l.programmeNom ?? PROGRAMME_NON_RENSEIGNE, sousTitre: null,
});

export function grouper(lignes: readonly LigneStock[], lecture: LectureStocks): GroupeStocks[] {
  const [niveau1, niveau2] = lecture === 'site' ? [site, programme] : [programme, site];
  const groupes = new Map<string, GroupeStocks>();
  for (const l of lignes) {
    const n1 = niveau1(l);
    let g = groupes.get(n1.cle);
    if (!g) {
      g = { ...n1, sousGroupes: [], nbProduits: 0, parStatut: compteurVide(), premiereRupture: null };
      groupes.set(n1.cle, g);
    }
    const n2 = niveau2(l);
    let sg = g.sousGroupes.find((x) => x.cle === n2.cle);
    if (!sg) {
      sg = { ...n2, produits: [] };
      g.sousGroupes.push(sg);
    }
    sg.produits.push(l);
    g.nbProduits += 1;
    g.parStatut[l.statut] += 1;
    if ((l.statut === 'rupture_signalee' || l.statut === 'a_surveiller') && l.cmm.calculable && l.cmm.dateRupture) {
      const r = l.cmm.dateRupture;
      if (g.premiereRupture === null || r < g.premiereRupture) g.premiereRupture = r;
    }
  }
  const resultat = [...groupes.values()];
  // par programme : ordre alphabétique, « non renseigné » en dernier ; les sites
  // gardent l'ordre de l'API (région, district, nom)
  if (lecture === 'programme') {
    resultat.sort((a, b) => (a.cle === '') !== (b.cle === '') ? (a.cle === '' ? 1 : -1) : a.titre.localeCompare(b.titre, 'fr'));
  }
  return resultat;
}

/** Lecture par site : conservée pour les appels existants. */
export const grouperParSite = (lignes: readonly LigneStock[]): GroupeStocks[] => grouper(lignes, 'site');

/**
 * Encadré de tête : les couples en rupture puis à signaler (couverture
 * croissante), et à part ceux à surveiller (rupture la plus proche d'abord).
 */
export function couplesASignaler(lignes: readonly LigneStock[]): { urgents: LigneStock[]; aSurveiller: LigneStock[] } {
  const couverture = (l: LigneStock) => (l.cmm.calculable ? l.cmm.couvertureJours : Number.POSITIVE_INFINITY);
  const parCouverture = (a: LigneStock, b: LigneStock) => couverture(a) - couverture(b) || a.siteNom.localeCompare(b.siteNom, 'fr');
  return {
    urgents: lignes.filter((l) => l.statut === 'en_rupture' || l.statut === 'rupture_signalee').sort(parCouverture),
    aSurveiller: lignes.filter((l) => l.statut === 'a_surveiller').sort(parCouverture),
  };
}

export const LIBELLES_STATUT: Record<StatutStock, string> = {
  en_rupture: 'En rupture',
  rupture_signalee: 'Rupture signalée',
  a_surveiller: 'À surveiller',
  sans_risque: 'Sans risque',
  non_calculable: 'Non calculable',
};

/** « 2 ruptures signalées », « 1 en rupture » : compte d'un statut dans un résumé. */
export function compteStatut(statut: StatutStock, n: number): string {
  const pluriel = n > 1;
  const libelle: Record<StatutStock, string> = {
    en_rupture: 'en rupture',
    rupture_signalee: pluriel ? 'ruptures signalées' : 'rupture signalée',
    a_surveiller: 'à surveiller',
    sans_risque: 'sans risque',
    non_calculable: pluriel ? 'non calculables' : 'non calculable',
  };
  return `${n} ${libelle[statut]}`;
}

/** Jetons de statut du thème (DESIGN_SYSTEM §2) : une couleur = un jeton. */
export const COULEURS_STATUT: Record<StatutStock, string> = {
  en_rupture: 'bg-alerte-fond text-alerte-texte',
  rupture_signalee: 'bg-alerte-fond text-alerte-texte',
  a_surveiller: 'bg-partiel-fond text-partiel-texte',
  sans_risque: 'bg-conforme-fond text-conforme-texte',
  non_calculable: 'bg-nc-fond text-nc-texte',
};

/** `AAAA-MM-JJ` vers `JJ/MM/AAAA`. */
export const dateFr = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export const nombre = (v: number): string => NOMBRE.format(v);

/** Écart signé stock projeté - stock mSupply : négatif = mSupply surestime le stock. */
export function ecartPhoto(projete: number | null, msupply: number): string {
  if (projete === null) return '';
  const e = Math.round((projete - msupply) * 10) / 10;
  return e > 0 ? `+${nombre(e)}` : nombre(e);
}

/** « sur 2 mois » ; moins d'un mois arrondi affiché en jours. */
export function duree(jours: number, nbMois: number): string {
  return nbMois >= 1 ? `sur ${nbMois} mois` : `sur ${jours} jours`;
}

const RAISONS: Record<'un_seul_inventaire' | 'sorties_non_positives', string> = {
  un_seul_inventaire: 'un seul inventaire dans les 90 jours',
  sorties_non_positives: 'sorties reconstituées nulles ou négatives',
};
export const raisonNonCalculable = (r: keyof typeof RAISONS): string => `non calculable : ${RAISONS[r]}`;
