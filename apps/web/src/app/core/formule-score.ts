import type { ScorePilier } from '@dqa/contracts';

/**
 * Le calcul d'un score écrit avec ses vraies valeurs, pour le dépliable de la
 * fiche site : « (100 × 50 + 0 × 50) ÷ 100 ». Les termes viennent tous de
 * l'API (notes, poids, dénominateurs figés au gel) ; le résultat affiché à
 * côté reste le score gelé, jamais un recalcul.
 */
export interface FormuleScore {
  /** Le membre de droite avant « = score ». */
  calcul: string;
  /** Ce qui sort du calcul faute d'être calculable ce mois, déjà rédigé. */
  horsCalcul: string[];
}

const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const n = (v: number): string => NOMBRE.format(v);

/** Somme pondérée divisée par le poids calculable : « (100 × 50 + 0 × 50) ÷ 100 ». */
function moyennePonderee(termes: readonly { note: number; poids: number }[], diviseur: number): string {
  return `(${termes.map((t) => `${n(t.note)} × ${n(t.poids)}`).join(' + ')}) ÷ ${n(diviseur)}`;
}

/** Calcul du score d'un pilier ; `null` si aucune sous-composante retenue n'est calculable. */
export function formulePilier(pil: ScorePilier): FormuleScore | null {
  const retenues = pil.sousComposantes.filter((sc) => sc.retenue);
  const comptees = retenues.flatMap((sc) => (sc.note === null ? [] : [{ ...sc, note: sc.note }]));
  if (pil.score === null || comptees.length === 0) return null;
  const horsCalcul = retenues
    .filter((sc) => sc.note === null)
    .map((sc) => `${sc.libelle}, non calculable ce mois, sort du calcul.`);
  const [seule] = comptees;
  if (comptees.length === 1 && seule) {
    return { calcul: `note « ${seule.libelle} »${seule.sanction ? ' (sanction)' : ''}`, horsCalcul };
  }
  return {
    calcul: moyennePonderee(comptees.map((sc) => ({ note: sc.note, poids: sc.poidsDansPilierPct })), pil.poidsCalculables),
    horsCalcul,
  };
}

/** Calcul du score composite ; `null` si aucun pilier n'est calculable. */
export function formuleComposite(piliers: readonly ScorePilier[], poidsCalculables: number): FormuleScore | null {
  const comptes = piliers.flatMap((p) => (p.score === null ? [] : [{ ...p, score: p.score }]));
  if (comptes.length === 0) return null;
  const horsCalcul = piliers
    .filter((p) => p.score === null)
    .map((p) => `${p.pilier} · ${p.libelle} (poids ${n(p.poids)} %), non calculable ce mois, sort du calcul.`);
  const [seul] = comptes;
  if (comptes.length === 1 && seul) {
    return { calcul: `score de ${seul.pilier} · ${seul.libelle}`, horsCalcul };
  }
  return {
    calcul: moyennePonderee(comptes.map((p) => ({ note: p.score, poids: p.poids })), poidsCalculables),
    horsCalcul,
  };
}
