import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IndicateursRepository } from '../src/indicateurs/indicateurs.repository.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Ticket 04 — `GET /api/sites/:id/piliers/:code`, variantes P1 et P2.
 * Détail ligne à ligne lu en direct du core, contre des `fact_*` fabriqués à la
 * main. Vérifie les listes, les comptes bruts figés, `calculeLe` / `coreMajLe`
 * et le drapeau de ré-import.
 */
describe('détail ligne à ligne des piliers (P1, P2)', () => {
  let base: BaseEphemere;
  let db: Pool;
  let repo: IndicateursRepository;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    db = base.pool;
    repo = new IndicateursRepository(db);
  }, 120_000);

  afterAll(async () => {
    await base.stop();
  });

  beforeEach(async () => {
    await db.query(`SET search_path TO dqa, public`);
    await db.query(`TRUNCATE dqa.hist_pilier_brut, dqa.hist_score_site, dqa.fact_inventaire_ligne,
      dqa.fact_inventaire, dqa.fact_ligne_transaction, dqa.fact_transaction, dqa.fact_requisition,
      dqa.dim_site_programme, dqa.dim_produit_traceur, dqa.dim_produit, dqa.dim_programme,
      dqa.dim_site, dqa.import_lot RESTART IDENTITY CASCADE`);
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('t.xlsx','2026-C2','2026-08','2026-08-01','2026-08-31','valide')`,
    );
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, type_structure, district, region)
      VALUES ('S1','Site 1',true,'CSU','D1','R1')`);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('VIH','VIH'),('TB','TB')`);
    await db.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif)
      VALUES ('S1','VIH',true),('S1','TB',true)`);
  });

  const inv = (id: string, prog: string, jour: string, statut = 'fn') =>
    db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ($1,'S1',$2,$3::date,$4,1)`,
      [id, prog, jour, statut],
    );
  const req = (id: string, prog: string, soumission: string | null) =>
    db.query(
      `INSERT INTO dqa.fact_requisition (requisition_id, site_id, programme_id, mois_couvert, date_soumission, lot_id_source)
       VALUES ($1,'S1',$2,'2026-08',$3::date,1)`,
      [id, prog, soumission],
    );
  const tx = (id: string, nature: string, jour: string, prog: string | null = 'VIH', ref: string | null = null) =>
    db.query(
      `INSERT INTO dqa.fact_transaction
         (transaction_id, site_id, nature, programme_id, statut, date_confirmation, goods_received_id, lot_id_source)
       VALUES ($1,'S1',$2,$3,'fn',$4::date,$5,1)`,
      [id, nature, prog, jour, ref],
    );
  const lotId = () =>
    db.query<{ id: number }>(`SELECT id FROM dqa.import_lot WHERE mois_paqd='2026-08'`).then((r) => r.rows[0]!.id);
  const geler = async () => db.query(`CALL dqa.rafraichir_et_geler($1)`, [await lotId()]);

  const prod = (id: string, nom: string) =>
    db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ($1,$1,$2)`, [id, nom]);
  /** Une ligne de transaction (mouvement) : `issuAjustement` pose le drapeau d'ajustement. */
  const ligne = (id: string, txId: string, produitId: string, quantite: number, issuAjustement = false) =>
    db.query(
      `INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, issu_ajustement, lot_id_source)
       VALUES ($1,$2,$3,$4,$5,1)`,
      [id, txId, produitId, quantite, issuAjustement],
    );

  // ── P1 ────────────────────────────────────────────────────────────────────

  it('P1 nominal : listes, manques par programme et comptes bruts figés', async () => {
    await inv('A', 'VIH', '2026-08-29'); // dans les 3 derniers jours
    await req('R1', 'VIH', '2026-08-31');
    await tx('RC1', 'reception', '2026-08-10', 'VIH', 'GRN-1');
    await tx('FA1', 'facture_fournisseur', '2026-08-05');
    await tx('FA2', 'facture_fournisseur', '2026-08-06');
    await geler();

    const d = await repo.detailPilier('S1', 'p1', {});
    expect(d).not.toBeNull();
    if (d === null || d.code !== 'p1') throw new Error('variante p1 attendue');

    expect(d.moisPaqd).toBe('2026-08');
    expect(d.inventaires).toEqual([{ date: '2026-08-29', programme: 'VIH' }]);
    expect(d.requisitions).toEqual([
      { programme: 'VIH', moisCouvert: '2026-08', dateSoumission: '2026-08-31' },
    ]);
    expect(d.receptions).toEqual([{ date: '2026-08-10', reference: 'GRN-1' }]);
    expect(d.factures.map((f) => f.date)).toEqual(['2026-08-05', '2026-08-06']);

    const vih = d.programmesGeres.find((p) => p.programme === 'VIH');
    const tb = d.programmesGeres.find((p) => p.programme === 'TB');
    expect(vih).toEqual({ programme: 'VIH', aInventaire: true, aRequisition: true });
    expect(tb).toEqual({ programme: 'TB', aInventaire: false, aRequisition: false });

    const inv1 = d.comptesBruts.find((c) => c.mesure === 'p1_inventaires');
    const rec1 = d.comptesBruts.find((c) => c.mesure === 'p1_receptions');
    expect(inv1).toMatchObject({ attendu: 2, realise: 1 });
    expect(rec1).toMatchObject({ attendu: 2, realise: 1 });

    expect(d.calculeLe).not.toBeNull();
    expect(d.coreMajLe).not.toBeNull();
    expect(d.reimporteDepuisLeGel).toBe(false);
  });

  it('P1 limite : aucune facture → p1_receptions non figée ; core modifié après le gel', async () => {
    await inv('A', 'VIH', '2026-08-29');
    await req('R1', 'VIH', '2026-08-31');
    await geler();

    const d1 = await repo.detailPilier('S1', 'p1', {});
    if (d1 === null || d1.code !== 'p1') throw new Error('variante p1 attendue');
    expect(d1.receptions).toEqual([]);
    expect(d1.factures).toEqual([]);
    expect(d1.comptesBruts.some((c) => c.mesure === 'p1_receptions')).toBe(false);
    expect(d1.reimporteDepuisLeGel).toBe(false);

    // le core bouge sans regel du mois → avertissement
    await db.query(`UPDATE dqa.fact_inventaire SET maj_le = now() + interval '1 day' WHERE inventaire_id = 'A'`);
    const d2 = await repo.detailPilier('S1', 'p1', {});
    if (d2 === null || d2.code !== 'p1') throw new Error('variante p1 attendue');
    expect(d2.reimporteDepuisLeGel).toBe(true);
  });

  // ── P2 ────────────────────────────────────────────────────────────────────

  it('P2 nominal : 3 derniers jours et date limite de réquisition', async () => {
    await inv('A', 'VIH', '2026-08-29'); // dans les 3 derniers jours (août : 29-31)
    await inv('B', 'TB', '2026-08-10'); // hors délai
    await req('R1', 'VIH', '2026-08-31'); // limite CSU = 2026-09-05 → à l'heure
    await req('R2', 'TB', '2026-09-30'); // en retard
    await geler();

    const d = await repo.detailPilier('S1', 'p2', {});
    if (d === null || d.code !== 'p2') throw new Error('variante p2 attendue');

    const invVih = d.inventaires.find((i) => i.programme === 'VIH');
    const invTb = d.inventaires.find((i) => i.programme === 'TB');
    expect(invVih).toEqual({ date: '2026-08-29', programme: 'VIH', dansLes3DerniersJours: true });
    expect(invTb).toEqual({ date: '2026-08-10', programme: 'TB', dansLes3DerniersJours: false });

    const reqVih = d.requisitions.find((r) => r.programme === 'VIH');
    const reqTb = d.requisitions.find((r) => r.programme === 'TB');
    expect(reqVih).toEqual({
      programme: 'VIH',
      dateSoumission: '2026-08-31',
      dateLimite: '2026-09-05',
      aLHeure: true,
    });
    expect(reqTb).toMatchObject({ dateLimite: '2026-09-05', aLHeure: false });

    expect(d.comptesBruts.find((c) => c.mesure === 'p2_inventaires')).toMatchObject({
      attendu: 2,
      aLHeure: 1,
    });
    expect(d.coreMajLe).not.toBeNull();
  });

  it('P2 limite : réquisition soumise pile le jour limite, inventaire pile au 1er des 3 derniers jours', async () => {
    await inv('A', 'VIH', '2026-08-29'); // premier jour de la fenêtre des 3 derniers
    await req('R1', 'VIH', '2026-09-05'); // pile la date limite CSU
    await geler();

    const d = await repo.detailPilier('S1', 'p2', {});
    if (d === null || d.code !== 'p2') throw new Error('variante p2 attendue');

    expect(d.inventaires.find((i) => i.programme === 'VIH')?.dansLes3DerniersJours).toBe(true);
    expect(d.requisitions.find((r) => r.programme === 'VIH')).toMatchObject({
      dateSoumission: '2026-09-05',
      dateLimite: '2026-09-05',
      aLHeure: true,
    });
  });

  // ── P3 ────────────────────────────────────────────────────────────────────

  it('P3 nominal : bandeau calendaire, deux jours avec sortie sur 31', async () => {
    await tx('D1', 'dispensation', '2026-08-03');
    await tx('D2', 'dispensation', '2026-08-03'); // même jour
    await tx('D3', 'dispensation', '2026-08-17');
    await geler();

    const d = await repo.detailPilier('S1', 'p3', {});
    if (d === null || d.code !== 'p3') throw new Error('variante p3 attendue');

    expect(d.moisPaqd).toBe('2026-08');
    expect(d.jours).toHaveLength(31);
    expect(d.jours[0]).toEqual({ jour: '2026-08-01', aSortie: false });
    expect(d.jours.filter((j) => j.aSortie).map((j) => j.jour)).toEqual(['2026-08-03', '2026-08-17']);

    expect(d.comptesBruts.find((c) => c.mesure === 'p3_regularite')).toMatchObject({
      attendu: 31,
      realise: 2,
    });
    expect(d.calculeLe).not.toBeNull();
    expect(d.coreMajLe).not.toBeNull();
    expect(d.reimporteDepuisLeGel).toBe(false);
  });

  it('P3 limite : une distribution compte, une transaction annulée est ignorée', async () => {
    await tx('DI', 'distribution', '2026-08-10');
    await db.query(
      `INSERT INTO dqa.fact_transaction
         (transaction_id, site_id, nature, programme_id, statut, date_confirmation, annulation, lot_id_source)
       VALUES ('AN','S1','dispensation','VIH','fn','2026-08-20',true,1)`,
    );
    await geler();

    const d = await repo.detailPilier('S1', 'p3', {});
    if (d === null || d.code !== 'p3') throw new Error('variante p3 attendue');
    expect(d.jours.filter((j) => j.aSortie).map((j) => j.jour)).toEqual(['2026-08-10']);
  });

  // ── P6 ────────────────────────────────────────────────────────────────────

  it('P6 nominal : un ajustement sur trois mouvements, sens déduit du signe', async () => {
    await prod('P-PARA', 'Paracétamol');
    await tx('M1', 'dispensation', '2026-08-05');
    await ligne('L1', 'M1', 'P-PARA', 10);
    await tx('M2', 'dispensation', '2026-08-06');
    await ligne('L2', 'M2', 'P-PARA', 5);
    await tx('AJ', 'dispensation', '2026-08-09');
    await ligne('L3', 'AJ', 'P-PARA', -8, true); // ligne issue d'un ajustement
    await geler();

    const d = await repo.detailPilier('S1', 'p6', {});
    if (d === null || d.code !== 'p6') throw new Error('variante p6 attendue');

    expect(d.nbMouvements).toBe(3);
    expect(d.ajustements).toEqual([
      { date: '2026-08-09', produit: 'Paracétamol', quantite: -8, sens: 'negatif' },
    ]);
    expect(d.comptesBruts.find((c) => c.mesure === 'p6_ajustements')).toMatchObject({
      attendu: 3,
      realise: 1,
    });
    expect(d.coreMajLe).not.toBeNull();
  });

  it('P6 limite : ligne issu_ajustement (signe) vs nature ajustement_negatif', async () => {
    await prod('P-A', 'Produit A');
    await tx('T1', 'dispensation', '2026-08-04');
    await ligne('T1L', 'T1', 'P-A', 3, true); // pas de nature d'ajustement → sens du signe : positif
    await tx('T2', 'ajustement_negatif', '2026-08-11');
    await ligne('T2L', 'T2', 'P-A', 7); // la nature l'emporte → negatif
    await geler();

    const d = await repo.detailPilier('S1', 'p6', {});
    if (d === null || d.code !== 'p6') throw new Error('variante p6 attendue');

    expect(d.nbMouvements).toBe(2);
    expect(d.ajustements.map((a) => ({ date: a.date, sens: a.sens }))).toEqual([
      { date: '2026-08-04', sens: 'positif' },
      { date: '2026-08-11', sens: 'negatif' },
    ]);
  });

  it('404 (null) pour un site hors périmètre', async () => {
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S9','Hors',false)`);
    expect(await repo.detailPilier('S9', 'p1', {})).toBeNull();
    expect(await repo.detailPilier('INCONNU', 'p2', {})).toBeNull();
    expect(await repo.detailPilier('S9', 'p3', {})).toBeNull();
    expect(await repo.detailPilier('INCONNU', 'p6', {})).toBeNull();
  });
});
