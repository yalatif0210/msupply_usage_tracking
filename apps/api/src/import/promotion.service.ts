import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { AnomalieImport } from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';
import { NATURES } from './contrat-jeux.js';

/**
 * Promotion staging → core, en transaction unique (appelée par ImportService
 * dans la transaction du lot). Upsert sur les identifiants mSupply : ré-importer
 * le même classeur laisse le core inchangé ; un classeur corrigé pour le même
 * mois remplace les lignes.
 */

const B = (col: string) => `upper(coalesce(${col}, '')) = 'OUI'`;
const D = (col: string) => `CASE WHEN ${col} ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN ${col}::date END`;
const N = (col: string) => `CASE WHEN ${col} ~ '^-?\\d+(\\.\\d+)?$' THEN ${col}::numeric END`;
const NATURE_LISTE = NATURES.map((n) => `'${n}'`).join(', ');

const ETAPES: { nom: string; sql: string }[] = [
  {
    // Fenêtre d'extraction, à défaut la date d'extraction (validée) : les mois
    // du lot ne sont écrits qu'après la promotion. Élargie à l'année civile
    // précédente et à la suivante : les réquisitions rattrapées (M-2) peuvent
    // enjamber le changement d'année.
    nom: 'dim_temps',
    sql: `
      SELECT dqa.completer_calendrier(
               (date_trunc('year', coalesce(fenetre_debut, date_extraction)) - interval '1 year')::date,
               (date_trunc('year', coalesce(fenetre_fin, date_extraction)) + interval '2 years - 1 day')::date)
      FROM dqa.import_lot
      WHERE id = $1 AND coalesce(fenetre_debut, date_extraction) IS NOT NULL
        AND coalesce(fenetre_fin, date_extraction) IS NOT NULL`,
  },
  {
    nom: 'dim_site',
    sql: `
      INSERT INTO dqa.dim_site
        (site_id, site_code, site_nom, district, region, type_structure,
         actif, dans_perimetre_dqa, lot_id_source, maj_le)
      SELECT site_id, site_code, coalesce(site_nom, ''), district, region, type_structure,
             ${B('actif')}, ${B('dans_perimetre_dqa')},
             $1, now()
      FROM dqa.stg_sites WHERE lot_id = $1 AND site_id IS NOT NULL
      ON CONFLICT (site_id) DO UPDATE SET
        site_code = EXCLUDED.site_code, site_nom = EXCLUDED.site_nom,
        district = EXCLUDED.district, region = EXCLUDED.region,
        type_structure = EXCLUDED.type_structure, actif = EXCLUDED.actif,
        dans_perimetre_dqa = EXCLUDED.dans_perimetre_dqa,
        lot_id_source = EXCLUDED.lot_id_source, maj_le = now()`,
  },
  {
    nom: 'dim_programme',
    sql: `
      INSERT INTO dqa.dim_programme (programme_id, programme_code, programme_nom, lot_id_source, maj_le)
      SELECT DISTINCT ON (programme_id)
             programme_id, programme_code, coalesce(programme_nom, ''), $1, now()
      FROM dqa.stg_site_programme WHERE lot_id = $1 AND programme_id IS NOT NULL
      ON CONFLICT (programme_id) DO UPDATE SET
        programme_code = EXCLUDED.programme_code, programme_nom = EXCLUDED.programme_nom,
        lot_id_source = EXCLUDED.lot_id_source, maj_le = now()`,
  },
  {
    nom: 'dim_produit',
    sql: `
      INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom, unite, programmes, lot_id_source, maj_le)
      SELECT produit_id, produit_code, coalesce(produit_nom, ''), unite,
             CASE WHEN coalesce(programmes, '') = '' THEN '{}'::text[]
                  ELSE string_to_array(programmes, ';') END,
             $1, now()
      FROM dqa.stg_produits WHERE lot_id = $1 AND produit_id IS NOT NULL
      ON CONFLICT (produit_id) DO UPDATE SET
        produit_code = EXCLUDED.produit_code, produit_nom = EXCLUDED.produit_nom,
        unite = EXCLUDED.unite, programmes = EXCLUDED.programmes,
        lot_id_source = EXCLUDED.lot_id_source, maj_le = now()`,
  },
  {
    // L'onglet PRODUITS ne porte que les traceurs listés dans le script
    // d'extraction (ADR 0015) : chacun l'est d'office, le dernier lot reçu
    // fait foi pour la liste.
    nom: 'dim_produit_traceur',
    sql: `
      INSERT INTO dqa.dim_produit_traceur (produit_code, libelle, actif, maj_le)
      SELECT DISTINCT ON (produit_code) produit_code, nullif(produit_nom, ''), true, now()
      FROM dqa.stg_produits WHERE lot_id = $1 AND coalesce(produit_code, '') <> ''
      ORDER BY produit_code, produit_id
      ON CONFLICT (produit_code) DO UPDATE SET
        libelle = EXCLUDED.libelle, actif = true, maj_le = now()`,
  },
  {
    // Garde : un lot sans onglet PRODUITS ne vide pas la liste.
    nom: 'dim_produit_traceur_retires',
    sql: `
      UPDATE dqa.dim_produit_traceur t SET actif = false, maj_le = now()
      WHERE t.actif
        AND EXISTS (SELECT 1 FROM dqa.stg_produits WHERE lot_id = $1 AND coalesce(produit_code, '') <> '')
        AND NOT EXISTS (SELECT 1 FROM dqa.stg_produits p
                        WHERE p.lot_id = $1 AND p.produit_code = t.produit_code)`,
  },
  {
    nom: 'dim_site_programme',
    sql: `
      INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif, lot_id_source, maj_le)
      SELECT sp.site_id, sp.programme_id, ${B('sp.actif')}, $1, now()
      FROM dqa.stg_site_programme sp
      JOIN dqa.dim_site s     ON s.site_id = sp.site_id
      JOIN dqa.dim_programme p ON p.programme_id = sp.programme_id
      WHERE sp.lot_id = $1
      ON CONFLICT (site_id, programme_id) DO UPDATE SET
        actif = EXCLUDED.actif, lot_id_source = EXCLUDED.lot_id_source, maj_le = now()`,
  },
  {
    nom: 'fact_transaction',
    sql: `
      WITH invad AS (
        SELECT invad_additions_id AS tx, 'ajustement_positif' AS n
        FROM dqa.stg_inventaires WHERE lot_id = $1 AND coalesce(invad_additions_id,'') <> ''
        UNION
        SELECT invad_reductions_id, 'ajustement_negatif'
        FROM dqa.stg_inventaires WHERE lot_id = $1 AND coalesce(invad_reductions_id,'') <> ''
      )
      INSERT INTO dqa.fact_transaction
        (transaction_id, site_id, nature, programme_id, type_transaction, mode, statut,
         annulation, date_saisie, date_confirmation, date_livraison, requisition_id,
         goods_received_id, commentaire, lot_id_source, maj_le)
      SELECT t.transaction_id, t.site_id,
             COALESCE(
               (SELECT n FROM invad WHERE tx = t.transaction_id),
               CASE
                 WHEN t.nature IN (${NATURE_LISTE}) THEN t.nature
                 WHEN lower(t.type_transaction) = 'ci' AND lower(t.mode) = 'dispensary' THEN 'dispensation'
                 WHEN lower(t.type_transaction) = 'ci' AND lower(t.mode) = 'store' THEN 'distribution'
                 WHEN lower(t.type_transaction) = 'si' THEN 'facture_fournisseur'
                 WHEN lower(t.type_transaction) = 'rc' THEN 'reception'
                 WHEN lower(t.type_transaction) = 'sc' THEN 'retour_fournisseur'
                 WHEN lower(t.type_transaction) = 'cc' THEN 'retour_client'
                 ELSE 'autre'
               END),
             p.programme_id, t.type_transaction, t.mode, t.statut,
             ${B('t.annulation')}, ${D('t.date_saisie')}, ${D('t.date_confirmation')},
             ${D('t.date_livraison')}, nullif(t.requisition_id, ''), nullif(t.goods_received_id, ''),
             nullif(t.commentaire, ''), $1, now()
      FROM dqa.stg_transactions t
      JOIN dqa.dim_site s ON s.site_id = t.site_id
      LEFT JOIN dqa.dim_programme p ON p.programme_id = t.programme_id
      WHERE t.lot_id = $1 AND t.transaction_id IS NOT NULL
      ON CONFLICT (transaction_id) DO UPDATE SET
        site_id = EXCLUDED.site_id, nature = EXCLUDED.nature, programme_id = EXCLUDED.programme_id,
        type_transaction = EXCLUDED.type_transaction, mode = EXCLUDED.mode, statut = EXCLUDED.statut,
        annulation = EXCLUDED.annulation, date_saisie = EXCLUDED.date_saisie,
        date_confirmation = EXCLUDED.date_confirmation, date_livraison = EXCLUDED.date_livraison,
        requisition_id = EXCLUDED.requisition_id, goods_received_id = EXCLUDED.goods_received_id,
        commentaire = EXCLUDED.commentaire, lot_id_source = EXCLUDED.lot_id_source, maj_le = now()`,
  },
  {
    nom: 'fact_ligne_transaction',
    sql: `
      INSERT INTO dqa.fact_ligne_transaction
        (ligne_id, transaction_id, produit_id, programme_id, lot, quantite,
         taille_conditionnement, type_ligne, issu_ajustement, date_peremption, lot_id_source, maj_le)
      SELECT l.ligne_id, l.transaction_id, l.produit_id, p.programme_id, coalesce(l.lot, ''),
             coalesce(${N('l.quantite')}, 0), coalesce(${N('l.taille_conditionnement')}, 1),
             l.type_ligne, ${B('l.issu_ajustement')}, ${D('l.date_peremption')}, $1, now()
      FROM dqa.stg_lignes_transactions l
      JOIN dqa.fact_transaction t ON t.transaction_id = l.transaction_id
      JOIN dqa.dim_produit pr     ON pr.produit_id = l.produit_id
      LEFT JOIN dqa.dim_programme p ON p.programme_id = l.programme_id
      WHERE l.lot_id = $1 AND l.ligne_id IS NOT NULL
      ON CONFLICT (ligne_id) DO UPDATE SET
        transaction_id = EXCLUDED.transaction_id, produit_id = EXCLUDED.produit_id,
        programme_id = EXCLUDED.programme_id, lot = EXCLUDED.lot, quantite = EXCLUDED.quantite,
        taille_conditionnement = EXCLUDED.taille_conditionnement, type_ligne = EXCLUDED.type_ligne,
        issu_ajustement = EXCLUDED.issu_ajustement, date_peremption = EXCLUDED.date_peremption,
        lot_id_source = EXCLUDED.lot_id_source, maj_le = now()`,
  },
  {
    nom: 'fact_inventaire',
    sql: `
      INSERT INTO dqa.fact_inventaire
        (inventaire_id, site_id, programme_id, date_inventaire, statut,
         invad_additions_id, invad_reductions_id, heure_inventaire, numero_inventaire,
         lot_id_source, maj_le)
      SELECT i.inventaire_id, i.site_id, p.programme_id, ${D('i.date_inventaire')}, i.statut,
             nullif(i.invad_additions_id, ''), nullif(i.invad_reductions_id, ''),
             CASE WHEN i.heure_inventaire ~ '^([01]?\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$' THEN i.heure_inventaire::time END,
             CASE WHEN i.numero_inventaire ~ '^\\d{1,9}$' THEN i.numero_inventaire::integer END,
             $1, now()
      FROM dqa.stg_inventaires i
      JOIN dqa.dim_site s ON s.site_id = i.site_id
      LEFT JOIN dqa.dim_programme p ON p.programme_id = i.programme_id
      WHERE i.lot_id = $1 AND i.inventaire_id IS NOT NULL
        AND i.date_inventaire ~ '^\\d{4}-\\d{2}-\\d{2}$'
      ON CONFLICT (inventaire_id) DO UPDATE SET
        site_id = EXCLUDED.site_id, programme_id = EXCLUDED.programme_id,
        date_inventaire = EXCLUDED.date_inventaire, statut = EXCLUDED.statut,
        invad_additions_id = EXCLUDED.invad_additions_id, invad_reductions_id = EXCLUDED.invad_reductions_id,
        heure_inventaire = EXCLUDED.heure_inventaire, numero_inventaire = EXCLUDED.numero_inventaire,
        lot_id_source = EXCLUDED.lot_id_source, maj_le = now()`,
  },
  {
    nom: 'fact_inventaire_ligne',
    sql: `
      INSERT INTO dqa.fact_inventaire_ligne
        (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source, maj_le)
      SELECT il.inventaire_id, il.produit_id, coalesce(il.lot, ''),
             sum(${N('il.quantite_theorique')}), sum(${N('il.quantite_comptee')}), $1, now()
      FROM dqa.stg_inventaire_lignes il
      JOIN dqa.fact_inventaire fi ON fi.inventaire_id = il.inventaire_id
      JOIN dqa.dim_produit pr     ON pr.produit_id = il.produit_id
      WHERE il.lot_id = $1
      GROUP BY il.inventaire_id, il.produit_id, coalesce(il.lot, '')
      ON CONFLICT (inventaire_id, produit_id, lot) DO UPDATE SET
        quantite_theorique = EXCLUDED.quantite_theorique, quantite_comptee = EXCLUDED.quantite_comptee,
        lot_id_source = EXCLUDED.lot_id_source, maj_le = now()`,
  },
  {
    nom: 'fact_requisition',
    sql: `
      INSERT INTO dqa.fact_requisition
        (requisition_id, site_id, programme_id, periode_id, mois_couvert,
         date_soumission, date_inventaire_ref, date_reception,
         statut, statut_autorisation, type_requisition, lot_id_source, maj_le)
      SELECT r.requisition_id, r.site_id, p.programme_id, nullif(r.periode_id, ''),
             to_char(r.mois_couvert_debut::date, 'YYYY-MM'),
             ${D('r.date_soumission')}, ${D('r.date_inventaire_ref')}, ${D('r.date_reception')},
             nullif(r.statut, ''), nullif(r.statut_autorisation, ''), nullif(r.type_requisition, ''),
             $1, now()
      FROM dqa.stg_requisitions r
      JOIN dqa.dim_site s ON s.site_id = r.site_id
      LEFT JOIN dqa.dim_programme p ON p.programme_id = r.programme_id
      WHERE r.lot_id = $1 AND r.requisition_id IS NOT NULL
        AND r.mois_couvert_debut ~ '^\\d{4}-\\d{2}-\\d{2}$'
      ON CONFLICT (requisition_id) DO UPDATE SET
        site_id = EXCLUDED.site_id, programme_id = EXCLUDED.programme_id,
        periode_id = EXCLUDED.periode_id, mois_couvert = EXCLUDED.mois_couvert,
        date_soumission = EXCLUDED.date_soumission, date_inventaire_ref = EXCLUDED.date_inventaire_ref,
        date_reception = EXCLUDED.date_reception, statut = EXCLUDED.statut,
        statut_autorisation = EXCLUDED.statut_autorisation, type_requisition = EXCLUDED.type_requisition,
        lot_id_source = EXCLUDED.lot_id_source, maj_le = now()`,
  },
  {
    // mSupply répartit un même lot sur plusieurs item_line (emplacements,
    // conditionnements) : on somme, et la péremption retenue est la plus proche.
    nom: 'fact_stock_snapshot',
    sql: `
      INSERT INTO dqa.fact_stock_snapshot
        (date_photo, site_id, produit_id, lot, quantite_disponible, date_peremption, lot_id_source, maj_le)
      SELECT ${D('st.date_photo')}, st.site_id, st.produit_id, coalesce(st.lot, ''),
             sum(coalesce(${N('st.quantite_disponible')}, 0)), min(${D('st.date_peremption')}), $1, now()
      FROM dqa.stg_stock_actuel st
      JOIN dqa.dim_site s   ON s.site_id = st.site_id
      JOIN dqa.dim_produit pr ON pr.produit_id = st.produit_id
      WHERE st.lot_id = $1 AND st.date_photo ~ '^\\d{4}-\\d{2}-\\d{2}$'
      GROUP BY ${D('st.date_photo')}, st.site_id, st.produit_id, coalesce(st.lot, '')
      ON CONFLICT (date_photo, site_id, produit_id, lot) DO UPDATE SET
        quantite_disponible = EXCLUDED.quantite_disponible, date_peremption = EXCLUDED.date_peremption,
        lot_id_source = EXCLUDED.lot_id_source, maj_le = now()`,
  },
];

