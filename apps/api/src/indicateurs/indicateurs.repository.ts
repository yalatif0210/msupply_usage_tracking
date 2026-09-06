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
  POIDS_PILIER,
  SOUS_COMPOSANTES,
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
  type HistoriqueQuery,
  type HistoriqueSite,
  type LigneProduitP4P5,
  type MesureSousComposante,
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
  type StatutSousComposante,
  TOP_SOUS_COMPOSANTES_DIFFICULTE,
  type SyntheseNationale,
  type SyntheseQuery,
  type SyntheseRapports,
  type TableauDeBord,
} from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';

interface LigneSite {
  site_id: string;
  site_code: string | null;
  site_nom: string;
  district: string | null;
  region: string | null;
  type_structure: string | null;
}

/**
 * Valeurs brutes d'une sous-composante telles que rendues par `pg` (texte) :
 * `pct` = taux mesuré, `score` = 100 / 0 / null (CONFORME / ALERTE / NON_CALCULABLE).
 * Les deux voyagent toujours ensemble.
 */
interface ValeurBrute {
  pct: string | null;
  score: string | null;
}

const brute = (pct: string | null | undefined, score: string | null | undefined): ValeurBrute => ({
  pct: pct ?? null,
  score: score ?? null,
});

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
const dixSousComposantes = (m: AtteintesParSc | null): SousComposanteBref[] =>
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
}

