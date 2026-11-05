import type { Pool } from 'pg';
import type {
  GrilleResume, Pilier, ReglesCalcul, SeuilSousComposante, SousComposante,
} from '@dqa/contracts';

/**
 * Lecture d'une grille datée partagée par l'administration de la grille et
 * par les écrans de lecture (fiche site, méthode de calcul) : mêmes colonnes,
 * même conversion, pour que les deux ne divergent pas.
 */

/** Colonnes des règles de calcul de `grille_parametre` (migrations 0058, 0062). */
export const COLONNES_REGLES_SQL =
  'jours_cloture_fin_mois, jours_cloture_mois_suivant, jours_marge_jugement, note_sanction, borne_conforme, borne_partiellement_conforme';

export interface LigneRegles {
  jours_cloture_fin_mois: number;
  jours_cloture_mois_suivant: number;
  jours_marge_jugement: number;
  note_sanction: string;
  borne_conforme: string;
  borne_partiellement_conforme: string;
}

export const versReglesCalcul = (r: LigneRegles): ReglesCalcul => ({
  joursClotureFinMois: r.jours_cloture_fin_mois,
  joursClotureMoisSuivant: r.jours_cloture_mois_suivant,
  joursMargeJugement: r.jours_marge_jugement,
  noteSanction: Number(r.note_sanction),
  borneConforme: Number(r.borne_conforme),
  bornePartiellementConforme: Number(r.borne_partiellement_conforme),
});

/** Colonnes d'un seuil de sous-composante, composition comprise (migration 0057). */
export const COLONNES_SEUIL_SQL = 'sous_composante, seuil, sens, tolerance, seuil_district, retenue, poids_pct';

export interface LigneSeuil {
  sous_composante: SousComposante;
  seuil: string;
  sens: SeuilSousComposante['sens'];
  tolerance: string | null;
  seuil_district: string | null;
  retenue: boolean;
  poids_pct: string;
}

export const versSeuilSousComposante = (r: LigneSeuil): SeuilSousComposante => ({
  sousComposante: r.sous_composante,
  seuil: Number(r.seuil),
  sens: r.sens,
  tolerance: r.tolerance === null ? null : Number(r.tolerance),
  seuilDistrict: r.seuil_district === null ? null : Number(r.seuil_district),
  retenue: r.retenue,
  poidsDansPilierPct: Number(r.poids_pct),
});

/** Une grille telle que les écrans de lecture l'appliquent. */
export interface GrilleLue {
  resume: GrilleResume;
  regles: ReglesCalcul;
  poids: Map<Pilier, number>;
  seuils: SeuilSousComposante[];
}

/** Poids des piliers d'une grille. */
export async function lirePoidsPiliers(pool: Pool, grilleId: number | string): Promise<Map<Pilier, number>> {
  const { rows } = await pool.query<{ pilier: Pilier; poids_pct: string }>(
    `SELECT pilier, poids_pct FROM dqa.grille_poids_pilier WHERE grille_id = $1 ORDER BY pilier`,
    [grilleId],
  );
  return new Map(rows.map((r) => [r.pilier, Number(r.poids_pct)]));
}

/** Seuils et composition des sous-composantes d'une grille. */
export async function lireSeuils(pool: Pool, grilleId: number | string): Promise<SeuilSousComposante[]> {
  const { rows } = await pool.query<LigneSeuil>(
    `SELECT ${COLONNES_SEUIL_SQL} FROM dqa.grille_seuil_sous_composante
     WHERE grille_id = $1 ORDER BY sous_composante`,
    [grilleId],
  );
  return rows.map(versSeuilSousComposante);
}

/**
 * La grille d'un mois : celle qui a produit ses scores gelés si elle est
 * connue, sinon celle en vigueur pour le mois. `null` avant toute grille.
 */
export async function lireGrilleDuMois(
  pool: Pool,
  mois: string,
  grilleIdGele: string | null = null,
): Promise<GrilleLue | null> {
  const g = await pool.query<LigneRegles & { id: number; version: string; effet: string }>(
    `SELECT id::int, version, to_char(effet_a_partir_de, 'YYYY-MM-DD') AS effet, ${COLONNES_REGLES_SQL}
     FROM dqa.grille_parametre
     WHERE id = coalesce($1::bigint, dqa.grille_pour_mois($2))`,
    [grilleIdGele, mois],
  );
  const r = g.rows[0];
  if (!r) return null;
  const [poids, seuils] = await Promise.all([lirePoidsPiliers(pool, r.id), lireSeuils(pool, r.id)]);
  return {
    resume: { id: r.id, version: r.version, effetAPartirDe: r.effet },
    regles: versReglesCalcul(r),
    poids,
    seuils,
  };
}
