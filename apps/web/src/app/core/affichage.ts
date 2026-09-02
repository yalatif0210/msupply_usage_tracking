/**
 * Jetons d'affichage partagés.
 *
 * `VALEUR_ABSENTE` : ce qu'on montre à la place d'une valeur nulle ou non
 * renseignée (score, seuil, libellé, mois…). Un seul endroit à changer.
 * `SANS_OBJET` : quand la grandeur n'a structurellement pas de valeur (ex.
 * tolérance d'une sous-composante qui n'en porte pas), à distinguer d'une
 * valeur simplement absente.
 */
export const VALEUR_ABSENTE = 'n/d';
export const SANS_OBJET = 's/o';

/**
 * Coerce en chaîne la valeur d'un `(valueChange)` / `(ngModelChange)` de
 * `hlm-select` (typée `unknown` faute d'inférence du générique `BrnSelect`).
 * Une valeur non-chaîne (jamais attendue de nos `<hlm-select-item>`) devient la
 * chaîne vide, c'est-à-dire « filtre inactif ».
 */
export function versChaine(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : '';
}
