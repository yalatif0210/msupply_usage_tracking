import { describe, expect, it } from 'vitest';
import { cleZone, jourMois, lignesVisibles, taux, type LigneArbre } from './arbre-territoire';

const lignes: LigneArbre[] = [
  { niveau: 'region', region: 'NORD', district: null },
  { niveau: 'zone', region: 'NORD', district: 'D1' },
  { niveau: 'zone', region: 'NORD', district: 'D2' },
  { niveau: 'region', region: 'SUD', district: null },
  { niveau: 'zone', region: 'SUD', district: 'D1' },
];

describe('arborescence par territoire', () => {
  it('toutes régions repliées : seules les régions sont visibles', () => {
    expect(lignesVisibles(lignes, new Set()).map((l) => l.region)).toEqual(['NORD', 'SUD']);
  });

  it('une région dépliée montre ses zones, dans l\'ordre reçu, sous elle', () => {
    expect(lignesVisibles(lignes, new Set(['NORD'])).map((l) => l.district ?? l.region))
      .toEqual(['NORD', 'D1', 'D2', 'SUD']);
  });

  it('deux districts homonymes de régions différentes ont des clés distinctes', () => {
    expect(cleZone(lignes[1]!)).not.toBe(cleZone(lignes[4]!));
  });

  it('taux au format français, « s/o » quand rien n\'était attendu', () => {
    expect(taux(66.7)).toBe('66,7 %');
    expect(taux(100)).toBe('100 %');
    expect(taux(null)).toBe('s/o');
  });

  it('échéance affichée en JJ/MM', () => {
    expect(jourMois('2026-11-10')).toBe('10/11');
  });
});
