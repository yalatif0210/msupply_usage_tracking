import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

describe('socle base de données DQA', () => {
  let base: BaseEphemere;
  let db: Pool;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    db = base.pool;
  }, 120_000);

  afterAll(async () => {
    await base.stop();
  });

  it('crée les tables de contrôle des imports, sans colonne d\'empreinte', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'dqa' AND table_name = 'import_lot'`,
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain('statut');
    expect(cols).toContain('mois_paqd');
    expect(cols.some((c) => c.includes('sha') || c.includes('empreinte'))).toBe(false);
  });

  it('a une table stg_* par jeu du contrat V2', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'dqa' AND table_name LIKE 'stg\\_%'`,
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual(
      [
        'stg_inventaire_lignes',
        'stg_inventaires',
        'stg_lignes_transactions',
        'stg_produits',
        'stg_requisitions',
        'stg_site_programme',
        'stg_sites',
        'stg_stock_actuel',
        'stg_transactions',
      ].sort(),
    );
  });

  it('les faits ont une clé mSupply et un lot source', async () => {
    for (const table of ['fact_transaction', 'fact_inventaire']) {
      const { rows } = await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'dqa' AND table_name = $1`,
        [table],
      );
      expect(rows.map((r) => r.column_name)).toContain('lot_id_source');
    }
  });

  it('seede la grille v1 avec des poids qui somment à 100', async () => {
    const { rows } = await db.query<{ somme: string }>(
      `SELECT sum(poids_pct)::text AS somme FROM dqa.grille_poids_pilier`,
    );
    expect(Number(rows[0]?.somme)).toBe(100);
    const seuils = await db.query(`SELECT * FROM dqa.grille_seuil_sous_composante`);
    expect(seuils.rowCount).toBe(9);
  });

  it('seede le calendrier avec jours ouvrables et fériés CI', async () => {
    const total = await db.query<{ c: string }>(`SELECT count(*)::text AS c FROM dqa.dim_temps`);
    expect(Number(total.rows[0]?.c)).toBeGreaterThan(1000);
    const feteNationale = await db.query<{ est_ouvrable: boolean }>(
      `SELECT est_ouvrable FROM dqa.dim_temps WHERE jour = DATE '2026-08-07'`,
    );
    expect(feteNationale.rows[0]?.est_ouvrable).toBe(false);
    const cycle = await db.query<{ cycle_paqd: string }>(
      `SELECT cycle_paqd FROM dqa.dim_temps WHERE jour = DATE '2026-05-15'`,
    );
    expect(cycle.rows[0]?.cycle_paqd).toBe('2026-C2');
  });

  it('seede la table des produits traceurs', async () => {
    const { rowCount } = await db.query(`SELECT 1 FROM dqa.dim_produit_traceur`);
    expect(rowCount).toBeGreaterThan(0);
  });

  it('seede la liste réelle des produits traceurs (13, sans placeholder)', async () => {
    const { rows } = await db.query<{ n: string; p: string }>(
      `SELECT count(*)::text AS n,
              count(*) FILTER (WHERE produit_code LIKE '\\_\\_PLACEHOLDER%')::text AS p
       FROM dqa.dim_produit_traceur`,
    );
    expect(rows[0]?.n).toBe('13');
    expect(rows[0]?.p).toBe('0');
  });

  it('les migrations de seed sont re-jouables (ON CONFLICT)', async () => {
    const avant = await db.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM dqa.dim_produit_traceur`,
    );
    await db.query(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle)
                    VALUES ('3100014-ARV', 'x') ON CONFLICT (produit_code) DO UPDATE SET libelle = EXCLUDED.libelle`);
    const apres = await db.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM dqa.dim_produit_traceur`,
    );
    expect(apres.rows[0]?.c).toBe(avant.rows[0]?.c);
  });
});
