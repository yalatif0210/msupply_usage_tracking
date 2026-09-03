import type { JourP3 } from '@dqa/contracts';

/**
 * Modèle de rendu du bandeau calendaire de P3 : la liste plate des jours du mois
 * (une entrée par jour calendaire, cf. `DetailPilierP3.jours`) devient une
 * grille de semaines alignées sur le lundi, prête à projeter.
 *
 * Fonction pure, sans Angular : testée en unitaire (`calendrier-p3.test.ts`).
 */

export interface CelluleCalendrierP3 {
  /** Date ISO `AAAA-MM-JJ`. */
  readonly jour: string;
  /** Quantième du mois, 1 à 31. */
  readonly numero: number;
  /** Vrai si le jour a porté au moins une sortie de stock. */
  readonly aSortie: boolean;
}

/** Une semaine de sept positions ; `null` = case de calage avant le 1er / après le dernier. */
export type SemaineCalendrierP3 = readonly (CelluleCalendrierP3 | null)[];

export interface CalendrierP3 {
  readonly semaines: readonly SemaineCalendrierP3[];
  /** Nombre de jours du mois (28 à 31). */
  readonly nbJours: number;
  /** Nombre de jours avec au moins une sortie. */
  readonly nbJoursAvecSortie: number;
}

/** Jour de la semaine ISO (lundi = 0 … dimanche = 6) d'une date ISO. */
function indexJourSemaineLundi(jourIso: string): number {
  // `Date` en UTC : pas de dérive de fuseau sur une date nue.
  const jsDay = new Date(`${jourIso}T00:00:00Z`).getUTCDay(); // dimanche = 0
  return (jsDay + 6) % 7;
}

export function construireCalendrierP3(jours: readonly JourP3[]): CalendrierP3 {
  if (jours.length === 0) {
    return { semaines: [], nbJours: 0, nbJoursAvecSortie: 0 };
  }

  const cellules: CelluleCalendrierP3[] = jours.map((j) => ({
    jour: j.jour,
    numero: Number(j.jour.slice(8, 10)),
    aSortie: j.aSortie,
  }));

  const calageAvant = indexJourSemaineLundi(cellules[0]!.jour);
  const grille: (CelluleCalendrierP3 | null)[] = [
    ...Array<null>(calageAvant).fill(null),
    ...cellules,
  ];
  while (grille.length % 7 !== 0) grille.push(null);

  const semaines: SemaineCalendrierP3[] = [];
  for (let i = 0; i < grille.length; i += 7) {
    semaines.push(grille.slice(i, i + 7));
  }

  return {
    semaines,
    nbJours: cellules.length,
    nbJoursAvecSortie: cellules.filter((c) => c.aSortie).length,
  };
}
