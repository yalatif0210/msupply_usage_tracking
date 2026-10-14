import type { LigneProduitP4P5 } from '@dqa/contracts';

/**
 * Lignes du tableau produit P4 · P5 regroupées par code produit (ADR 0016).
 * Le verdict d'un code reprend la règle des vues : conforme seulement si tous
 * ses articles le sont ; la consommation ne juge que les articles évaluables.
 */
export interface GroupeProduitP4P5 {
  produitCode: string;
  libelle: string | null;
  articles: LigneProduitP4P5[];
  sduConforme: boolean;
  concordanceConforme: boolean;
  /** `null` : aucun article n'a de consommation évaluable. */
  consoConforme: boolean | null;
}

export function grouperProduitsP4P5(lignes: readonly LigneProduitP4P5[]): GroupeProduitP4P5[] {
  const groupes = new Map<string, LigneProduitP4P5[]>();
  for (const l of lignes) {
    const articles = groupes.get(l.produitCode);
    if (articles) articles.push(l);
    else groupes.set(l.produitCode, [l]);
  }
  return [...groupes.entries()].map(([produitCode, articles]) => {
    const evaluables = articles.flatMap((a) => (a.consommation.evaluable ? [a.consommation] : []));
    return {
      produitCode,
      libelle: articles[0]?.libelle ?? null,
      articles,
      sduConforme: articles.every((a) => a.sdu.conforme),
      concordanceConforme: articles.every((a) => a.concordance.conforme),
      consoConforme: evaluables.length === 0 ? null : evaluables.every((c) => c.conforme),
    };
  });
}
