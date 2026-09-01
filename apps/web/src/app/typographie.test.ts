import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Garde typographique : aucun tiret long en console.
 *
 * `—` (cadratin, U+2014), `–` (demi-cadratin, U+2013) et `−` (signe moins,
 * U+2212) sont proscrits de `apps/web/src`. Remplacements : valeur absente →
 * `n/d` ; séparateur de titre → `·` ; apposition → deux-points ; delta négatif
 * → `-` (trait d'union). Voir DESIGN_SYSTEM.md.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));
const INTERDITS = /[—–−]/;
const CE_FICHIER = fileURLToPath(import.meta.url);

function fichiersSource(dossier: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      out.push(...fichiersSource(chemin));
    } else if (/\.(ts|html|css)$/.test(entree) && chemin !== CE_FICHIER) {
      out.push(chemin);
    }
  }
  return out;
}

describe('garde typographique', () => {
  it('aucun tiret long (— – −) dans apps/web/src', () => {
    const fautifs = fichiersSource(SRC)
      .map((chemin) => ({ chemin, lignes: lignesFautives(chemin) }))
      .filter((f) => f.lignes.length > 0);

    expect(
      fautifs,
      fautifs
        .map((f) => `${f.chemin}\n  ${f.lignes.join('\n  ')}`)
        .join('\n'),
    ).toEqual([]);
  });
});

function lignesFautives(chemin: string): string[] {
  return readFileSync(chemin, 'utf8')
    .split('\n')
    .map((ligne, i) => ({ ligne, n: i + 1 }))
    .filter(({ ligne }) => INTERDITS.test(ligne))
    .map(({ ligne, n }) => `L${n}: ${ligne.trim()}`);
}
