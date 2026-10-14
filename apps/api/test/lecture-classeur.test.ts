import { describe, expect, it } from 'vitest';
import { lireClasseur } from '../src/import/lecture-classeur.js';
import { construireClasseur, optionsValides } from './helpers/classeur.js';

/**
 * Le lecteur ne doit pas dépendre de l'ordre des attributs XML : un classeur
 * produit par openpyxl (script de la DAP, envoyé sans passer par Excel) écrit
 * `Target` avant `Id` et des cibles absolues, là où Excel écrit l'inverse.
 */
describe('lireClasseur : indépendance vis-à-vis du producteur du fichier', () => {
  it('lit un classeur sérialisé façon Excel (Id avant Target)', () => {
    const c = lireClasseur(construireClasseur(optionsValides()));
    expect(c.onglets.size).toBe(9);
    expect(c.metadata.get('cycle_paqd')).toBe('2026-C2');
    expect(c.onglets.get('SITES')?.lignes[0]?.valeurs['site_id']).toBe('SITE-1');
  });

  it('lit un classeur sérialisé façon openpyxl (Target avant Id, cible absolue)', () => {
    const c = lireClasseur(construireClasseur({ ...optionsValides(), styleOpenpyxl: true }));
    expect(c.onglets.size).toBe(9);
    expect(c.metadata.get('cycle_paqd')).toBe('2026-C2');
    expect(c.metadata.get('nb_lignes_SITES')).toBe('1');
    expect(c.onglets.get('SITES')?.lignes[0]?.valeurs['site_id']).toBe('SITE-1');
    expect(c.onglets.get('TRANSACTIONS')?.lignes[0]?.valeurs['nature']).toBe('dispensation');
  });
});
