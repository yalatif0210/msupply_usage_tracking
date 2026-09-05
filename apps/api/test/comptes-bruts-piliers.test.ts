import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Ticket 01 — les vues de pilier exposent leurs couples attendu / réalisé.
 * Vérifie que chaque couple num/dénom est correct et que le taux existant
 * n'a pas bougé. Grain de l'agrégat « tous programmes » (programme_id NULL).
 */
describe('vues de pilier : couples attendu / réalisé', () => {
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
    await db.query(`SET search_path TO dqa, public`);
    await db.query(`TRUNCATE dqa.fact_inventaire_ligne, dqa.fact_inventaire, dqa.fact_ligne_transaction,
      dqa.fact_transaction, dqa.fact_requisition, dqa.dim_site_programme, dqa.dim_produit_traceur,
      dqa.dim_produit, dqa.dim_programme, dqa.dim_site, dqa.import_lot RESTART IDENTITY CASCADE`);
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('t.xlsx','2026-C2','2026-08','2026-08-01','2026-08-31','valide')`,
    );
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, type_structure)
      VALUES ('S1','Site 1',true,'CSU')`);
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
  const tx = (id: string, nature: string, jour: string, prog: string | null = 'VIH') =>
    db.query(
      `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, lot_id_source)
       VALUES ($1,'S1',$2,$3,'fn',$4::date,1)`,
      [id, nature, prog, jour],
    );
  const refresh = () => db.query(`CALL dqa.rafraichir_et_geler(NULL)`);
  const ligneP1 = <T extends Record<string, unknown>>(cols: string) =>
    db
      .query<T>(
        `SELECT ${cols} FROM dqa.mv_p1_completude
         WHERE site_id='S1' AND mois_paqd='2026-08' AND programme_id IS NULL`,
      )
      .then((r) => r.rows[0]);

  it('P1 : inventaires et réquisitions réalisés sur programmes gérés', async () => {
    // VIH : inventaire + réquisition ; TB : rien
    await inv('A', 'VIH', '2026-08-28');
    await req('R1', 'VIH', '2026-08-31');
    await refresh();
    const row = await ligneP1<{
      nb_inventaires_realise: number;
      nb_inventaires_attendu: number;
      nb_requisitions_realise: number;
      nb_requisitions_attendu: number;
      completude_inventaires_pct: string;
    }>(
      'nb_inventaires_realise, nb_inventaires_attendu, nb_requisitions_realise, nb_requisitions_attendu, completude_inventaires_pct',
    );
    expect(row).toMatchObject({
      nb_inventaires_realise: 1,
      nb_inventaires_attendu: 2,
      nb_requisitions_realise: 1,
      nb_requisitions_attendu: 2,
    });
    expect(Number(row!.completude_inventaires_pct)).toBe(50);
  });

  it('P1 : réceptions / factures fournisseur', async () => {
    await tx('RC1', 'reception', '2026-08-10');
    await tx('RC2', 'reception', '2026-08-12');
    await tx('FA1', 'facture_fournisseur', '2026-08-05');
    await tx('FA2', 'facture_fournisseur', '2026-08-06');
    await tx('FA3', 'facture_fournisseur', '2026-08-07');
    await refresh();
    const row = await ligneP1<{ nb_receptions: number; nb_factures: number; completude_receptions_pct: string }>(
      'nb_receptions, nb_factures, completude_receptions_pct',
    );
    expect(row).toMatchObject({ nb_receptions: 2, nb_factures: 3 });
    expect(Number(row!.completude_receptions_pct)).toBeCloseTo(66.7, 1);
  });

  it('P2 : à l\'heure / attendu, inventaire hors des 3 derniers jours', async () => {
    await inv('A', 'VIH', '2026-08-29'); // dans les 3 derniers jours
    await inv('B', 'TB', '2026-08-10'); // hors délai
    await req('R1', 'VIH', '2026-08-31'); // limite CSU = 5 sept ; à l'heure
    await req('R2', 'TB', '2026-09-30'); // hors délai
    await refresh();
    const { rows } = await db.query<{
      nb_inventaires_a_lheure: number;
      nb_inventaires_attendu: number;
      nb_requisitions_a_lheure: number;
      nb_requisitions_attendu: number;
    }>(
      `SELECT nb_inventaires_a_lheure, nb_inventaires_attendu, nb_requisitions_a_lheure, nb_requisitions_attendu
       FROM dqa.mv_p2_promptitude
       WHERE site_id='S1' AND mois_paqd='2026-08' AND programme_id IS NULL`,
    );
    expect(rows[0]).toMatchObject({
      nb_inventaires_a_lheure: 1,
      nb_inventaires_attendu: 2,
      nb_requisitions_a_lheure: 1,
      nb_requisitions_attendu: 2,
    });
  });

  it('P5 : produits traceurs conformes au seuil / inventoriés', async () => {
    await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom)
      VALUES ('p1','C1','C1'),('p2','C2','C2')`);
    await db.query(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle) VALUES ('C1','C1'),('C2','C2')`);
    await inv('A', 'VIH', '2026-08-28');
    // C1 : 100/100 → concordance 100, conforme ; C2 : 100/50 → 50, non conforme
    await db.query(`INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
      VALUES ('A','p1','X',100,100,1),('A','p2','X',100,50,1)`);
    await refresh();
    const { rows } = await db.query<{ nb_produits: number; nb_produits_conformes: number; taux_concordance_pct: string }>(
      `SELECT nb_produits, nb_produits_conformes, taux_concordance_pct
       FROM dqa.mv_p5_concordance
       WHERE site_id='S1' AND mois_paqd='2026-08' AND programme_id IS NULL`,
    );
    expect(rows[0]).toMatchObject({ nb_produits: 2, nb_produits_conformes: 1 });
  });

  it('P4 : produits dans la tolérance / évalués (écart SDU)', async () => {
    await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom)
      VALUES ('p1','C1','C1'),('p2','C2','C2'),('p3','C3','C3')`);
    await db.query(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle)
      VALUES ('C1','C1'),('C2','C2'),('C3','C3')`);
    await inv('A', 'VIH', '2026-08-28');
    // C1 100/100 conforme ; C2 100/101 (~1%) conforme (tol 2%) ; C3 100/90 non conforme
    await db.query(`INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
      VALUES ('A','p1','X',100,100,1),('A','p2','X',100,101,1),('A','p3','X',100,90,1)`);
    await refresh();
    const { rows } = await db.query<{ nb_produits_sdu: number; nb_conformes_sdu: number }>(
      `SELECT nb_produits_sdu, nb_conformes_sdu FROM dqa.mv_p4_ecart
       WHERE site_id='S1' AND mois_paqd='2026-08' AND programme_id IS NULL`,
    );
    expect(rows[0]).toMatchObject({ nb_produits_sdu: 3, nb_conformes_sdu: 2 });
  });

  // ── Ticket 02 : gel des comptes bruts P1 dans hist_pilier_brut ──────────
  describe('gel des comptes bruts P1', () => {
    const lot = () =>
      db.query<{ id: number }>(`SELECT id FROM dqa.import_lot WHERE mois_paqd='2026-08'`).then((r) => r.rows[0]!.id);
    const geler = async () => db.query(`CALL dqa.rafraichir_et_geler($1)`, [await lot()]);
    const brut = (mesure: string) =>
      db
        .query<{ nb_attendu: number; nb_realise: number; nb_a_lheure: number | null; lot_id: number }>(
          `SELECT nb_attendu, nb_realise, nb_a_lheure, lot_id FROM dqa.hist_pilier_brut
           WHERE site_id='S1' AND mois_paqd='2026-08' AND programme_id IS NULL AND mesure=$1`,
          [mesure],
        )
        .then((r) => r.rows[0]);

    it('fige les trois mesures P1 au grain « tous programmes »', async () => {
      await inv('A', 'VIH', '2026-08-28');
      await req('R1', 'VIH', '2026-08-31');
      await tx('RC1', 'reception', '2026-08-10');
      await tx('FA1', 'facture_fournisseur', '2026-08-05');
      await tx('FA2', 'facture_fournisseur', '2026-08-06');
      await geler();
      expect(await brut('p1_inventaires')).toMatchObject({ nb_attendu: 2, nb_realise: 1, nb_a_lheure: null });
      expect(await brut('p1_requisitions')).toMatchObject({ nb_attendu: 2, nb_realise: 1 });
      expect(await brut('p1_receptions')).toMatchObject({ nb_attendu: 2, nb_realise: 1 });
      expect((await brut('p1_inventaires')).lot_id).toBe(await lot());
    });

    it('ré-appliquer le gel écrase la ligne (upsert sur la clé mesure)', async () => {
      await inv('A', 'VIH', '2026-08-28');
      await geler();
      expect((await brut('p1_inventaires')).nb_realise).toBe(1);
      await inv('B', 'TB', '2026-08-20');
      await geler();
      expect((await brut('p1_inventaires')).nb_realise).toBe(2);
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM dqa.hist_pilier_brut
         WHERE site_id='S1' AND mois_paqd='2026-08' AND programme_id IS NULL AND mesure='p1_inventaires'`,
      );
      expect(rows[0]).toMatchObject({ n: 1 });
    });

    it('sans facture fournisseur, p1_receptions n\'est pas figée (NON_CALCULABLE)', async () => {
      await inv('A', 'VIH', '2026-08-28');
      await geler();
      expect(await brut('p1_receptions')).toBeUndefined();
    });
  });

  // ── Ticket 03 : gel des comptes bruts P2 à P6 ──────────────────────────
  describe('gel des comptes bruts P2 à P6', () => {
    const lot = () =>
      db.query<{ id: number }>(`SELECT id FROM dqa.import_lot WHERE mois_paqd='2026-08'`).then((r) => r.rows[0]!.id);
    const geler = async () => db.query(`CALL dqa.rafraichir_et_geler($1)`, [await lot()]);
    const brut = (mesure: string) =>
      db
        .query<{ nb_attendu: number; nb_realise: number | null; nb_a_lheure: number | null }>(
          `SELECT nb_attendu, nb_realise, nb_a_lheure FROM dqa.hist_pilier_brut
           WHERE site_id='S1' AND mois_paqd='2026-08' AND programme_id IS NULL AND mesure=$1`,
          [mesure],
        )
        .then((r) => r.rows[0]);

    it('P2 : attendu, réalisé (repris de P1) et à l\'heure figés', async () => {
      await inv('A', 'VIH', '2026-08-29'); // dans les 3 derniers jours
      await inv('B', 'TB', '2026-08-10'); // hors délai
      await geler();
      // 2 programmes gérés ont un inventaire → réalisé = 2 (comme p1_inventaires) ;
      // un seul est à l'heure.
      expect(await brut('p2_inventaires')).toMatchObject({
        nb_attendu: 2,
        nb_realise: 2,
        nb_a_lheure: 1,
      });
      expect((await brut('p1_inventaires')).nb_realise).toBe(2);
    });

    it('P3 : jours avec sortie / jours du mois', async () => {
      await tx('D1', 'dispensation', '2026-08-03');
      await tx('D2', 'dispensation', '2026-08-03'); // même jour
      await tx('D3', 'dispensation', '2026-08-17');
      await geler();
      expect(await brut('p3_regularite')).toMatchObject({ nb_attendu: 31, nb_realise: 2 });
    });

    it('P6 : ajustements / mouvements', async () => {
      await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ('x','X','X')`);
      await tx('M1', 'reception', '2026-08-05');
      await tx('M2', 'dispensation', '2026-08-06');
      await tx('AJ', 'ajustement_positif', '2026-08-07');
      for (const t of ['M1', 'M2', 'AJ']) {
        await db.query(
          `INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
           VALUES ($1,$2,'x',1,1,$3,1)`,
          [`${t}L`, t, t === 'AJ'],
        );
      }
      await geler();
      expect(await brut('p6_ajustements')).toMatchObject({ nb_attendu: 3, nb_realise: 1 });
    });
  });

  // ── Le gel reconstitue tous les mois trouvables dans le core, pas
  // seulement celui déclaré par le lot en cours (migration 0035).
  describe('le gel reconstitue tous les mois, pas seulement celui du lot', () => {
    const lot = () =>
      db.query<{ id: number }>(`SELECT id FROM dqa.import_lot WHERE mois_paqd='2026-08'`).then((r) => r.rows[0]!.id);
    const geler = (idLot: number) => db.query(`CALL dqa.rafraichir_et_geler($1)`, [idLot]);
    const moisGeles = () =>
      db
        .query<{ mois_paqd: string }>(`SELECT DISTINCT mois_paqd FROM dqa.hist_score_site ORDER BY mois_paqd`)
        .then((r) => r.rows.map((x) => x.mois_paqd));

    it('un import qui déclare août fige aussi septembre si des données de septembre sont déjà dans le core', async () => {
      await inv('A', 'VIH', '2026-08-28'); // août : programme VIH couvert
      await inv('B', 'VIH', '2026-09-05'); // septembre : arrivé en avance (fenêtre de 45 jours)
      await geler(await lot());
      expect(await moisGeles()).toEqual(['2026-08', '2026-09']);
    });

    it('un identifiant de lot inexistant ne fait pas échouer le gel (trace lot_id = NULL)', async () => {
      await inv('A', 'VIH', '2026-08-28');
      await geler(999999);
      const { rows } = await db.query<{ lot_id: number | null }>(
        `SELECT lot_id FROM dqa.hist_score_site WHERE site_id='S1' AND mois_paqd='2026-08' AND programme_id IS NULL`,
      );
      expect(rows[0]?.lot_id).toBeNull();
    });

    it('mois_est_clos : faux avant le 10 du mois suivant, vrai après', async () => {
      const { rows } = await db.query<{ avant: boolean; limite: boolean; apres: boolean }>(
        `SELECT dqa.mois_est_clos('2026-08', '2026-09-10'::date) AS avant,
                dqa.mois_est_clos('2026-08', '2026-09-11'::date) AS limite,
                dqa.mois_est_clos('2026-08', '2026-10-01'::date) AS apres`,
      );
      expect(rows[0]).toMatchObject({ avant: false, limite: true, apres: true });
    });
  });

  // ── P3 pour un district : réponse aux réquisitions de la zone (ADR 0011) ───
  describe('P3 district : réponse aux réquisitions de la zone', () => {
    const geler = () => db.query(`CALL dqa.rafraichir_et_geler(NULL)`);
    const p3 = (siteId: string) =>
      db
        .query<{ nb_jours: number; nb_jours_avec_sortie: number; taux_regularite_pct: string | null; est_district: boolean }>(
          `SELECT nb_jours, nb_jours_avec_sortie, taux_regularite_pct, est_district
           FROM dqa.mv_p3_regularite
           WHERE site_id = $1 AND mois_paqd = '2026-08' AND programme_id IS NULL`,
          [siteId],
        )
        .then((r) => r.rows[0]);

    beforeEach(async () => {
      // un district et deux sites de sa zone (district 'ZONE-X')
      await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, type_structure, district)
        VALUES ('DIST-T','District test',true,'District sanitaire','ZONE-X'),
               ('ZS1','Zone site 1',true,'CSU','ZONE-X'),
               ('ZS2','Zone site 2',true,'CSU','ZONE-X')`);
      // réquisitions de la zone couvrant juillet → comptent pour le P3 d'août
      await db.query(`INSERT INTO dqa.fact_requisition
        (requisition_id, site_id, programme_id, mois_couvert, date_soumission, statut, lot_id_source)
        VALUES ('RZ1','ZS1','VIH','2026-07','2026-08-03','fn',1),
               ('RZ2','ZS2','VIH','2026-07','2026-08-04','fn',1),
               ('RZ3','ZS1','TB', '2026-07','2026-08-05','fn',1)`);
    });

    it('taux = réquisitions servies dans le mois / réquisitions de la zone (seuil 80)', async () => {
      // le district sert RZ1 (dans août) et RZ2 (dans août) ; RZ3 non servie
      await db.query(`INSERT INTO dqa.fact_transaction
        (transaction_id, site_id, nature, programme_id, statut, date_confirmation, requisition_id, lot_id_source)
        VALUES ('DTX1','DIST-T','distribution','VIH','fn','2026-08-10','RZ1',1),
               ('DTX2','DIST-T','distribution','VIH','fn','2026-08-15','RZ2',1)`);
      await geler();
      const row = await p3('DIST-T');
      expect(row?.est_district).toBe(true);
      expect(Number(row?.nb_jours)).toBe(3);
      expect(Number(row?.nb_jours_avec_sortie)).toBe(2);
      expect(Number(row!.taux_regularite_pct)).toBeCloseTo(66.7, 1);
    });

    it('une distribution hors du mois PAQD ne compte pas', async () => {
      // servie en septembre → hors de la fenêtre du P3 d'août
      await db.query(`INSERT INTO dqa.fact_transaction
        (transaction_id, site_id, nature, programme_id, statut, date_confirmation, requisition_id, lot_id_source)
        VALUES ('DTX1','DIST-T','distribution','VIH','fn','2026-09-02','RZ1',1)`);
      await geler();
      const row = await p3('DIST-T');
      expect(row?.est_district).toBe(true);
      expect(Number(row?.nb_jours)).toBe(3);
      expect(Number(row?.nb_jours_avec_sortie)).toBe(0);
    });

    it('le district n\'apparaît pas dans la branche dispensation', async () => {
      // même si le district a des distributions, sa ligne P3 est est_district
      await db.query(`INSERT INTO dqa.fact_transaction
        (transaction_id, site_id, nature, programme_id, statut, date_confirmation, lot_id_source)
        VALUES ('DTX9','DIST-T','distribution','VIH','fn','2026-08-12',1)`);
      await geler();
      const { rows } = await db.query(
        `SELECT count(*)::int AS n FROM dqa.mv_p3_regularite WHERE site_id = 'DIST-T' AND NOT est_district`,
      );
      expect(rows[0]).toMatchObject({ n: 0 });
    });
  });
});
