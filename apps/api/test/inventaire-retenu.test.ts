import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * ADR 0016 : un seul inventaire retenu par (site, jour, produit), lignes sans
 * programme comptées une fois, P5 sur les lots sommés, codes produit portés
 * par plusieurs articles comptés une fois. Données de core fabriquées à la
 * main, août 2026 (mois clos).
 */
describe('inventaire retenu et codes à plusieurs articles', () => {
  let base: BaseEphemere;
  let db: Pool;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    db = base.pool;
  }, 120_000);

  afterAll(async () => {
    await base.stop();
  });

  beforeEach(async () => {
    await db.query(`TRUNCATE dqa.hist_score_site, dqa.fact_inventaire_ligne, dqa.fact_inventaire,
      dqa.fact_ligne_transaction, dqa.fact_transaction, dqa.fact_stock_snapshot,
      dqa.dim_site_programme, dqa.dim_produit_traceur, dqa.dim_produit, dqa.dim_programme,
      dqa.dim_site, dqa.import_lot RESTART IDENTITY CASCADE`);
    await db.query(`INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
      VALUES ('t.xlsx', '2026-C2', '2026-08', '2026-08-01', '2026-08-31', 'valide')`);
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, type_structure, dans_perimetre_dqa)
      VALUES ('S1', 'CSU', 'ESPC', true)`);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('P1', 'VIH'), ('P2', 'TB')`);
    await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES
      ('I1', 'ARV', 'ARV'), ('I2A', 'ALB', 'Albendazole'), ('I2B', 'ALB', 'Albendazole')`);
    await db.query(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle) VALUES ('ARV', 'ARV'), ('ALB', 'Albendazole')`);
  });

  type Ligne = [produit: string, lot: string, theorique: number, comptee: number];
  const inventaire = async (
    id: string, programme: string | null, jour: string,
    heure: string | null, numero: number | null, lignes: Ligne[],
  ) => {
    await db.query(
      `INSERT INTO dqa.fact_inventaire
         (inventaire_id, site_id, programme_id, date_inventaire, statut, heure_inventaire, numero_inventaire, lot_id_source)
       VALUES ($1, 'S1', $2, $3::date, 'fn', $4::time, $5, 1)`,
      [id, programme, jour, heure, numero],
    );
    for (const [produit, lot, theorique, comptee] of lignes) {
      await db.query(
        `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
         VALUES ($1, $2, $3, $4, $5, 1)`,
        [id, produit, lot, theorique, comptee],
      );
    }
  };
  const reception = async (id: string, programme: string | null, jour: string, produit: string, qte: number) => {
    await db.query(
      `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, lot_id_source)
       VALUES ($1, 'S1', 'reception', $2, 'fn', $3::date, 1)`,
      [id, programme, jour],
    );
    await db.query(
      `INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
       VALUES ($1, $2, $3, $4, 1, false, 1)`,
      [`${id}L`, id, produit, qte],
    );
  };
  const rafraichir = () => db.query(`CALL dqa.rafraichir_et_geler(1)`);
  const produit = async (produitId: string, programme: string | null) => {
    const { rows } = await db.query<{ theorique: string; comptee: string; receptions: string | null }>(
      `SELECT theorique::text, comptee::text, receptions::text FROM dqa.mv_p4_ecart_produit
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND produit_id = $1
         AND coalesce(programme_id, '') = $2`,
      [produitId, programme ?? ''],
    );
    expect(rows.length).toBeLessThanOrEqual(1);
    return rows[0];
  };
  const nombre = (v: string | undefined) => (v === undefined ? undefined : Number(v));

  it('recomptage le même jour : le dernier finalisé fait foi, le stock n\'est pas doublé', async () => {
    await inventaire('INV-A', 'P1', '2026-08-29', '10:00', 5, [['I1', 'X', 100, 50]]);
    await inventaire('INV-B', 'P1', '2026-08-29', '15:00', 6, [['I1', 'X', 100, 100]]);
    await rafraichir();
    expect(nombre((await produit('I1', 'P1'))?.comptee)).toBe(100);
    expect(nombre((await produit('I1', null))?.comptee)).toBe(100);
  });

  it('l\'heure prime sur l\'ordre d\'insertion : une saisie plus ancienne ne remplace pas la plus récente', async () => {
    await inventaire('INV-B', 'P1', '2026-08-29', '15:00', 6, [['I1', 'X', 100, 100]]);
    await inventaire('INV-A', 'P1', '2026-08-29', '10:00', 5, [['I1', 'X', 100, 50]]);
    await rafraichir();
    expect(nombre((await produit('I1', null))?.comptee)).toBe(100);
  });

  it('sans heure, le numéro mSupply départage', async () => {
    await inventaire('INV-Z', 'P1', '2026-08-29', null, 7, [['I1', 'X', 100, 100]]);
    await inventaire('INV-Y', 'P1', '2026-08-29', null, 3, [['I1', 'X', 100, 50]]);
    await rafraichir();
    expect(nombre((await produit('I1', null))?.comptee)).toBe(100);
  });

  it('deux programmes le même jour : chacun garde le sien, « tous programmes » le dernier, sans somme', async () => {
    await inventaire('INV-P1', 'P1', '2026-08-29', '09:00', 1, [['I1', 'X', 100, 80]]);
    await inventaire('INV-P2', 'P2', '2026-08-29', '11:00', 2, [['I1', 'X', 100, 100]]);
    await rafraichir();
    expect(nombre((await produit('I1', 'P1'))?.comptee)).toBe(80);
    expect(nombre((await produit('I1', 'P2'))?.comptee)).toBe(100);
    expect(nombre((await produit('I1', null))?.comptee)).toBe(100);
  });

  it('un inventaire sans programme ne compte qu\'une fois dans « tous programmes »', async () => {
    await inventaire('INV-N', null, '2026-08-29', '10:00', 1, [['I1', 'X', 100, 100]]);
    await rafraichir();
    const { rows } = await db.query(
      `SELECT 1 FROM dqa.mv_p4_ecart_produit WHERE site_id = 'S1' AND produit_id = 'I1'`,
    );
    expect(rows.length).toBe(1);
  });

  it('une réception sans programme n\'est comptée qu\'une fois dans la consommation', async () => {
    await inventaire('INV-JUL', 'P1', '2026-07-31', '10:00', 1, [['I1', 'X', 100, 100]]);
    await inventaire('INV-AOU', 'P1', '2026-08-29', '10:00', 2, [['I1', 'X', 100, 100]]);
    await reception('R1', null, '2026-08-10', 'I1', 10);
    await rafraichir();
    expect(nombre((await produit('I1', null))?.receptions)).toBe(10);
  });

  it('P5 additionne les lots d\'un produit', async () => {
    await inventaire('INV-L', 'P1', '2026-08-29', '10:00', 1, [['I1', 'L1', 50, 50], ['I1', 'L2', 50, 40]]);
    await rafraichir();
    const { rows } = await db.query<{ taux: string; nb: number }>(
      `SELECT taux_concordance_pct::text AS taux, nb_produits::int AS nb FROM dqa.mv_p5_concordance
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
    );
    expect(rows[0]).toEqual({ taux: '90.0', nb: 1 });
  });

  it('un code porté par deux articles compte une fois, non conforme si un article ne l\'est pas', async () => {
    await inventaire('INV-C', 'P1', '2026-08-29', '10:00', 1, [
      ['I1', 'X', 100, 100],
      ['I2A', 'X', 100, 100],
      ['I2B', 'X', 100, 50],
    ]);
    await rafraichir();
    const p4 = await db.query<{ nb: number; conformes: number }>(
      `SELECT nb_produits_sdu::int AS nb, nb_conformes_sdu::int AS conformes FROM dqa.mv_p4_ecart
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
    );
    expect(p4.rows[0]).toEqual({ nb: 2, conformes: 1 });
    const p5 = await db.query<{ nb: number; conformes: number }>(
      `SELECT nb_produits::int AS nb, nb_produits_conformes::int AS conformes FROM dqa.mv_p5_concordance
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
    );
    expect(p5.rows[0]).toEqual({ nb: 2, conformes: 1 });
    const articles = await db.query(
      `SELECT produit_id FROM dqa.mv_p4_ecart_produit
       WHERE site_id = 'S1' AND produit_code = 'ALB' AND programme_id IS NULL ORDER BY 1`,
    );
    expect(articles.rows.map((r: { produit_id: string }) => r.produit_id)).toEqual(['I2A', 'I2B']);
  });
});
