import { describe, expect, it } from 'vitest';
import type { JourP3 } from '@dqa/contracts';
import { construireCalendrierP3 } from './calendrier-p3';

/** Liste plate des jours d'un mois, `aSortie` faux sauf pour `avecSortie`. */
function moisPlat(annee: number, mois: number, avecSortie: readonly number[] = []): JourP3[] {
  const nb = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const set = new Set(avecSortie);
  return Array.from({ length: nb }, (_, i) => ({
    jour: `${annee}-${String(mois).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    aSortie: set.has(i + 1),
  }));
}

describe('construireCalendrierP3', () => {
  it('rend une entrée par jour du mois, semaines de sept positions', () => {
    const cal = construireCalendrierP3(moisPlat(2026, 8, [3, 17]));
    expect(cal.nbJours).toBe(31);
    expect(cal.semaines.every((s) => s.length === 7)).toBe(true);
    const cellules = cal.semaines.flat().filter((c) => c !== null);
    expect(cellules).toHaveLength(31);
    expect(cellules.map((c) => c.numero)).toEqual(
      Array.from({ length: 31 }, (_, i) => i + 1),
    );
  });

  it('cale le 1er du mois sur le bon jour de semaine (lundi = colonne 0)', () => {
    // 1er août 2026 = samedi -> 5 cases nulles avant.
    const cal = construireCalendrierP3(moisPlat(2026, 8));
    const premiereSemaine = cal.semaines[0]!;
    expect(premiereSemaine.slice(0, 5).every((c) => c === null)).toBe(true);
    expect(premiereSemaine[5]?.numero).toBe(1);
  });

  it('compte les jours avec sortie et les marque', () => {
    const cal = construireCalendrierP3(moisPlat(2026, 8, [3, 3, 17]));
    expect(cal.nbJoursAvecSortie).toBe(2);
    const marques = cal.semaines
      .flat()
      .filter((c): c is NonNullable<typeof c> => c !== null && c.aSortie)
      .map((c) => c.numero);
    expect(marques).toEqual([3, 17]);
  });

  it('gère février (28 jours) sans case fantôme', () => {
    const cal = construireCalendrierP3(moisPlat(2026, 2));
    expect(cal.nbJours).toBe(28);
    expect(cal.semaines.flat().filter((c) => c !== null)).toHaveLength(28);
  });

  it('rend un calendrier vide sur une liste vide', () => {
    expect(construireCalendrierP3([])).toEqual({ semaines: [], nbJours: 0, nbJoursAvecSortie: 0 });
  });
});