const moyennesPiliers = (
  r: MoyennesPilierBrutes | undefined,
): SyntheseNationale['national']['moyennesPiliers'] => [
  { pilier: 'P1', moyenne: nombreOuNull(r?.moy_p_completude ?? null) },
  { pilier: 'P2', moyenne: nombreOuNull(r?.moy_p_promptitude ?? null) },
  { pilier: 'P3', moyenne: nombreOuNull(r?.moy_p_regularite ?? null) },
  { pilier: 'P4', moyenne: nombreOuNull(r?.moy_p_ecart_sdu ?? null) },
  { pilier: 'P5', moyenne: nombreOuNull(r?.moy_p_concordance ?? null) },
  { pilier: 'P6', moyenne: nombreOuNull(r?.moy_p_ajustements ?? null) },
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
    const mois = q.mois && moisDisponibles.includes(q.mois) ? q.mois : moisDisponibles[0];

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
      };
    }

    const national = await this.pool.query<LigneSynthese & MoyennesPilierBrutes>(
      `SELECT nb_sites::int, nb_mesures::int, score_composite_moyen,
              nb_conforme::int, nb_partiellement_conforme::int,
              nb_non_conforme::int, nb_sans_mesure::int,
              moy_p_completude, moy_p_promptitude, moy_p_regularite,
              moy_p_ecart_sdu, moy_p_concordance, moy_p_ajustements
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
    const mois = q.mois && moisDisponibles.includes(q.mois) ? q.mois : moisDisponibles[0];

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
    const mois = moisValide ?? points.at(-1)?.moisPaqd ?? null;

    if (mois === null) {
      return {
        moisPaqd: null,
        moisClos: true,
        national: versBloc(undefined),
        progression: [],
        sousComposantesEnDifficulte: [],
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
        WHERE sp.site_id = s.site_id AND sp.programme_id = $${idxProg})`);
    }

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
         SELECT h.site_id, max(h.mois_paqd) AS mois_paqd
         FROM dqa.hist_score_site h
         WHERE h.programme_id IS NOT DISTINCT FROM $${idxProg}
         GROUP BY h.site_id
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
        sousComposantes: dixSousComposantes(null),
      };
    }

    const { rows } = await this.pool.query<{
      sc: AtteintesParSc | null;
      score_composite: string | null;
      classification: Classification | null;
      piliers_couverts: number | null;
      p_completude: string | null;
      p_promptitude: string | null;
      p_regularite: string | null;
      p_ecart_sdu: string | null;
      p_concordance: string | null;
      p_ajustements: string | null;
      completude_inventaires_pct: string | null;
      completude_requisitions_pct: string | null;
      completude_receptions_pct: string | null;
      score_inventaires: string | null;
      score_requisitions: string | null;
      score_receptions: string | null;
      promptitude_inventaires_pct: string | null;
      promptitude_requisitions_pct: string | null;
      p2_score_inventaires: string | null;
      p2_score_requisitions: string | null;
      taux_regularite_pct: string | null;
      est_district: boolean;
      taux_sdu_pct: string | null;
      taux_conso_pct: string | null;
      score_sdu: string | null;
      score_conso: string | null;
      taux_concordance_pct: string | null;
      ratio_ajustements_pct: string | null;
      seuil_completude: string | null;
      seuil_promptitude: string | null;
      seuil_regularite: string | null;
      seuil_ecart_sdu: string | null;
      seuil_ecart_conso: string | null;
      seuil_concordance: string | null;
      seuil_ajustements: string | null;
    }>(
      `SELECT h.score_composite, h.classification, vsc.sc,
              ${COMPTE_PILIERS_SQL} AS piliers_couverts,
              h.p_completude, h.p_promptitude, h.p_regularite,
              h.p_ecart_sdu, h.p_concordance, h.p_ajustements,
              p1.completude_inventaires_pct, p1.completude_requisitions_pct, p1.completude_receptions_pct,
              p1.score_inventaires, p1.score_requisitions, p1.score_receptions,
              p2.promptitude_inventaires_pct, p2.promptitude_requisitions_pct,
              p2.score_inventaires AS p2_score_inventaires,
              p2.score_requisitions AS p2_score_requisitions,
              p3.taux_regularite_pct, coalesce(p3.est_district, false) AS est_district,
              p4.taux_sdu_pct, p4.taux_conso_pct, p4.score_sdu, p4.score_conso,
              p5.taux_concordance_pct, p6.ratio_ajustements_pct,
              sc1.seuil AS seuil_completude,
              sc2.seuil AS seuil_promptitude,
              CASE WHEN coalesce(p3.est_district, false) AND sc3.seuil_district IS NOT NULL
                   THEN sc3.seuil_district ELSE sc3.seuil END AS seuil_regularite,
              sc4s.seuil AS seuil_ecart_sdu, sc4c.seuil AS seuil_ecart_conso,
              sc5.seuil AS seuil_concordance, sc6.seuil AS seuil_ajustements
       FROM dqa.hist_score_site h
       LEFT JOIN dqa.mv_p1_completude p1
              ON p1.site_id = h.site_id AND p1.mois_paqd = h.mois_paqd
             AND p1.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.mv_p2_promptitude p2
              ON p2.site_id = h.site_id AND p2.mois_paqd = h.mois_paqd
             AND p2.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.mv_p3_regularite p3
              ON p3.site_id = h.site_id AND p3.mois_paqd = h.mois_paqd
             AND p3.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.mv_p4_ecart p4
              ON p4.site_id = h.site_id AND p4.mois_paqd = h.mois_paqd
             AND p4.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.mv_p5_concordance p5
              ON p5.site_id = h.site_id AND p5.mois_paqd = h.mois_paqd
             AND p5.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.mv_p6_ajustements p6
              ON p6.site_id = h.site_id AND p6.mois_paqd = h.mois_paqd
             AND p6.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.grille_seuil_sous_composante sc1
              ON sc1.grille_id = h.grille_id AND sc1.sous_composante = 'completude_inventaires'
       LEFT JOIN dqa.grille_seuil_sous_composante sc2
              ON sc2.grille_id = h.grille_id AND sc2.sous_composante = 'promptitude_inventaires'
       LEFT JOIN dqa.grille_seuil_sous_composante sc3
              ON sc3.grille_id = h.grille_id AND sc3.sous_composante = 'regularite_saisie'
       LEFT JOIN dqa.grille_seuil_sous_composante sc4s
              ON sc4s.grille_id = h.grille_id AND sc4s.sous_composante = 'ecart_sdu'
       LEFT JOIN dqa.grille_seuil_sous_composante sc4c
              ON sc4c.grille_id = h.grille_id AND sc4c.sous_composante = 'ecart_consommation'
       LEFT JOIN dqa.grille_seuil_sous_composante sc5
              ON sc5.grille_id = h.grille_id AND sc5.sous_composante = 'concordance'
       LEFT JOIN dqa.grille_seuil_sous_composante sc6
              ON sc6.grille_id = h.grille_id AND sc6.sous_composante = 'ratio_ajustements'
       ${ATTEINTE_JSONB_SQL}
       WHERE h.site_id = $1 AND h.mois_paqd = $2 AND h.programme_id IS NOT DISTINCT FROM $3`,
      [siteId, mois, prog],
    );
    const h = rows[0];
    const moisClos = await this.moisEstClos(mois);

    const piliers: ScorePilier[] = [
      this.pilierP1(h?.p_completude ?? null, h?.seuil_completude ?? null, {
        inv: brute(h?.completude_inventaires_pct, h?.score_inventaires),
        req: brute(h?.completude_requisitions_pct, h?.score_requisitions),
        rec: brute(h?.completude_receptions_pct, h?.score_receptions),
      }),
      this.pilierP2(h?.p_promptitude ?? null, h?.seuil_promptitude ?? null, {
        inv: brute(h?.promptitude_inventaires_pct, h?.p2_score_inventaires),
        req: brute(h?.promptitude_requisitions_pct, h?.p2_score_requisitions),
      }),
      this.pilierP3(h?.p_regularite ?? null, h?.seuil_regularite ?? null,
        brute(h?.taux_regularite_pct, h?.p_regularite), estDistrict),
      this.pilierP4(h?.p_ecart_sdu ?? null, {
        sdu: brute(h?.taux_sdu_pct, h?.score_sdu),
        seuilSdu: h?.seuil_ecart_sdu ?? null,
        conso: brute(h?.taux_conso_pct, h?.score_conso),
        seuilConso: h?.seuil_ecart_conso ?? null,
      }, estDistrict, moisClos),
      this.pilierP5(h?.p_concordance ?? null, h?.seuil_concordance ?? null,
        brute(h?.taux_concordance_pct, h?.p_concordance), moisClos),
      this.pilierP6(h?.p_ajustements ?? null, h?.seuil_ajustements ?? null,
        brute(h?.ratio_ajustements_pct, h?.p_ajustements)),
    ];

    const comptesParPilier = await this.comptesBrutsParPilier(siteId, mois, prog, estDistrict);

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
      piliers: piliers.map((p) => ({ ...p, comptesBruts: comptesParPilier.get(p.pilier) ?? [] })),
      sousComposantes: dixSousComposantes(h?.sc ?? null),
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
        sousComposantes: dixSousComposantes(r.sc),
        moisClos: r.mois_clos,
      })),
    };
  }

  /** Une sous-composante rendue : statut binaire dérivé du score de sous-composante. */
  private mesure(
    sc: SousComposante,
    m: ValeurBrute,
    seuil: string | null,
    raisonNC: string,
    libelle: string = LIBELLES_SOUS_COMPOSANTE[sc],
  ): MesureSousComposante {
    const statut = m.score === null ? 'NON_CALCULABLE' : Number(m.score) >= 100 ? 'CONFORME' : 'ALERTE';
    return {
      sousComposante: sc,
      libelle,
      valeur: nombreOuNull(m.pct),
      unite: 'pct',
      seuil: nombreOuNull(seuil),
      statut,
      raison: statut === 'NON_CALCULABLE' ? raisonNC : null,
    };
  }

  private pilierP1(
    score: string | null,
    seuil: string | null,
    m: { inv: ValeurBrute; req: ValeurBrute; rec: ValeurBrute },
  ): ScorePilier {
    // NON_CALCULABLE ici = le mois n'a ni inventaire ni réquisition à évaluer
    // (le site n'a rien transmis, ou n'a aucun programme géré déclaré).
    const raisonNC = 'Aucun inventaire ni réquisition transmis pour ce mois';
    return this.envelopper('P1', score, [
      this.mesure('completude_inventaires', m.inv, seuil, raisonNC),
      this.mesure('completude_requisitions', m.req, seuil, raisonNC),
      this.mesure('completude_receptions', m.rec, seuil,
        'Aucune facture fournisseur adressée au site ce mois'),
    ]);
  }

  private pilierP2(
    score: string | null,
    seuil: string | null,
    m: { inv: ValeurBrute; req: ValeurBrute },
  ): ScorePilier {
    const raisonNC = 'Aucun inventaire ni réquisition transmis pour ce mois';
    return this.envelopper('P2', score, [
      this.mesure('promptitude_inventaires', m.inv, seuil, raisonNC),
      this.mesure('promptitude_requisitions', m.req, seuil, raisonNC),
    ]);
  }

  private pilierP3(
    score: string | null,
    seuil: string | null,
    m: ValeurBrute,
    estDistrict: boolean,
  ): ScorePilier {
    const p = this.envelopper('P3', score, [
      this.mesure(
        'regularite_saisie',
        m,
        seuil,
        estDistrict
          ? 'Aucune réquisition de la zone du district à évaluer ce mois'
          : 'Aucune sortie de stock exploitable sur le mois',
        libelleSousComposante('regularite_saisie', estDistrict),
      ),
    ]);
    // Libellé adaptatif (ADR 0011) : la sous-composante est unique, l'écran
    // distingue le district par le suffixe.
    return { ...p, libelle: libelleSousComposante('regularite_saisie', estDistrict) };
  }

  /** Régime district (`dqa.est_district`) : P3 mesuré autrement (ADR 0011, ADR 0013). */
  private async estSiteDistrict(siteId: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ d: boolean }>(
      `SELECT dqa.est_district(type_structure) AS d FROM dqa.dim_site WHERE site_id = $1`,
      [siteId],
    );
    return rows[0]?.d ?? false;
  }

  // Mois en cours (ADR 0014) : l'inventaire de fin de mois n'est pas encore
  // attendu, donc P4 et P5 sont non calculables plutôt que réputés à 0 %.
  private static readonly RAISON_MOIS_EN_COURS =
    'Inventaire de fin de mois pas encore attendu (mois en cours)';

  private pilierP4(
    score: string | null,
    m: { sdu: ValeurBrute; seuilSdu: string | null; conso: ValeurBrute; seuilConso: string | null },
    estDistrict: boolean,
    moisClos: boolean,
  ): ScorePilier {
    // Pour un district, l'écart consommation se lit « écart distribution » :
    // la consommation déclarée compte les quantités distribuées (ADR 0012).
    const flux = estDistrict ? 'distribution' : 'consommation';
    const raisonSdu = moisClos
      ? 'Un inventaire du mois est présent mais sans produit traceur exploitable'
      : IndicateursRepository.RAISON_MOIS_EN_COURS;
    const raisonConso = moisClos
      ? `Les inventaires bornants existent mais aucune ${flux} reconstituée n'est positive`
      : IndicateursRepository.RAISON_MOIS_EN_COURS;
    return this.envelopper('P4', score, [
      this.mesure('ecart_sdu', m.sdu, m.seuilSdu, raisonSdu),
      this.mesure(
        'ecart_consommation',
        m.conso,
        m.seuilConso,
        raisonConso,
        libelleSousComposante('ecart_consommation', estDistrict),
      ),
    ]);
  }

  private pilierP5(
    score: string | null,
    seuil: string | null,
    m: ValeurBrute,
    moisClos: boolean,
  ): ScorePilier {
    const raison = moisClos
      ? 'Un inventaire du mois est présent mais sans produit traceur exploitable'
      : IndicateursRepository.RAISON_MOIS_EN_COURS;
    return this.envelopper('P5', score, [this.mesure('concordance', m, seuil, raison)]);
  }

  private pilierP6(score: string | null, seuil: string | null, m: ValeurBrute): ScorePilier {
    return this.envelopper('P6', score, [
      this.mesure('ratio_ajustements', m, seuil, 'Aucun mouvement de stock pour le mois'),
    ]);
  }

  private envelopper(
    pilier: Pilier,
    score: string | null,
    sousComposantes: MesureSousComposante[],
  ): ScorePilier {
    return {
      pilier,
      libelle: LIBELLES_PILIER[pilier],
      poids: POIDS_PILIER[pilier] * 100,
      score: score === null ? null : Number(score),
      sousComposantes,
      comptesBruts: [],
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
          return { ...vide, code, inventaires: [], requisitions: [], receptions: [], factures: [], programmesGeres: [] };
        case 'p2':
          return { ...vide, code, inventaires: [], requisitions: [] };
        case 'p3':
          return { ...vide, code, jours: [], reponseZone: null };
        case 'p4':
          return { ...vide, code, estDistrict, produits: [] };
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
    Pick<
      DetailPilierP1,
      'inventaires' | 'requisitions' | 'receptions' | 'factures' | 'programmesGeres'
    > & { coreMajLe: Date | null }
  > {
    const params = [siteId, mois, prog];

    const inventaires = await this.pool.query<{ date: string; programme: string }>(
      `SELECT to_char(fi.date_inventaire, 'YYYY-MM-DD') AS date,
              coalesce(nullif(dp.programme_nom, ''), fi.programme_id, 'Sans programme') AS programme
       FROM dqa.fact_inventaire fi
       LEFT JOIN dqa.dim_programme dp ON dp.programme_id = fi.programme_id
       WHERE fi.site_id = $1 AND fi.statut = 'fn'
         AND to_char(fi.date_inventaire, 'YYYY-MM') = $2
         AND ($3::text IS NULL OR fi.programme_id = $3)
       ORDER BY fi.date_inventaire, programme`,
      params,
    );

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

    const receptions = await this.pool.query<{ date: string; reference: string | null }>(
      `SELECT to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM-DD') AS date,
              coalesce(nullif(ft.goods_received_id, ''), nullif(ft.commentaire, '')) AS reference
       FROM dqa.fact_transaction ft
       WHERE ft.site_id = $1 AND ft.nature = 'reception'
         AND coalesce(ft.statut, '') = 'fn' AND coalesce(ft.annulation, false) = false
         AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $2
         AND ($3::text IS NULL OR ft.programme_id = $3)
       ORDER BY coalesce(ft.date_confirmation, ft.date_saisie)`,
      params,
    );

    const factures = await this.pool.query<{ date: string; reference: string | null }>(
      `SELECT to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM-DD') AS date,
              coalesce(nullif(ft.goods_received_id, ''), nullif(ft.commentaire, '')) AS reference
       FROM dqa.fact_transaction ft
       WHERE ft.site_id = $1 AND ft.nature = 'facture_fournisseur'
         AND coalesce(ft.annulation, false) = false
         AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $2
         AND ($3::text IS NULL OR ft.programme_id = $3)
       ORDER BY coalesce(ft.date_confirmation, ft.date_saisie)`,
      params,
    );

    const programmesGeres = await this.pool.query<{
      programme: string;
      a_inventaire: boolean;
      a_requisition: boolean;
    }>(
      `SELECT coalesce(nullif(dp.programme_nom, ''), sp.programme_id) AS programme,
              EXISTS (SELECT 1 FROM dqa.fact_inventaire fi
                       WHERE fi.site_id = sp.site_id AND fi.statut = 'fn'
                         AND fi.programme_id = sp.programme_id
                         AND to_char(fi.date_inventaire, 'YYYY-MM') = $2
                         AND fi.date_inventaire >= (date_trunc('month', fi.date_inventaire)
                                                    + interval '1 month' - interval '3 days')::date) AS a_inventaire,
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
         (SELECT max(fi.maj_le) FROM dqa.fact_inventaire fi
           WHERE fi.site_id = $1 AND fi.statut = 'fn'
             AND to_char(fi.date_inventaire, 'YYYY-MM') = $2
             AND ($3::text IS NULL OR fi.programme_id = $3)),
         (SELECT max(fr.maj_le) FROM dqa.fact_requisition fr
           WHERE fr.site_id = $1 AND fr.mois_couvert = $2
             AND ($3::text IS NULL OR fr.programme_id = $3)),
         (SELECT max(ft.maj_le) FROM dqa.fact_transaction ft
           WHERE ft.site_id = $1 AND ft.nature IN ('reception', 'facture_fournisseur')
             AND coalesce(ft.annulation, false) = false
             AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $2
             AND ($3::text IS NULL OR ft.programme_id = $3))
       ) AS core_maj_le`,
      params,
    );

    return {
      inventaires: inventaires.rows,
      requisitions: requisitions.rows.map((r) => ({
        programme: r.programme,
        moisCouvert: r.mois_couvert,
        dateSoumission: r.date_soumission,
      })),
      receptions: receptions.rows,
      factures: factures.rows,
      programmesGeres: programmesGeres.rows.map((r) => ({
        programme: r.programme,
        aInventaire: r.a_inventaire,
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
    Pick<DetailPilierP2, 'inventaires' | 'requisitions'> & { coreMajLe: Date | null }
  > {
    const params = [siteId, mois, prog];

    const inventaires = await this.pool.query<{
      date: string;
      programme: string;
      dans_les_3_derniers_jours: boolean;
    }>(
      `SELECT to_char(fi.date_inventaire, 'YYYY-MM-DD') AS date,
              coalesce(nullif(dp.programme_nom, ''), fi.programme_id, 'Sans programme') AS programme,
              fi.date_inventaire >= (date_trunc('month', fi.date_inventaire)
                                     + interval '1 month' - interval '3 days')::date
                AS dans_les_3_derniers_jours
       FROM dqa.fact_inventaire fi
       LEFT JOIN dqa.dim_programme dp ON dp.programme_id = fi.programme_id
       WHERE fi.site_id = $1 AND fi.statut = 'fn'
         AND to_char(fi.date_inventaire, 'YYYY-MM') = $2
         AND ($3::text IS NULL OR fi.programme_id = $3)
       ORDER BY fi.date_inventaire, programme`,
      params,
    );

    // Date limite : `dqa.jour_limite_requisition` lit le référentiel des
    // structures (ADR 0013) — mois couvert + 1 mois + (jour limite - 1) jours.
    const requisitions = await this.pool.query<{
      programme: string;
      date_soumission: string | null;
      date_limite: string;
      a_lheure: boolean;
    }>(
      `SELECT coalesce(nullif(dp.programme_nom, ''), fr.programme_id, 'Sans programme') AS programme,
              to_char(fr.date_soumission, 'YYYY-MM-DD') AS date_soumission,
              to_char(lim.date_limite, 'YYYY-MM-DD') AS date_limite,
              (fr.date_soumission IS NOT NULL AND fr.date_soumission <= lim.date_limite) AS a_lheure
       FROM dqa.fact_requisition fr
       JOIN dqa.dim_site ds ON ds.site_id = fr.site_id
       LEFT JOIN dqa.dim_programme dp ON dp.programme_id = fr.programme_id
       CROSS JOIN LATERAL (
         SELECT (date_trunc('month', (fr.mois_couvert || '-01')::date) + interval '1 month')::date
                + (dqa.jour_limite_requisition(ds.type_structure) - 1) AS date_limite
       ) lim
       WHERE fr.site_id = $1 AND fr.mois_couvert = $2
         AND ($3::text IS NULL OR fr.programme_id = $3)
       ORDER BY programme`,
      params,
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
      coreMajLe: maj.rows[0]?.core_maj_le ?? null,
    };
  }


  /**
   * Détail de P3. Pour un district (ADR 0011) : le couple réquisitions de la
   * zone couvrant M-1 / servies dans M par une distribution liée. Sinon : le
   * bandeau calendaire (un item par jour du mois PAQD, marqué s'il a porté ≥ 1
   * sortie de stock — mêmes prédicats que `mv_p3_regularite`).
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
           WHERE ft.site_id = $1 AND ft.nature = 'distribution'
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
       WHERE ft.site_id = $1
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
       WHERE ft.site_id = $1
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
   * `mv_p5_concordance`) — jamais recalculée ici.
   */
  private async detailPilierP4(
    siteId: string,
    mois: string,
    prog: string | null,
    estDistrict: boolean,
  ): Promise<Pick<DetailPilierP4, 'produits' | 'estDistrict'> & { coreMajLe: Date | null }> {
    const params = [siteId, mois, prog];

    // `mv_p4_ecart_produit` restreint déjà aux sites du périmètre et aux
    // traceurs actifs ; l'appelant a écarté un site hors périmètre.
    const { rows } = await this.pool.query<{
      produit_code: string;
      libelle: string | null;
      theorique: string | null;
      comptee: string | null;
      ecart_sdu_pct: string | null;
      sdu_conforme: boolean;
      stock_debut: string | null;
      stock_fin: string | null;
      receptions: string | null;
      declaree: string | null;
      reconstituee: string | null;
      conso_evaluable: boolean;
      conso_raison_exclusion: RaisonExclusionConso | null;
      ecart_conso_pct: string | null;
      conso_conforme: boolean;
      concordance_pct: string | null;
      concordance_conforme: boolean;
    }>(
      `SELECT ep.produit_code, ep.libelle, ep.theorique, ep.comptee,
              ep.ecart_sdu_pct, ep.sdu_conforme,
              ep.stock_debut, ep.stock_fin, ep.receptions, ep.declaree, ep.reconstituee,
              ep.conso_evaluable, ep.conso_raison_exclusion, ep.ecart_conso_pct, ep.conso_conforme,
              ep.concordance_pct, ep.concordance_conforme
       FROM dqa.mv_p4_ecart_produit ep
       WHERE ep.site_id = $1 AND ep.mois_paqd = $2 AND ep.programme_id IS NOT DISTINCT FROM $3
       ORDER BY ep.sdu_conforme, ep.produit_code`,
      params,
    );

    const maj = await this.pool.query<{ core_maj_le: Date | null }>(
      `SELECT GREATEST(
         (SELECT max(fi.maj_le) FROM dqa.fact_inventaire fi
           WHERE fi.site_id = $1 AND fi.statut = 'fn'
             AND to_char(fi.date_inventaire, 'YYYY-MM') = $2
             AND ($3::text IS NULL OR fi.programme_id = $3)),
         (SELECT max(fil.maj_le) FROM dqa.fact_inventaire_ligne fil
           JOIN dqa.fact_inventaire fi ON fi.inventaire_id = fil.inventaire_id
           WHERE fi.site_id = $1 AND fi.statut = 'fn'
             AND to_char(fi.date_inventaire, 'YYYY-MM') = $2
             AND ($3::text IS NULL OR fi.programme_id = $3)),
         (SELECT max(ft.maj_le) FROM dqa.fact_transaction ft
           WHERE ft.site_id = $1 AND ft.nature IN ('reception', 'dispensation', 'distribution')
             AND coalesce(ft.annulation, false) = false
             AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $2
             AND ($3::text IS NULL OR ft.programme_id = $3))
       ) AS core_maj_le`,
      params,
    );

    const produits: LigneProduitP4P5[] = rows.map((r) => ({
      produitCode: r.produit_code,
      libelle: r.libelle,
      sdu: {
        theorique: nombreOuNull(r.theorique),
        comptee: nombreOuNull(r.comptee),
        ecartPct: nombreOuNull(r.ecart_sdu_pct),
        conforme: r.sdu_conforme,
      },
      consommation: r.conso_evaluable
        ? {
            evaluable: true,
            stockDebut: Number(r.stock_debut),
            stockFin: Number(r.stock_fin),
            receptions: Number(r.receptions),
            declaree: Number(r.declaree),
            reconstituee: Number(r.reconstituee),
            ecartPct: Number(r.ecart_conso_pct),
            conforme: r.conso_conforme,
          }
        : { evaluable: false, raisonExclusion: r.conso_raison_exclusion ?? 'aucune_borne' },
      concordance: {
        tauxPct: nombreOuNull(r.concordance_pct),
        conforme: r.concordance_conforme,
      },
    }));

    return { produits, estDistrict, coreMajLe: maj.rows[0]?.core_maj_le ?? null };
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
    const site = await this.pool.query<LigneSite>(
      `SELECT site_id, site_code, site_nom, district, region, type_structure
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
    };

    if (!mois) {
      return {
        ...commun,
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

    const params = [siteId, code, mois, prog];

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
         AND to_char(fi.date_inventaire, 'YYYY-MM') = $3
         AND ($4::text IS NULL OR fi.programme_id = $4)
       GROUP BY fi.inventaire_id, fi.date_inventaire, fi.statut
       ORDER BY fi.date_inventaire, fi.inventaire_id`,
      params,
    );

    const snapshots = await this.pool.query<{ date_photo: string; quantite_disponible: string }>(
      `SELECT to_char(fss.date_photo, 'YYYY-MM-DD')  AS date_photo,
              sum(fss.quantite_disponible)          AS quantite_disponible
       FROM dqa.fact_stock_snapshot fss
       JOIN dqa.dim_produit p ON p.produit_id = fss.produit_id AND p.produit_code = $2
       WHERE fss.site_id = $1 AND to_char(fss.date_photo, 'YYYY-MM') = $3
       GROUP BY fss.date_photo
       ORDER BY fss.date_photo`,
      [siteId, code, mois],
    );

    const receptions = await this.pool.query<{ date: string; quantite: string }>(
      `SELECT to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM-DD') AS date,
              sum(fl.quantite_unitaire)                                            AS quantite
       FROM dqa.fact_transaction ft
       JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
       JOIN dqa.dim_produit p ON p.produit_id = fl.produit_id AND p.produit_code = $2
       WHERE ft.site_id = $1 AND ft.nature = 'reception'
         AND coalesce(ft.statut, '') = 'fn' AND coalesce(ft.annulation, false) = false
         AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
         AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $3
         AND ($4::text IS NULL OR ft.programme_id = $4)
       GROUP BY ft.transaction_id, coalesce(ft.date_confirmation, ft.date_saisie)
       ORDER BY coalesce(ft.date_confirmation, ft.date_saisie), ft.transaction_id`,
      params,
    );

    const dispensations = await this.pool.query<{ total: string | null; nb_jours: number }>(
      `SELECT sum(fl.quantite_unitaire)                                              AS total,
              count(DISTINCT coalesce(ft.date_confirmation, ft.date_saisie))::int    AS nb_jours
       FROM dqa.fact_transaction ft
       JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
       JOIN dqa.dim_produit p ON p.produit_id = fl.produit_id AND p.produit_code = $2
       WHERE ft.site_id = $1 AND ft.nature = 'dispensation'
         AND coalesce(ft.annulation, false) = false
         AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
         AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $3
         AND ($4::text IS NULL OR ft.programme_id = $4)`,
      params,
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
       WHERE ft.site_id = $1
         AND coalesce(ft.annulation, false) = false
         AND coalesce(ft.date_confirmation, ft.date_saisie) IS NOT NULL
         AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $3
         AND ($4::text IS NULL OR ft.programme_id = $4)
         AND (fl.issu_ajustement OR ft.nature IN ('ajustement_positif', 'ajustement_negatif'))
       ORDER BY coalesce(ft.date_confirmation, ft.date_saisie), fl.ligne_id`,
      params,
    );

    const conso = await this.pool.query<{
      stock_debut: string | null;
      stock_fin: string | null;
      declaree: string | null;
      reconstituee: string | null;
    }>(
      `SELECT ep.stock_debut, ep.stock_fin, ep.declaree, ep.reconstituee
       FROM dqa.mv_p4_ecart_produit ep
       WHERE ep.site_id = $1 AND ep.produit_code = $2 AND ep.mois_paqd = $3
         AND ep.programme_id IS NOT DISTINCT FROM $4`,
      params,
    );
    const cp = conso.rows[0];
    const reconstituee = nombreOuNull(cp?.reconstituee ?? null);
    const declaree = nombreOuNull(cp?.declaree ?? null);
    const ecartConso =
      reconstituee !== null && declaree !== null ? declaree - reconstituee : null;

    const calculeLe = await this.horodatageGelFiche(siteId, mois, prog);

    const maj = await this.pool.query<{ core_maj_le: Date | null }>(
      `SELECT GREATEST(
         (SELECT max(fi.maj_le) FROM dqa.fact_inventaire fi
            JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
            JOIN dqa.dim_produit p ON p.produit_id = fil.produit_id AND p.produit_code = $2
           WHERE fi.site_id = $1 AND fi.statut = 'fn'
             AND to_char(fi.date_inventaire, 'YYYY-MM') = $3
             AND ($4::text IS NULL OR fi.programme_id = $4)),
         (SELECT max(fil.maj_le) FROM dqa.fact_inventaire fi
            JOIN dqa.fact_inventaire_ligne fil ON fil.inventaire_id = fi.inventaire_id
            JOIN dqa.dim_produit p ON p.produit_id = fil.produit_id AND p.produit_code = $2
           WHERE fi.site_id = $1 AND fi.statut = 'fn'
             AND to_char(fi.date_inventaire, 'YYYY-MM') = $3
             AND ($4::text IS NULL OR fi.programme_id = $4)),
         (SELECT max(fss.maj_le) FROM dqa.fact_stock_snapshot fss
            JOIN dqa.dim_produit p ON p.produit_id = fss.produit_id AND p.produit_code = $2
           WHERE fss.site_id = $1 AND to_char(fss.date_photo, 'YYYY-MM') = $3),
         (SELECT max(ft.maj_le) FROM dqa.fact_transaction ft
            JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
            JOIN dqa.dim_produit p ON p.produit_id = fl.produit_id AND p.produit_code = $2
           WHERE ft.site_id = $1 AND coalesce(ft.annulation, false) = false
             AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $3
             AND ($4::text IS NULL OR ft.programme_id = $4)
             AND (fl.issu_ajustement
                  OR ft.nature IN ('reception', 'dispensation', 'ajustement_positif', 'ajustement_negatif'))),
         (SELECT max(fl.maj_le) FROM dqa.fact_transaction ft
            JOIN dqa.fact_ligne_transaction fl ON fl.transaction_id = ft.transaction_id
            JOIN dqa.dim_produit p ON p.produit_id = fl.produit_id AND p.produit_code = $2
           WHERE ft.site_id = $1 AND coalesce(ft.annulation, false) = false
             AND to_char(coalesce(ft.date_confirmation, ft.date_saisie), 'YYYY-MM') = $3
             AND ($4::text IS NULL OR ft.programme_id = $4)
             AND (fl.issu_ajustement
                  OR ft.nature IN ('reception', 'dispensation', 'ajustement_positif', 'ajustement_negatif')))
       ) AS core_maj_le`,
      params,
    );
    const coreMajLe = maj.rows[0]?.core_maj_le ?? null;

    return {
      ...commun,
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
      consommation: { reconstituee, declaree, ecart: ecartConso },
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
