import { DecimalPipe, registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { describe, expect, it } from 'vitest';
import { sansActivite } from '../core/programmes-eligibles';
import { nombreGraphe } from './graphe-commun';

/** Règles d'affichage du parcours du 2026-10-14 (U8, ADR 0020). */
describe('affichage au format français', () => {
  it('les nombres des écrans utilisent la virgule décimale (U8)', () => {
    registerLocaleData(localeFr);
    const nb = new DecimalPipe('fr');
    expect(nb.transform(27.5, '1.0-1')).toBe('27,5');
    expect(nb.transform(3101, '1.0-0')).toMatch(/^3\s101$/u);
  });

  it('les étiquettes et infobulles de graphe aussi, n/d pour une valeur absente', () => {
    expect(nombreGraphe(100)).toBe('100');
    expect(nombreGraphe(72.46)).toBe('72,5');
    expect(nombreGraphe(null)).toBe('n/d');
  });

  it('un programme sans inventaire ni réquisition est repéré comme sans activité', () => {
    expect(sansActivite({ nbInventaires: 0, nbRequisitions: 0 })).toBe(true);
    expect(sansActivite({ nbInventaires: 0, nbRequisitions: 1 })).toBe(false);
  });
});
