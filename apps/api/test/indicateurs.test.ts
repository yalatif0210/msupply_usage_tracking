import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Couture B — vues d'indicateurs (P3, P5, P6), score composite et gel de
 * l'historique, contre des données de core fabriquées à la main.
 */
describe('vues d\'indicateurs, composite et gel', () => {
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
    await db.query(`TRUNCATE dqa.hist_score_site, dqa.fact_inventaire_ligne, dqa.fact_inventaire,
      dqa.fact_ligne_transaction, dqa.fact_transaction, dqa.fact_stock_snapshot,
      dqa.dim_site_programme, dqa.dim_produit_traceur, dqa.dim_produit, dqa.dim_programme,
      dqa.dim_site, dqa.import_lot RESTART IDENTITY CASCADE`);
    await db.query(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle) VALUES ('ARV', 'ARV')`);
  });

  const socle = async (opts: {
    perimetre?: boolean;
    comptee?: number;
    theorique?: number;
    avecInventaire?: boolean;
    nbAjustements?: number;
    nbMouvements?: number;
    /** Sorties de stock supplémentaires, une par (jour, nature) — pilotent P3. */
    sorties?: { jour: string; nature?: 'dispensation' | 'distribution' }[];
  }) => {
    const {
      perimetre = true, comptee = 100, theorique = 100,
      avecInventaire = true, nbAjustements = 0, nbMouvements = 4,
      sorties = [],
    } = opts;
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('t.xlsx','2026-C2','2026-08','2026-08-01','2026-08-31','valide')`,
    );
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',$1)`, [perimetre]);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('P1','VIH')`);
    await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ('I1','ARV','ARV')`);
    // Mouvements P6 : posés un dimanche (2026-08-02, jour non ouvrable) pour ne
    // pas alimenter P3 involontairement — les tests P3 passent par `sorties`.
    for (let i = 0; i < nbMouvements; i++) {
      const ajust = i < nbAjustements;
      await db.query(
        `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, lot_id_source)
         VALUES ($1,'S1',$2,'P1','fn','2026-08-02',1)`,
        [`T${i}`, ajust ? 'ajustement_negatif' : 'dispensation'],
      );
      await db.query(
        `INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
         VALUES ($1,$2,'I1',1,1,$3,1)`,
        [`L${i}`, `T${i}`, ajust],
      );
    }
    for (const [k, s] of sorties.entries()) {
      await db.query(
        `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, lot_id_source)
         VALUES ($1,'S1',$2,'P1','fn',$3::date,1)`,
        [`SO${k}`, s.nature ?? 'dispensation', s.jour],
      );
      await db.query(
        `INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
         VALUES ($1,$2,'I1',1,1,false,1)`,
        [`SOL${k}`, `SO${k}`],
      );
    }
    if (avecInventaire) {
      // socle ne déclare pas de dim_site_programme → P1 et P2 restent
      // NON_CALCULABLE ici ; la date d'inventaire n'influe que sur P4/P5.
      await db.query(
        `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
         VALUES ('INV1','S1','P1','2026-08-28','fn',1)`,
      );
      await db.query(
        `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
         VALUES ('INV1','I1','X',$1,$2,1)`,
        [theorique, comptee],
      );
    }
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
  };

  const scorePilier = async (programme: string | null) => {
    const { rows } = await db.query<{
      p_completude: string | null;
      p_promptitude: string | null;
      p_regularite: string | null;
      p_ecart_sdu: string | null;
      p_concordance: string | null;
      p_ajustements: string | null;
      score_composite: string | null;
      classification: string | null;
    }>(
      `SELECT p_completude, p_promptitude, p_regularite, p_ecart_sdu,
              p_concordance, p_ajustements, score_composite, classification
       FROM dqa.mv_score_pilier
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND coalesce(programme_id,'') = $1`,
      [programme ?? ''],
    );
    return rows[0];
  };

  it('P5 CONFORME quand compté = théorique', async () => {
    await socle({ comptee: 100, theorique: 100 });
    expect((await scorePilier(null))?.p_concordance).toBe('100.0');
  });

  it('P5 ALERTE quand la concordance est sous le seuil', async () => {
    await socle({ comptee: 70, theorique: 100 });
    expect((await scorePilier(null))?.p_concordance).toBe('0.0');
  });

  it('P6 CONFORME sans ajustement', async () => {
    await socle({ nbMouvements: 10, nbAjustements: 0 });
    expect((await scorePilier(null))?.p_ajustements).toBe('100.0');
  });

  it('P6 ALERTE au-dessus du seuil', async () => {
    await socle({ nbMouvements: 10, nbAjustements: 3 });
    expect((await scorePilier(null))?.p_ajustements).toBe('0.0');
  });

  it('P5 NON_CALCULABLE sans inventaire exploitable', async () => {
    await socle({ avecInventaire: false, nbMouvements: 4 });
    expect((await scorePilier(null))?.p_concordance).toBeNull();
  });

  it('exclut un site hors périmètre', async () => {
    await socle({ perimetre: false });
    const { rowCount } = await db.query(`SELECT 1 FROM dqa.mv_score_pilier WHERE site_id = 'S1'`);
    expect(rowCount).toBe(0);
  });

  it('produit une ligne par programme et une ligne « tous programmes »', async () => {
    await socle({});
    const parProg = await scorePilier('P1');
    const tous = await scorePilier(null);
    expect(parProg).toBeDefined();
    expect(tous).toBeDefined();
  });

  // ── P3 — régularité de saisie ────────────────────────────────────────────
  // Août 2026 : 20 jours ouvrables (Aug 7 = fête de l'Indépendance, exclue).
  // Seuil grille = 65 % → 13 jours ouvrables avec sortie pour être CONFORME.
  const joursOuvrablesAout = [
    '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
    '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
    '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
    '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-31',
  ];
  const p3 = async () => {
    const { rows } = await db.query<{
      nb_jours_avec_sortie: number;
      nb_ouvrables: number;
      taux_regularite_pct: string | null;
    }>(
      `SELECT nb_jours_avec_sortie::int, nb_ouvrables::int, taux_regularite_pct
       FROM dqa.mv_p3_regularite WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
    );
    return rows[0];
  };

  it('P3 ALERTE sous le seuil de régularité', async () => {
    await socle({ nbMouvements: 0, sorties: joursOuvrablesAout.slice(0, 4).map((j) => ({ jour: j })) });
    expect((await p3())?.taux_regularite_pct).toBe('20.0'); // 4 / 20
    expect((await scorePilier(null))?.p_regularite).toBe('0.0');
  });

  it('P3 CONFORME quand ≥ 65 % des jours ouvrables ont une sortie', async () => {
    await socle({ nbMouvements: 0, sorties: joursOuvrablesAout.slice(0, 13).map((j) => ({ jour: j })) });
    const v = await p3();
    expect(v?.nb_ouvrables).toBe(20);
    expect(v?.taux_regularite_pct).toBe('65.0'); // 13 / 20
    expect((await scorePilier(null))?.p_regularite).toBe('100.0');
  });

  it('P3 ne compte pas une sortie faite un jour férié', async () => {
    await socle({
      nbMouvements: 0,
      sorties: [...joursOuvrablesAout.slice(0, 12), '2026-08-07'].map((j) => ({ jour: j })),
    });
    // 12 jours ouvrables + le 7 août (férié, exclu) → 12 / 20, pas 13 / 20
    expect((await p3())?.nb_jours_avec_sortie).toBe(12);
    expect((await scorePilier(null))?.p_regularite).toBe('0.0');
  });

  it('P3 compte les distributions d\'un district comme des sorties', async () => {
    await socle({
      nbMouvements: 0,
      sorties: joursOuvrablesAout.slice(0, 13).map((j) => ({ jour: j, nature: 'distribution' as const })),
    });
    expect((await p3())?.nb_jours_avec_sortie).toBe(13);
    expect((await scorePilier(null))?.p_regularite).toBe('100.0');
  });

  it('P3 NON_CALCULABLE quand le site n\'a aucune sortie sur le mois', async () => {
    await socle({ nbMouvements: 0 }); // inventaire présent → P5 calculable, mais aucune sortie
    const { rowCount } = await db.query(
      `SELECT 1 FROM dqa.mv_p3_regularite WHERE site_id = 'S1'`,
    );
    expect(rowCount).toBe(0);
    const sp = await scorePilier(null);
    expect(sp).toBeDefined();
    expect(sp?.p_regularite).toBeNull();
  });

  it('le composite intègre P3 dans la renormalisation', async () => {
    // P3 ALERTE (0, 15), P4 (100, 25), P5 (100, 25), P6 (100, 10) — P1/P2 absents
    // → (0·15 + 100·25 + 100·25 + 100·10) / (15 + 25 + 25 + 10) = 6000 / 75 = 80.0
    await socle({
      comptee: 100, theorique: 100, nbMouvements: 0,
      sorties: joursOuvrablesAout.slice(0, 4).map((j) => ({ jour: j })),
    });
    const sp = await scorePilier(null);
    expect(sp?.p_regularite).toBe('0.0');
    expect(sp?.score_composite).toBe('80.0');
    expect(sp?.classification).toBe('PARTIELLEMENT_CONFORME');
  });

  // ── P4 — écart SDU et écart consommation ─────────────────────────────────
  const p4 = async (programme: string | null = null) => {
    const { rows } = await db.query<{
      taux_sdu_pct: string | null;
      nb_produits_sdu: number;
      taux_conso_pct: string | null;
      nb_produits_conso: number;
      score_sdu: string | null;
      score_conso: string | null;
      p_ecart_sdu: string | null;
    }>(
      `SELECT taux_sdu_pct, nb_produits_sdu::int, taux_conso_pct, nb_produits_conso::int,
              score_sdu, score_conso, p_ecart_sdu
       FROM dqa.mv_p4_ecart
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND coalesce(programme_id,'') = $1`,
      [programme ?? ''],
    );
    return rows[0];
  };
  const inventaire = async (id: string, jour: string, produit: string, theorique: number, comptee: number) => {
    await db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ($1,'S1','P1',$2::date,'fn',1) ON CONFLICT (inventaire_id) DO NOTHING`,
      [id, jour],
    );
    await db.query(
      `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
       VALUES ($1,$2,'X',$3,$4,1)`,
      [id, produit, theorique, comptee],
    );
  };
  const mouvement = async (id: string, nature: string, jour: string, produit: string, qte: number) => {
    await db.query(
      `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, lot_id_source)
       VALUES ($1,'S1',$2,'P1','fn',$3::date,1)`,
      [id, nature, jour],
    );
    await db.query(
      `INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
       VALUES ($1,$2,$3,$4,1,false,1)`,
      [`${id}L`, id, produit, qte],
    );
  };

  it('P4 écart SDU CONFORME quand le produit est juste dans la tolérance', async () => {
    await socle({ nbMouvements: 0, comptee: 100, theorique: 102 }); // 2 % pile
    const v = await p4();
    expect(v?.nb_produits_sdu).toBe(1);
    expect(v?.taux_sdu_pct).toBe('100.0');
    expect(v?.score_sdu).toBe('100.0');
  });

  it('P4 écart SDU ALERTE quand le produit est juste hors tolérance', async () => {
    await socle({ nbMouvements: 0, comptee: 100, theorique: 103 }); // 3 % > 2 %
    const v = await p4();
    expect(v?.taux_sdu_pct).toBe('0.0');
    expect(v?.score_sdu).toBe('0.0');
  });

  it('P4 écart SDU : compté 0 / théorique 0 conforme, compté 0 / théorique > 0 non conforme', async () => {
    await socle({ nbMouvements: 0, comptee: 0, theorique: 0 });
    expect((await p4())?.taux_sdu_pct).toBe('100.0');
    await db.query(`TRUNCATE dqa.hist_score_site, dqa.fact_inventaire_ligne, dqa.fact_inventaire,
      dqa.fact_ligne_transaction, dqa.fact_transaction, dqa.dim_site_programme,
      dqa.dim_produit, dqa.dim_programme, dqa.dim_site, dqa.import_lot RESTART IDENTITY CASCADE`);
    await socle({ nbMouvements: 0, comptee: 0, theorique: 5 });
    expect((await p4())?.taux_sdu_pct).toBe('0.0');
  });

  it('P4 écart SDU : un petit stock non conforme n\'écrase pas un grand panier conforme', async () => {
    // 10 produits traceurs, 9 conformes, 1 hors tolérance → taux = 90 %, pas une
    // moyenne d'amplitude dominée par le petit stock.
    await socle({ nbMouvements: 0, comptee: 1000, theorique: 1000 }); // I1 conforme
    for (let i = 2; i <= 10; i++) {
      await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ($1,$1,$1)`, [`I${i}`]);
      await db.query(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle) VALUES ($1,$1)`, [`I${i}`]);
      // I2..I9 conformes (écart nul), I10 hors tolérance sur un tout petit stock
      const [theo, compte] = i === 10 ? [2, 1] : [500, 500];
      await db.query(
        `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
         VALUES ('INV1',$1,'X',$2,$3,1)`,
        [`I${i}`, theo, compte],
      );
    }
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const v = await p4();
    expect(v?.nb_produits_sdu).toBe(10);
    expect(v?.taux_sdu_pct).toBe('90.0');
    expect(v?.score_sdu).toBe('100.0'); // 90 ≥ seuil 90
  });

  it('P4 écart SDU NON_CALCULABLE sans produit traceur inventorié', async () => {
    await db.query(`DELETE FROM dqa.dim_produit_traceur`);
    await socle({ nbMouvements: 4 }); // mouvements → P6 calculable, mais aucun traceur
    const { rowCount } = await db.query(`SELECT 1 FROM dqa.mv_p4_ecart WHERE site_id = 'S1'`);
    expect(rowCount).toBe(0);
    expect((await scorePilier(null))?.p_ecart_sdu).toBeNull();
  });

  it('P4 écart consommation : produit évaluable et classé conforme', async () => {
    await socle({ nbMouvements: 0, comptee: 50, theorique: 50 }); // INV1 le 28/08, stock fin = 50
    await inventaire('INV0', '2026-08-03', 'I1', 100, 100);        // stock début = 100
    await mouvement('RC1', 'reception', '2026-08-10', 'I1', 30);   // + 30 dans l'intervalle
    await mouvement('DI1', 'dispensation', '2026-08-15', 'I1', 80); // déclarée = 80
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    // reconstituée = 100 + 30 − 50 = 80 ; |80 − 80| / 80 = 0 % ≤ 2 % → conforme
    const v = await p4();
    expect(v?.nb_produits_conso).toBe(1);
    expect(v?.taux_conso_pct).toBe('100.0');
    expect(v?.score_conso).toBe('100.0');
  });

  it('P4 écart consommation : un seul inventaire → produit exclu → NON_CALCULABLE', async () => {
    await socle({ nbMouvements: 0, comptee: 50, theorique: 50 }); // seul INV1
    const v = await p4();
    expect(v?.taux_sdu_pct).not.toBeNull();     // SDU reste calculable
    expect(v?.nb_produits_conso).toBe(0);
    expect(v?.taux_conso_pct).toBeNull();
    expect(v?.score_conso).toBeNull();
    // score de pilier P4 = moyenne des seules sous-composantes calculables = SDU
    expect((await scorePilier(null))?.p_ecart_sdu).toBe(v?.score_sdu);
  });

  it('P4 écart consommation : reconstituée ≤ 0 → produit exclu', async () => {
    await socle({ nbMouvements: 0, comptee: 100, theorique: 100 }); // stock fin = 100
    await inventaire('INV0', '2026-08-03', 'I1', 10, 10);           // stock début = 10, aucune réception
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    // reconstituée = 10 + 0 − 100 = −90 ≤ 0 → exclu
    expect((await p4())?.nb_produits_conso).toBe(0);
    expect((await p4())?.taux_conso_pct).toBeNull();
  });

  it('P4 : score de pilier = moyenne des deux sous-composantes calculables', async () => {
    await socle({ nbMouvements: 0, comptee: 50, theorique: 50 }); // SDU conforme (100)
    await inventaire('INV0', '2026-08-03', 'I1', 100, 100);
    await mouvement('RC1', 'reception', '2026-08-10', 'I1', 0);
    await mouvement('DI1', 'dispensation', '2026-08-15', 'I1', 10); // déclarée 10 vs reconstituée 50 → 80 % > 2 % → ALERTE (0)
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const v = await p4();
    expect(v?.score_sdu).toBe('100.0');
    expect(v?.score_conso).toBe('0.0');
    expect(v?.p_ecart_sdu).toBe('50.0'); // (100 + 0) / 2
    expect((await scorePilier(null))?.p_ecart_sdu).toBe('50.0');
  });

  it('gèle le mois du lot dans hist_score_site avec les six colonnes de pilier', async () => {
    await socle({});
    const { rows } = await db.query(
      `SELECT mois_paqd, p_completude, p_promptitude, p_regularite, p_ecart_sdu,
              p_concordance, p_ajustements, score_composite, classification, grille_id, lot_id
       FROM dqa.hist_score_site WHERE site_id = 'S1' AND programme_id IS NULL`,
    );
    expect(rows[0].mois_paqd).toBe('2026-08');
    // P1 et P2 sans programme géré déclaré → NULL ; P3 sans sortie → NULL ;
    // P4, P5, P6 gelés
    expect(rows[0].p_completude).toBeNull();
    expect(rows[0].p_promptitude).toBeNull();
    expect(rows[0].p_regularite).toBeNull();
    expect(rows[0].p_ecart_sdu).toBe('100.0');
    expect(rows[0].p_concordance).toBe('100.0');
    expect(rows[0].p_ajustements).toBe('100.0');
    expect(rows[0].grille_id).not.toBeNull();
    expect(rows[0].lot_id).not.toBeNull();
  });

  it('renormalise le composite sur les seuls piliers calculables', async () => {
    // socle : P1, P2, P3 absents → leurs poids (10 + 15 + 15) sortent du dénominateur.
    // P4 hors tolérance (0), P5 sous le seuil (0), P6 conforme (100).
    // Composite = (0·25 + 0·25 + 100·10) / (25 + 25 + 10) = 1000 / 60 = 16.7
    await socle({ comptee: 70, theorique: 100, nbMouvements: 10, nbAjustements: 0 });
    const tous = await scorePilier(null);
    expect(tous?.p_completude).toBeNull();
    expect(tous?.p_promptitude).toBeNull();
    expect(tous?.p_regularite).toBeNull();
    expect(tous?.p_ecart_sdu).toBe('0.0');
    expect(tous?.p_concordance).toBe('0.0');
    expect(tous?.p_ajustements).toBe('100.0');
    expect(tous?.score_composite).toBe('16.7');
    expect(tous?.classification).toBe('NON_CONFORME');
  });

  it('composite = 100 et CONFORME quand P4, P5 et P6 sont tous conformes', async () => {
    await socle({ comptee: 100, theorique: 100, nbMouvements: 10, nbAjustements: 0 });
    const tous = await scorePilier(null);
    expect(tous?.score_composite).toBe('100.0');
    expect(tous?.classification).toBe('CONFORME');
  });

  it('n\'inscrit aucune ligne d\'historique pour un site sans donnée du mois', async () => {
    await socle({ avecInventaire: false, nbMouvements: 0 });
    const { rowCount } = await db.query(`SELECT 1 FROM dqa.hist_score_site WHERE site_id = 'S1'`);
    expect(rowCount).toBe(0);
  });

  it('classe le composite aux bornes 90 et 75 (classer_composite)', async () => {
    const { rows } = await db.query<{ s: string; c: string | null }>(
      `SELECT v.s::text AS s, dqa.classer_composite(v.s) AS c
       FROM (VALUES (90.0), (89.9), (75.0), (74.9)) AS v(s)`,
    );
    const par = Object.fromEntries(rows.map((r) => [r.s, r.c]));
    expect(par['90.0']).toBe('CONFORME');
    expect(par['89.9']).toBe('PARTIELLEMENT_CONFORME');
    expect(par['75.0']).toBe('PARTIELLEMENT_CONFORME');
    expect(par['74.9']).toBe('NON_CONFORME');
  });

  it('un re-gel du même mois met à jour la ligne sans doublon', async () => {
    await socle({ comptee: 100, theorique: 100 });
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const { rows } = await db.query(
      `SELECT count(*)::int AS c FROM dqa.hist_score_site WHERE site_id = 'S1' AND programme_id IS NULL`,
    );
    expect(rows[0].c).toBe(1);
  });
});

/**
 * Couture B — P1 complétude des transactions (trois sous-composantes).
 */
describe('vue P1 — complétude des transactions', () => {
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
    await db.query(`TRUNCATE dqa.hist_score_site, dqa.fact_requisition, dqa.fact_inventaire_ligne,
      dqa.fact_inventaire, dqa.fact_ligne_transaction, dqa.fact_transaction,
      dqa.dim_site_programme, dqa.dim_produit, dqa.dim_programme, dqa.dim_site,
      dqa.import_lot RESTART IDENTITY CASCADE`);
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('t.xlsx','2026-C2','2026-08','2026-08-01','2026-08-31','valide')`,
    );
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
  });

  const programmeGere = async (id: string) => {
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ($1,$1)
                    ON CONFLICT DO NOTHING`, [id]);
    await db.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ('S1',$1,true)`, [id]);
  };
  const inventaireFinalise = async (id: string, programme: string) => {
    await db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ($1,'S1',$2,'2026-08-20','fn',1)`,
      [id, programme],
    );
  };
  const requisition = async (id: string, programme: string, mois = '2026-08') => {
    await db.query(
      `INSERT INTO dqa.fact_requisition (requisition_id, site_id, programme_id, mois_couvert, lot_id_source)
       VALUES ($1,'S1',$2,$3,1)`,
      [id, programme, mois],
    );
  };
  const transactionRec = async (id: string, nature: 'reception' | 'facture_fournisseur') => {
    await db.query(
      `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, statut, date_confirmation, lot_id_source)
       VALUES ($1,'S1',$2,'fn','2026-08-12',1)`,
      [id, nature],
    );
  };
  const p1 = async (programme: string | null = null) => {
    const { rows } = await db.query<{
      completude_inventaires_pct: string | null;
      completude_requisitions_pct: string | null;
      completude_receptions_pct: string | null;
      score_inventaires: string | null;
      score_requisitions: string | null;
      score_receptions: string | null;
      p_completude: string | null;
    }>(
      `SELECT completude_inventaires_pct, completude_requisitions_pct, completude_receptions_pct,
              score_inventaires, score_requisitions, score_receptions, p_completude
       FROM dqa.mv_p1_completude
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND coalesce(programme_id,'') = $1`,
      [programme ?? ''],
    );
    return rows[0];
  };

  it('complétude inventaires : tous les programmes gérés inventoriés → 100 → CONFORME', async () => {
    await programmeGere('VIH');
    await inventaireFinalise('INV1', 'VIH');
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p1())?.completude_inventaires_pct).toBe('100.0');
    expect((await p1())?.score_inventaires).toBe('100.0');
  });

  it('complétude inventaires : un programme géré non inventorié → < 100 → ALERTE', async () => {
    await programmeGere('VIH');
    await programmeGere('TB');
    await inventaireFinalise('INV1', 'VIH');
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p1())?.completude_inventaires_pct).toBe('50.0'); // 1 / 2
    expect((await p1())?.score_inventaires).toBe('0.0');
    // grain par programme : VIH conforme, TB non
    expect((await p1('VIH'))?.completude_inventaires_pct).toBe('100.0');
    expect((await p1('TB'))?.completude_inventaires_pct).toBe('0.0');
  });

  it('complétude réquisitions : idem via mois_couvert', async () => {
    await programmeGere('VIH');
    await programmeGere('TB');
    await requisition('R1', 'VIH', '2026-08');
    await requisition('R2', 'TB', '2026-07'); // couvre un autre mois → ne compte pas
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p1())?.completude_requisitions_pct).toBe('50.0');
  });

  it('complétude réceptions : réceptions = factures → CONFORME', async () => {
    await programmeGere('VIH');
    await requisition('R1', 'VIH');
    await transactionRec('F1', 'facture_fournisseur');
    await transactionRec('F2', 'facture_fournisseur');
    await transactionRec('RC1', 'reception');
    await transactionRec('RC2', 'reception');
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p1())?.completude_receptions_pct).toBe('100.0');
    expect((await p1())?.score_receptions).toBe('100.0');
  });

  it('complétude réceptions : aucune facture → NON_CALCULABLE', async () => {
    await programmeGere('VIH');
    await inventaireFinalise('INV1', 'VIH');
    await transactionRec('RC1', 'reception'); // réception sans facture
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const v = await p1();
    expect(v?.completude_receptions_pct).toBeNull();
    expect(v?.score_receptions).toBeNull();
  });

  it('score de pilier P1 = moyenne des sous-composantes calculables', async () => {
    await programmeGere('VIH');
    await inventaireFinalise('INV1', 'VIH');   // inventaires 100
    await requisition('R1', 'VIH');            // réquisitions 100
    // aucune facture → réceptions NON_CALCULABLE → moyenne de (100, 100) = 100
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p1())?.p_completude).toBe('100.0');
    const { rows } = await db.query<{ p_completude: string | null }>(
      `SELECT p_completude FROM dqa.mv_score_pilier WHERE site_id = 'S1' AND programme_id IS NULL`,
    );
    expect(rows[0]?.p_completude).toBe('100.0');
  });

  it('aucune ligne P1 pour un mois sans activité', async () => {
    await programmeGere('VIH'); // programme géré mais aucune transaction du mois
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const { rowCount } = await db.query(`SELECT 1 FROM dqa.mv_p1_completude WHERE site_id = 'S1'`);
    expect(rowCount).toBe(0);
  });
});

/**
 * Couture B — P2 promptitude des transactions (deux sous-composantes).
 */
describe('vue P2 — promptitude des transactions', () => {
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
    await db.query(`TRUNCATE dqa.hist_score_site, dqa.fact_requisition, dqa.fact_inventaire_ligne,
      dqa.fact_inventaire, dqa.fact_ligne_transaction, dqa.fact_transaction,
      dqa.dim_site_programme, dqa.dim_produit, dqa.dim_programme, dqa.dim_site,
      dqa.import_lot RESTART IDENTITY CASCADE`);
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('t.xlsx','2026-C2','2026-08','2026-08-01','2026-08-31','valide')`,
    );
  });

  const site = async (typeStructure: string, jourLimite: number | null = null, programmes = ['VIH']) => {
    await db.query(
      `INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, type_structure, jour_limite_requisition)
       VALUES ('S1','CSU',true,$1,$2)`,
      [typeStructure, jourLimite],
    );
    for (const p of programmes) {
      await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ($1,$1)`, [p]);
      await db.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ('S1',$1,true)`, [p]);
    }
  };
  const inventaire = async (id: string, jour: string, programme = 'VIH') => {
    await db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ($1,'S1',$2,$3::date,'fn',1)`,
      [id, programme, jour],
    );
  };
  const requisition = async (id: string, dateSoumission: string | null, programme = 'VIH') => {
    await db.query(
      `INSERT INTO dqa.fact_requisition (requisition_id, site_id, programme_id, mois_couvert, date_soumission, lot_id_source)
       VALUES ($1,'S1',$2,'2026-08',$3::date,1)`,
      [id, programme, dateSoumission],
    );
  };
  const p2 = async () => {
    const { rows } = await db.query<{
      promptitude_inventaires_pct: string | null;
      promptitude_requisitions_pct: string | null;
      score_inventaires: string | null;
      score_requisitions: string | null;
      p_promptitude: string | null;
    }>(
      `SELECT promptitude_inventaires_pct, promptitude_requisitions_pct,
              score_inventaires, score_requisitions, p_promptitude
       FROM dqa.mv_p2_promptitude
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
    );
    return rows[0];
  };

  it('promptitude inventaires : un inventaire dans les 3 derniers jours compte', async () => {
    await site('ESPC');
    await inventaire('INV1', '2026-08-30');
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p2())?.promptitude_inventaires_pct).toBe('100.0');
    expect((await p2())?.score_inventaires).toBe('100.0');
  });

  it('promptitude inventaires : un inventaire le 28 ne compte pas (trop tôt)', async () => {
    await site('ESPC');
    await inventaire('INV1', '2026-08-28');
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p2())?.promptitude_inventaires_pct).toBe('0.0');
    expect((await p2())?.score_inventaires).toBe('0.0');
  });

  it('promptitude réquisitions : jour limite 5 pour un centre de santé', async () => {
    await site('ESPC'); // limite = 5 du mois suivant → 2026-09-05
    await requisition('R1', '2026-09-05');
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p2())?.promptitude_requisitions_pct).toBe('100.0');
  });

  it('promptitude réquisitions : une soumission le 6 est en retard pour un CS', async () => {
    await site('ESPC');
    await requisition('R1', '2026-09-06');
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p2())?.promptitude_requisitions_pct).toBe('0.0');
  });

  it('promptitude réquisitions : jour limite 7 pour un hôpital général', async () => {
    // dénominateur = programmes gérés : VIH servi à l'heure, TB non → 1 / 2
    await site('HG', null, ['VIH', 'TB']); // limite = 7
    await requisition('R1', '2026-09-07', 'VIH');
    await requisition('R2', '2026-09-08', 'TB'); // en retard
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p2())?.promptitude_requisitions_pct).toBe('50.0');
  });

  it('promptitude réquisitions : dim_site.jour_limite_requisition prime sur le type', async () => {
    await site('HG', 10); // override explicite → limite = 10
    await requisition('R1', '2026-09-09');
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p2())?.promptitude_requisitions_pct).toBe('100.0');
  });

  it('un programme géré sans réquisition compte 0 (pas NON_CALCULABLE)', async () => {
    // dénominateur = programmes gérés : ne rien soumettre pénalise P2.
    await site('ESPC');
    await inventaire('INV1', '2026-08-30'); // inventaires : VIH à l'heure → 100
    // aucune réquisition pour VIH → promptitude_requisitions = 0 (pas NULL)
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const v = await p2();
    expect(v?.promptitude_requisitions_pct).toBe('0.0');
    expect(v?.score_requisitions).toBe('0.0');
    expect(v?.p_promptitude).toBe('50.0'); // moyenne de (100, 0)
    const { rows } = await db.query<{ p_promptitude: string | null }>(
      `SELECT p_promptitude FROM dqa.mv_score_pilier WHERE site_id = 'S1' AND programme_id IS NULL`,
    );
    expect(rows[0]?.p_promptitude).toBe('50.0');
  });

  it('P2 NON_CALCULABLE seulement sans aucun programme géré déclaré', async () => {
    await db.query(
      `INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, type_structure)
       VALUES ('S1','CSU',true,'ESPC')`,
    );
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('VIH','VIH')`);
    await db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ('INV1','S1','VIH','2026-08-30','fn',1)`,
    );
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const { rowCount } = await db.query(`SELECT 1 FROM dqa.mv_p2_promptitude WHERE site_id = 'S1'`);
    expect(rowCount).toBe(0);
  });
});
