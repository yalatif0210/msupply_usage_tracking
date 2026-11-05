import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  LIBELLES_PILIER,
  LIBELLES_SOUS_COMPOSANTE,
  libelleMesureBrute,
  libelleSousComposante,
  MESURES_BRUTES,
  PILIER_DE_CODE,
  PILIER_DE_MESURE_BRUTE,
  PILIER_DE_SOUS_COMPOSANTE,
  PILIERS,
  SOUS_COMPOSANTES,
  SOUS_COMPOSANTES_DU_PILIER,
  type BlocSynthese,
  type Classification,
  type CodeDetailPilier,
  type CompteBrut,
  type DetailPilier,
  type DetailPilierP1,
  type DetailPilierP2,
  type DetailPilierP3,
  type DetailPilierP4,
  type DetailPilierP6,
  type DetailPilierQuery,
  type LigneAjustementP6,
  type DetailSite,
  type FicheProduitMois,
  type FicheProduitMoisQuery,
  type FiltreSites,
  type GrilleResume,
  type MethodeCalcul,
  type MethodeCalculQuery,
  type ReglesCalcul,
  type HistoriqueQuery,
  type HistoriqueSite,
  type LigneProduitP4P5,
  type MesureSousComposante,
  type MoisMesure,
  type ProduitEcarte,
  type RaisonExclusionConso,
  type Pilier,
  type Programme,
  type RepartitionClassification,
  type ScorePilier,
  type ScoreSite,
  type LigneRapports,
  type LigneStrateRapports,
  type SeuilSousComposante,
  type Site,
  type SousComposante,
  type SousComposanteBref,
  type SuiviReceptions,
  type StatutSousComposante,
  TOP_SOUS_COMPOSANTES_DIFFICULTE,
  type SyntheseNationale,
  type SyntheseQuery,
  type SyntheseRapports,
  type TableauDeBord,
} from '@dqa/contracts';
import { lireGrilleDuMois } from '../commun/lecture-grille.js';
import { PG_POOL } from '../database/database.module.js';

interface LigneSite {
  site_id: string;
  site_code: string | null;
  site_nom: string;
  district: string | null;
  region: string | null;
  type_structure: string | null;
}

/** Nombre de scores de pilier non nuls, calculé en SQL sur la ligne gelée `h`. */
const COMPTE_PILIERS_SQL = `(
    (h.p_completude  IS NOT NULL)::int + (h.p_promptitude IS NOT NULL)::int
  + (h.p_regularite  IS NOT NULL)::int + (h.p_ecart_sdu   IS NOT NULL)::int
  + (h.p_concordance IS NOT NULL)::int + (h.p_ajustements IS NOT NULL)::int
)`;

const versSite = (r: LigneSite): Site => ({
  siteId: r.site_id,
  siteCode: r.site_code,
  siteNom: r.site_nom,
  district: r.district,
  region: r.region,
  typeStructure: r.type_structure,
});

const nombreOuNull = (v: string | null): number | null => (v === null ? null : Number(v));

/** `AAAA-MM-JJ` vers `JJ/MM/AAAA`, pour les messages. */
const dateCourte = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Cause d'une conformité SDU, consommation ou concordance non chiffrée ou
 * sanctionnée, lue dans `mv_cloture_mois` / `mv_p4_ecart` / `mv_p5_concordance`
 * (migration 0062) ; l'API ne fait que la traduire en phrase.
 */
type CauseP4P5 =
  | 'calculee' | 'cloture' | 'non_jugee' | 'hors_fenetre' | 'sans_cloture'
  | 'sans_ouverture' | 'ouverture_non_jugee' | 'sans_produit_commun';

/** Clôture d'un site, d'un programme et d'un mois, pour expliquer P4 et P5. */
interface LigneCauses {
  cause_sdu: CauseP4P5 | null;
  cause_conso: CauseP4P5 | null;
  cause_concordance: CauseP4P5 | null;
  fenetre_debut: string;
  fenetre_fin: string;
  fin_jugee: string;
  date_hors_fenetre: string | null;
}

/** Valeur, note et sanction figées de chaque sous-composante (hist_score_site). */
type ColonnesSousComposantes =
  & { [K in SousComposante as `sc_${K}`]: string | null }
  & { [K in SousComposante as `note_${K}`]: string | null };

const NOMBRE_FR = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Les six colonnes de score de pilier gelées, telles que rendues par `pg`. */
interface PiliersBruts {
  p_completude: string | null;
  p_promptitude: string | null;
  p_regularite: string | null;
  p_ecart_sdu: string | null;
  p_concordance: string | null;
  p_ajustements: string | null;
}

const scoresPiliers = (r: PiliersBruts): { pilier: Pilier; score: number | null }[] => [
  { pilier: 'P1', score: nombreOuNull(r.p_completude) },
  { pilier: 'P2', score: nombreOuNull(r.p_promptitude) },
  { pilier: 'P3', score: nombreOuNull(r.p_regularite) },
  { pilier: 'P4', score: nombreOuNull(r.p_ecart_sdu) },
  { pilier: 'P5', score: nombreOuNull(r.p_concordance) },
  { pilier: 'P6', score: nombreOuNull(r.p_ajustements) },
];

/** Une sous-composante lue sur `v_sous_composante_atteinte` (jsonb, nombres déjà parsés). */
interface AtteinteBrute {
  valeur: number | null;
  seuil: number | null;
  tauxAtteinte: number | null;
  statut: StatutSousComposante;
}
type AtteintesParSc = Partial<Record<SousComposante, AtteinteBrute>>;

/**
 * Sous-requête agrégeant `v_sous_composante_atteinte` d'une ligne `h`
 * (site, mois, programme) en un objet jsonb `sc[sous_composante] = { ... }`.
 */
const ATTEINTE_JSONB_SQL = `
  LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(
             va.sous_composante,
             jsonb_build_object('valeur', va.valeur, 'seuil', va.seuil,
                                'tauxAtteinte', va.taux_atteinte, 'statut', va.statut)
           ) AS sc
    FROM dqa.v_sous_composante_atteinte va
    WHERE va.site_id = h.site_id AND va.mois_paqd = h.mois_paqd
      AND va.programme_id IS NOT DISTINCT FROM h.programme_id
  ) vsc ON true`;

/** Les dix `SousComposanteBref` d'un mois, ordre canonique, depuis l'agrégat jsonb. */
const sousComposantesDuMois = (m: AtteintesParSc | null): SousComposanteBref[] =>
  SOUS_COMPOSANTES.map((sc) => {
    const a = m?.[sc];
    return {
      sousComposante: sc,
      valeur: a?.valeur ?? null,
      seuil: a?.seuil ?? null,
      tauxAtteinte: a?.tauxAtteinte ?? null,
      statut: a?.statut ?? 'NON_CALCULABLE',
    };
  });

// ─── Synthèse nationale ────────────────────────────────────────────────────

/** Une ligne de `mv_synthese_nationale` telle que rendue par `pg` (comptes castés `::int`). */
interface LigneSynthese {
  nb_sites: number;
  nb_mesures: number;
  score_composite_moyen: string | null;
  nb_conforme: number;
  nb_partiellement_conforme: number;
  nb_non_conforme: number;
  nb_sans_mesure: number;
}

interface MoyennesPilierBrutes {
  moy_p_completude: string | null;
  moy_p_promptitude: string | null;
  moy_p_regularite: string | null;
  moy_p_ecart_sdu: string | null;
  moy_p_concordance: string | null;
  moy_p_ajustements: string | null;
  nb_p_completude: number;
  nb_p_promptitude: number;
  nb_p_regularite: number;
  nb_p_ecart_sdu: number;
  nb_p_concordance: number;
  nb_p_ajustements: number;
}

const moyennesPiliers = (
  r: MoyennesPilierBrutes | undefined,
): SyntheseNationale['national']['moyennesPiliers'] => [
  { pilier: 'P1', moyenne: nombreOuNull(r?.moy_p_completude ?? null), nbSites: r?.nb_p_completude ?? 0 },
  { pilier: 'P2', moyenne: nombreOuNull(r?.moy_p_promptitude ?? null), nbSites: r?.nb_p_promptitude ?? 0 },
  { pilier: 'P3', moyenne: nombreOuNull(r?.moy_p_regularite ?? null), nbSites: r?.nb_p_regularite ?? 0 },
  { pilier: 'P4', moyenne: nombreOuNull(r?.moy_p_ecart_sdu ?? null), nbSites: r?.nb_p_ecart_sdu ?? 0 },
  { pilier: 'P5', moyenne: nombreOuNull(r?.moy_p_concordance ?? null), nbSites: r?.nb_p_concordance ?? 0 },
  { pilier: 'P6', moyenne: nombreOuNull(r?.moy_p_ajustements ?? null), nbSites: r?.nb_p_ajustements ?? 0 },
];

/** Une ligne de `mv_synthese_sous_composante` telle que rendue par `pg` (comptes castés `::int`). */
interface LigneSousComposanteSyntheseBrute {
  sous_composante: SousComposante;
  taux_atteinte_moyen: string | null;
  nb_conforme: number;
  nb_alerte: number;
  nb_non_calculable: number;
}

const versLigneSousComposante = (r: LigneSousComposanteSyntheseBrute) => ({
  sousComposante: r.sous_composante,
  pilier: PILIER_DE_SOUS_COMPOSANTE[r.sous_composante],
  tauxAtteinteMoyen: nombreOuNull(r.taux_atteinte_moyen),
  nbConforme: r.nb_conforme,
  nbAlerte: r.nb_alerte,
  nbNonCalculable: r.nb_non_calculable,
});

const versBloc = (r: LigneSynthese | undefined): BlocSynthese => ({
  nbSites: r?.nb_sites ?? 0,
  nbMesures: r?.nb_mesures ?? 0,
  scoreCompositeMoyen: nombreOuNull(r?.score_composite_moyen ?? null),
  repartition: {
    CONFORME: r?.nb_conforme ?? 0,
    PARTIELLEMENT_CONFORME: r?.nb_partiellement_conforme ?? 0,
    NON_CONFORME: r?.nb_non_conforme ?? 0,
    SANS_MESURE: r?.nb_sans_mesure ?? 0,
  } satisfies RepartitionClassification,
});

// ─── Synthèse « rapports & inventaires » ───────────────────────────────────

/** Une ligne de `mv_synthese_rapports` telle que rendue par `pg` (comptes castés `::int`). */
interface LigneRapportsBrute {
  strate: string;
  req_attendu: number;
  req_realise: number;
  req_a_lheure: number;
  inv_attendu: number;
  inv_realise: number;
  inv_a_lheure: number;
}

const ligneRapportsVide = (): LigneRapports => ({
  requisitions: { attendu: 0, realise: 0, aLHeure: 0 },
  inventaires: { attendu: 0, realise: 0, aLHeure: 0 },
});

const versLigneStrateRapports = (r: LigneRapportsBrute): LigneStrateRapports => ({
  strate: r.strate,
  requisitions: {
    attendu: r.req_attendu,
    realise: r.req_realise,
    aLHeure: r.req_a_lheure,
  },
  inventaires: {
    attendu: r.inv_attendu,
    realise: r.inv_realise,
    aLHeure: r.inv_a_lheure,
  },
});

/** Somme terme à terme des triplets de deux lignes (pour la ligne de total). */
const cumulRapports = (a: LigneRapports, b: LigneRapports): LigneRapports => ({
  requisitions: {
    attendu: a.requisitions.attendu + b.requisitions.attendu,
    realise: a.requisitions.realise + b.requisitions.realise,
    aLHeure: a.requisitions.aLHeure + b.requisitions.aLHeure,
  },
  inventaires: {
    attendu: a.inventaires.attendu + b.inventaires.attendu,
    realise: a.inventaires.realise + b.inventaires.realise,
    aLHeure: a.inventaires.aLHeure + b.inventaires.aLHeure,
  },
});

