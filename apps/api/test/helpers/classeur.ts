import { strToU8, zipSync } from 'fflate';

/**
 * Construit un classeur `.xlsx` minimal pour les tests d'import :
 * un onglet METADATA (champ / valeur) + un onglet par jeu de données
 * (noms de colonnes en ligne 5, données à partir de la ligne 6).
 * Chaînes en `inlineStr` — pas de table de chaînes partagées.
 */

export interface JeuTest {
  nom: string;
  colonnes: string[];
  lignes: Record<string, string>[];
}

export interface OptionsClasseur {
  metadata: Record<string, string>;
  jeux: JeuTest[];
  /** Omettre certains onglets même s'ils sont dans `jeux` (test « onglet manquant »). */
  omettreOnglets?: string[];
  /**
   * Sérialisation façon openpyxl (classeur produit par le script de la DAP,
   * jamais réenregistré dans Excel) : attributs dans un autre ordre
   * (`Target` avant `Id`, `r:id` en dernier), cible de relation absolue,
   * attribut de style avant le type de cellule.
   */
  styleOpenpyxl?: boolean;
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const colRef = (i: number): string => {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

function celluleTexte(ref: string, valeur: string, openpyxl: boolean): string {
  const attributs = openpyxl ? `r="${ref}" s="1" t="inlineStr"` : `r="${ref}" t="inlineStr"`;
  return `<c ${attributs}><is><t xml:space="preserve">${esc(valeur)}</t></is></c>`;
}

function feuille(rows: string[][], openpyxl = false): string {
  const xmlRows = rows
    .map((cells, r) => {
      const num = r + 1;
      const xmlCells = cells
        .map((v, c) => (v === '' ? '' : celluleTexte(`${colRef(c)}${num}`, v, openpyxl)))
        .join('');
      return `<row r="${num}">${xmlCells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlRows}</sheetData></worksheet>`;
}

export function construireClasseur(opts: OptionsClasseur): Buffer {
  const omis = new Set(opts.omettreOnglets ?? []);
  const openpyxl = opts.styleOpenpyxl ?? false;

  const feuilles: { nom: string; xml: string }[] = [];

  // METADATA : ligne 4 = en-têtes, données à partir de la 5 (le lecteur prend
  // toute paire champ/valeur, quel que soit le numéro de ligne)
  const metaRows: string[][] = [['METADATA'], [], [], ['Champ', 'Valeur']];
  for (const [k, v] of Object.entries(opts.metadata)) metaRows.push([k, v]);
  feuilles.push({ nom: 'METADATA', xml: feuille(metaRows, openpyxl) });

  for (const jeu of opts.jeux) {
    if (omis.has(jeu.nom)) continue;
    const rows: string[][] = [
      [jeu.nom],
      ['description'],
      [],
      jeu.colonnes.map(() => 'consigne'),
      jeu.colonnes,
      ...jeu.lignes.map((l) => jeu.colonnes.map((c) => l[c] ?? '')),
    ];
    feuilles.push({ nom: jeu.nom, xml: feuille(rows, openpyxl) });
  }

  const sheetsXml = feuilles
    .map((f, i) =>
      openpyxl
        ? `<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="${esc(f.nom)}" sheetId="${i + 1}" state="visible" r:id="rId${i + 1}"/>`
        : `<sheet name="${esc(f.nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('');
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetsXml}</sheets></workbook>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles
    .map((_, i) =>
      openpyxl
        ? `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet${i + 1}.xml" Id="rId${i + 1}"/>`
        : `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')}</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${feuilles
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('')}</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const fichiers: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(rels),
  };
  feuilles.forEach((f, i) => {
    fichiers[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(f.xml);
  });

  return Buffer.from(zipSync(fichiers));
}

// ── Fixture cohérente : 9 jeux, 1 ligne chacun, références croisées valides ──

export const COLONNES: Record<string, string[]> = {
  SITES: ['site_id', 'site_code', 'site_nom', 'district', 'region', 'type_structure', 'actif', 'dans_perimetre_dqa', 'type_structure_msupply'],
  SITE_PROGRAMME: ['site_id', 'programme_id', 'programme_code', 'programme_nom', 'actif'],
  PRODUITS: ['produit_id', 'produit_code', 'produit_nom', 'unite', 'programmes'],
  TRANSACTIONS: ['transaction_id', 'site_id', 'nature', 'programme_id', 'type_transaction', 'mode', 'statut', 'annulation', 'date_saisie', 'date_confirmation', 'date_livraison', 'requisition_id', 'goods_received_id', 'commentaire', 'date_finalisation', 'transaction_liee_id', 'date_finalisation_liee'],
  LIGNES_TRANSACTIONS: ['ligne_id', 'transaction_id', 'produit_id', 'programme_id', 'lot', 'quantite', 'taille_conditionnement', 'type_ligne', 'issu_ajustement', 'date_peremption'],
  STOCK_ACTUEL: ['site_id', 'produit_id', 'lot', 'quantite_disponible', 'date_peremption', 'date_photo'],
  INVENTAIRES: ['inventaire_id', 'site_id', 'programme_id', 'date_inventaire', 'statut', 'invad_additions_id', 'invad_reductions_id', 'heure_inventaire', 'numero_inventaire'],
  INVENTAIRE_LIGNES: ['inventaire_id', 'produit_id', 'lot', 'quantite_theorique', 'quantite_comptee'],
  REQUISITIONS: ['requisition_id', 'site_id', 'programme_id', 'periode_id', 'mois_couvert_debut', 'mois_couvert_fin', 'date_soumission', 'date_inventaire_ref', 'date_reception', 'statut', 'statut_autorisation', 'type_requisition'],
};

export function optionsValides(): OptionsClasseur {
  const S = 'SITE-1';
  const P = 'PROG-1';
  const I = 'ITEM-1';
  const T = 'TX-1';
  const INV = 'INV-1';
  const jeux: JeuTest[] = [
    { nom: 'SITES', colonnes: COLONNES.SITES!, lignes: [{ site_id: S, site_code: 'C1', site_nom: 'CSU Test', district: 'BONDOUKOU', region: 'GONTOUGO', type_structure: 'ESPC', actif: 'OUI', dans_perimetre_dqa: 'OUI', type_structure_msupply: 'ESPC' }] },
    { nom: 'SITE_PROGRAMME', colonnes: COLONNES.SITE_PROGRAMME!, lignes: [{ site_id: S, programme_id: P, programme_code: 'VIH', programme_nom: 'VIH', actif: 'OUI' }] },
    { nom: 'PRODUITS', colonnes: COLONNES.PRODUITS!, lignes: [{ produit_id: I, produit_code: 'ARV001', produit_nom: 'TDF/3TC/DTG', unite: 'comprimé', programmes: 'VIH' }] },
    { nom: 'TRANSACTIONS', colonnes: COLONNES.TRANSACTIONS!, lignes: [{ transaction_id: T, site_id: S, nature: 'dispensation', programme_id: P, type_transaction: 'ci', mode: 'dispensary', statut: 'fn', annulation: 'NON', date_saisie: '2026-08-10', date_confirmation: '2026-08-10', date_livraison: '', requisition_id: '', goods_received_id: '', commentaire: '', date_finalisation: '2026-08-10', transaction_liee_id: '', date_finalisation_liee: '' }] },
    { nom: 'LIGNES_TRANSACTIONS', colonnes: COLONNES.LIGNES_TRANSACTIONS!, lignes: [{ ligne_id: 'L-1', transaction_id: T, produit_id: I, programme_id: P, lot: 'LOT7', quantite: '30', taille_conditionnement: '30', type_ligne: 'stock_out', issu_ajustement: 'NON', date_peremption: '2027-06-30' }] },
    { nom: 'STOCK_ACTUEL', colonnes: COLONNES.STOCK_ACTUEL!, lignes: [{ site_id: S, produit_id: I, lot: 'LOT7', quantite_disponible: '270', date_peremption: '2027-06-30', date_photo: '2026-08-18' }] },
    { nom: 'INVENTAIRES', colonnes: COLONNES.INVENTAIRES!, lignes: [{ inventaire_id: INV, site_id: S, programme_id: P, date_inventaire: '2026-08-29', statut: 'fn', invad_additions_id: '', invad_reductions_id: '', heure_inventaire: '10:00:00', numero_inventaire: '1' }] },
    { nom: 'INVENTAIRE_LIGNES', colonnes: COLONNES.INVENTAIRE_LIGNES!, lignes: [{ inventaire_id: INV, produit_id: I, lot: 'LOT7', quantite_theorique: '300', quantite_comptee: '295' }] },
    { nom: 'REQUISITIONS', colonnes: COLONNES.REQUISITIONS!, lignes: [{ requisition_id: 'R-1', site_id: S, programme_id: P, periode_id: '', mois_couvert_debut: '2026-08-01', mois_couvert_fin: '2026-08-31', date_soumission: '2026-09-05', date_inventaire_ref: '2026-08-29', date_reception: '', statut: 'fn', statut_autorisation: 'authorised', type_requisition: 'Ordinaire' }] },
  ];
  const metadata: Record<string, string> = {
    date_extraction: '2026-08-18',
    cycle_paqd: '2026-C2',
    mois_paqd: 'M+4',
    mois_debut: '2026-08-01',
    mois_fin: '2026-08-31',
    fenetre_debut: '2026-07-04',
    fenetre_fin: '2026-08-18',
    realisee_par: 'Test',
    version_msupply: 'V9',
  };
  for (const j of jeux) metadata[`nb_lignes_${j.nom}`] = String(j.lignes.length);
  return { metadata, jeux };
}

