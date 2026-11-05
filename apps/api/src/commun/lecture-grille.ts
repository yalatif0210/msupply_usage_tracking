import type { ReglesCalcul, SeuilSousComposante, SousComposante } from '@dqa/contracts';

/**
 * Lecture d'une grille datée partagée par l'administration de la grille et
 * par les écrans de lecture (fiche site, méthode de calcul) : mêmes colonnes,
 * même conversion, pour que les deux ne divergent pas.
 */

/** Colonnes des règles de calcul de `grille_parametre` (migration 0058). */
export const COLONNES_REGLES_SQL =
  'jours_cloture_fin_mois, jours_cloture_mois_suivant, note_sanction, borne_conforme, borne_partiellement_conforme';

export interface LigneRegles {
  jours_cloture_fin_mois: number;
  jours_cloture_mois_suivant: number;
  note_sanction: string;
  borne_conforme: string;
  borne_partiellement_conforme: string;
}

export const versReglesCalcul = (r: LigneRegles): ReglesCalcul => ({
  joursClotureFinMois: r.jours_cloture_fin_mois,
  joursClotureMoisSuivant: r.jours_cloture_mois_suivant,
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
