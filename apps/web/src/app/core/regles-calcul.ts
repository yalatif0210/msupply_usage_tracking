import type { ReglesCalcul, SeuilSousComposante } from '@dqa/contracts';

/**
 * Formulation des règles de la grille datée pour les écrans de lecture. Les
 * valeurs viennent toujours de l'API (`ReglesCalcul`) : aucune règle n'est
 * écrite en dur dans un gabarit.
 */

const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/**
 * « les 3 derniers jours du mois ou le 1er jour du mois suivant », article
 * compris, singulier et pluriel accordés : se lit après « dans ».
 */
export function fenetreCloture(r: Pick<ReglesCalcul, 'joursClotureFinMois' | 'joursClotureMoisSuivant'>): string {
  const n = r.joursClotureFinMois;
  const fin = n === 1 ? 'le dernier jour du mois' : `les ${n} derniers jours du mois`;
  const m = r.joursClotureMoisSuivant;
  if (m === 0) return fin;
  return `${fin} ou ${m === 1 ? 'le 1er jour' : `les ${m} premiers jours`} du mois suivant`;
}

/** « plus 3 jours de marge » avant de juger un mois ; « sans marge » à 0. */
export function margeJugement(r: Pick<ReglesCalcul, 'joursMargeJugement'>): string {
  const n = r.joursMargeJugement;
  if (n === 0) return 'sans marge';
  return `plus ${n} jour${n > 1 ? 's' : ''} de marge`;
}

/** « ≥ 65 % » ou « ≤ 5 % » : le seuil d'une sous-composante dans son sens. */
export function seuilLisible(s: Pick<SeuilSousComposante, 'sens' | 'seuil'>): string {
  return `${s.sens === 'sup' ? '≥' : '≤'} ${NOMBRE.format(s.seuil)} %`;
}

/** Repères d'une courbe de score composite : les deux bornes de classification, croissantes. */
export function bornesClassification(
  r: Pick<ReglesCalcul, 'borneConforme' | 'bornePartiellementConforme'>,
): number[] {
  return [r.bornePartiellementConforme, r.borneConforme];
}