@Injectable()
export class IndicateursRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async programmes(): Promise<Programme[]> {
    const { rows } = await this.pool.query<{ programme_id: string; programme_code: string | null; programme_nom: string }>(
      `SELECT programme_id, programme_code, programme_nom FROM dqa.dim_programme ORDER BY programme_nom`,
    );
    return rows.map((r) => ({
      programmeId: r.programme_id,
      programmeCode: r.programme_code,
      programmeNom: r.programme_nom,
    }));
  }

  async districts(): Promise<string[]> {
    const { rows } = await this.pool.query<{ district: string }>(
      `SELECT DISTINCT district FROM dqa.dim_site
       WHERE dans_perimetre_dqa AND district IS NOT NULL ORDER BY district`,
    );
    return rows.map((r) => r.district);
  }

  async regions(): Promise<string[]> {
    const { rows } = await this.pool.query<{ region: string }>(
      `SELECT DISTINCT region FROM dqa.dim_site
       WHERE dans_perimetre_dqa AND region IS NOT NULL ORDER BY region`,
    );
    return rows.map((r) => r.region);
  }

  async synthese(q: SyntheseQuery): Promise<SyntheseNationale> {
    const prog = q.programmeId ?? null;
    const region = q.region ?? null;

    const moisRows = await this.pool.query<{ mois_paqd: string }>(
      `SELECT DISTINCT mois_paqd FROM dqa.mv_synthese_nationale ORDER BY mois_paqd DESC`,
    );
    const moisDisponibles = moisRows.rows.map((r) => r.mois_paqd);
    const mois = q.mois && moisDisponibles.includes(q.mois) ? q.mois : await this.dernierMoisClos(moisDisponibles);

    if (!mois) {
      return {
        moisPaqd: null,
        moisDisponibles: [],
        programmeId: prog,
        region,
        national: { ...versBloc(undefined), moyennesPiliers: moyennesPiliers(undefined) },
        parDistrict: [],
        parProgramme: [],
        parSousComposante: [],
        suiviReceptions: await this.suiviNational(null, region),
      };
    }

    const national = await this.pool.query<LigneSynthese & MoyennesPilierBrutes>(
      `SELECT nb_sites::int, nb_mesures::int, score_composite_moyen,
              nb_conforme::int, nb_partiellement_conforme::int,
              nb_non_conforme::int, nb_sans_mesure::int,
              moy_p_completude, moy_p_promptitude, moy_p_regularite,
              moy_p_ecart_sdu, moy_p_concordance, moy_p_ajustements,
              nb_p_completude::int, nb_p_promptitude::int, nb_p_regularite::int,
              nb_p_ecart_sdu::int, nb_p_concordance::int, nb_p_ajustements::int
       FROM dqa.mv_synthese_nationale
       WHERE mois_paqd = $1 AND programme_id IS NOT DISTINCT FROM $2
         AND region IS NOT DISTINCT FROM $3 AND district IS NULL`,
      [mois, prog, region],
    );
    const nat = national.rows[0];

    const parDistrict = await this.pool.query<LigneSynthese & { district: string }>(
      `SELECT district, nb_sites::int, nb_mesures::int, score_composite_moyen,
              nb_conforme::int, nb_partiellement_conforme::int,
              nb_non_conforme::int, nb_sans_mesure::int
       FROM dqa.mv_synthese_nationale
       WHERE mois_paqd = $1 AND programme_id IS NOT DISTINCT FROM $2 AND district IS NOT NULL
         AND ($3::text IS NULL OR region = $3)
       ORDER BY score_composite_moyen ASC NULLS LAST, district`,
      [mois, prog, region],
    );

    const parProgramme = await this.pool.query<
      LigneSynthese & { programme_id: string; programme_nom: string }
    >(
      `SELECT sn.programme_id, p.programme_nom,
              sn.nb_sites::int, sn.nb_mesures::int, sn.score_composite_moyen,
              sn.nb_conforme::int, sn.nb_partiellement_conforme::int,
              sn.nb_non_conforme::int, sn.nb_sans_mesure::int
       FROM dqa.mv_synthese_nationale sn
       JOIN dqa.dim_programme p ON p.programme_id = sn.programme_id
       WHERE sn.mois_paqd = $1 AND sn.programme_id IS NOT NULL AND sn.district IS NULL
         AND sn.region IS NOT DISTINCT FROM $2
       ORDER BY sn.score_composite_moyen ASC NULLS LAST, p.programme_nom`,
      [mois, region],
    );

    const parSousComposante = await this.pool.query<LigneSousComposanteSyntheseBrute>(
      `SELECT sous_composante, taux_atteinte_moyen,
              nb_conforme::int, nb_alerte::int, nb_non_calculable::int
       FROM dqa.mv_synthese_sous_composante
       WHERE mois_paqd = $1 AND programme_id IS NOT DISTINCT FROM $2
         AND region IS NOT DISTINCT FROM $3 AND district IS NULL
       ORDER BY taux_atteinte_moyen ASC NULLS LAST, sous_composante`,
      [mois, prog, region],
    );

    return {
      moisPaqd: mois,
      moisDisponibles,
      programmeId: prog,
      region,
      national: { ...versBloc(nat), moyennesPiliers: moyennesPiliers(nat) },
      parDistrict: parDistrict.rows.map((r) => ({ district: r.district, ...versBloc(r) })),
      parProgramme: parProgramme.rows.map((r) => ({
        programmeId: r.programme_id,
        programmeNom: r.programme_nom,
        ...versBloc(r),
      })),
      parSousComposante: parSousComposante.rows.map(versLigneSousComposante),
      suiviReceptions: await this.suiviNational(mois, region),
    };
  }

  /**
   * Suivi des réceptions au niveau national ou régional, hors score (ADR
   * 0019). Les factures en attente sont un état courant (à la date
   * d'extraction du dernier lot), pas une mesure du mois.
   */
  private async suiviNational(
    mois: string | null,
    region: string | null,
  ): Promise<SyntheseNationale['suiviReceptions']> {
    const req = await this.pool.query<{ nb_requisitions: number; nb_avec_facture: number }>(
      `SELECT coalesce(sum(v.nb_requisitions), 0)::int AS nb_requisitions,
              coalesce(sum(v.nb_avec_facture), 0)::int AS nb_avec_facture
       FROM dqa.v_suivi_requisitions_factures v
       JOIN dqa.dim_site s ON s.site_id = v.site_id
       WHERE v.mois_paqd = $1 AND ($2::text IS NULL OR s.region = $2)`,
      [mois, region],
    );
    const attente = await this.pool.query<{ nb: number; nb_alerte: number }>(
      `SELECT count(*)::int AS nb, (count(*) FILTER (WHERE v.en_alerte))::int AS nb_alerte
       FROM dqa.v_factures_en_attente v
       JOIN dqa.dim_site s ON s.site_id = v.site_id
       WHERE $1::text IS NULL OR s.region = $1`,
      [region],
    );
    const { delai } = await this.parametresSuivi();
    return {
      nbRequisitions: req.rows[0]?.nb_requisitions ?? 0,
      nbAvecFacture: req.rows[0]?.nb_avec_facture ?? 0,
      nbFacturesEnAttente: attente.rows[0]?.nb ?? 0,
      nbFacturesEnAlerte: attente.rows[0]?.nb_alerte ?? 0,
      delaiAlerteJours: delai,
    };
  }

  /**
   * Onglet national « Rapports & inventaires » : `mv_synthese_rapports` agrège
   * les comptes P1 / P2 des réquisitions et des inventaires de fin de mois par
   * strate de structure. `mois` par défaut = le plus récent gelé ; `region` /
   * `programmeId` narrows via des lignes GROUPING SETS dédiées. La ligne de
   * total est la somme des strates affichées (ré-agrégation, jamais une
   * moyenne de moyennes).
   */
  async syntheseRapports(q: SyntheseQuery): Promise<SyntheseRapports> {
    const prog = q.programmeId ?? null;
    const region = q.region ?? null;

    const moisRows = await this.pool.query<{ mois_paqd: string }>(
      `SELECT DISTINCT mois_paqd FROM dqa.mv_synthese_rapports ORDER BY mois_paqd DESC`,
    );
    const moisDisponibles = moisRows.rows.map((r) => r.mois_paqd);
    const mois = q.mois && moisDisponibles.includes(q.mois) ? q.mois : await this.dernierMoisClos(moisDisponibles);

    if (!mois) {
      return {
        moisPaqd: null,
        moisDisponibles: [],
        programmeId: prog,
        region,
        strates: [],
        total: ligneRapportsVide(),
      };
    }

    const { rows } = await this.pool.query<LigneRapportsBrute>(
      `SELECT strate,
              req_attendu, req_realise, req_a_lheure,
              inv_attendu, inv_realise, inv_a_lheure
       FROM dqa.mv_synthese_rapports
       WHERE mois_paqd = $1
         AND region IS NOT DISTINCT FROM $2
         AND programme_id IS NOT DISTINCT FROM $3
       ORDER BY strate`,
      [mois, region, prog],
    );

    const strates = rows.map(versLigneStrateRapports);
    const total = strates.reduce<LigneRapports>(cumulRapports, ligneRapportsVide());

    return { moisPaqd: mois, moisDisponibles, programmeId: prog, region, strates, total };
  }

  /** Agrégat de la page d'accueil : état national du dernier mois, courbe et sous-composantes en difficulté. */
  /**
   * @param moisDemande Mois PAQD explicitement demandé (navigation vers le
   *   passé). Ignoré s'il ne figure pas dans l'historique gelé : on retombe
   *   alors sur le dernier mois disponible, jamais sur une page vide.
   */
  async tableauDeBord(moisDemande?: string): Promise<TableauDeBord> {
    // Les deux vues n'agrègent que les sites `dans_perimetre_dqa` (cf. 0021, 0026) ;
    // le grain national = programme / région / district tous nuls.
    const NATIONAL = `programme_id IS NULL AND region IS NULL AND district IS NULL`;

    const progression = await this.pool.query<{
      mois_paqd: string;
      score_composite_moyen: string | null;
      mois_clos: boolean;
    }>(
      `SELECT mois_paqd, score_composite_moyen, dqa.mois_est_clos(mois_paqd) AS mois_clos
       FROM dqa.mv_synthese_nationale
       WHERE ${NATIONAL}
       ORDER BY mois_paqd`,
    );
    const points = progression.rows.map((r) => ({
      moisPaqd: r.mois_paqd,
      scoreCompositeMoyen: nombreOuNull(r.score_composite_moyen),
      moisClos: r.mois_clos,
    }));
    const moisValide = moisDemande && points.some((p) => p.moisPaqd === moisDemande) ? moisDemande : null;
    // Par défaut le dernier mois clos (U1) : un mois en cours reste provisoire.
    const mois = moisValide ?? points.filter((p) => p.moisClos).at(-1)?.moisPaqd ?? points.at(-1)?.moisPaqd ?? null;

    if (mois === null) {
      return {
        moisPaqd: null,
        moisClos: true,
        national: versBloc(undefined),
        progression: [],
        sousComposantesEnDifficulte: [],
        regles: null,
      };
    }

    const national = await this.pool.query<LigneSynthese>(
      `SELECT nb_sites::int, nb_mesures::int, score_composite_moyen,
              nb_conforme::int, nb_partiellement_conforme::int,
              nb_non_conforme::int, nb_sans_mesure::int
       FROM dqa.mv_synthese_nationale
       WHERE mois_paqd = $1 AND ${NATIONAL}`,
      [mois],
    );

    const difficulte = await this.pool.query<LigneSousComposanteSyntheseBrute>(
      `SELECT sous_composante, taux_atteinte_moyen,
              nb_conforme::int, nb_alerte::int, nb_non_calculable::int
       FROM dqa.mv_synthese_sous_composante
       WHERE mois_paqd = $1 AND ${NATIONAL}
       ORDER BY nb_alerte DESC, sous_composante
       LIMIT ${TOP_SOUS_COMPOSANTES_DIFFICULTE}`,
      [mois],
    );

    return {
      moisPaqd: mois,
      moisClos: await this.moisEstClos(mois),
      national: versBloc(national.rows[0]),
      progression: points,
      sousComposantesEnDifficulte: difficulte.rows.map(versLigneSousComposante),
      regles: (await lireGrilleDuMois(this.pool, mois))?.regles ?? null,
    };
  }

  /**
   * `false` tant que le mois peut encore recevoir des données (délai de
   * réquisition non expiré, ADR 0010) : un score gelé sur ce mois est
   * provisoire, pas un verdict final.
   */
  private async moisEstClos(mois: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ clos: boolean }>('SELECT dqa.mois_est_clos($1) AS clos', [mois]);
    return rows[0]?.clos ?? true;
  }

  /** Date du jour selon la base : la même que celle des vues (`CURRENT_DATE`). */
  private async dateDuJour(): Promise<string> {
    const { rows } = await this.pool.query<{ d: string }>(`SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS d`);
    return rows[0]!.d;
  }

  /**
   * Phrase d'une cause P4 / P5 (ADR 0022). Sans ligne de clôture pour un
   * programme filtré : programme non géré par le site, rien n'est attendu.
   */
  private raisonP4P5(cause: CauseP4P5 | null | undefined, c: LigneCauses | undefined, noteSanction: number): string {
    if (!c || !cause) {
      return "Programme non éligible pour ce site (voir l'écran Programmes) : aucun inventaire de clôture attendu";
    }
    const fenetre = `du ${dateCourte(c.fenetre_debut)} au ${dateCourte(c.fenetre_fin)}`;
    const sanction = `sanction, note ${NOMBRE_FR.format(noteSanction)}`;
    switch (cause) {
      case 'calculee':
      case 'cloture':
        return "L'inventaire de clôture ne porte aucune quantité exploitable pour ce calcul";
      case 'non_jugee':
        return `Mois pas encore jugé : inventaire de clôture attendu ${fenetre}, imports à couvrir jusqu'au ${dateCourte(c.fin_jugee)}`;
      case 'hors_fenetre':
        return c.date_hors_fenetre
          ? `Inventaire du ${dateCourte(c.date_hors_fenetre)} hors de la fenêtre de clôture (${fenetre}) : ${sanction}`
          : `Aucun inventaire de clôture (${fenetre}) : ${sanction}`;
      case 'sans_cloture':
        return `Aucun inventaire de clôture portant un produit traceur (${fenetre}) : ${sanction}`;
      case 'sans_ouverture':
        return `Pas d'inventaire d'ouverture (clôture du mois précédent) : ${sanction}`;
      case 'ouverture_non_jugee':
        return "Ouverture non jugée : la fenêtre de clôture du mois précédent n'est pas entièrement couverte par les imports";
      case 'sans_produit_commun':
        return `Aucun produit commun aux inventaires d'ouverture et de clôture : ${sanction}`;
    }
  }

  /** Suivi des réceptions du site, hors score (ADR 0019). */
  private async suiviReceptions(siteId: string, mois: string | null): Promise<SuiviReceptions> {
    const req = await this.pool.query<{ nb_requisitions: number; nb_avec_facture: number }>(
      `SELECT nb_requisitions, nb_avec_facture FROM dqa.v_suivi_requisitions_factures
       WHERE site_id = $1 AND mois_paqd = $2`,
      [siteId, mois],
    );
    const { delai, reference } = await this.parametresSuivi();
    const factures = await this.pool.query<{
      reference: string | null;
      statut: string;
      mois_couvert: string | null;
      date_emission: string;
      anciennete_jours: number | null;
      en_alerte: boolean | null;
    }>(
      `SELECT nullif(commentaire, '') AS reference, statut, mois_couvert,
              to_char(date_emission, 'YYYY-MM-DD') AS date_emission, anciennete_jours, en_alerte
       FROM dqa.v_factures_en_attente
       WHERE site_id = $1
       ORDER BY date_emission, transaction_id`,
      [siteId],
    );
    return {
      nbRequisitions: req.rows[0]?.nb_requisitions ?? 0,
      nbAvecFacture: req.rows[0]?.nb_avec_facture ?? 0,
      dateReference: reference,
      delaiAlerteJours: delai,
      facturesEnAttente: factures.rows.map((f) => ({
        reference: f.reference,
        statut: f.statut,
        moisCouvert: f.mois_couvert,
        dateEmission: f.date_emission,
        ancienneteJours: f.anciennete_jours ?? 0,
        enAlerte: f.en_alerte ?? false,
      })),
    };
  }

  private async parametresSuivi(): Promise<{ delai: number; reference: string | null }> {
    const { rows } = await this.pool.query<{ delai: string | null; reference: string | null }>(
      `SELECT (SELECT valeur FROM dqa.parametre_suivi WHERE cle = 'delai_alerte_facture_jours') AS delai,
              (SELECT to_char(max(date_extraction), 'YYYY-MM-DD') FROM dqa.import_lot WHERE statut = 'valide') AS reference`,
    );
    return { delai: Number(rows[0]?.delai ?? 7), reference: rows[0]?.reference ?? null };
  }

  async moisMesures(): Promise<MoisMesure[]> {
    const { rows } = await this.pool.query<{ mois_paqd: string; clos: boolean }>(
      `SELECT DISTINCT h.mois_paqd, dqa.mois_est_clos(h.mois_paqd) AS clos
       FROM dqa.hist_score_site h
       JOIN dqa.dim_site s ON s.site_id = h.site_id AND s.dans_perimetre_dqa
       ORDER BY h.mois_paqd DESC`,
    );
    return rows.map((r) => ({ moisPaqd: r.mois_paqd, clos: r.clos }));
  }

  /**
   * Mois servi par défaut (U1) : le dernier mois clos, dont le score ne
   * bougera plus ; à défaut le dernier mois mesuré. Un mois demandé qui n'est
   * pas mesuré retombe sur ce défaut.
   */
  private async moisParDefaut(demande: string | undefined): Promise<string | null> {
    const mois = await this.moisMesures();
    if (demande && mois.some((m) => m.moisPaqd === demande)) return demande;
    return mois.find((m) => m.clos)?.moisPaqd ?? mois[0]?.moisPaqd ?? null;
  }

  /** Parmi des mois mesurés, le plus récent qui est clos (U1), à défaut le plus récent. */
  private async dernierMoisClos(mois: string[]): Promise<string | undefined> {
    if (mois.length === 0) return undefined;
    const { rows } = await this.pool.query<{ m: string }>(
      `SELECT m FROM unnest($1::text[]) AS m WHERE dqa.mois_est_clos(m) ORDER BY m DESC LIMIT 1`,
      [mois],
    );
    return rows[0]?.m ?? mois[0];
  }

  async listerSites(filtres: FiltreSites): Promise<ScoreSite[]> {
    const cond: string[] = ['s.dans_perimetre_dqa'];
    const params: unknown[] = [];
    if (filtres.district) {
      params.push(filtres.district);
      cond.push(`s.district = $${params.length}`);
    }
    if (filtres.region) {
      params.push(filtres.region);
      cond.push(`s.region = $${params.length}`);
    }
    params.push(filtres.programmeId ?? null);
    const idxProg = params.length;
    if (filtres.programmeId) {
      cond.push(`EXISTS (SELECT 1 FROM dqa.dim_site_programme sp
        WHERE sp.site_id = s.site_id AND sp.programme_id = $${idxProg} AND sp.actif)`);
    }
    // Tous les sites au même mois : un classement mêlant des mois différents
    // comparerait un mois clos à un mois provisoire.
    params.push(await this.moisParDefaut(filtres.mois));
    const idxMois = params.length;

    const { rows } = await this.pool.query<
      LigneSite & {
        mois_paqd: string | null;
        score_composite: string | null;
        classification: Classification | null;
        piliers_couverts: number | null;
        p_completude: string | null;
        p_promptitude: string | null;
        p_regularite: string | null;
        p_ecart_sdu: string | null;
        p_concordance: string | null;
        p_ajustements: string | null;
      }
    >(
      `WITH dernier AS (
         SELECT h.site_id, h.mois_paqd
         FROM dqa.hist_score_site h
         WHERE h.programme_id IS NOT DISTINCT FROM $${idxProg} AND h.mois_paqd = $${idxMois}
       )
       SELECT s.site_id, s.site_code, s.site_nom, s.district, s.region, s.type_structure,
              d.mois_paqd, h.score_composite, h.classification,
              ${COMPTE_PILIERS_SQL} AS piliers_couverts,
              h.p_completude, h.p_promptitude, h.p_regularite,
              h.p_ecart_sdu, h.p_concordance, h.p_ajustements
       FROM dqa.dim_site s
       LEFT JOIN dernier d ON d.site_id = s.site_id
       LEFT JOIN dqa.hist_score_site h
              ON h.site_id = s.site_id AND h.mois_paqd = d.mois_paqd
             AND h.programme_id IS NOT DISTINCT FROM $${idxProg}
       WHERE ${cond.join(' AND ')}
       ORDER BY h.score_composite ASC NULLS LAST, s.site_nom`,
      params,
    );

    return rows.map((r) => ({
      site: versSite(r),
      moisPaqd: r.mois_paqd,
      piliersCouverts: r.piliers_couverts ?? 0,
      scoreComposite: nombreOuNull(r.score_composite),
      classification: r.classification,
      scoresPiliers: scoresPiliers(r),
    }));
  }

  async detailSite(
    siteId: string,
    moisDemande: string | undefined,
    programmeId: string | undefined,
  ): Promise<DetailSite | null> {
    const site = await this.pool.query<LigneSite & { est_district: boolean }>(
      `SELECT site_id, site_code, site_nom, district, region, type_structure,
              dqa.est_district(type_structure) AS est_district
       FROM dqa.dim_site WHERE site_id = $1 AND dans_perimetre_dqa`,
      [siteId],
    );
    if (site.rowCount === 0) return null;
    const siteRow = site.rows[0]!;
    const estDistrict = siteRow.est_district;

    const prog = programmeId ?? null;
    const moisRows = await this.pool.query<{ mois_paqd: string }>(
      `SELECT DISTINCT mois_paqd FROM dqa.hist_score_site
       WHERE site_id = $1 AND programme_id IS NOT DISTINCT FROM $2
       ORDER BY mois_paqd DESC`,
      [siteId, prog],
    );
    const moisDisponibles = moisRows.rows.map((r) => r.mois_paqd);
    const mois =
      moisDemande && moisDisponibles.includes(moisDemande) ? moisDemande : moisDisponibles[0];

    if (!mois) {
      return {
        site: versSite(siteRow),
        moisPaqd: null,
        moisClos: true,
        estDistrict,
        moisDisponibles: [],
        programmeId: prog,
        piliersCouverts: 0,
        piliersTotal: 6,
        scoreComposite: null,
        classification: null,
        piliers: [],
        calcul: null,
        sousComposantes: sousComposantesDuMois(null),
        suiviReceptions: await this.suiviReceptions(siteId, null),
      };
    }

    const [hist, causes, comptesParPilier, moisClos, aujourdhui, suiviReceptions] = await Promise.all([
      this.pool.query<PiliersBruts & ColonnesSousComposantes & {
        sc: AtteintesParSc | null;
        grille_id: string;
        score_composite: string | null;
        classification: Classification | null;
        piliers_couverts: number | null;
        sanction_ecart_sdu: boolean;
        sanction_ecart_consommation: boolean;
        sanction_concordance: boolean;
        poids_calc_p1: string | null;
        poids_calc_p2: string | null;
        poids_calc_p3: string | null;
        poids_calc_p4: string | null;
        poids_calc_p5: string | null;
        poids_calc_p6: string | null;
        poids_piliers_calcules: string | null;
        echeance_requisitions: string;
        echeance_inventaire: string;
      }>(
        // Valeurs, notes, sanctions et dénominateurs figés au gel : la
        // décomposition redonne exactement le score affiché.
        `SELECT h.score_composite, h.classification, h.grille_id::text AS grille_id, vsc.sc,
                ${COMPTE_PILIERS_SQL} AS piliers_couverts,
                h.p_completude, h.p_promptitude, h.p_regularite,
                h.p_ecart_sdu, h.p_concordance, h.p_ajustements,
                ${SOUS_COMPOSANTES.map((sc) => `h.sc_${sc}, h.note_${sc}`).join(', ')},
                h.sanction_ecart_sdu, h.sanction_ecart_consommation, h.sanction_concordance,
                h.poids_calc_p1, h.poids_calc_p2, h.poids_calc_p3,
                h.poids_calc_p4, h.poids_calc_p5, h.poids_calc_p6, h.poids_piliers_calcules,
                to_char(dqa.echeance_requisition(h.mois_paqd, s.type_structure), 'YYYY-MM-DD') AS echeance_requisitions,
                to_char(dqa.echeance_inventaire(h.mois_paqd), 'YYYY-MM-DD') AS echeance_inventaire
         FROM dqa.hist_score_site h
         JOIN dqa.dim_site s ON s.site_id = h.site_id
         ${ATTEINTE_JSONB_SQL}
         WHERE h.site_id = $1 AND h.mois_paqd = $2 AND h.programme_id IS NOT DISTINCT FROM $3`,
        [siteId, mois, prog],
      ),
      this.pool.query<LigneCauses>(
        `SELECT p4.cause_cloture AS cause_sdu, p4.cause_consommation AS cause_conso,
                p5.cause_cloture AS cause_concordance,
                to_char(cm.fenetre_debut, 'YYYY-MM-DD') AS fenetre_debut,
                to_char(cm.fenetre_fin, 'YYYY-MM-DD') AS fenetre_fin,
                to_char(cm.fenetre_fin + dqa.jours_marge_jugement($2), 'YYYY-MM-DD') AS fin_jugee,
                to_char(cm.date_hors_fenetre, 'YYYY-MM-DD') AS date_hors_fenetre
         FROM dqa.mv_cloture_mois cm
         LEFT JOIN dqa.mv_p4_ecart p4
                ON p4.site_id = cm.site_id AND p4.mois_paqd = cm.mois_paqd
               AND p4.programme_id IS NOT DISTINCT FROM cm.programme_id
         LEFT JOIN dqa.mv_p5_concordance p5
                ON p5.site_id = cm.site_id AND p5.mois_paqd = cm.mois_paqd
               AND p5.programme_id IS NOT DISTINCT FROM cm.programme_id
         WHERE cm.site_id = $1 AND cm.mois_paqd = $2 AND cm.programme_id IS NOT DISTINCT FROM $3`,
        [siteId, mois, prog],
      ),
      this.comptesBrutsParPilier(siteId, mois, prog, estDistrict),
      this.moisEstClos(mois),
      this.dateDuJour(),
      this.suiviReceptions(siteId, mois),
    ]);
    const h = hist.rows[0];
    const c = causes.rows[0];
    const grille = await lireGrilleDuMois(this.pool, mois, h?.grille_id ?? null);
    const noteSanction = grille?.regles.noteSanction ?? 0;
    const echeanceReq = h?.echeance_requisitions ?? `${mois}-28`;
    const echeanceInv = h?.echeance_inventaire ?? `${mois}-28`;
    const reqNonArrivee = `Échéance non arrivée : réquisition attendue au plus tard le ${dateCourte(echeanceReq)}`;
    const sansProgramme = "Aucun programme éligible pour ce site (voir l'écran Programmes)";

    const raisons: Record<SousComposante, string> = {
      completude_requisitions: aujourdhui <= echeanceReq ? reqNonArrivee : sansProgramme,
      completude_receptions: 'Aucune facture fournisseur ne répond aux réquisitions ordinaires du mois précédent',
      promptitude_inventaires: aujourdhui <= echeanceInv
        ? `Échéance non arrivée : inventaire de fin de mois attendu jusqu'au ${dateCourte(echeanceInv)}`
        : sansProgramme,
      promptitude_requisitions: aujourdhui <= echeanceReq ? reqNonArrivee : sansProgramme,
      regularite_saisie: estDistrict
        ? 'Aucune réquisition de la zone du district à évaluer ce mois'
        : 'Aucune sortie de stock exploitable sur le mois',
      ecart_sdu: this.raisonP4P5(c?.cause_sdu, c, noteSanction),
      ecart_consommation: this.raisonP4P5(c?.cause_conso, c, noteSanction),
      concordance: this.raisonP4P5(c?.cause_concordance, c, noteSanction),
      ratio_ajustements: 'Aucun mouvement de stock pour le mois',
    };
    const sanctions: Record<SousComposante, boolean> = {
      completude_requisitions: false,
      completude_receptions: false,
      promptitude_inventaires: false,
      promptitude_requisitions: false,
      regularite_saisie: false,
      ecart_sdu: h?.sanction_ecart_sdu ?? false,
      ecart_consommation: h?.sanction_ecart_consommation ?? false,
      concordance: h?.sanction_concordance ?? false,
      ratio_ajustements: false,
    };
    const scores: Record<Pilier, string | null> = {
      P1: h?.p_completude ?? null, P2: h?.p_promptitude ?? null, P3: h?.p_regularite ?? null,
      P4: h?.p_ecart_sdu ?? null, P5: h?.p_concordance ?? null, P6: h?.p_ajustements ?? null,
    };
    const poidsCalculables: Record<Pilier, string | null> = {
      P1: h?.poids_calc_p1 ?? null, P2: h?.poids_calc_p2 ?? null, P3: h?.poids_calc_p3 ?? null,
      P4: h?.poids_calc_p4 ?? null, P5: h?.poids_calc_p5 ?? null, P6: h?.poids_calc_p6 ?? null,
    };
    const seuils = new Map(grille?.seuils.map((r) => [r.sousComposante, r]) ?? []);

    const piliers: ScorePilier[] = PILIERS.map((pilier) => ({
      pilier,
      // P3 se lit « (dispensation) » ou « (distribution) » selon le site (ADR 0011)
      libelle: pilier === 'P3' ? libelleSousComposante('regularite_saisie', estDistrict) : LIBELLES_PILIER[pilier],
      poids: grille?.poids.get(pilier) ?? 0,
      score: nombreOuNull(scores[pilier]),
      sousComposantes: SOUS_COMPOSANTES_DU_PILIER[pilier].map((sc) => this.mesure(sc, {
        valeur: h?.[`sc_${sc}`] ?? null,
        note: h?.[`note_${sc}`] ?? null,
        regle: seuils.get(sc),
        raison: raisons[sc],
        sanction: sanctions[sc],
        estDistrict,
      })),
      poidsCalculables: Number(poidsCalculables[pilier] ?? 0),
      comptesBruts: comptesParPilier.get(pilier) ?? [],
    }));

    return {
      site: versSite(siteRow),
      moisPaqd: mois,
      moisClos,
      estDistrict,
      moisDisponibles,
      programmeId: prog,
      piliersCouverts: h?.piliers_couverts ?? 0,
      piliersTotal: 6,
      scoreComposite: nombreOuNull(h?.score_composite ?? null),
      classification: h?.classification ?? null,
      piliers,
      calcul: grille
        ? {
            grille: grille.resume,
            regles: grille.regles,
            poidsPiliersCalculables: Number(h?.poids_piliers_calcules ?? 0),
          }
        : null,
      sousComposantes: sousComposantesDuMois(h?.sc ?? null),
      suiviReceptions,
    };
  }

  /** La grille d'un mois décrite pour les écrans de lecture (dépliable « méthode »). */
  async methodeCalcul(q: MethodeCalculQuery): Promise<MethodeCalcul | null> {
    // même mois par défaut que les écrans de liste (dernier mois clos) ; un
    // mois demandé hors des mois mesurés se décrit quand même s'il a une grille
    const mois = q.mois ?? (await this.moisParDefaut(undefined)) ?? null;
    if (!mois) return null;
    const grille = await lireGrilleDuMois(this.pool, mois);
    if (!grille) return null;
    const parSc = new Map(grille.seuils.map((r) => [r.sousComposante, r]));
    return {
      moisPaqd: mois,
      grille: grille.resume,
      regles: grille.regles,
      piliers: PILIERS.map((pilier) => ({
        pilier,
        libelle: LIBELLES_PILIER[pilier],
        poidsPct: grille.poids.get(pilier) ?? 0,
        sousComposantes: SOUS_COMPOSANTES_DU_PILIER[pilier].flatMap((sc) => {
          const r = parSc.get(sc);
          return r ? [{ ...r, libelle: LIBELLES_SOUS_COMPOSANTE[sc] }] : [];
        }),
      })),
    };
  }

  async historiqueSite(siteId: string, q: HistoriqueQuery): Promise<HistoriqueSite | null> {
    const site = await this.pool.query<LigneSite>(
      `SELECT site_id, site_code, site_nom, district, region, type_structure
       FROM dqa.dim_site WHERE site_id = $1 AND dans_perimetre_dqa`,
      [siteId],
    );
    if (site.rowCount === 0) return null;
    const siteRow = site.rows[0]!;
    const prog = q.programmeId ?? null;

    const fenetres = await this.pool.query<{ mois_paqd: string; cycle_paqd: string }>(
      `SELECT h.mois_paqd, vmc.cycle_paqd
       FROM dqa.hist_score_site h
       JOIN dqa.dim_site s ON s.site_id = h.site_id AND s.dans_perimetre_dqa
       JOIN dqa.v_mois_cycle vmc ON vmc.mois_paqd = h.mois_paqd
       WHERE h.site_id = $1 AND h.programme_id IS NOT DISTINCT FROM $2
       ORDER BY h.mois_paqd DESC`,
      [siteId, prog],
    );
    const moisDisponibles = fenetres.rows.map((r) => r.mois_paqd);
    const cyclesDisponibles = [...new Set(fenetres.rows.map((r) => r.cycle_paqd))];

    const base = {
      site: versSite(siteRow),
      programmeId: prog,
      cyclesDisponibles,
      moisDisponibles,
    };

    if (moisDisponibles.length === 0) {
      return { ...base, cyclePaqd: null, points: [] };
    }

    // Plage `de`/`a` libre si les deux bornes ont le format AAAA-MM (pas besoin
    // qu'elles soient mesurées : un préréglage « 12 mois » peut viser plus large
    // que l'historique). Sinon la fenêtre est un cycle.
    const estMois = (m: string | undefined): m is string => /^\d{4}-\d{2}$/.test(m ?? '');
    const plage =
      estMois(q.de) && estMois(q.a)
        ? { de: q.de <= q.a ? q.de : q.a, a: q.de <= q.a ? q.a : q.de }
        : null;
    const cycle = plage
      ? null
      : q.cycle && cyclesDisponibles.includes(q.cycle)
        ? q.cycle
        : cyclesDisponibles[0]!;

    const { filtre, params } = plage
      ? { filtre: 'h.mois_paqd BETWEEN $3 AND $4', params: [siteId, prog, plage.de, plage.a] }
      : { filtre: 'vmc.cycle_paqd = $3', params: [siteId, prog, cycle] };

    const { rows } = await this.pool.query<
      PiliersBruts & {
        mois_paqd: string;
        rang: number;
        score_composite: string | null;
        classification: Classification | null;
        piliers_couverts: number;
        mois_clos: boolean;
        sc: AtteintesParSc | null;
      }
    >(
      `SELECT h.mois_paqd, vmc.rang,
              h.score_composite, h.classification,
              ${COMPTE_PILIERS_SQL} AS piliers_couverts,
              dqa.mois_est_clos(h.mois_paqd) AS mois_clos,
              h.p_completude, h.p_promptitude, h.p_regularite,
              h.p_ecart_sdu, h.p_concordance, h.p_ajustements,
              vsc.sc
       FROM dqa.hist_score_site h
       JOIN dqa.dim_site s ON s.site_id = h.site_id AND s.dans_perimetre_dqa
       JOIN dqa.v_mois_cycle vmc ON vmc.mois_paqd = h.mois_paqd
       ${ATTEINTE_JSONB_SQL}
       WHERE h.site_id = $1 AND h.programme_id IS NOT DISTINCT FROM $2 AND ${filtre}
       ORDER BY h.mois_paqd`,
      params,
    );

    return {
      ...base,
      cyclePaqd: cycle,
      points: rows.map((r) => ({
        moisPaqd: r.mois_paqd,
        rang: r.rang,
        scoreComposite: nombreOuNull(r.score_composite),
        classification: r.classification,
        piliersCouverts: r.piliers_couverts,
        scoresPiliers: scoresPiliers(r),
        sousComposantes: sousComposantesDuMois(r.sc),
        moisClos: r.mois_clos,
      })),
    };
  }

  /**
   * Une sous-composante rendue depuis l'historique gelé : son statut se déduit
   * de la note (100 : conforme ; une note de sanction n'atteint jamais 100).
   * La raison accompagne une sous-composante non calculable ou sanctionnée.
   */
  private mesure(
    sc: SousComposante,
    m: {
      valeur: string | null;
      note: string | null;
      regle: SeuilSousComposante | undefined;
      raison: string;
      sanction: boolean;
      estDistrict: boolean;
    },
  ): MesureSousComposante {
    const statut = m.note === null ? 'NON_CALCULABLE' : Number(m.note) >= 100 ? 'CONFORME' : 'ALERTE';
    const seuil = m.estDistrict && m.regle?.seuilDistrict != null ? m.regle.seuilDistrict : m.regle?.seuil ?? null;
    return {
      sousComposante: sc,
      libelle: libelleSousComposante(sc, m.estDistrict),
      valeur: nombreOuNull(m.valeur),
      unite: 'pct',
      seuil,
      statut,
      raison: statut === 'NON_CALCULABLE' || m.sanction ? m.raison : null,
      retenue: m.regle?.retenue ?? false,
      poidsDansPilierPct: m.regle?.poidsDansPilierPct ?? 0,
      note: nombreOuNull(m.note),
      sanction: m.sanction,
    };
  }

  /**
   * Couples attendu / réalisé figés (`hist_pilier_brut`), groupés par pilier.
   * Vide pour un mois sans gel de comptes bruts.
   */
  private async comptesBrutsParPilier(
    siteId: string,
    mois: string,
    prog: string | null,
    estDistrict = false,
  ): Promise<Map<Pilier, CompteBrut[]>> {
    const { rows } = await this.pool.query<{
      mesure: CompteBrut['mesure'];
      nb_attendu: number | null;
      nb_realise: number | null;
      nb_a_lheure: number | null;
    }>(
      `SELECT mesure, nb_attendu, nb_realise, nb_a_lheure
       FROM dqa.hist_pilier_brut
       WHERE site_id = $1 AND mois_paqd = $2 AND programme_id IS NOT DISTINCT FROM $3`,
      [siteId, mois, prog],
    );
    const parMesure = new Map(rows.map((r) => [r.mesure, r]));
    const parPilier = new Map<Pilier, CompteBrut[]>();
    for (const mesure of MESURES_BRUTES) {
      const r = parMesure.get(mesure);
      // `nb_attendu` nul ou 0 = sous-composante NON_CALCULABLE : pas de couple.
      if (!r || !r.nb_attendu) continue;
      const pilier = PILIER_DE_MESURE_BRUTE[mesure];
      const liste = parPilier.get(pilier) ?? [];
      liste.push({
        mesure,
        libelle: libelleMesureBrute(mesure, estDistrict),
        attendu: r.nb_attendu,
        realise: r.nb_realise,
        aLHeure: r.nb_a_lheure,
      });
      parPilier.set(pilier, liste);
    }
    return parPilier;
  }

  /**
   * Détail transaction par transaction derrière le taux d'un pilier, lu en
   * direct du core (`fact_*`). `comptesBruts` et `calculeLe` restent les valeurs
   * figées ; `coreMajLe` / `reimporteDepuisLeGel` disent si le core a bougé
   * depuis le gel. `null` si le site est hors périmètre.
   *
   * Le filtre programme (`prog` NULL = tous programmes) porte sur les lignes de
   * core : NULL ne restreint rien, une valeur restreint à ce programme.
   */
  async detailPilier(
    siteId: string,
    code: CodeDetailPilier,
    q: DetailPilierQuery,
  ): Promise<DetailPilier | null> {
    const pilier = PILIER_DE_CODE[code];

    const site = await this.pool.query<LigneSite & { est_district: boolean }>(
      `SELECT site_id, site_code, site_nom, district, region, type_structure,
              dqa.est_district(type_structure) AS est_district
       FROM dqa.dim_site WHERE site_id = $1 AND dans_perimetre_dqa`,
      [siteId],
    );
    if (site.rowCount === 0) return null;
    const siteRow = site.rows[0]!;
    const estDistrict = siteRow.est_district;
    const prog = q.programmeId ?? null;

    const moisRows = await this.pool.query<{ mois_paqd: string }>(
      `SELECT DISTINCT mois_paqd FROM dqa.hist_score_site
       WHERE site_id = $1 AND programme_id IS NOT DISTINCT FROM $2
       ORDER BY mois_paqd DESC`,
      [siteId, prog],
    );
    const moisDisponibles = moisRows.rows.map((r) => r.mois_paqd);
    const mois = q.mois && moisDisponibles.includes(q.mois) ? q.mois : moisDisponibles[0];

    const comptesBruts = mois
      ? (await this.comptesBrutsParPilier(siteId, mois, prog, estDistrict)).get(pilier) ?? []
      : [];

    const commun = {
      site: versSite(siteRow),
      moisPaqd: mois ?? null,
      moisDisponibles,
      programmeId: prog,
      comptesBruts,
    };

    if (!mois) {
      const vide = { ...commun, calculeLe: null, coreMajLe: null, reimporteDepuisLeGel: false };
      switch (code) {
        case 'p1':
          return { ...vide, code, requisitions: [], echeanceRequisitions: '1970-01-01', factures: [], programmesGeres: [] };
        case 'p2':
          return { ...vide, code, inventaires: [], requisitions: [], echeanceInventaires: '1970-01-01', echeanceRequisitions: '1970-01-01' };
        case 'p3':
          return { ...vide, code, jours: [], reponseZone: null };
        case 'p4':
          return { ...vide, code, estDistrict, produits: [], produitsEcartes: [] };
        case 'p6':
          return { ...vide, code, ajustements: [], nbMouvements: 0 };
      }
    }

    const calculeLe = await this.horodatageGel(siteId, mois, prog, pilier);
    const horo = (coreMajLe: Date | null) => ({
      calculeLe: calculeLe ? calculeLe.toISOString() : null,
      coreMajLe: coreMajLe ? coreMajLe.toISOString() : null,
      reimporteDepuisLeGel:
        calculeLe !== null && coreMajLe !== null && coreMajLe.getTime() > calculeLe.getTime(),
    });

    if (code === 'p1') {
      const { coreMajLe, ...lignes } = await this.detailPilierP1(siteId, mois, prog);
      return { ...commun, ...horo(coreMajLe), code, ...lignes };
    }
    if (code === 'p2') {
      const { coreMajLe, ...lignes } = await this.detailPilierP2(siteId, mois, prog);
      return { ...commun, ...horo(coreMajLe), code, ...lignes };
    }
    if (code === 'p3') {
      const { coreMajLe, ...lignes } = await this.detailPilierP3(siteId, mois, prog, estDistrict);
      return { ...commun, ...horo(coreMajLe), code, ...lignes };
    }
    if (code === 'p4') {
      const { coreMajLe, ...lignes } = await this.detailPilierP4(siteId, mois, prog, estDistrict);
      return { ...commun, ...horo(coreMajLe), code, ...lignes };
    }
    const { coreMajLe, ...lignes } = await this.detailPilierP6(siteId, mois, prog);
    return { ...commun, ...horo(coreMajLe), code, ...lignes };
  }

  /** Produits absents d'un des deux inventaires du mois, tels que figés au gel (constat de site). */
  private async produitsEcartes(siteId: string, mois: string): Promise<ProduitEcarte[]> {
    const { rows } = await this.pool.query<{
      produit_code: string; libelle: string | null;
      sens: ProduitEcarte['sens']; qualification: ProduitEcarte['qualification'];
      date_ouverture: string; date_cloture: string;
      stock_connu: string; entrees: string; sorties: string; stock_calcule: string;
    }>(
      `SELECT produit_code, libelle, sens, qualification,
              to_char(date_ouverture, 'YYYY-MM-DD') AS date_ouverture,
              to_char(date_cloture, 'YYYY-MM-DD') AS date_cloture,
              stock_connu, entrees, sorties, stock_calcule
       FROM dqa.hist_produit_ecarte
       WHERE site_id = $1 AND mois_paqd = $2
       ORDER BY sens DESC, qualification, produit_code`,
      [siteId, mois],
    );
    return rows.map((r) => ({
      produitCode: r.produit_code,
      libelle: r.libelle,
      sens: r.sens,
      qualification: r.qualification,
      dateOuverture: r.date_ouverture,
      dateCloture: r.date_cloture,
      stockConnu: Number(r.stock_connu),
      entrees: Number(r.entrees),
      sorties: Number(r.sorties),
      stockCalcule: Number(r.stock_calcule),
    }));
  }

  /** Horodatage du gel des comptes bruts du pilier, à défaut celui du score. */
  private async horodatageGel(
    siteId: string,
    mois: string,
    prog: string | null,
    pilier: Pilier,
  ): Promise<Date | null> {
    const mesures = MESURES_BRUTES.filter((m) => PILIER_DE_MESURE_BRUTE[m] === pilier);
    const brut = await this.pool.query<{ calcule_le: Date | null }>(
      `SELECT max(calcule_le) AS calcule_le FROM dqa.hist_pilier_brut
       WHERE site_id = $1 AND mois_paqd = $2 AND programme_id IS NOT DISTINCT FROM $3
         AND mesure = ANY($4::text[])`,
      [siteId, mois, prog, mesures],
    );
    if (brut.rows[0]?.calcule_le) return brut.rows[0].calcule_le;
    const score = await this.pool.query<{ calcule_le: Date | null }>(
      `SELECT calcule_le FROM dqa.hist_score_site
       WHERE site_id = $1 AND mois_paqd = $2 AND programme_id IS NOT DISTINCT FROM $3`,
      [siteId, mois, prog],
    );
    return score.rows[0]?.calcule_le ?? null;
  }

  private async detailPilierP1(
    siteId: string,
    mois: string,
    prog: string | null,
  ): Promise<
    Pick<DetailPilierP1, 'requisitions' | 'echeanceRequisitions' | 'factures' | 'programmesGeres'> & {
      coreMajLe: Date | null;
    }
  > {
    const params = [siteId, mois, prog];

    const requisitions = await this.pool.query<{
      programme: string;
      mois_couvert: string;
      date_soumission: string | null;
    }>(
      `SELECT coalesce(nullif(dp.programme_nom, ''), fr.programme_id, 'Sans programme') AS programme,
              fr.mois_couvert,
              to_char(fr.date_soumission, 'YYYY-MM-DD') AS date_soumission
       FROM dqa.fact_requisition fr
       LEFT JOIN dqa.dim_programme dp ON dp.programme_id = fr.programme_id
       WHERE fr.site_id = $1 AND fr.mois_couvert = $2
         AND ($3::text IS NULL OR fr.programme_id = $3)
       ORDER BY programme`,
      params,
    );

    const echeance = await this.pool.query<{ d: string }>(
      `SELECT to_char(dqa.echeance_requisition($2, s.type_structure), 'YYYY-MM-DD') AS d
       FROM dqa.dim_site s WHERE s.site_id = $1`,
      [siteId, mois],
    );

    // Mêmes prédicats que la complétude des réceptions de mv_p1_completude :
    // factures citant une réquisition ordinaire finalisée couvrant M-1.
    const factures = await this.pool.query<{
      reference: string | null;
      programme: string;
      mois_couvert: string;
      statut: string;
      date_emission: string;
      date_reception: string | null;
      acceptee: boolean;
    }>(
      `SELECT nullif(ft.commentaire, '') AS reference,
              coalesce(nullif(dp.programme_nom, ''), fr.programme_id, 'Sans programme') AS programme,
              fr.mois_couvert, ft.statut,
              to_char(dqa.date_emission_facture(ft.date_finalisation_liee, ft.date_saisie), 'YYYY-MM-DD') AS date_emission,
              CASE WHEN ft.statut = 'fn'
                   THEN to_char(dqa.date_reception_facture(ft.date_finalisation, ft.date_confirmation, ft.date_saisie), 'YYYY-MM-DD')
              END AS date_reception,
              (ft.statut = 'fn'
               AND to_char(dqa.date_reception_facture(ft.date_finalisation, ft.date_confirmation, ft.date_saisie), 'YYYY-MM')
                 = to_char(dqa.date_emission_facture(ft.date_finalisation_liee, ft.date_saisie), 'YYYY-MM')) AS acceptee
       FROM dqa.fact_requisition fr
       JOIN dqa.fact_transaction ft
         ON ft.requisition_id = fr.requisition_id AND ft.site_id = fr.site_id
       LEFT JOIN dqa.dim_programme dp ON dp.programme_id = fr.programme_id
       WHERE fr.site_id = $1
         AND fr.mois_couvert = to_char(($2 || '-01')::date - interval '1 month', 'YYYY-MM')
         AND fr.type_requisition = 'Ordinaire' AND fr.statut = 'fn'
         AND (fr.programme_id IS NULL OR EXISTS (
               SELECT 1 FROM dqa.dim_site_programme sp
               WHERE sp.site_id = fr.site_id AND sp.programme_id = fr.programme_id AND sp.actif))
         AND ($3::text IS NULL OR fr.programme_id = $3)
         AND ft.nature = 'facture_fournisseur' AND ft.statut IN ('fn', 'cn', 'nw')
         AND coalesce(ft.annulation, false) = false
         AND dqa.date_emission_facture(ft.date_finalisation_liee, ft.date_saisie) IS NOT NULL
       ORDER BY acceptee, date_emission, ft.transaction_id`,
      params,
    );

    const programmesGeres = await this.pool.query<{ programme: string; a_requisition: boolean }>(
      `SELECT coalesce(nullif(dp.programme_nom, ''), sp.programme_id) AS programme,
              EXISTS (SELECT 1 FROM dqa.fact_requisition fr
                       WHERE fr.site_id = sp.site_id AND fr.programme_id = sp.programme_id
                         AND fr.mois_couvert = $2) AS a_requisition
       FROM dqa.dim_site_programme sp
       LEFT JOIN dqa.dim_programme dp ON dp.programme_id = sp.programme_id
       WHERE sp.site_id = $1 AND sp.actif AND ($3::text IS NULL OR sp.programme_id = $3)
       ORDER BY programme`,
      params,
    );

    const maj = await this.pool.query<{ core_maj_le: Date | null }>(
      `SELECT GREATEST(
         (SELECT max(fr.maj_le) FROM dqa.fact_requisition fr
           WHERE fr.site_id = $1
             AND fr.mois_couvert IN ($2, to_char(($2 || '-01')::date - interval '1 month', 'YYYY-MM'))
             AND ($3::text IS NULL OR fr.programme_id = $3)),
         (SELECT max(ft.maj_le) FROM dqa.fact_transaction ft
           WHERE ft.site_id = $1 AND ft.nature = 'facture_fournisseur'
             AND coalesce(ft.annulation, false) = false
             AND to_char(dqa.date_emission_facture(ft.date_finalisation_liee, ft.date_saisie), 'YYYY-MM') >= $2
             AND ($3::text IS NULL OR ft.programme_id = $3))
       ) AS core_maj_le`,
      params,
    );

    return {
      requisitions: requisitions.rows.map((r) => ({
        programme: r.programme,
        moisCouvert: r.mois_couvert,
        dateSoumission: r.date_soumission,
      })),
      echeanceRequisitions: echeance.rows[0]?.d ?? `${mois}-28`,
      factures: factures.rows.map((f) => ({
        reference: f.reference,
        programme: f.programme,
        moisCouvert: f.mois_couvert,
        statut: f.statut,
        dateEmission: f.date_emission,
        dateReception: f.date_reception,
        acceptee: f.acceptee,
      })),
      programmesGeres: programmesGeres.rows.map((r) => ({
        programme: r.programme,
        aRequisition: r.a_requisition,
      })),
      coreMajLe: maj.rows[0]?.core_maj_le ?? null,
    };
  }

  private async detailPilierP2(
    siteId: string,
    mois: string,
    prog: string | null,
  ): Promise<
    Pick<DetailPilierP2, 'inventaires' | 'requisitions' | 'echeanceInventaires' | 'echeanceRequisitions'> & {
      coreMajLe: Date | null;
    }
  > {
    const params = [siteId, mois, prog];

    const inventaires = await this.pool.query<{
      date: string;
      programme: string;
      dans_les_3_derniers_jours: boolean;
    }>(
      `SELECT to_char(fi.date_inventaire, 'YYYY-MM-DD') AS date,
              coalesce(nullif(dp.programme_nom, ''), fi.programme_id, 'Sans programme') AS programme,
              fi.date_inventaire >= dqa.echeance_inventaire($2) - 2 AS dans_les_3_derniers_jours
       FROM dqa.fact_inventaire fi
       LEFT JOIN dqa.dim_programme dp ON dp.programme_id = fi.programme_id
       WHERE fi.site_id = $1 AND fi.statut = 'fn'
         AND to_char(fi.date_inventaire, 'YYYY-MM') = $2
         AND ($3::text IS NULL OR fi.programme_id = $3)
       ORDER BY fi.date_inventaire, programme`,
      params,
    );

    // Date limite : `dqa.echeance_requisition` lit le référentiel des
    // structures (ADR 0013), mois couvert + 1 mois + (jour limite - 1) jours.
    const requisitions = await this.pool.query<{
      programme: string;
      date_soumission: string | null;
      date_limite: string;
      a_lheure: boolean;
    }>(
      `SELECT coalesce(nullif(dp.programme_nom, ''), fr.programme_id, 'Sans programme') AS programme,
              to_char(fr.date_soumission, 'YYYY-MM-DD') AS date_soumission,
              to_char(dqa.echeance_requisition(fr.mois_couvert, ds.type_structure), 'YYYY-MM-DD') AS date_limite,
              (fr.date_soumission IS NOT NULL
               AND fr.date_soumission <= dqa.echeance_requisition(fr.mois_couvert, ds.type_structure)) AS a_lheure
       FROM dqa.fact_requisition fr
       JOIN dqa.dim_site ds ON ds.site_id = fr.site_id
       LEFT JOIN dqa.dim_programme dp ON dp.programme_id = fr.programme_id
       WHERE fr.site_id = $1 AND fr.mois_couvert = $2
         AND ($3::text IS NULL OR fr.programme_id = $3)
       ORDER BY programme`,
      params,
    );

    const echeances = await this.pool.query<{ inv: string; req: string }>(
      `SELECT to_char(dqa.echeance_inventaire($2), 'YYYY-MM-DD') AS inv,
              to_char(dqa.echeance_requisition($2, s.type_structure), 'YYYY-MM-DD') AS req
       FROM dqa.dim_site s WHERE s.site_id = $1`,
      [siteId, mois],
    );

    const maj = await this.pool.query<{ core_maj_le: Date | null }>(
      `SELECT GREATEST(
         (SELECT max(fi.maj_le) FROM dqa.fact_inventaire fi
           WHERE fi.site_id = $1 AND fi.statut = 'fn'
             AND to_char(fi.date_inventaire, 'YYYY-MM') = $2
             AND ($3::text IS NULL OR fi.programme_id = $3)),
         (SELECT max(fr.maj_le) FROM dqa.fact_requisition fr
           WHERE fr.site_id = $1 AND fr.mois_couvert = $2
             AND ($3::text IS NULL OR fr.programme_id = $3))
       ) AS core_maj_le`,
      params,
    );

    return {
      inventaires: inventaires.rows.map((r) => ({
        date: r.date,
        programme: r.programme,
        dansLes3DerniersJours: r.dans_les_3_derniers_jours,
      })),
      requisitions: requisitions.rows.map((r) => ({
        programme: r.programme,
        dateSoumission: r.date_soumission,
        dateLimite: r.date_limite,
        aLHeure: r.a_lheure,
      })),
      echeanceInventaires: echeances.rows[0]?.inv ?? `${mois}-28`,
      echeanceRequisitions: echeances.rows[0]?.req ?? `${mois}-28`,
      coreMajLe: maj.rows[0]?.core_maj_le ?? null,
    };
  }

  /**
   * Détail de P3. Pour un district (ADR 0011) : le couple réquisitions de la
   * zone couvrant M-1 / servies dans M par une distribution liée. Sinon : le
   * bandeau calendaire (un item par jour du mois PAQD, marqué s'il a porté ≥ 1
   * sortie de stock : mêmes prédicats que `mv_p3_regularite`).
   */
  private async detailPilierP3(
    siteId: string,
    mois: string,
    prog: string | null,
    estDistrict: boolean,
  ): Promise<Pick<DetailPilierP3, 'jours' | 'reponseZone'> & { coreMajLe: Date | null }> {
    if (estDistrict) return this.detailP3District(siteId, mois, prog);

    const params = [siteId, mois, prog];

    const jours = await this.pool.query<{ jour: string; a_sortie: boolean }>(
      `SELECT to_char(t.jour, 'YYYY-MM-DD') AS jour,
              EXISTS (
                SELECT 1 FROM dqa.fact_transaction ft
                WHERE ft.site_id = $1
                  AND ft.nature IN ('dispensation', 'distribution')
                  AND ft.statut = 'fn'
                  AND coalesce(ft.annulation, false) = false
                  AND coalesce(ft.date_confirmation, ft.date_saisie) = t.jour
                  AND ($3::text IS NULL OR ft.programme_id = $3)
              ) AS a_sortie
       FROM dqa.dim_temps t
       WHERE t.mois_paqd = $2 AND t.jour <= CURRENT_DATE
       ORDER BY t.jour`,
      params,
    );

    const maj = await this.pool.query<{ core_maj_le: Date | null }>(
      `SELECT max(ft.maj_le) AS core_maj_le
       FROM dqa.fact_transaction ft
       JOIN dqa.dim_temps t ON t.jour = coalesce(ft.date_confirmation, ft.date_saisie)
       WHERE ft.site_id = $1 AND t.mois_paqd = $2
         AND ft.nature IN ('dispensation', 'distribution')
         AND coalesce(ft.annulation, false) = false
         AND ($3::text IS NULL OR ft.programme_id = $3)`,
      params,
    );

    return {
      jours: jours.rows.map((r) => ({ jour: r.jour, aSortie: r.a_sortie })),
      reponseZone: null,
      coreMajLe: maj.rows[0]?.core_maj_le ?? null,
    };
  }

  /**
   * Détail P3 d'un district : réquisitions DISTINCTES de sa zone (sites du
   * périmètre du même district) couvrant M-1, et celles servies dans M par une
   * distribution du district liée par `requisition_id`. Aligné sur la branche
   * district de `mv_p3_regularite` (migration 0036).
   */
  private async detailP3District(
    siteId: string,
    mois: string,
    prog: string | null,
  ): Promise<Pick<DetailPilierP3, 'jours' | 'reponseZone'> & { coreMajLe: Date | null }> {
    const [annee, moisNum] = mois.split('-').map(Number) as [number, number];
    const moisCouvert =
      moisNum === 1
        ? `${annee - 1}-12`
        : `${annee}-${String(moisNum - 1).padStart(2, '0')}`;
    const debutM = `${mois}-01`;
    const finM = `${mois}-${String(new Date(Date.UTC(annee, moisNum, 0)).getUTCDate()).padStart(2, '0')}`;
    const params = [siteId, moisCouvert, prog, debutM, finM];

    const { rows } = await this.pool.query<{ nb_requisitions: number; nb_repondues: number }>(
      `WITH zone AS (
         SELECT sreq.site_id
         FROM dqa.dim_site d
         JOIN dqa.dim_site sreq
           ON sreq.district = d.district AND sreq.dans_perimetre_dqa
          AND sreq.site_id <> d.site_id
          AND NOT dqa.est_district(sreq.type_structure)
         WHERE d.site_id = $1
       ),
       reqs AS (
         SELECT DISTINCT fr.requisition_id
         FROM dqa.fact_requisition fr
         JOIN zone z ON z.site_id = fr.site_id
         WHERE fr.mois_couvert = $2 AND ($3::text IS NULL OR fr.programme_id = $3)
       )
       SELECT
         count(*)::int AS nb_requisitions,
         count(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM dqa.fact_transaction ft
           WHERE ft.site_id = $1 AND ft.nature = 'distribution' AND ft.statut = 'fn'
             AND ft.requisition_id = reqs.requisition_id
             AND coalesce(ft.annulation, false) = false
             AND coalesce(ft.date_confirmation, ft.date_saisie) BETWEEN $4::date AND $5::date
         ))::int AS nb_repondues
       FROM reqs`,
      params,
    );

    const maj = await this.pool.query<{ core_maj_le: Date | null }>(
      `SELECT greatest(
         (SELECT max(fr.maj_le) FROM dqa.fact_requisition fr
          JOIN dqa.dim_site sreq ON sreq.site_id = fr.site_id
          JOIN dqa.dim_site d ON d.district = sreq.district AND d.site_id = $1
          WHERE fr.mois_couvert = $2 AND ($3::text IS NULL OR fr.programme_id = $3)),
         (SELECT max(ft.maj_le) FROM dqa.fact_transaction ft
          WHERE ft.site_id = $1 AND ft.nature = 'distribution'
            AND coalesce(ft.date_confirmation, ft.date_saisie) BETWEEN $4::date AND $5::date)
       ) AS core_maj_le`,
      params,
    );

    return {
      jours: [],
      reponseZone: {
        moisCouvert,
        nbRequisitions: rows[0]?.nb_requisitions ?? 0,
        nbRepondues: rows[0]?.nb_repondues ?? 0,
      },
      coreMajLe: maj.rows[0]?.core_maj_le ?? null,
    };
  }

  /**
   * Liste des seuls mouvements d'ajustement de P6, plus le dénominateur du
   * ratio. Prédicat d'ajustement et dénominateur `nbMouvements` alignés sur
   * `mv_p6_ajustements` (0012) : une ligne de transaction compte pour un
   * mouvement ; ajustement = `issu_ajustement` OU nature `ajustement_*`. Le sens
   * vient de la nature quand elle est explicite, sinon du signe de la quantité.
   */
  private async detailPilierP6(
    siteId: string,
    mois: string,
    prog: string | null,
  ): Promise<Pick<DetailPilierP6, 'ajustements' | 'nbMouvements'> & { coreMajLe: Date | null }> {
    const params = [siteId, mois, prog];

    const ajustements = await this.pool.query<{
      date: string;
      produit: string;
      quantite: string;
      sens: LigneAjustementP6['sens'];
    }>(
      `SELECT to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM-DD') AS date,
              coalesce(nullif(dp.produit_nom, ''), dp.produit_code, fl.produit_id) AS produit,
              fl.quantite_unitaire AS quantite,
              CASE
                WHEN ft.nature = 'ajustement_negatif' THEN 'negatif'
                WHEN ft.nature = 'ajustement_positif' THEN 'positif'
                WHEN fl.quantite_unitaire < 0 THEN 'negatif'
                ELSE 'positif'
              END AS sens
       FROM dqa.fact_transaction ft
       JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
       JOIN dqa.dim_produit dp ON dp.produit_id = fl.produit_id
       WHERE ft.site_id = $1 AND ft.statut = 'fn'
         AND coalesce(ft.annulation, false) = false
         AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
         AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $2
         AND ($3::text IS NULL OR ft.programme_id = $3)
         AND (fl.issu_ajustement OR ft.nature IN ('ajustement_positif', 'ajustement_negatif'))
       ORDER BY coalesce(ft.date_confirmation, ft.date_saisie), produit`,
      params,
    );

    const mouvements = await this.pool.query<{ nb: number }>(
      `SELECT count(*)::int AS nb
       FROM dqa.fact_transaction ft
       JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
       WHERE ft.site_id = $1 AND ft.statut = 'fn'
         AND coalesce(ft.annulation, false) = false
         AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
         AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $2
         AND ($3::text IS NULL OR ft.programme_id = $3)`,
      params,
    );

    const maj = await this.pool.query<{ core_maj_le: Date | null }>(
      `SELECT GREATEST(
         (SELECT max(ft.maj_le) FROM dqa.fact_transaction ft
           WHERE ft.site_id = $1 AND coalesce(ft.annulation, false) = false
             AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $2
             AND ($3::text IS NULL OR ft.programme_id = $3)),
         (SELECT max(fl.maj_le) FROM dqa.fact_ligne_transaction fl
           JOIN dqa.fact_transaction ft ON ft.transaction_id = fl.transaction_id
           WHERE ft.site_id = $1 AND coalesce(ft.annulation, false) = false
             AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $2
             AND ($3::text IS NULL OR ft.programme_id = $3))
       ) AS core_maj_le`,
      params,
    );

    return {
      ajustements: ajustements.rows.map((r) => ({
        date: r.date,
        produit: r.produit,
        quantite: Number(r.quantite),
        sens: r.sens,
      })),
      nbMouvements: mouvements.rows[0]?.nb ?? 0,
      coreMajLe: maj.rows[0]?.core_maj_le ?? null,
    };
  }

  /**
   * Tableau produit P4 · P5 : une ligne par produit traceur inventorié, lue de
   * `mv_p4_ecart_produit` (écart SDU + écart consommation, déjà calculés par la
   * vue). La concordance par produit (pilier P5) est un détail de mise en forme
   * lue directement de `mv_p4_ecart_produit` (colonnes `concordance_pct` /
   * `concordance_conforme` ajoutées migration 0033, sémantique NULL alignée sur
   * `mv_p5_concordance`), jamais recalculée ici.
   */
  private async detailPilierP4(
    siteId: string,
    mois: string,
    prog: string | null,
    estDistrict: boolean,
  ): Promise<Pick<DetailPilierP4, 'produits' | 'estDistrict' | 'produitsEcartes'> & { coreMajLe: Date | null }> {
    const params = [siteId, mois, prog];

    // `mv_p4_ecart_produit` restreint déjà aux sites du périmètre et aux
    // traceurs actifs ; l'appelant a écarté un site hors périmètre.
    const { rows } = await this.pool.query<{
      produit_id: string;
      produit_code: string;
      libelle: string | null;
      unite: string | null;
      rang_article: number;
      nb_articles: number;
      theorique: string | null;
      comptee: string | null;
      ecart_sdu_pct: string | null;
      sdu_conforme: boolean;
      stock_debut: string | null;
      stock_fin: string | null;
      receptions: string | null;
      declaree: string | null;
      reconstituee: string | null;
      conso_borne_ok: boolean;
      conso_evaluable: boolean;
      conso_raison_exclusion: RaisonExclusionConso | null;
      ecart_conso_pct: string | null;
      conso_conforme: boolean;
      concordance_pct: string | null;
      concordance_conforme: boolean;
      date_inventaire: string;
      date_debut: string | null;
      date_fin: string | null;
      lots: { lot: string; theorique: number | null; comptee: number | null }[] | null;
    }>(
      `SELECT ep.produit_id, ep.produit_code, ep.libelle, nullif(p.unite, '') AS unite,
              (row_number() OVER (PARTITION BY ep.produit_code ORDER BY ep.produit_id))::int AS rang_article,
              (count(*) OVER (PARTITION BY ep.produit_code))::int AS nb_articles,
              ep.theorique, ep.comptee,
              ep.ecart_sdu_pct, ep.sdu_conforme,
              ep.stock_debut, ep.stock_fin, ep.receptions, ep.declaree, ep.reconstituee,
              ep.conso_borne_ok, ep.conso_evaluable, ep.conso_raison_exclusion, ep.ecart_conso_pct, ep.conso_conforme,
              ep.concordance_pct, ep.concordance_conforme,
              to_char(ep.date_inventaire, 'YYYY-MM-DD') AS date_inventaire,
              to_char(ep.date_debut, 'YYYY-MM-DD') AS date_debut,
              to_char(ep.date_fin, 'YYYY-MM-DD') AS date_fin,
              ep.lots
       FROM dqa.mv_p4_ecart_produit ep
       JOIN dqa.dim_produit p ON p.produit_id = ep.produit_id
       WHERE ep.site_id = $1 AND ep.mois_paqd = $2 AND ep.programme_id IS NOT DISTINCT FROM $3
       -- les articles d'un même code restent groupés ; d'abord les codes non
       -- conformes en consommation (la sous-composante retenue), puis écartés
       ORDER BY min(CASE WHEN ep.conso_borne_ok AND NOT ep.conso_conforme THEN 0
                         WHEN NOT ep.conso_borne_ok THEN 1 ELSE 2 END)
                  OVER (PARTITION BY ep.produit_code),
                ep.produit_code, ep.produit_id`,
      params,
    );

    // P4 de n lit l'ouverture (fenêtre de n-1), la clôture (fenêtre de n) et
    // les mouvements entre les deux : c'est cette période qui doit être
    // surveillée pour signaler un ré-import postérieur au gel.
    const maj = await this.pool.query<{ core_maj_le: Date | null }>(
      `WITH periode AS (SELECT (dqa.fenetre_cloture(dqa.mois_precedent($2))).debut AS debut,
                               (dqa.fenetre_cloture($2)).fin AS fin)
       SELECT GREATEST(
         (SELECT max(fi.maj_le) FROM dqa.fact_inventaire fi, periode pe
           WHERE fi.site_id = $1 AND fi.statut = 'fn'
             AND fi.date_inventaire BETWEEN pe.debut AND pe.fin
             AND ($3::text IS NULL OR fi.programme_id = $3)),
         (SELECT max(fil.maj_le) FROM dqa.fact_inventaire_ligne fil
           JOIN dqa.fact_inventaire fi ON fi.inventaire_id = fil.inventaire_id, periode pe
           WHERE fi.site_id = $1 AND fi.statut = 'fn'
             AND fi.date_inventaire BETWEEN pe.debut AND pe.fin
             AND ($3::text IS NULL OR fi.programme_id = $3)),
         (SELECT max(ft.maj_le) FROM dqa.fact_transaction ft, periode pe
           WHERE ft.site_id = $1 AND ft.nature IN ('facture_fournisseur', 'dispensation', 'distribution')
             AND coalesce(ft.annulation, false) = false
             AND coalesce(ft.date_confirmation, ft.date_saisie) BETWEEN pe.debut AND pe.fin
             AND ($3::text IS NULL OR ft.programme_id = $3))
       ) AS core_maj_le`,
      params,
    );

    const produitsEcartes = await this.produitsEcartes(siteId, mois);
    const produits: LigneProduitP4P5[] = rows.map((r) => {
      const bornes =
        r.date_debut !== null && r.date_fin !== null && r.reconstituee !== null
          ? {
              dateDebut: r.date_debut,
              dateFin: r.date_fin,
              stockDebut: Number(r.stock_debut),
              stockFin: Number(r.stock_fin),
              receptions: Number(r.receptions),
              declaree: Number(r.declaree),
              reconstituee: Number(r.reconstituee),
            }
          : null;
      return {
        produitId: r.produit_id,
        produitCode: r.produit_code,
        libelle: r.libelle,
        article: r.nb_articles > 1 ? { rang: r.rang_article, nombre: r.nb_articles, unite: r.unite } : null,
        dateInventaire: r.date_inventaire,
        // jsonb : les quantités numeric arrivent en nombres
        lots: (r.lots ?? []).map((l) => ({ lot: l.lot, theorique: l.theorique, comptee: l.comptee })),
        sdu: {
          theorique: nombreOuNull(r.theorique),
          comptee: nombreOuNull(r.comptee),
          ecartPct: nombreOuNull(r.ecart_sdu_pct),
          conforme: r.sdu_conforme,
        },
        consommation: this.consommationProduit(r, bornes),
        concordance: {
          tauxPct: nombreOuNull(r.concordance_pct),
          conforme: r.concordance_conforme,
        },
      };
    });

    return {
      produits,
      estDistrict,
      produitsEcartes,
      coreMajLe: maj.rows[0]?.core_maj_le ?? null,
    };
  }

  /**
   * Écart de consommation d'un article : chiffré, ou la raison donnée par la
   * vue. Une raison absente pour un écart non chiffré trahirait une vue
   * incohérente : on le signale au lieu d'inventer une raison.
   */
  private consommationProduit(
    r: { conso_evaluable: boolean; conso_borne_ok: boolean; conso_raison_exclusion: RaisonExclusionConso | null;
         ecart_conso_pct: string | null; conso_conforme: boolean },
    bornes: NonNullable<Extract<LigneProduitP4P5['consommation'], { evaluable: false }>['bornes']> | null,
  ): LigneProduitP4P5['consommation'] {
    if (r.conso_evaluable && bornes) {
      return { evaluable: true, ...bornes, ecartPct: Number(r.ecart_conso_pct), conforme: r.conso_conforme };
    }
    if (r.conso_raison_exclusion === null) {
      throw new Error('mv_p4_ecart_produit : écart de consommation non chiffré sans raison');
    }
    return { evaluable: false, raison: r.conso_raison_exclusion, compteAuDenominateur: r.conso_borne_ok, bornes };
  }

  /**
   * Fiche produit-mois : toutes les grandeurs brutes d'un produit traceur pour
   * un site et un mois. Lue en direct des `fact_*` (inventaires, photos de
   * stock, réceptions, dispensations, ajustements) ; `consommation`,
   * `stockDebut` et `stockFin` sont repris de `mv_p4_ecart_produit` (mêmes
   * calculs que l'écart consommation P4, migration 0017). `null` si le site est
   * hors périmètre ou si `code` n'est pas un produit traceur → 404.
   *
   * Le filtre programme (`prog` NULL = tous programmes) porte sur les lignes de
   * core ; la lecture de la vue prend la ligne agrégée (`programme_id` NULL) ou
   * la ligne du programme (`IS NOT DISTINCT FROM`).
   */
  async ficheProduitMois(
    siteId: string,
    code: string,
    q: FicheProduitMoisQuery,
  ): Promise<FicheProduitMois | null> {
    const site = await this.pool.query<LigneSite & { est_district: boolean }>(
      `SELECT site_id, site_code, site_nom, district, region, type_structure,
              dqa.est_district(type_structure) AS est_district
       FROM dqa.dim_site WHERE site_id = $1 AND dans_perimetre_dqa`,
      [siteId],
    );
    if (site.rowCount === 0) return null;
    const siteRow = site.rows[0]!;

    const traceur = await this.pool.query<{ libelle: string | null }>(
      `SELECT libelle FROM dqa.dim_produit_traceur WHERE produit_code = $1`,
      [code],
    );
    if (traceur.rowCount === 0) return null;
    const libelle = traceur.rows[0]!.libelle;

    const prog = q.programmeId ?? null;

    const moisRows = await this.pool.query<{ mois_paqd: string }>(
      `SELECT DISTINCT mois_paqd FROM dqa.hist_score_site
       WHERE site_id = $1 AND programme_id IS NOT DISTINCT FROM $2
       ORDER BY mois_paqd DESC`,
      [siteId, prog],
    );
    const moisDisponibles = moisRows.rows.map((r) => r.mois_paqd);
    const mois = q.mois && moisDisponibles.includes(q.mois) ? q.mois : moisDisponibles[0];

    const commun = {
      site: versSite(siteRow),
      produit: { code, libelle },
      moisPaqd: mois ?? null,
      moisDisponibles,
      programmeId: prog,
      estDistrict: siteRow.est_district,
    };

    if (!mois) {
      return {
        ...commun,
        periode: null,
        inventaires: [],
        snapshots: [],
        receptions: [],
        dispensations: { total: 0, nbJours: 0 },
        ajustements: [],
        consommation: { reconstituee: null, declaree: null, ecart: null },
        stockDebut: null,
        stockFin: null,
        calculeLe: null,
        coreMajLe: null,
        reimporteDepuisLeGel: false,
      };
    }

    // Période que P4 compare : ouverture et clôture du produit (ses articles),
    // à défaut celles du site, à défaut les fenêtres de clôture (ADR 0022).
    const per = await this.pool.query<{
      debut: string; fin: string; debut_mouvements: string;
      ouverture_connue: boolean; cloture_connue: boolean;
    }>(
      `WITH fenetres AS (
         SELECT (dqa.fenetre_cloture(dqa.mois_precedent($3))).debut AS debut,
                (dqa.fenetre_cloture($3)).fin                       AS fin
       ),
       produit AS (
         SELECT min(ep.date_debut) AS ouverture, max(ep.date_inventaire) AS cloture
         FROM dqa.mv_p4_ecart_produit ep
         WHERE ep.site_id = $1 AND ep.produit_code = $2 AND ep.mois_paqd = $3
           AND ep.programme_id IS NOT DISTINCT FROM $4
       ),
       site AS (
         SELECT cm.date_ouverture AS ouverture, cm.date_cloture AS cloture
         FROM dqa.mv_cloture_mois cm
         WHERE cm.site_id = $1 AND cm.mois_paqd = $3 AND cm.programme_id IS NOT DISTINCT FROM $4
       ),
       bornes AS (
         SELECT coalesce(p.ouverture, s.ouverture) AS ouverture,
                coalesce(p.cloture, s.cloture)     AS cloture,
                f.debut, f.fin
         FROM fenetres f CROSS JOIN produit p LEFT JOIN site s ON true
       )
       SELECT to_char(coalesce(ouverture, debut), 'YYYY-MM-DD')        AS debut,
              to_char(coalesce(cloture, fin), 'YYYY-MM-DD')            AS fin,
              -- l'inventaire d'ouverture clôt le stock d'ouverture : les
              -- mouvements comptent à partir du lendemain
              to_char(coalesce(ouverture + 1, debut), 'YYYY-MM-DD')    AS debut_mouvements,
              ouverture IS NOT NULL                                    AS ouverture_connue,
              cloture IS NOT NULL                                      AS cloture_connue
       FROM bornes`,
      [siteId, code, mois, prog],
    );
    const pr = per.rows[0]!;
    const periode = {
      debut: pr.debut,
      fin: pr.fin,
      ouvertureConnue: pr.ouverture_connue,
      clotureConnue: pr.cloture_connue,
    };
    // $1 site, $2 code, $3 programme, $4 et $5 : la période, bornes comprises
    const pInventaires = [siteId, code, prog, pr.debut, pr.fin];
    const pMouvements = [siteId, code, prog, pr.debut_mouvements, pr.fin];

    const inventaires = await this.pool.query<{
      date: string;
      statut: string | null;
      theorique: string | null;
      comptee: string | null;
      ecart: string | null;
    }>(
      `SELECT to_char(fi.date_inventaire, 'YYYY-MM-DD')      AS date,
              fi.statut                                      AS statut,
              sum(fil.quantite_theorique)                    AS theorique,
              sum(fil.quantite_comptee)                      AS comptee,
              sum(fil.ecart_absolu)                          AS ecart
       FROM dqa.fact_inventaire fi
       JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
       JOIN dqa.dim_produit p ON p.produit_id = fil.produit_id AND p.produit_code = $2
       WHERE fi.site_id = $1 AND fi.statut = 'fn'
         AND fi.date_inventaire BETWEEN $4::date AND $5::date
         AND ($3::text IS NULL OR fi.programme_id = $3)
       GROUP BY fi.inventaire_id, fi.date_inventaire, fi.statut
       ORDER BY fi.date_inventaire, fi.inventaire_id`,
      pInventaires,
    );

    const snapshots = await this.pool.query<{ date_photo: string; quantite_disponible: string }>(
      `SELECT to_char(fss.date_photo, 'YYYY-MM-DD')  AS date_photo,
              sum(fss.quantite_disponible)          AS quantite_disponible
       FROM dqa.fact_stock_snapshot fss
       JOIN dqa.dim_produit p ON p.produit_id = fss.produit_id AND p.produit_code = $2
       WHERE fss.site_id = $1 AND fss.date_photo BETWEEN $3::date AND $4::date
       GROUP BY fss.date_photo
       ORDER BY fss.date_photo`,
      [siteId, code, pr.debut, pr.fin],
    );

    const receptions = await this.pool.query<{ date: string; quantite: string }>(
      `SELECT to_char(r.jour, 'YYYY-MM-DD') AS date, sum(fl.quantite_unitaire) AS quantite
       FROM dqa.fact_transaction ft
       CROSS JOIN LATERAL (SELECT dqa.date_reception_facture(ft.date_finalisation, ft.date_confirmation, ft.date_saisie) AS jour) r
       JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
       JOIN dqa.dim_produit p ON p.produit_id = fl.produit_id AND p.produit_code = $2
       WHERE ft.site_id = $1 AND ft.nature = 'facture_fournisseur'
         AND ft.statut = 'fn' AND coalesce(ft.annulation, false) = false
         AND NOT coalesce(fl.issu_ajustement, false)
         AND r.jour BETWEEN $4::date AND $5::date
         AND ($3::text IS NULL OR ft.programme_id = $3)
       GROUP BY ft.transaction_id, r.jour
       ORDER BY r.jour, ft.transaction_id`,
      pMouvements,
    );

    // la consommation déclarée d'un district est sa distribution (ADR 0018)
    const dispensations = await this.pool.query<{ total: string | null; nb_jours: number }>(
      `SELECT sum(fl.quantite_unitaire)                                              AS total,
              count(DISTINCT coalesce(ft.date_confirmation, ft.date_saisie))::int    AS nb_jours
       FROM dqa.fact_transaction ft
       JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
       JOIN dqa.dim_produit p ON p.produit_id = fl.produit_id AND p.produit_code = $2
       WHERE ft.site_id = $1 AND ft.statut = 'fn'
         AND ft.nature = $6
         AND coalesce(ft.annulation, false) = false
         AND coalesce(ft.date_confirmation, ft.date_saisie) BETWEEN $4::date AND $5::date
         AND ($3::text IS NULL OR ft.programme_id = $3)`,
      [...pMouvements, siteRow.est_district ? 'distribution' : 'dispensation'],
    );

    const ajustements = await this.pool.query<{
      date: string;
      quantite: string;
      sens: 'positif' | 'negatif';
    }>(
      `SELECT to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM-DD') AS date,
              fl.quantite_unitaire                                                 AS quantite,
              CASE
                WHEN ft.nature = 'ajustement_negatif' THEN 'negatif'
                WHEN ft.nature = 'ajustement_positif' THEN 'positif'
                WHEN fl.quantite_unitaire < 0 THEN 'negatif'
                ELSE 'positif'
              END                                                                  AS sens
       FROM dqa.fact_transaction ft
       JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
       JOIN dqa.dim_produit p ON p.produit_id = fl.produit_id AND p.produit_code = $2
       WHERE ft.site_id = $1 AND ft.statut = 'fn'
         AND coalesce(ft.annulation, false) = false
         AND coalesce(ft.date_confirmation, ft.date_saisie) BETWEEN $4::date AND $5::date
         AND ($3::text IS NULL OR ft.programme_id = $3)
         AND (fl.issu_ajustement OR ft.nature IN ('ajustement_positif', 'ajustement_negatif'))
       ORDER BY coalesce(ft.date_confirmation, ft.date_saisie), fl.ligne_id`,
      pMouvements,
    );

    const conso = await this.pool.query<{
      stock_debut: string | null;
      stock_fin: string | null;
      declaree: string | null;
      reconstituee: string | null;
      ecart: string | null;
    }>(
      // un code = un produit : ses articles s'additionnent, et la consommation
      // n'est connue que si chacun a ses deux bornes (ADR 0016)
      `SELECT CASE WHEN bool_and(ep.conso_borne_ok) THEN sum(ep.stock_debut) END  AS stock_debut,
              CASE WHEN bool_and(ep.conso_borne_ok) THEN sum(ep.stock_fin) END    AS stock_fin,
              CASE WHEN bool_and(ep.conso_borne_ok) THEN sum(ep.declaree) END     AS declaree,
              CASE WHEN bool_and(ep.conso_borne_ok) THEN sum(ep.reconstituee) END AS reconstituee,
              CASE WHEN bool_and(ep.conso_borne_ok) THEN sum(ep.ecart_conso) END  AS ecart
       FROM dqa.mv_p4_ecart_produit ep
       WHERE ep.site_id = $1 AND ep.produit_code = $2 AND ep.mois_paqd = $3
         AND ep.programme_id IS NOT DISTINCT FROM $4`,
      [siteId, code, mois, prog],
    );
    const cp = conso.rows[0];

    const calculeLe = await this.horodatageGelFiche(siteId, mois, prog);

    // Toute écriture du core sur la période après le gel : la fiche, lue en
    // direct, peut alors différer des comptes figés.
    const maj = await this.pool.query<{ core_maj_le: Date | null }>(
      `SELECT GREATEST(
         (SELECT max(GREATEST(fi.maj_le, fil.maj_le)) FROM dqa.fact_inventaire fi
            JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
            JOIN dqa.dim_produit p ON p.produit_id = fil.produit_id AND p.produit_code = $2
           WHERE fi.site_id = $1 AND fi.statut = 'fn'
             AND fi.date_inventaire BETWEEN $4::date AND $5::date
             AND ($3::text IS NULL OR fi.programme_id = $3)),
         (SELECT max(fss.maj_le) FROM dqa.fact_stock_snapshot fss
            JOIN dqa.dim_produit p ON p.produit_id = fss.produit_id AND p.produit_code = $2
           WHERE fss.site_id = $1 AND fss.date_photo BETWEEN $4::date AND $5::date),
         (SELECT max(GREATEST(ft.maj_le, fl.maj_le)) FROM dqa.fact_transaction ft
            JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
            JOIN dqa.dim_produit p ON p.produit_id = fl.produit_id AND p.produit_code = $2
           WHERE ft.site_id = $1 AND coalesce(ft.annulation, false) = false
             AND CASE WHEN ft.nature = 'facture_fournisseur'
                      THEN dqa.date_reception_facture(ft.date_finalisation, ft.date_confirmation, ft.date_saisie)
                      ELSE coalesce(ft.date_confirmation, ft.date_saisie)
                 END BETWEEN $6::date AND $5::date
             AND ($3::text IS NULL OR ft.programme_id = $3)
             AND (fl.issu_ajustement
                  OR ft.nature IN ('facture_fournisseur', 'dispensation', 'distribution',
                                   'ajustement_positif', 'ajustement_negatif')))
       ) AS core_maj_le`,
      [...pInventaires, pr.debut_mouvements],
    );
    const coreMajLe = maj.rows[0]?.core_maj_le ?? null;

    return {
      ...commun,
      periode,
      inventaires: inventaires.rows.map((r) => ({
        date: r.date,
        statut: r.statut,
        theorique: nombreOuNull(r.theorique),
        comptee: nombreOuNull(r.comptee),
        ecart: nombreOuNull(r.ecart),
      })),
      snapshots: snapshots.rows.map((r) => ({
        datePhoto: r.date_photo,
        quantiteDisponible: Number(r.quantite_disponible),
      })),
      receptions: receptions.rows.map((r) => ({ date: r.date, quantite: Number(r.quantite) })),
      dispensations: {
        total: Number(dispensations.rows[0]?.total ?? 0),
        nbJours: dispensations.rows[0]?.nb_jours ?? 0,
      },
      ajustements: ajustements.rows.map((r) => ({
        date: r.date,
        quantite: Number(r.quantite),
        sens: r.sens,
      })),
      consommation: {
        reconstituee: nombreOuNull(cp?.reconstituee ?? null),
        declaree: nombreOuNull(cp?.declaree ?? null),
        ecart: nombreOuNull(cp?.ecart ?? null),
      },
      stockDebut: nombreOuNull(cp?.stock_debut ?? null),
      stockFin: nombreOuNull(cp?.stock_fin ?? null),
      calculeLe: calculeLe ? calculeLe.toISOString() : null,
      coreMajLe: coreMajLe ? coreMajLe.toISOString() : null,
      reimporteDepuisLeGel:
        calculeLe !== null && coreMajLe !== null && coreMajLe.getTime() > calculeLe.getTime(),
    };
  }

  /**
   * Horodatage du gel des comptes du mois pour la fiche produit (transverse aux
   * piliers) : `max(calcule_le)` de `hist_pilier_brut`, à défaut celui du score.
   */
  private async horodatageGelFiche(
    siteId: string,
    mois: string,
    prog: string | null,
  ): Promise<Date | null> {
    const brut = await this.pool.query<{ calcule_le: Date | null }>(
      `SELECT max(calcule_le) AS calcule_le FROM dqa.hist_pilier_brut
       WHERE site_id = $1 AND mois_paqd = $2 AND programme_id IS NOT DISTINCT FROM $3`,
      [siteId, mois, prog],
    );
    if (brut.rows[0]?.calcule_le) return brut.rows[0].calcule_le;
    const score = await this.pool.query<{ calcule_le: Date | null }>(
      `SELECT calcule_le FROM dqa.hist_score_site
       WHERE site_id = $1 AND mois_paqd = $2 AND programme_id IS NOT DISTINCT FROM $3`,
      [siteId, mois, prog],
    );
    return score.rows[0]?.calcule_le ?? null;
  }
}
