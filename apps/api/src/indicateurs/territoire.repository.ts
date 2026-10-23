import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  Classification,
  ComptesTaux,
  LigneTerritoireRapports,
  LigneTerritoireScores,
  NiveauTerritoire,
  SitesTerritoireQuery,
  SyntheseTerritoireQuery,
  SyntheseTerritoireRapports,
  SyntheseTerritoireScores,
} from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';

interface IdentiteBrute {
  niveau: NiveauTerritoire;
  region: string;
  district: string | null;
  site_id: string | null;
  site_nom: string | null;
  type_structure: string | null;
  nb_sites: number;
}

interface LigneRapportsBrute extends IdentiteBrute {
  req_attendu: number;
  req_realise: number;
  req_a_lheure: number;
  req_taux_realise: string | null;
  req_taux_a_lheure: string | null;
  inv_attendu: number;
  inv_realise: number;
  inv_a_lheure: number;
  inv_taux_realise: string | null;
  inv_taux_a_lheure: string | null;
}

interface LigneScoresBrute extends IdentiteBrute {
  nb_mesures: number;
  score_composite_moyen: string | null;
  nb_conforme: number;
  nb_partiellement_conforme: number;
  nb_non_conforme: number;
  nb_sans_mesure: number;
  classification: Classification | null;
  piliers_couverts: number | null;
}

const nombreOuNull = (v: string | null): number | null => (v === null ? null : Number(v));

const identite = (r: IdentiteBrute) => ({
  niveau: r.niveau,
  region: r.region,
  district: r.district,
  siteId: r.site_id,
  siteNom: r.site_nom,
  typeStructure: r.type_structure,
  nbSites: r.nb_sites,
});

const comptes = (attendu: number, realise: number, aLHeure: number, tr: string | null, th: string | null): ComptesTaux => ({
  attendu,
  realise,
  aLHeure,
  tauxRealise: nombreOuNull(tr),
  tauxALHeure: nombreOuNull(th),
});

const versRapports = (r: LigneRapportsBrute): LigneTerritoireRapports => ({
  ...identite(r),
  requisitions: comptes(r.req_attendu, r.req_realise, r.req_a_lheure, r.req_taux_realise, r.req_taux_a_lheure),
  inventaires: comptes(r.inv_attendu, r.inv_realise, r.inv_a_lheure, r.inv_taux_realise, r.inv_taux_a_lheure),
});

const versScores = (r: LigneScoresBrute): LigneTerritoireScores => ({
  ...identite(r),
  nbMesures: r.nb_mesures,
  scoreCompositeMoyen: nombreOuNull(r.score_composite_moyen),
  repartition: {
    CONFORME: r.nb_conforme,
    PARTIELLEMENT_CONFORME: r.nb_partiellement_conforme,
    NON_CONFORME: r.nb_non_conforme,
    SANS_MESURE: r.nb_sans_mesure,
  },
  classification: r.niveau === 'site' ? r.classification : null,
  piliersCouverts: r.niveau === 'site' ? r.piliers_couverts : null,
});

/**
 * Tri d'un niveau : du plus faible au plus élevé, les lignes sans valeur
 * (rien d'attendu, aucun score) en fin de liste, puis par libellé.
 */
function trier<T>(lignes: T[], cle: (l: T) => number | null, libelle: (l: T) => string): T[] {
  return [...lignes].sort((a, b) => {
    const [x, y] = [cle(a), cle(b)];
    if (x !== y) {
      if (x === null) return 1;
      if (y === null) return -1;
      return x - y;
    }
    return libelle(a).localeCompare(libelle(b), 'fr');
  });
}

/** Régions triées, chacune suivie de ses zones triées : l'ordre d'affichage de l'arborescence. */
function arborescence<T extends { niveau: NiveauTerritoire; region: string; district: string | null }>(
  lignes: T[],
  cle: (l: T) => number | null,
): T[] {
  const regions = trier(lignes.filter((l) => l.niveau === 'region'), cle, (l) => l.region);
  const zones = lignes.filter((l) => l.niveau === 'zone');
  return regions.flatMap((r) => [
    r,
    ...trier(zones.filter((z) => z.region === r.region), cle, (z) => z.district ?? ''),
  ]);
}

const COLONNES_IDENTITE = `v.niveau, v.region, v.district, v.site_id, s.site_nom, s.type_structure, v.nb_sites`;

/**
 * Synthèse nationale par territoire (Région, zone de district, site), lue des
 * vues `mv_synthese_territoire_*` (migration 0051). Les régions et leurs zones
 * viennent en une lecture ; les sites d'une zone à la demande.
 */
