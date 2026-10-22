import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Lot réel du 2026-10-22 : une réquisition ancienne citée par une facture
 * (canevas v2.4) créait des mois fantômes, et le gel échouait sur ceux sans
 * grille en vigueur. Seuls les mois mesurables reçoivent un score (0050).
 */
describe('mois mesurables', () => {
  let base: BaseEphemere;
  let db: Pool;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    db = base.pool;
    await db.query(`INSERT INTO dqa.import_lot (nom_fichier, mois_paqd, fenetre_debut, date_extraction, statut)
                    VALUES ('t.xlsx','2026-10','2026-08-01','2026-10-22','valide')`);
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, type_structure)
                    VALUES ('S1','CSU',true,'ESPC')`);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('VIH','VIH')`);
    await db.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ('S1','VIH',true)`);
    // réquisitions : une de 2019 et une de juin 2026 (avant la fenêtre), citées par
    // une facture ; une d'août 2026, dans la fenêtre
    await db.query(`INSERT INTO dqa.fact_requisition (requisition_id, site_id, programme_id, mois_couvert, type_requisition, statut, date_soumission, lot_id_source)
                    VALUES ('R19','S1','VIH','2019-06','Ordinaire','fn','2019-07-02',1),
                           ('R06','S1','VIH','2026-06','Ordinaire','fn','2026-07-02',1),
                           ('R08','S1','VIH','2026-08','Ordinaire','fn','2026-09-02',1)`);
    await db.query(`INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, type_transaction, statut, requisition_id, date_saisie, date_finalisation, lot_id_source)
                    VALUES ('F19','S1','facture_fournisseur','si','fn','R19','2026-08-05','2026-08-06',1),
                           ('F06','S1','facture_fournisseur','si','fn','R06','2026-08-05','2026-08-06',1)`);
  }, 120_000);

  afterAll(async () => {
    await base.stop();
  });

  it('le gel aboutit et ne note que les mois couverts par la fenêtre d\'extraction', async () => {
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const { rows } = await db.query<{ mois_paqd: string }>(
      `SELECT DISTINCT mois_paqd FROM dqa.hist_score_site ORDER BY 1`,
    );
    const mois = rows.map((r) => r.mois_paqd);
    expect(mois).toContain('2026-08');
    expect(mois.every((m) => m >= '2026-08' && m <= '2026-10')).toBe(true);
  });

  it('dqa.mois_mesurable : grille en vigueur, pas dans le futur, pas avant la première fenêtre', async () => {
    const m = async (mois: string) =>
      (await db.query<{ v: boolean }>(`SELECT dqa.mois_mesurable($1) AS v`, [mois])).rows[0]!.v;
    expect(await m('2026-08')).toBe(true);
    expect(await m('2026-07')).toBe(false); // avant la fenêtre importée
    expect(await m('2019-07')).toBe(false); // aucune grille en vigueur
    expect(await m('2099-01')).toBe(false); // futur
  });
});
