import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Garde de conventions de source sur `apps/web/src`.
 *
 * Scan recursif de tous les `.ts` / `.html` / `.css`, memes mecaniques et meme
 * style de rapport que l'ancien `typographie.test.ts`. Trois regles :
 *
 *  1. AUCUN TIRET LONG (cadratin U+2014, demi-cadratin U+2013, signe moins
 *     U+2212). Regle heritee de la refonte analytique. Remplacements : valeur
 *     absente -> "n/d" ; grandeur sans objet -> "s/o" ; separateur de titre ->
 *     point median ; apposition -> deux-points ; delta negatif -> trait
 *     d'union. Voir DESIGN_SYSTEM.md §11.
 *
 *  2. AUCUNE VALEUR TAILWIND ARBITRAIRE dans un template : une chaine de
 *     classes (`class="..."`, `[class]`, `[class.x]`, `[ngClass]`, ou la cle
 *     `class` d'un bloc `host: { ... }`) qui contient un crochet de valeur
 *     arbitraire (`bg-[#123456]`, `w-[13px]`, `text-[15px]`, `min-[600px]:...`).
 *     Motif detecte : `-[` a l'interieur. Une couleur ou une mesure absente de
 *     l'echelle du theme s'ajoute au theme, elle ne se bricole pas dans le
 *     template (DESIGN_SYSTEM.md §3, spec .scratch/refonte-spartan-ui).
 *
 *  3. AUCUN LITTERAL DE COULEUR dans le CSS d'un composant (bloc `styles:` d'un
 *     composant Angular, fichier `.css`, ou attribut/liaison `style` d'un
 *     template) : ni hex (`#rgb` / `#rrggbb` / `#rrggbbaa`), ni `oklch(` /
 *     `rgb(` / `hsl(`. Les couleurs passent par `var(--...)` ou un utilitaire
 *     Tailwind mappe au theme. Les definitions de jetons vivent dans
 *     `theme.css` (exception ci-dessous).
 *
 * EXCEPTIONS : liste explicite, chaque entree justifiee. Le dernier `it`
 * verifie que chaque exception existe encore sur le disque, pour qu'une
 * exception perimee soit signalee.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));

type Regle = 1 | 2 | 3;

interface Exception {
  /** Chemin relatif a `apps/web/src`, separateur `/`. Prefixe : `x/y` couvre `x/y` et son contenu. */
  readonly chemin: string;
  /** Regles que cette entree neutralise pour ce chemin. */
  readonly regles: readonly Regle[];
  readonly pourquoi: string;
}

const EXCEPTIONS: readonly Exception[] = [
  {
    chemin: 'app/ui/spartan',
    regles: [1, 2, 3],
    pourquoi:
      'Composants Helm generes par le CLI spartan (utilitaires Tailwind inlines). ' +
      "On les possede mais on ne les lint pas a la main : ils s'appuient legitimement sur " +
      'des valeurs arbitraires (rounded-[2px], translate-y-[calc(-50%-2px)], text-[length:--spacing(4)]).',
  },
  {
    chemin: 'theme.css',
    regles: [3],
    pourquoi:
      'Couche de jetons du theme. Les litteraux hex / oklch vivent ici par conception : ' +
      '--primary force a #1f6fd6, palette slate en oklch (DESIGN_SYSTEM.md §2).',
  },
  {
    chemin: 'styles.css',
    regles: [3],
    pourquoi:
      "Entree Tailwind + preset spartan + import de theme.css + couche @layer base. " +
      'Fait partie de la couche de jetons ; aucune couleur en dur aujourd\'hui, mais les ' +
      'valeurs brutes y sont admises par conception (DESIGN_SYSTEM.md §3).',
  },
  {
    chemin: 'app/conventions-source.test.ts',
    regles: [1, 2, 3],
    pourquoi:
      'Ce fichier contient les motifs interdits comme litteraux de chaine (regex, exemples de ' +
      'documentation, tirets longs cites dans le commentaire d\'entete).',
  },
];

/** Vrai si `rel` est couvert par une exception pour `regle`. */
function estExcepte(rel: string, regle: Regle): boolean {
  return EXCEPTIONS.some(
    (e) => e.regles.includes(regle) && (rel === e.chemin || rel.startsWith(`${e.chemin}/`)),
  );
}

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

function relatif(chemin: string): string {
  return chemin.slice(SRC.length).replace(/\\/g, '/');
}

/** Numero de ligne (1-based) de l'offset `index` dans `contenu`. */
function ligneDe(contenu: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index && i < contenu.length; i++) {
    if (contenu[i] === '\n') n++;
  }
  return n;
}

interface Fautif {
  readonly chemin: string;
  readonly lignes: readonly string[];
}

function rapport(fautifs: readonly Fautif[]): string {
  return fautifs.map((f) => `${f.chemin}\n  ${f.lignes.join('\n  ')}`).join('\n');
}

// -- Regle 1 : tirets longs -------------------------------------------------

const TIRET_LONG = /[—–−]/;

function tiretsLongs(chemin: string): string[] {
  return readFileSync(chemin, 'utf8')
    .split('\n')
    .map((ligne, i) => ({ ligne, n: i + 1 }))
    .filter(({ ligne }) => TIRET_LONG.test(ligne))
    .map(({ ligne, n }) => `L${n}: ${ligne.trim()}`);
}