@Injectable()
export class TerritoireRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Mois servi : celui demandé s'il est mesuré, sinon le dernier mois clos, à défaut le plus récent. */
  private async entete(q: SyntheseTerritoireQuery) {
    const { rows } = await this.pool.query<{ mois_paqd: string; clos: boolean }>(
      `SELECT DISTINCT mois_paqd, dqa.mois_est_clos(mois_paqd) AS clos
       FROM dqa.hist_score_site ORDER BY mois_paqd DESC`,
    );
    const moisDisponibles = rows.map((r) => r.mois_paqd);
    const mois = q.mois && moisDisponibles.includes(q.mois)
      ? q.mois
      : rows.find((r) => r.clos)?.mois_paqd ?? moisDisponibles[0] ?? null;
    const echeance = mois
      ? (await this.pool.query<{ d: string; clos: boolean }>(
          `SELECT to_char(($1 || '-01')::date + interval '1 month 9 days', 'YYYY-MM-DD') AS d,
                  dqa.mois_est_clos($1) AS clos`,
          [mois],
        )).rows[0]
      : undefined;
    return {
      moisPaqd: mois,
      moisDisponibles,
      moisClos: echeance?.clos ?? true,
      echeance: echeance?.d ?? null,
      programmeId: q.programmeId ?? null,
      region: q.region ?? null,
      strate: q.strate ?? null,
    };
  }

  async rapports(q: SyntheseTerritoireQuery): Promise<SyntheseTerritoireRapports> {
    const entete = await this.entete(q);
    if (!entete.moisPaqd) return { ...entete, lignes: [] };
    const { rows } = await this.pool.query<LigneRapportsBrute>(
      `SELECT ${COLONNES_IDENTITE},
              v.req_attendu, v.req_realise, v.req_a_lheure, v.req_taux_realise, v.req_taux_a_lheure,
              v.inv_attendu, v.inv_realise, v.inv_a_lheure, v.inv_taux_realise, v.inv_taux_a_lheure
       FROM dqa.mv_synthese_territoire_rapports v
       LEFT JOIN dqa.dim_site s ON s.site_id = v.site_id
       WHERE v.mois_paqd = $1 AND v.niveau IN ('region', 'zone')
         AND v.programme_id IS NOT DISTINCT FROM $2 AND v.strate IS NOT DISTINCT FROM $3
         AND ($4::text IS NULL OR v.region = $4)`,
      [entete.moisPaqd, entete.programmeId, entete.strate, entete.region],
    );
    const lignes = rows.map(versRapports);
    return { ...entete, lignes: arborescence(lignes, (l) => l.requisitions.tauxALHeure) };
  }

  async sitesRapports(q: SitesTerritoireQuery): Promise<LigneTerritoireRapports[]> {
    const { rows } = await this.pool.query<LigneRapportsBrute>(
      `SELECT ${COLONNES_IDENTITE},
              v.req_attendu, v.req_realise, v.req_a_lheure, v.req_taux_realise, v.req_taux_a_lheure,
              v.inv_attendu, v.inv_realise, v.inv_a_lheure, v.inv_taux_realise, v.inv_taux_a_lheure
       FROM dqa.mv_synthese_territoire_rapports v
       JOIN dqa.dim_site s ON s.site_id = v.site_id
       WHERE v.mois_paqd = $1 AND v.niveau = 'site'
         AND v.programme_id IS NOT DISTINCT FROM $2 AND v.strate IS NOT DISTINCT FROM $3
         AND v.region = $4 AND v.district = $5`,
      [q.mois, q.programmeId ?? null, q.strate ?? null, q.region, q.district],
    );
    return trier(rows.map(versRapports), (l) => l.requisitions.tauxALHeure, (l) => l.siteNom ?? '');
  }

  async scores(q: SyntheseTerritoireQuery): Promise<SyntheseTerritoireScores> {
    const entete = await this.entete(q);
    if (!entete.moisPaqd) return { ...entete, lignes: [] };
    const { rows } = await this.pool.query<LigneScoresBrute>(
      `SELECT ${COLONNES_IDENTITE},
              v.nb_mesures, v.score_composite_moyen, v.nb_conforme, v.nb_partiellement_conforme,
              v.nb_non_conforme, v.nb_sans_mesure, v.classification, v.piliers_couverts
       FROM dqa.mv_synthese_territoire_scores v
       LEFT JOIN dqa.dim_site s ON s.site_id = v.site_id
       WHERE v.mois_paqd = $1 AND v.niveau IN ('region', 'zone')
         AND v.programme_id IS NOT DISTINCT FROM $2 AND v.strate IS NOT DISTINCT FROM $3
         AND ($4::text IS NULL OR v.region = $4)`,
      [entete.moisPaqd, entete.programmeId, entete.strate, entete.region],
    );
    const lignes = rows.map(versScores);
    return { ...entete, lignes: arborescence(lignes, (l) => l.scoreCompositeMoyen) };
  }

  async sitesScores(q: SitesTerritoireQuery): Promise<LigneTerritoireScores[]> {
    const { rows } = await this.pool.query<LigneScoresBrute>(
      `SELECT ${COLONNES_IDENTITE},
              v.nb_mesures, v.score_composite_moyen, v.nb_conforme, v.nb_partiellement_conforme,
              v.nb_non_conforme, v.nb_sans_mesure, v.classification, v.piliers_couverts
       FROM dqa.mv_synthese_territoire_scores v
       JOIN dqa.dim_site s ON s.site_id = v.site_id
       WHERE v.mois_paqd = $1 AND v.niveau = 'site'
         AND v.programme_id IS NOT DISTINCT FROM $2 AND v.strate IS NOT DISTINCT FROM $3
         AND v.region = $4 AND v.district = $5`,
      [q.mois, q.programmeId ?? null, q.strate ?? null, q.region, q.district],
    );
    return trier(rows.map(versScores), (l) => l.scoreCompositeMoyen, (l) => l.siteNom ?? '');
  }

  /** Strates présentes dans le périmètre, pour le filtre. */
  async strates(): Promise<string[]> {
    const { rows } = await this.pool.query<{ strate: string }>(
      `SELECT DISTINCT dqa.strate_de(type_structure) AS strate
       FROM dqa.dim_site WHERE dans_perimetre_dqa ORDER BY 1`,
    );
    return rows.map((r) => r.strate);
  }
}
