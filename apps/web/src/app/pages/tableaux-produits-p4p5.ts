import type { LigneProduitP4P5, ProduitEcarte, RaisonExclusionConso } from '@dqa/contracts';

/**
 * Mise en forme des trois tableaux produit de la fiche site (conformité SDU,
 * conformité consommation, concordance). Aucun calcul d'indicateur ici : les
 * écarts et verdicts viennent de `mv_p4_ecart_produit`.
 */

const POURCENT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const QUANTITE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });

/** `AAAA-MM-JJ` vers `J/M` (« 30/8 »), la forme des en-têtes de colonne. */
export function jourMoisCourt(iso: string): string {
  return `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
}

/** La date partagée par toutes les valeurs connues, sinon `null` (dates à afficher ligne à ligne). */
export function dateCommune(dates: readonly (string | null)[]): string | null {
  const connues = new Set(dates.filter((d): d is string => d !== null));
  const [seule] = connues;
  return connues.size === 1 && seule !== undefined ? seule : null;
}

/** Bornes de la consommation d'une ligne, qu'elle soit évaluée ou exclue. */
export function bornesDe(l: LigneProduitP4P5) {
  return l.consommation.evaluable ? l.consommation : l.consommation.bornes;
}

/** « lots 9/0 et 20/15 » (théorique / compté par lot) ; vide pour un seul lot. */
export function libelleLots(lots: LigneProduitP4P5['lots']): string {
  if (lots.length < 2) return '';
  const q = (v: number | null) => (v === null ? '?' : QUANTITE.format(v));
  const parties = lots.map((l) => `${q(l.theorique)}/${q(l.comptee)}`);
  return `lots ${parties.slice(0, -1).join(', ')} et ${parties.at(-1) ?? ''}`;
}

export function pourcent(v: number): string {
  return `${POURCENT.format(v)} %`;
}

/** Écart SDU : `null` quand le compté est 0 et le théorique ne l'est pas. */
export function ecartSdu(ecartPct: number | null): string {
  return ecartPct === null ? 'non chiffrable (compté = 0)' : pourcent(ecartPct);
}

const RAISONS: Record<RaisonExclusionConso, string> = {
  sans_ouverture: 'exclu (pas d\'inventaire d\'ouverture)',
  absent_ouverture: 'exclu (absent de l\'ouverture)',
  reconstituee_non_positive: 'exclu (reconstituée ≤ 0)',
};

export function ecartConso(l: LigneProduitP4P5): string {
  return l.consommation.evaluable ? pourcent(l.consommation.ecartPct) : RAISONS[l.consommation.raisonExclusion];
}

export const LIBELLES_QUALIFICATION: Record<ProduitEcarte['qualification'], string> = {
  oubli_demontre: 'oubli démontré',
  indetermine: 'cause indéterminée',
  oubli_probable: 'oubli probable',
  epuise: 'épuisé',
};

/**
 * Le calcul qui qualifie une absence, avec les valeurs servies par l'API :
 * « 3 927 comptés à la clôture + 5 000 sorties déclarées - 0 reçus = 8 927 ».
 */
export function calculAbsence(pe: ProduitEcarte): string {
  const q = (v: number) => QUANTITE.format(v);
  return pe.sens === 'absent_ouverture'
    ? `${q(pe.stockConnu)} comptés à la clôture + ${q(pe.sortiesDeclarees)} sorties déclarées - ${q(pe.receptions)} reçus = ${q(pe.stockCalcule)} au moins à l'ouverture`
    : `${q(pe.stockConnu)} comptés à l'ouverture + ${q(pe.receptions)} reçus - ${q(pe.sortiesDeclarees)} sorties déclarées = ${q(pe.stockCalcule)} attendus à la clôture`;
}
