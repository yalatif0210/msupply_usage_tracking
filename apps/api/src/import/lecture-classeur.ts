import { unzipSync, strFromU8 } from 'fflate';

/**
 * Lecteur de classeur `.xlsx` sans dépendance lourde : dézippe l'archive OOXML
 * et parse les XML. Rend les valeurs de cellules comme du **texte brut** — la
 * couche staging capture tout, la validation interprète ensuite.
 *
 * Ligne 5 de chaque onglet = noms de colonnes ; ligne 6+ = données.
 */

export interface OngletLu {
  nom: string;
  entetes: string[]; // ligne 5, dans l'ordre des colonnes
  lignes: LigneLue[]; // ligne 6+
}

export interface LigneLue {
  ligneSource: number; // numéro de ligne Excel (1-based)
  valeurs: Record<string, string>; // par nom de colonne (entête)
}

export interface ClasseurLu {
  metadata: Map<string, string>; // onglet METADATA : champ -> valeur
  onglets: Map<string, OngletLu>; // tous les autres onglets, par nom
}

const LIGNE_ENTETES = 5;
const LIGNE_DONNEES_DEBUT = 6;

function decode(xml: string): string {
  return xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * Valeur d'un attribut XML dans une liste d'attributs, quel que soit son rang :
 * l'ordre varie selon le producteur (Excel écrit `Id` avant `Target`, openpyxl
 * l'inverse).
 */
function attribut(attributs: string, nom: string): string | undefined {
  const echappe = nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${echappe}="([^"]*)"`).exec(attributs)?.[1];
}

function colLettres(ref: string): string {
  return ref.replace(/\d+/g, '');
}

function colIndex(lettres: string): number {
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const si of xml.match(/<si>[\s\S]*?<\/si>|<si\/>/g) ?? []) {
    const textes = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? '');
    out.push(decode(textes.join('')));
  }
  return out;
}

interface CelluleBrute {
  col: number;
  valeur: string;
}

function parseFeuille(xml: string, shared: string[]): Map<number, CelluleBrute[]> {
  const lignes = new Map<number, CelluleBrute[]>();
  for (const rowMatch of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const numLigne = Number(rowMatch[1]);
    const cellules: CelluleBrute[] = [];
    for (const cMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cMatch[1] ?? '';
      const ref = attribut(attrs, 'r');
      if (!ref) continue;
      const corps = cMatch[2] ?? '';
      const type = attribut(attrs, 't');
      let valeur = '';
      if (type === 's') {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(corps)?.[1] ?? '');
        valeur = shared[idx] ?? '';
      } else if (type === 'inlineStr') {
        const t = [...corps.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? '');
        valeur = decode(t.join(''));
      } else if (type === 'str') {
        valeur = decode(/<v>([\s\S]*?)<\/v>/.exec(corps)?.[1] ?? '');
      } else if (type === 'b') {
        valeur = /<v>1<\/v>/.test(corps) ? 'TRUE' : 'FALSE';
      } else {
        valeur = decode(/<v>([\s\S]*?)<\/v>/.exec(corps)?.[1] ?? '');
      }
      cellules.push({ col: colIndex(colLettres(ref)), valeur: valeur.trim() });
    }
    lignes.set(numLigne, cellules);
  }
  return lignes;
}

export function lireClasseur(buffer: Buffer): ClasseurLu {
  let fichiers: Record<string, Uint8Array>;
  try {
    fichiers = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new ClasseurIllisibleError('Le fichier n\'est pas un classeur .xlsx valide');
  }

  const lire = (p: string): string | undefined => {
    const f = fichiers[p];
    return f ? strFromU8(f) : undefined;
  };

  const workbook = lire('xl/workbook.xml');
  const rels = lire('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) {
    throw new ClasseurIllisibleError('Classeur .xlsx incomplet (workbook manquant)');
  }
  const shared = parseSharedStrings(lire('xl/sharedStrings.xml'));

  const relCible = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attribut(m[1] ?? '', 'Id');
    const cible = attribut(m[1] ?? '', 'Target');
    if (id && cible) relCible.set(id, cible.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const metadata = new Map<string, string>();
  const onglets = new Map<string, OngletLu>();

  for (const s of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const nom = decode(attribut(s[1] ?? '', 'name') ?? '');
    const cible = relCible.get(attribut(s[1] ?? '', 'r:id') ?? '');
    const xml = cible ? lire(`xl/${cible}`) : undefined;
    if (!xml) continue;
    const lignes = parseFeuille(xml, shared);

    if (nom === 'MODE_EMPLOI') continue;

    if (nom === 'METADATA') {
      for (const [, cellules] of lignes) {
        const champ = cellules.find((c) => c.col === 0)?.valeur ?? '';
        const valeur = cellules.find((c) => c.col === 1)?.valeur ?? '';
        if (champ) metadata.set(champ, valeur);
      }
      continue;
    }

    const entetesCells = lignes.get(LIGNE_ENTETES) ?? [];
    const maxCol = entetesCells.reduce((m, c) => Math.max(m, c.col), -1);
    const entetes: string[] = [];
    for (let i = 0; i <= maxCol; i++) {
      entetes.push(entetesCells.find((c) => c.col === i)?.valeur ?? '');
    }

    const donnees: LigneLue[] = [];
    for (const [num, cellules] of [...lignes.entries()].sort((a, b) => a[0] - b[0])) {
      if (num < LIGNE_DONNEES_DEBUT) continue;
      const valeurs: Record<string, string> = {};
      let vide = true;
      for (let i = 0; i < entetes.length; i++) {
        const nomCol = entetes[i] ?? `col_${i}`;
        const v = cellules.find((c) => c.col === i)?.valeur ?? '';
        valeurs[nomCol] = v;
        if (v !== '') vide = false;
      }
      if (!vide) donnees.push({ ligneSource: num, valeurs });
    }

    onglets.set(nom, { nom, entetes, lignes: donnees });
  }

  return { metadata, onglets };
}

export class ClasseurIllisibleError extends Error {}
