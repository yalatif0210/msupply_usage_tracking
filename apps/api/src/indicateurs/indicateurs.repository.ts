import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  LIBELLES_MESURE_BRUTE,
  LIBELLES_PILIER,
  LIBELLES_SOUS_COMPOSANTE,
  MESURES_BRUTES,
  PILIER_DE_MESURE_BRUTE,
  PILIER_DE_SOUS_COMPOSANTE,
  POIDS_PILIER,
  SOUS_COMPOSANTES,
  type BlocSynthese,
  type Classification,
  type CompteBrut,
  type DetailP4Produits,
  type DetailSite,
  type FiltreSites,
  type HistoriqueQuery,
  type HistoriqueSite,
  type LigneEcartProduitP4,
  type MesureSousComposante,
  type RaisonExclusionConso,
  type Pilier,
  type Programme,
  type RepartitionClassification,
  type ScorePilier,
  type ScoreSite,
  type SeuilSousComposante,
  type Site,
  type SousComposante,
  type SousComposanteBref,
  type StatutSousComposante,
  TOP_SOUS_COMPOSANTES_DIFFICULTE,
  type SyntheseNationale,
  type SyntheseQuery,
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

  /** Agrégat de la page d'accueil : état national du dernier mois, courbe et sous-composantes en difficulté. */
  async tableauDeBord(): Promise<TableauDeBord> {
    // Les deux vues n'agrègent que les sites `dans_perimetre_dqa` (cf. 0021, 0026) ;
    // le grain national = programme / région / district tous nuls.
    const NATIONAL = `programme_id IS NULL AND region IS NULL AND district IS NULL`;

    const progression = await this.pool.query<{ mois_paqd: string; score_composite_moyen: string | null }>(
      `SELECT mois_paqd, score_composite_moyen
       FROM dqa.mv_synthese_nationale
       WHERE ${NATIONAL}
       ORDER BY mois_paqd`,
    );
    const points = progression.rows.map((r) => ({
      moisPaqd: r.mois_paqd,
      scoreCompositeMoyen: nombreOuNull(r.score_composite_moyen),
    }));
    const mois = points.at(-1)?.moisPaqd ?? null;

    if (mois === null) {
      return { moisPaqd: null, national: versBloc(undefined), progression: [], sousComposantesEnDifficulte: [] };
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
      national: versBloc(national.rows[0]),
      progression: points,
      sousComposantesEnDifficulte: difficulte.rows.map(versLigneSousComposante),
    };
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
    const site = await this.pool.query<LigneSite>(
      `SELECT site_id, site_code, site_nom, district, region, type_structure
       FROM dqa.dim_site WHERE site_id = $1 AND dans_perimetre_dqa`,
      [siteId],
    );
    if (site.rowCount === 0) return null;
    const siteRow = site.rows[0]!;

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
              p3.taux_regularite_pct,
              p4.taux_sdu_pct, p4.taux_conso_pct, p4.score_sdu, p4.score_conso,
              p5.taux_concordance_pct, p6.ratio_ajustements_pct,
              sc1.seuil AS seuil_completude,
              sc2.seuil AS seuil_promptitude,
              sc3.seuil AS seuil_regularite,
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
        brute(h?.taux_regularite_pct, h?.p_regularite)),
      this.pilierP4(h?.p_ecart_sdu ?? null, {
        sdu: brute(h?.taux_sdu_pct, h?.score_sdu),
        seuilSdu: h?.seuil_ecart_sdu ?? null,
        conso: brute(h?.taux_conso_pct, h?.score_conso),
        seuilConso: h?.seuil_ecart_conso ?? null,
      }),
      this.pilierP5(h?.p_concordance ?? null, h?.seuil_concordance ?? null,
        brute(h?.taux_concordance_pct, h?.p_concordance)),
      this.pilierP6(h?.p_ajustements ?? null, h?.seuil_ajustements ?? null,
        brute(h?.ratio_ajustements_pct, h?.p_ajustements)),
    ];

    const comptesParPilier = await this.comptesBrutsParPilier(siteId, mois, prog);

    return {
      site: versSite(siteRow),
      moisPaqd: mois,
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
        sc: AtteintesParSc | null;
      }
    >(
      `SELECT h.mois_paqd, vmc.rang,
              h.score_composite, h.classification,
              ${COMPTE_PILIERS_SQL} AS piliers_couverts,
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
      })),
    };
  }

  async detailP4Produits(
    siteId: string,
    moisDemande: string | undefined,
    programmeId: string | undefined,
  ): Promise<DetailP4Produits | null> {
    const site = await this.pool.query<LigneSite>(
      `SELECT site_id, site_code, site_nom, district, region, type_structure
       FROM dqa.dim_site WHERE site_id = $1 AND dans_perimetre_dqa`,
      [siteId],
    );
    if (site.rowCount === 0) return null;
    const siteRow = site.rows[0]!;
    const prog = programmeId ?? null;

    const moisRows = await this.pool.query<{ mois_paqd: string }>(
      `SELECT DISTINCT mois_paqd FROM dqa.mv_p4_ecart_produit
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
        moisDisponibles: [],
        programmeId: prog,
        produits: [],
      };
    }

    // `mv_p4_ecart_produit` restreint déjà aux sites du périmètre et aux
    // traceurs actifs ; la garde ci-dessus a écarté un site hors périmètre.
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
    }>(
      `SELECT produit_code, libelle, theorique, comptee, ecart_sdu_pct, sdu_conforme,
              stock_debut, stock_fin, receptions, declaree, reconstituee,
              conso_evaluable, conso_raison_exclusion, ecart_conso_pct, conso_conforme
       FROM dqa.mv_p4_ecart_produit
       WHERE site_id = $1 AND mois_paqd = $2 AND programme_id IS NOT DISTINCT FROM $3
       ORDER BY sdu_conforme, produit_code`,
      [siteId, mois, prog],
    );

    const produits: LigneEcartProduitP4[] = rows.map((r) => ({
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
        : { evaluable: false, raisonExclusion: r.conso_raison_exclusion ?? 'un_seul_inventaire' },
    }));

    return {
      site: versSite(siteRow),
      moisPaqd: mois,
      moisDisponibles,
      programmeId: prog,
      produits,
    };
  }

  /** Une sous-composante rendue : statut binaire dérivé du score de sous-composante. */
  private mesure(
    sc: SousComposante,
    m: ValeurBrute,
    seuil: string | null,
    raisonNC: string,
  ): MesureSousComposante {
    const statut = m.score === null ? 'NON_CALCULABLE' : Number(m.score) >= 100 ? 'CONFORME' : 'ALERTE';
    return {
      sousComposante: sc,
      libelle: LIBELLES_SOUS_COMPOSANTE[sc],
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
    const raisonProg = 'Aucun programme géré déclaré pour ce site';
    return this.envelopper('P1', score, [
      this.mesure('completude_inventaires', m.inv, seuil, raisonProg),
      this.mesure('completude_requisitions', m.req, seuil, raisonProg),
      this.mesure('completude_receptions', m.rec, seuil,
        'Aucune facture fournisseur adressée au site ce mois'),
    ]);
  }

  private pilierP2(
    score: string | null,
    seuil: string | null,
    m: { inv: ValeurBrute; req: ValeurBrute },
  ): ScorePilier {
    const raisonProg = 'Aucun programme géré déclaré pour ce site';
    return this.envelopper('P2', score, [
      this.mesure('promptitude_inventaires', m.inv, seuil, raisonProg),
      this.mesure('promptitude_requisitions', m.req, seuil, raisonProg),
    ]);
  }

  private pilierP3(score: string | null, seuil: string | null, m: ValeurBrute): ScorePilier {
    return this.envelopper('P3', score, [
      this.mesure('regularite_saisie', m, seuil, 'Aucune sortie de stock exploitable sur le mois'),
    ]);
  }

  private pilierP4(
    score: string | null,
    m: { sdu: ValeurBrute; seuilSdu: string | null; conso: ValeurBrute; seuilConso: string | null },
  ): ScorePilier {
    return this.envelopper('P4', score, [
      this.mesure('ecart_sdu', m.sdu, m.seuilSdu, 'Aucun produit traceur inventorié ce mois'),
      this.mesure('ecart_consommation', m.conso, m.seuilConso,
        'Aucun produit évaluable : deux inventaires bornants et une consommation reconstituée positive sont requis'),
    ]);
  }

  private pilierP5(score: string | null, seuil: string | null, m: ValeurBrute): ScorePilier {
    return this.envelopper('P5', score, [
      this.mesure('concordance', m, seuil, 'Aucun inventaire finalisé exploitable pour le mois'),
    ]);
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
        libelle: LIBELLES_MESURE_BRUTE[mesure],
        attendu: r.nb_attendu,
        realise: r.nb_realise,
        aLHeure: r.nb_a_lheure,
      });
      parPilier.set(pilier, liste);
    }
    return parPilier;
  }
}
