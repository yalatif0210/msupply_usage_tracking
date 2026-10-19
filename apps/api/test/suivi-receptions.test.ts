import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Suivi des réceptions, hors score (ADR 0019) : factures en attente
 * d'acceptation et réquisitions ordinaires ayant reçu une facture.
 */
describe('suivi des réceptions (hors score)', () => {
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
    await db.query(`TRUNCATE dqa.fact_transaction, dqa.fact_requisition, dqa.dim_site_programme,
      dqa.dim_programme, dqa.dim_site, dqa.import_lot RESTART IDENTITY CASCADE`);
    // les données ne sont pas en temps réel : l'attente se mesure à la date
    // d'extraction du dernier lot validé
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, mois_paqd, date_extraction, statut)
       VALUES ('t.xlsx','2026-08','2026-08-20','valide')`,
    );
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('VIH','VIH')`);
    await db.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ('S1','VIH',true)`);
  });

  const facture = (id: string, statut: string, saisie: string, requisitionId: string | null = null) =>
    db.query(
      `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, statut, requisition_id, date_saisie, lot_id_source)
       VALUES ($1,'S1','facture_fournisseur',$2,$3,$4::date,1)`,
      [id, statut, requisitionId, saisie],
    );
  const enAttente = async () =>
    (
      await db.query<{ transaction_id: string; anciennete_jours: number; en_alerte: boolean }>(
        `SELECT transaction_id, anciennete_jours, en_alerte FROM dqa.v_factures_en_attente ORDER BY transaction_id`,
      )
    ).rows;

  it('une facture en attente depuis 8 jours est signalée, pas une de 6 jours', async () => {
    await facture('F8', 'nw', '2026-08-12'); // 8 jours avant l'extraction
    await facture('F6', 'cn', '2026-08-14'); // 6 jours
    await facture('FN', 'fn', '2026-08-01'); // finalisée : plus en attente
    expect(await enAttente()).toEqual([
      { transaction_id: 'F6', anciennete_jours: 6, en_alerte: false },
      { transaction_id: 'F8', anciennete_jours: 8, en_alerte: true },
    ]);
  });

  it('le délai d\'alerte est un paramètre en base', async () => {
    await facture('F6', 'cn', '2026-08-14');
    await db.query(`UPDATE dqa.parametre_suivi SET valeur = 5 WHERE cle = 'delai_alerte_facture_jours'`);
    try {
      expect((await enAttente())[0]?.en_alerte).toBe(true);
    } finally {
      await db.query(`UPDATE dqa.parametre_suivi SET valeur = 7 WHERE cle = 'delai_alerte_facture_jours'`);
    }
  });

  it('part des réquisitions ordinaires du mois précédent ayant reçu une facture', async () => {
    const req = (id: string, type = 'Ordinaire', statut = 'fn') =>
      db.query(
        `INSERT INTO dqa.fact_requisition
           (requisition_id, site_id, programme_id, mois_couvert, type_requisition, statut, lot_id_source)
         VALUES ($1,'S1','VIH','2026-07',$2,$3,1)`,
        [id, type, statut],
      );
    await req('R1');
    await req('R2');
    await req('RU', 'Urgente'); // hors suivi
    await facture('F1', 'nw', '2026-08-05', 'R1');
    const { rows } = await db.query<{ nb_requisitions: number; nb_avec_facture: number }>(
      `SELECT nb_requisitions, nb_avec_facture FROM dqa.v_suivi_requisitions_factures
       WHERE site_id = 'S1' AND mois_paqd = '2026-08'`,
    );
    expect(rows[0]).toEqual({ nb_requisitions: 2, nb_avec_facture: 1 });
  });
});