@Injectable()
export class PromotionService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Promeut le lot dans le core. Doit tourner dans la transaction du lot. */
  async promouvoir(lotId: number, client: PoolClient): Promise<void> {
    for (const etape of ETAPES) {
      await client.query(etape.sql, [lotId]);
    }
  }

  /** Détecte les lignes de staging non promues faute de référence. */
  async anomaliesReferences(lotId: number, client: PoolClient): Promise<AnomalieImport[]> {
    const requetes: { onglet: string; code: string; sql: string; message: string }[] = [
      { onglet: 'TRANSACTIONS', code: 'REFERENCE_NON_PROMUE',
        message: 'transaction non promue : site absent du core',
        sql: `SELECT ligne_source, transaction_id AS v FROM dqa.stg_transactions t
              WHERE t.lot_id = $1 AND t.transaction_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM dqa.dim_site s WHERE s.site_id = t.site_id)` },
      { onglet: 'LIGNES_TRANSACTIONS', code: 'REFERENCE_NON_PROMUE',
        message: 'ligne non promue : transaction ou produit absent du core',
        sql: `SELECT ligne_source, ligne_id AS v FROM dqa.stg_lignes_transactions l
              WHERE l.lot_id = $1 AND l.ligne_id IS NOT NULL
                AND (NOT EXISTS (SELECT 1 FROM dqa.fact_transaction ft WHERE ft.transaction_id = l.transaction_id)
                  OR NOT EXISTS (SELECT 1 FROM dqa.dim_produit p WHERE p.produit_id = l.produit_id))` },
      { onglet: 'INVENTAIRE_LIGNES', code: 'REFERENCE_NON_PROMUE',
        message: 'ligne d\'inventaire non promue : inventaire ou produit absent du core',
        sql: `SELECT ligne_source, inventaire_id AS v FROM dqa.stg_inventaire_lignes il
              WHERE il.lot_id = $1
                AND (NOT EXISTS (SELECT 1 FROM dqa.fact_inventaire fi WHERE fi.inventaire_id = il.inventaire_id)
                  OR NOT EXISTS (SELECT 1 FROM dqa.dim_produit p WHERE p.produit_id = il.produit_id))` },
      { onglet: 'REQUISITIONS', code: 'REFERENCE_NON_PROMUE',
        message: 'réquisition non promue : site absent du core',
        sql: `SELECT ligne_source, requisition_id AS v FROM dqa.stg_requisitions r
              WHERE r.lot_id = $1 AND r.requisition_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM dqa.dim_site s WHERE s.site_id = r.site_id)` },
    ];
    const out: AnomalieImport[] = [];
    for (const r of requetes) {
      const { rows } = await client.query<{ ligne_source: number | null; v: string | null }>(r.sql, [lotId]);
      for (const row of rows) {
        out.push({
          onglet: r.onglet, ligneSource: row.ligne_source, gravite: 'avertissement',
          code: r.code, message: r.message, valeurBrute: row.v,
        });
      }
    }
    return out;
  }
}