// -- Regle 2 : valeur Tailwind arbitraire dans une chaine de classes -------

/** `class="..."`, `[class]="..."`, `[class.x]="..."`, `[ngClass]="..."`, `ngClass="..."`. */
const CHAINE_DE_CLASSES = /\[?(?:ng)?class(?:\.[\w-]+)?\]?\s*=\s*(['"`])([\s\S]*?)\1/gi;
/** Cle `class` d'un objet `host: { ... }` de decorateur Angular. */
const CLASSE_HOST = /(['"]?)class\1\s*:\s*(['"`])([\s\S]*?)\2/gi;
const VALEUR_ARBITRAIRE = /-\[/;

function valeursArbitraires(chemin: string): string[] {
  const contenu = readFileSync(chemin, 'utf8');
  const fautes: string[] = [];
  for (const motif of [CHAINE_DE_CLASSES, CLASSE_HOST]) {
    for (const m of contenu.matchAll(motif)) {
      const valeur = m[m.length - 1] ?? '';
      if (VALEUR_ARBITRAIRE.test(valeur)) {
        const n = ligneDe(contenu, m.index ?? 0);
        fautes.push(`L${n}: ${m[0].replace(/\s+/g, ' ').trim()}`);
      }
    }
  }
  return fautes;
}

// -- Regle 3 : litteral de couleur dans le CSS d'un composant --------------

/** Bloc `styles: \`...\`` d'un decorateur Angular (forme chaine, gabarit courant du depot). */
const BLOC_STYLES = /styles:\s*\[?\s*(['"`])([\s\S]*?)\1/g;
const COULEUR_EN_DUR = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b|(?:oklch|rgba?|hsla?)\s*\(/;

/** Renvoie les segments CSS a inspecter pour un fichier donne, avec leur offset dans le fichier. */
function segmentsCss(chemin: string, contenu: string): { css: string; base: number }[] {
  if (chemin.endsWith('.css')) return [{ css: contenu, base: 0 }];
  if (chemin.endsWith('.ts')) {
    const out: { css: string; base: number }[] = [];
    for (const m of contenu.matchAll(BLOC_STYLES)) {
      out.push({ css: m[2] ?? '', base: (m.index ?? 0) + m[0].indexOf(m[2] ?? '') });
    }
    return out;
  }
  return [];
}

/**
 * `style="..."`, `[style]`, `[style.x]`, `[ngStyle]`, `[attr.style]`. Le
 * lookbehind evite `element.style` / `ctx.fillStyle` (code TS, pas un template).
 */
const CHAINE_DE_STYLE = /(?<![\w.])\[?(?:attr\.|ng)?style(?:\.[\w-]+)?\]?\s*=\s*(['"`])([\s\S]*?)\1/gi;

function couleursEnDur(chemin: string): string[] {
  const contenu = readFileSync(chemin, 'utf8');
  const fautes: string[] = [];
  for (const { css, base } of segmentsCss(chemin, contenu)) {
    for (const ligneCss of css.split('\n')) {
      if (COULEUR_EN_DUR.test(ligneCss)) {
        const n = ligneDe(contenu, base + css.indexOf(ligneCss));
        fautes.push(`L${n}: ${ligneCss.trim()}`);
      }
    }
  }
  if (chemin.endsWith('.ts') || chemin.endsWith('.html')) {
    for (const m of contenu.matchAll(CHAINE_DE_STYLE)) {
      const valeur = m[2] ?? '';
      if (COULEUR_EN_DUR.test(valeur)) {
        fautes.push(`L${ligneDe(contenu, m.index ?? 0)}: ${m[0].replace(/\s+/g, ' ').trim()}`);
      }
    }
  }
  return fautes;
}

// -- Suites ---------------------------------------------------------------

function scanner(regle: Regle, sonde: (chemin: string) => string[]): Fautif[] {
  return fichiersSource(SRC)
    .filter((chemin) => !estExcepte(relatif(chemin), regle))
    .map((chemin) => ({ chemin, lignes: sonde(chemin) }))
    .filter((f) => f.lignes.length > 0);
}

describe('garde de conventions de source', () => {
  it('aucun tiret long dans apps/web/src', () => {
    const fautifs = scanner(1, tiretsLongs);
    expect(fautifs, rapport(fautifs)).toEqual([]);
  });

  it('aucune valeur Tailwind arbitraire dans une chaine de classes', () => {
    const fautifs = scanner(2, valeursArbitraires);
    expect(fautifs, rapport(fautifs)).toEqual([]);
  });

  it('aucun litteral de couleur (hex / oklch / rgb / hsl) dans le CSS d\'un composant', () => {
    const fautifs = scanner(3, couleursEnDur);
    expect(fautifs, rapport(fautifs)).toEqual([]);
  });

  it('chaque exception existe encore sur le disque', () => {
    const perimees = EXCEPTIONS.filter((e) => !existsSync(join(SRC, e.chemin)));
    expect(
      perimees,
      perimees.map((e) => `exception perimee : ${e.chemin}`).join('\n'),
    ).toEqual([]);
  });
});
