import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Non-régression de l'audit du 2026-10-14 : le script de recalcul
 * indépendant (`db/audit/recalcul_independant.sql`) ne doit trouver aucun
 * écart entre ses recalculs et les vues de piliers.
 */
describe('recalcul indépendant des piliers', () => {
  let base: BaseEphemere;
  let db: Pool;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    db = base.pool;
    const q = (sql: string, params: unknown[] = []) => db.query(sql, params);

    await q(`INSERT INTO dqa.import_lot (nom_fichier, mois_paqd, date_extraction, statut)
             VALUES ('t.xlsx','2026-08','2026-09-02','valide')`);
    await q(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, type_structure)
             VALUES ('S1','CSU A',true,'ESPC'),('S2','CSU B',true,'ESPC')`);
    await q(`INSERT INTO dqa.dim_programme (programme_id, programme_code, programme_nom) VALUES ('VIH','VIH','VIH')`);
    await q(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ('S1','VIH',true),('S2','VIH',true)`);
    await q(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom, programmes)
             VALUES ('A1','ARV','ARV','{VIH}'),('A2','ARV','ARV bis','{VIH}'),('B1','TB','TB','{VIH}')`);
    await q(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle) VALUES ('ARV','ARV'),('TB','TB')`);

    for (const site of ['S1', 'S2']) {
      // inventaires bornants (juillet, fin août) sur deux codes, dont un à deux articles
      for (const [inv, jour] of [['I7', '2026-07-30'], ['I8', '2026-08-30']] as const) {
        const id = `${site}-${inv}`;
        await q(`INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
                 VALUES ($1,$2,'VIH',$3::date,'fn',1)`, [id, site, jour]);
        await q(`INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
                 VALUES ($1,'A1','L',100,$2,1),($1,'A2','L',50,50,1),($1,'B1','L',40,30,1)`,
          [id, site === 'S1' ? 100 : 90]);
      }
      // réquisitions ordinaires de juillet et d'août
      await q(`INSERT INTO dqa.fact_requisition (requisition_id, site_id, programme_id, mois_couvert, type_requisition, statut, date_soumission, lot_id_source)
               VALUES ($1,$2,'VIH','2026-07','Ordinaire','fn','2026-08-03',1),($3,$2,'VIH','2026-08','Ordinaire','fn','2026-09-04',1)`,
        [`${site}-R7`, site, `${site}-R8`]);
    }
    // factures répondant à la réquisition de juillet : acceptée, hors mois d'émission, en attente
    const facture = (id: string, site: string, statut: string, saisie: string, fin: string | null, liee: string | null = null) =>
      q(`INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, type_transaction, programme_id, statut,
           requisition_id, date_saisie, date_confirmation, date_finalisation, date_finalisation_liee, lot_id_source)
         VALUES ($1,$2,'facture_fournisseur','si','VIH',$3,$4,$5::date,$5::date,$6::date,$7::date,1)`,
        [id, site, statut, `${site}-R7`, saisie, fin, liee]);
    await facture('F1', 'S1', 'fn', '2026-08-05', '2026-08-06');
    await facture('F2', 'S1', 'fn', '2026-08-02', '2026-08-03', '2026-07-31');
    await facture('F3', 'S2', 'nw', '2026-08-20', null);
    // mouvements : entrée finalisée, entrée non finalisée, dispensations, ajustement
    const mvt = (id: string, site: string, nature: string, statut: string, jour: string, q2: number, ajust = false) =>
      q(`INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, date_finalisation, lot_id_source)
         VALUES ($1,$2,$3,'VIH',$4,$5::date,$5::date,1)`, [id, site, nature, statut, jour])
        .then(() => q(`INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, issu_ajustement, lot_id_source)
                       VALUES ($1,$2,'A1',$3,$4,1)`, [`${id}L`, id, q2, ajust]));
    await mvt('E1', 'S1', 'facture_fournisseur', 'fn', '2026-08-10', 30);
    await mvt('E2', 'S1', 'facture_fournisseur', 'cn', '2026-08-11', 500);
    await mvt('D1', 'S1', 'dispensation', 'fn', '2026-08-12', 30);
    await mvt('D2', 'S2', 'dispensation', 'cn', '2026-08-12', 10);
    await mvt('AJ', 'S2', 'ajustement_negatif', 'fn', '2026-08-30', 10, true);

    await q(`CALL dqa.rafraichir_et_geler(1)`);
  }, 180_000);

  afterAll(async () => {
    await base.stop();
  });

  it('aucun écart entre les recalculs indépendants et les vues', async () => {
    const sql = await readFile(new URL('../../../db/audit/recalcul_independant.sql', import.meta.url), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const { rows } = await client.query<{ controle: string; nb_ecarts: string }>(sql);
      await client.query('ROLLBACK');
      expect(rows).toHaveLength(5);
      for (const r of rows) expect(Number(r.nb_ecarts), r.controle).toBe(0);
    } finally {
      client.release();
    }
  });

  it('le scénario exerce bien chaque contrôle', async () => {
    const { rows } = await db.query<{ rec: string | null; nb: number }>(
      `SELECT completude_receptions_pct AS rec, nb_factures AS nb FROM dqa.mv_p1_completude
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
    );
    expect(rows[0]).toEqual({ rec: '50.0', nb: 2 });
    const p6 = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM dqa.mv_p6_ajustements WHERE programme_id IS NULL`,
    );
    expect(Number(p6.rows[0]?.n)).toBeGreaterThan(0);
  });
});
