import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IndicateursRepository } from '../src/indicateurs/indicateurs.repository.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Couture B — `mv_p4_ecart_produit` : détail par produit traceur des écarts
 * SDU / consommation, contre des données de core fabriquées à la main.
 * Vérifie aussi la cohérence avec les taux agrégés de `mv_p4_ecart`, et la
 * lecture repository de la variante `p4` de `DetailPilier` (tableau P4 · P5).
 */
describe('vue mv_p4_ecart_produit', () => {
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
    await db.query(`TRUNCATE dqa.hist_pilier_brut, dqa.hist_score_site, dqa.fact_inventaire_ligne, dqa.fact_inventaire,
      dqa.fact_ligne_transaction, dqa.fact_transaction, dqa.dim_site_programme,
      dqa.dim_produit_traceur, dqa.dim_produit, dqa.dim_programme, dqa.dim_site,
      dqa.import_lot RESTART IDENTITY CASCADE`);
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('t.xlsx','2026-C2','2026-08','2026-08-01','2026-08-31','valide')`,
    );
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('P1','VIH')`);
  });

  const produit = async (id: string, code: string, traceur: boolean) => {
    await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ($1,$2,$1)`, [id, code]);
    if (traceur) {
      await db.query(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle) VALUES ($1,$2)`, [code, `lib ${code}`]);
    }
  };
  const inventaire = async (id: string, jour: string) =>
    db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ($1,'S1','P1',$2::date,'fn',1)`,
      [id, jour],
    );
  const ligne = async (inv: string, prod: string, theorique: number, comptee: number) =>
    db.query(
      `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
       VALUES ($1,$2,'X',$3,$4,1)`,
      [inv, prod, theorique, comptee],
    );
  const mouvement = async (id: string, nature: string, jour: string, prod: string, qte: number) => {
    await db.query(
      `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, lot_id_source)
       VALUES ($1,'S1',$2,'P1','fn',$3::date,1)`,
      [id, nature, jour],
    );
    await db.query(
      `INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
       VALUES ($1,$2,$3,$4,1,false,1)`,
      [`${id}L`, id, prod, qte],
    );
  };

  const prod = async (programme: string | null = null) => {
    const { rows } = await db.query<{
      produit_code: string;
      ecart_sdu_pct: string | null;
      sdu_conforme: boolean;
      reconstituee: string | null;
      ecart_conso_pct: string | null;
      conso_evaluable: boolean;
      conso_raison_exclusion: string | null;
      conso_conforme: boolean;
    }>(
      `SELECT produit_code, ecart_sdu_pct, sdu_conforme, reconstituee,
              ecart_conso_pct, conso_evaluable, conso_raison_exclusion, conso_conforme
       FROM dqa.mv_p4_ecart_produit
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND coalesce(programme_id,'') = $1
       ORDER BY produit_code`,
      [programme ?? ''],
    );
    return Object.fromEntries(rows.map((r) => [r.produit_code, r]));
  };

  /** Panier de test : 6 traceurs inventoriés + 1 non traceur + 1 site hors périmètre. */
  const socle = async () => {
    await Promise.all([
      produit('I1', 'T1', true), produit('I2', 'T2', true), produit('I4', 'T4', true),
      produit('I5', 'T5', true), produit('I6', 'T6', true), produit('I7', 'T7', true),
      produit('I3', 'X3', false),
    ]);
    await db.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ('S1','P1',true)`);
    await inventaire('A', '2026-08-05');
    await inventaire('B', '2026-08-28');
    // I1 : SDU conforme (100/100) ; conso évaluable, non conforme (25 vs 30)
    await ligne('A', 'I1', 100, 100);
    await ligne('B', 'I1', 100, 100);
    await mouvement('RC1', 'facture_fournisseur', '2026-08-10', 'I1', 30);
    await mouvement('DI1', 'dispensation', '2026-08-15', 'I1', 25);
    // I2 : un seul inventaire, SDU hors tolérance (100 vs 90)
    await ligne('B', 'I2', 100, 90);
    // I4 : compté 0 / théorique 0 → conforme
    await ligne('B', 'I4', 0, 0);
    // I5 : compté 0 / théorique 5 → écart infini, non conforme
    await ligne('B', 'I5', 5, 0);
    // I6 : deux inventaires, reconstituée négative (10 + 0 − 100)
    await ligne('A', 'I6', 10, 10);
    await ligne('B', 'I6', 100, 100);
    // I7 : deux inventaires, conso évaluable ET conforme
    // reconstituée = 50 (début) + 20 (réception) − 50 (fin) = 20 ; déclarée = 20
    await ligne('A', 'I7', 50, 50);
    await ligne('B', 'I7', 50, 50);
    await mouvement('RC7', 'facture_fournisseur', '2026-08-10', 'I7', 20);
    await mouvement('DI7', 'dispensation', '2026-08-15', 'I7', 20);
    // I3 non traceur → ignoré
    await ligne('B', 'I3', 100, 50);
    // site hors périmètre avec un traceur inventorié → doit être ignoré
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S9','HORS',false)`);
    await db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ('Z','S9','P1','2026-08-28','fn',1)`,
    );
    await db.query(
      `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
       VALUES ('Z','I1','X',100,10,1)`,
    );
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
  };

  it('une ligne par produit traceur inventorié ; non traceur et hors périmètre exclus', async () => {
    await socle();
    const p = await prod();
    expect(Object.keys(p).sort()).toEqual(['T1', 'T2', 'T4', 'T5', 'T6', 'T7']);
    expect(p['X3']).toBeUndefined();
    const { rowCount } = await db.query(`SELECT 1 FROM dqa.mv_p4_ecart_produit WHERE site_id = 'S9'`);
    expect(rowCount).toBe(0);
  });

  it('écart SDU : cas nominal, cas limites compté 0', async () => {
    await socle();
    const p = await prod();
    expect(p['T1']).toMatchObject({ ecart_sdu_pct: '0.0', sdu_conforme: true });
    expect(p['T2']?.sdu_conforme).toBe(false); // 11.1 % > 2 %
    expect(p['T4']).toMatchObject({ ecart_sdu_pct: '0.0', sdu_conforme: true }); // 0 / 0
    expect(p['T5']).toMatchObject({ ecart_sdu_pct: null, sdu_conforme: false }); // 0 / >0 → infini
  });

  it('écart consommation : évaluable, exclusions et reconstituée', async () => {
    await socle();
    const p = await prod();
    // I1 : reconstituée = 100 + 30 − 100 = 30 ; |25 − 30| / 30 = 16.7 % > 2 %
    expect(p['T1']).toMatchObject({
      conso_evaluable: true, reconstituee: '30.000', ecart_conso_pct: '16.7', conso_conforme: false,
    });
    // I7 : reconstituée = 50 + 20 − 50 = 20 ; |20 − 20| / 20 = 0 % → conforme
    expect(p['T7']).toMatchObject({
      conso_evaluable: true, reconstituee: '20.000', ecart_conso_pct: '0.0', conso_conforme: true,
    });
    // I2 : un seul inventaire du mois, pas de borne d'ouverture (M-1 absent)
    expect(p['T2']).toMatchObject({ conso_evaluable: false, conso_raison_exclusion: 'aucune_borne' });
    // I6 : reconstituée = 10 + 0 − 100 = −90 ≤ 0
    expect(p['T6']).toMatchObject({ conso_evaluable: false, conso_raison_exclusion: 'reconstituee_non_positive' });
  });

  it('cohérence avec les taux agrégés de mv_p4_ecart', async () => {
    await socle();
    const p = await prod();
    const conformesSdu = Object.values(p).filter((r) => r.sdu_conforme).length;
    const totalSdu = Object.keys(p).length;
    const evaluables = Object.values(p).filter((r) => r.conso_evaluable);
    const conformesConso = evaluables.filter((r) => r.conso_conforme).length;

    const { rows } = await db.query<{ taux_sdu_pct: string; taux_conso_pct: string | null }>(
      `SELECT taux_sdu_pct, taux_conso_pct FROM dqa.mv_p4_ecart
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
    );
    expect(Number(rows[0]?.taux_sdu_pct)).toBeCloseTo((conformesSdu / totalSdu) * 100, 1);
    expect(Number(rows[0]?.taux_conso_pct)).toBeCloseTo(
      (conformesConso / evaluables.length) * 100,
      1,
    );
  });

  it('CALL rafraichir_et_geler rafraîchit la vue', async () => {
    await socle();
    await db.query(`UPDATE dqa.fact_inventaire_ligne SET quantite_comptee = 50 WHERE inventaire_id = 'B' AND produit_id = 'I1'`);
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    // |100 − 50| / 50 = 100 % → hors tolérance
    expect((await prod())['T1']?.sdu_conforme).toBe(false);
  });

  // ── Variante `p4` de DetailPilier : tableau produit P4 · P5 fusionné ──────
  describe('lecture repository detailPilier(p4)', () => {
    let repo: IndicateursRepository;
    beforeAll(() => {
      repo = new IndicateursRepository(db);
    });

    it('rend la variante p4 : une ligne par produit traceur, SDU hors tolérance en tête', async () => {
      await socle();
      const d = await repo.detailPilier('S1', 'p4', {});
      expect(d).not.toBeNull();
      if (d === null || d.code !== 'p4') throw new Error('variante p4 attendue');

      expect(d.moisPaqd).toBe('2026-08');
      expect(d.produits.map((p) => p.produitCode)).toEqual(['T2', 'T5', 'T1', 'T4', 'T6', 'T7']);
      // SDU hors tolérance (sdu_conforme = false) d'abord
      expect(d.produits.slice(0, 2).every((p) => !p.sdu.conforme)).toBe(true);
      expect(d.produits.slice(2).every((p) => p.sdu.conforme)).toBe(true);

      const t1 = d.produits.find((p) => p.produitCode === 'T1')!;
      expect(t1.consommation.evaluable).toBe(true);
      if (t1.consommation.evaluable) expect(t1.consommation.conforme).toBe(false);
      const t2 = d.produits.find((p) => p.produitCode === 'T2')!;
      expect(t2.consommation.evaluable).toBe(false);
      if (!t2.consommation.evaluable) expect(t2.consommation.raisonExclusion).toBe('aucune_borne');

      // comptes bruts figés du pilier P4 + horodatage du gel
      expect(d.comptesBruts.some((c) => c.mesure === 'p4_ecart_sdu')).toBe(true);
      expect(d.calculeLe).not.toBeNull();
      expect(d.reimporteDepuisLeGel).toBe(false);
    });

    it('concordance par produit : seuil 100 → conforme si théorique = compté au dernier inventaire', async () => {
      await socle();
      const d = await repo.detailPilier('S1', 'p4', {});
      if (d === null || d.code !== 'p4') throw new Error('variante p4 attendue');
      const par = Object.fromEntries(d.produits.map((p) => [p.produitCode, p.concordance]));

      // dernier inventaire B : T1 100/100, T4 0/0, T6 100/100, T7 50/50 → 100 % conforme
      expect(par['T1']).toEqual({ tauxPct: 100, conforme: true });
      expect(par['T4']).toEqual({ tauxPct: 100, conforme: true });
      expect(par['T6']).toEqual({ tauxPct: 100, conforme: true });
      // T2 100/90 → 90 % ; T5 5/0 → 0 % → non conformes
      expect(par['T2']).toEqual({ tauxPct: 90, conforme: false });
      expect(par['T5']).toEqual({ tauxPct: 0, conforme: false });
    });

    it('se réconcilie avec l’agrégat mv_p5_concordance', async () => {
      await socle();
      const d = await repo.detailPilier('S1', 'p4', {});
      if (d === null || d.code !== 'p4') throw new Error('variante p4 attendue');
      // `mv_p5_concordance` n'agrège que les produits à concordance calculable
      // (quantités présentes) — le tableau les distingue par `tauxPct` non nul.
      const evaluables = d.produits.filter((p) => p.concordance.tauxPct !== null);
      const conformes = evaluables.filter((p) => p.concordance.conforme).length;

      const { rows } = await db.query<{ nb_produits: number; nb_produits_conformes: number }>(
        `SELECT nb_produits, nb_produits_conformes FROM dqa.mv_p5_concordance
         WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
      );
      expect(rows[0]).toMatchObject({ nb_produits: evaluables.length, nb_produits_conformes: conformes });
    });

    it('quantités absentes : concordance nulle, exclue de l’agrégat (retour de revue)', async () => {
      await socle();
      // T8 : traceur inventorié au dernier inventaire mais sans quantités.
      await produit('I8', 'T8', true);
      await db.query(
        `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
         VALUES ('B','I8','X',NULL,NULL,1)`,
      );
      await db.query(`CALL dqa.rafraichir_et_geler(1)`);
      const d = await repo.detailPilier('S1', 'p4', {});
      if (d === null || d.code !== 'p4') throw new Error('variante p4 attendue');
      const t8 = d.produits.find((p) => p.produitCode === 'T8');
      expect(t8?.concordance).toEqual({ tauxPct: null, conforme: false });

      const { rows } = await db.query<{ nb_produits: number }>(
        `SELECT nb_produits FROM dqa.mv_p5_concordance
         WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
      );
      const evaluables = d.produits.filter((p) => p.concordance.tauxPct !== null).length;
      expect(rows[0]?.nb_produits).toBe(evaluables);
    });

    it('404 (null) pour un site hors périmètre', async () => {
      await socle();
      expect(await repo.detailPilier('S9', 'p4', {})).toBeNull();
      expect(await repo.detailPilier('INCONNU', 'p4', {})).toBeNull();
    });
  });
});
