import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Garde typographique : aucun tiret long en console.
 *
 * Les tirets longs (cadratin U+2014, demi-cadratin U+2013, signe moins
 * U+2212) sont proscrits de `apps/web/src`. Remplacements : valeur absente
 * -> "n/d" ; separateur de titre -> point median ; apposition -> deux-points ;
 * delta negatif -> trait d'union. Voir la spec .scratch/refonte-analytique.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));
const INTERDITS = new RegExp('[\\u2014\\u2013\\u2212]');

/** Fichiers tolérés (chemins relatifs à `apps/web/src`). Vide au départ. */
const EXCEPTIONS: readonly string[] = [];

function fichiersSource(dossier: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      out.push(...fichiersSource(chemin));
    } else if (/\.(ts|html|css)$/.test(entree)) {
      out.push(chemin);
    }
  }
  return out;
}

describe('garde typographique', () => {
  it('aucun tiret long dans apps/web/src', () => {
    const fautifs = fichiersSource(SRC)
      .filter((chemin) => !EXCEPTIONS.includes(chemin.slice(SRC.length).replace(/\\/g, '/')))
      .map((chemin) => ({ chemin, lignes: lignesFautives(chemin) }))
      .filter((f) => f.lignes.length > 0);

    expect(fautifs, fautifs.map((f) => `${f.chemin}\n  ${f.lignes.join('\n  ')}`).join('\n')).toEqual([]);
  });
});

function lignesFautives(chemin: string): string[] {
  return readFileSync(chemin, 'utf8')
    .split('\n')
    .map((ligne, i) => ({ ligne, n: i + 1 }))
    .filter(({ ligne }) => INTERDITS.test(ligne))
    .map(({ ligne, n }) => `L${n}: ${ligne.trim()}`);
}
