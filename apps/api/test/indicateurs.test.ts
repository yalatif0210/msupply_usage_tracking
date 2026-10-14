import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

  afterEach(async () => {
    // certains tests forcent la clôture via `jour_limite_requisition` : on
    // restaure les valeurs du référentiel (migration 0040) pour l'isolation.
    await db.query(`UPDATE dqa.strate_structure SET jour_limite_requisition = CASE type_structure
      WHEN 'ESPC' THEN 5 WHEN 'Hôpital de référence' THEN 7 ELSE 10 END`);
  });

  // Cycle PAQD d'un mois `AAAA-MM` : 3 cycles de 4 mois (C1 = janv-avr, ...).
  const cycleDe = (mois: string) => {
    const [a, m] = mois.split('-').map(Number);
    return `${a}-C${Math.floor((m! - 1) / 4) + 1}`;
  };
  const finDeMois = (mois: string) => {
    const [a, m] = mois.split('-').map(Number);
    return `${mois}-${String(new Date(Date.UTC(a!, m!, 0)).getUTCDate()).padStart(2, '0')}`;
  };

  const socle = async (opts: {
    perimetre?: boolean;
    comptee?: number;
    theorique?: number;
    avecInventaire?: boolean;
    nbAjustements?: number;
    nbMouvements?: number;
    /** Mois PAQD du socle (défaut `2026-08`). Décale lot, mouvements et inventaire. */
    mois?: string;
    /** Sorties de stock supplémentaires, une par (jour, nature) — pilotent P3. */
    sorties?: { jour: string; nature?: 'dispensation' | 'distribution' }[];
  }) => {
    const {
      perimetre = true, comptee = 100, theorique = 100,
      avecInventaire = true, nbAjustements = 0, nbMouvements = 4,
      mois = '2026-08', sorties = [],
    } = opts;
    const jourTxn = `${mois}-02`;
    const jourInv = `${mois}-28`;
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('t.xlsx',$1,$2,$3,$4,'valide')`,
      [cycleDe(mois), mois, `${mois}-01`, finDeMois(mois)],
    );
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',$1)`, [perimetre]);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('P1','VIH')`);
    await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ('I1','ARV','ARV')`);
    // Mouvements P6 : les non-ajustements sont des `reception` (hors P3, qui ne
    // compte que dispensation / distribution) — les tests P3 passent par `sorties`.
    for (let i = 0; i < nbMouvements; i++) {
      const ajust = i < nbAjustements;
      await db.query(
        `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, lot_id_source)
         VALUES ($1,'S1',$2,'P1','fn',$3::date,1)`,
        [`T${i}`, ajust ? 'ajustement_negatif' : 'reception', jourTxn],
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
         VALUES ('INV1','S1','P1',$1::date,'fn',1)`,
        [jourInv],
      );
      await db.query(
        `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
         VALUES ('INV1','I1','X',$1,$2,1)`,
        [theorique, comptee],
      );
    }
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
  };

  const scorePilier = async (programme: string | null, mois = '2026-08') => {
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
       WHERE site_id = 'S1' AND mois_paqd = $2 AND coalesce(programme_id,'') = $1`,
      [programme ?? '', mois],
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

  it('P4 et P5 à 0 % sans inventaire quand le mois est CLOS (ADR 0012 + 0014)', async () => {
    // 2026-06 : clos depuis le 2026-07-10 quelle que soit la date d'exécution.
    await socle({ avecInventaire: false, nbMouvements: 4, mois: '2026-06' });
    const s = await scorePilier(null, '2026-06');
    expect(s?.p_concordance).toBe('0.0');
    expect(s?.p_ecart_sdu).toBe('0.0');
  });

  it('P4 et P5 NON_CALCULABLE sans inventaire quand le mois est EN COURS (ADR 0014)', async () => {
    // Le mois courant est en cours par définition : un mois figé (2026-08)
    // finissait forcément par être clos et le test par échouer.
    const moisCourant = new Date().toISOString().slice(0, 7);
    await db.query(`SELECT dqa.completer_calendrier(date_trunc('month', CURRENT_DATE)::date,
                     (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date)`);
    await socle({ avecInventaire: false, nbMouvements: 4, mois: moisCourant });
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const s = await scorePilier(null, moisCourant);
    expect(s?.p_concordance).toBeNull();
    expect(s?.p_ecart_sdu).toBeNull();
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
  // Août 2026 : 31 jours calendaires (dispensation 7 j/7 en milieu hospitalier,
  // ni week-ends ni fériés retranchés). Seuil grille = 65 % → 21 jours avec
  // sortie pour être CONFORME (round(21 / 31 * 100, 1) = 67.7).
  const joursAout = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
  const p3 = async () => {
    const { rows } = await db.query<{
      nb_jours_avec_sortie: number;
      nb_jours: number;
      taux_regularite_pct: string | null;
    }>(
      `SELECT nb_jours_avec_sortie::int, nb_jours::int, taux_regularite_pct
       FROM dqa.mv_p3_regularite WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
    );
    return rows[0];
  };

  it('P3 ALERTE sous le seuil de régularité', async () => {
    await socle({ nbMouvements: 0, sorties: joursAout.slice(0, 4).map((j) => ({ jour: j })) });
    expect((await p3())?.taux_regularite_pct).toBe('12.9'); // 4 / 31
    expect((await scorePilier(null))?.p_regularite).toBe('0.0');
  });

  it('P3 ALERTE juste sous le seuil (20 / 31 = 64.5 %)', async () => {
    await socle({ nbMouvements: 0, sorties: joursAout.slice(0, 20).map((j) => ({ jour: j })) });
    expect((await p3())?.taux_regularite_pct).toBe('64.5');
    expect((await scorePilier(null))?.p_regularite).toBe('0.0');
  });

  it('P3 CONFORME juste au-dessus du seuil (21 / 31 = 67.7 %)', async () => {
    await socle({ nbMouvements: 0, sorties: joursAout.slice(0, 21).map((j) => ({ jour: j })) });
    const v = await p3();
    expect(v?.nb_jours).toBe(31);
    expect(v?.taux_regularite_pct).toBe('67.7'); // 21 / 31
    expect((await scorePilier(null))?.p_regularite).toBe('100.0');
  });

  it('P3 compte une sortie faite un week-end ou un ancien jour férié', async () => {
    // 01/08 = samedi, 02/08 = dimanche, 07/08 = ex-fête nationale
    await socle({
      nbMouvements: 0,
      sorties: ['2026-08-01', '2026-08-02', '2026-08-07'].map((j) => ({ jour: j })),
    });
    expect((await p3())?.nb_jours_avec_sortie).toBe(3);
    expect((await scorePilier(null))?.p_regularite).toBe('0.0'); // 3 / 31 → ALERTE
  });

  it('P3 compte les distributions d\'un district comme des sorties', async () => {
    await socle({
      nbMouvements: 0,
      sorties: joursAout.slice(0, 21).map((j) => ({ jour: j, nature: 'distribution' as const })),
    });
    expect((await p3())?.nb_jours_avec_sortie).toBe(21);
    expect((await scorePilier(null))?.p_regularite).toBe('100.0');
  });

  it('P3 à 0 % quand un site de soins n\'a aucune sortie du mois (ADR 0012)', async () => {
    await socle({ nbMouvements: 0 }); // inventaire présent, aucune sortie → P3 = 0 %, pas NON_CALCULABLE
    const v = await p3();
    expect(v?.nb_jours_avec_sortie).toBe(0);
    expect(v?.taux_regularite_pct).toBe('0.0');
    const sp = await scorePilier(null);
    expect(sp?.p_regularite).toBe('0.0');
  });

  it('le composite intègre P3 dans la renormalisation', async () => {
    // P3 ALERTE (0, 15), P4 (100, 25), P5 (100, 25), P6 (100, 10) — P1/P2 absents
    // → (0·15 + 100·25 + 100·25 + 100·10) / (15 + 25 + 25 + 10) = 6000 / 75 = 80.0
    await socle({
      comptee: 100, theorique: 100, nbMouvements: 0,
      sorties: joursAout.slice(0, 4).map((j) => ({ jour: j })),  // 1 sortie dans (03/08, 28/08] : le 04/08
    });
    // borne d'ouverture pour que l'écart consommation soit conforme (P4 = 100) :
    // reconstituée = 101 − 100 = 1 = déclarée (04/08).
    await inventaire('INV0', '2026-08-03', 'I1', 101, 101);
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const sp = await scorePilier(null);
    expect(sp?.p_regularite).toBe('0.0');
    expect(sp?.score_composite).toBe('80.0');
    expect(sp?.classification).toBe('PARTIELLEMENT_CONFORME');
  });

  // ── Gel des valeurs de sous-composante (sc_*) ────────────────────────────
  const COLONNES_SC = [
    'sc_completude_inventaires', 'sc_completude_requisitions', 'sc_completude_receptions',
    'sc_promptitude_inventaires', 'sc_promptitude_requisitions', 'sc_regularite_saisie',
    'sc_ecart_sdu', 'sc_ecart_consommation', 'sc_concordance', 'sc_ratio_ajustements',
  ];
  const histSousComposantes = async (mois = '2026-08') => {
    const { rows } = await db.query<Record<string, string | null>>(
      `SELECT ${COLONNES_SC.join(', ')}
       FROM dqa.hist_score_site
       WHERE site_id = 'S1' AND mois_paqd = $1 AND programme_id IS NULL`,
      [mois],
    );
    return rows[0];
  };

  it('gèle les valeurs de sous-composante mesurées, NULL pour les non calculables', async () => {
    await socle({
      comptee: 100, theorique: 100, nbMouvements: 10, nbAjustements: 0,
      sorties: joursAout.slice(0, 21).map((j) => ({ jour: j })),
    });
    const sc = await histSousComposantes();
    expect(sc?.sc_regularite_saisie).toBe('67.7'); // 21 / 31
    expect(sc?.sc_ecart_sdu).toBe('100.0'); // 1 produit traceur dans la tolérance
    expect(sc?.sc_concordance).toBe('100.0'); // compté = théorique
    expect(sc?.sc_ratio_ajustements).toBe('0.0'); // 0 ajustement sur 10 mouvements
    expect(sc?.sc_completude_inventaires).toBeNull(); // P1 non calculable (aucun programme géré)
    expect(sc?.sc_ecart_consommation).toBe('0.0'); // traceur inventorié sans borne d'ouverture → 0 % (ADR 0012)
  });

  it('le rattrapage repeuple les dix sc_* remis à NULL avec les mêmes valeurs', async () => {
    await socle({
      comptee: 100, theorique: 100, nbMouvements: 10,
      sorties: joursAout.slice(0, 21).map((j) => ({ jour: j })),
    });
    const avant = await histSousComposantes();
    await db.query(`UPDATE dqa.hist_score_site SET ${COLONNES_SC.map((c) => `${c} = NULL`).join(', ')}`);
    // miroir exact du rattrapage one-shot de la migration 0025 — garder synchronisé
    await db.query(
      `UPDATE dqa.hist_score_site h SET
         ${COLONNES_SC.map((c) => `${c} = sp.${c}`).join(',\n         ')}
       FROM dqa.mv_score_pilier sp
       JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
       WHERE sp.site_id = h.site_id AND sp.mois_paqd = h.mois_paqd
         AND coalesce(sp.programme_id, '') = coalesce(h.programme_id, '')`,
    );
    expect(await histSousComposantes()).toEqual(avant);
  });

  it('un rafraîchissement déclenché par un autre lot reconstruit aussi les mois déjà gelés (ADR 0010)', async () => {
    await socle({
      comptee: 100, theorique: 100, nbMouvements: 10,
      sorties: joursAout.slice(0, 21).map((j) => ({ jour: j })),
    });
    // valeur sentinelle, différente de ce que le core recalculerait (67.7 = 21/31)
    await db.query(`UPDATE dqa.hist_score_site SET sc_regularite_saisie = 42.0 WHERE mois_paqd = '2026-08'`);
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('juillet.xlsx','2026-C2','2026-07','2026-07-01','2026-07-31','valide')`,
    );
    await db.query(`CALL dqa.rafraichir_et_geler(2)`); // lot 2 = 2026-07
    // le gel reconstitue tous les mois trouvables dans le core, pas seulement
    // celui du lot en cours : la sentinelle est écrasée par la vraie valeur.
    expect((await histSousComposantes('2026-08'))?.sc_regularite_saisie).toBe('67.7');
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
    // le site a un inventaire du mois mais sans traceur exploitable → ligne forcée
    // (grain tous programmes), taux SDU et conso NULL (ADR 0012).
    const v = await p4();
    expect(v?.taux_sdu_pct).toBeNull();
    expect(v?.taux_conso_pct).toBeNull();
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

  it('P4 écart consommation : un seul inventaire du mois → 0 % / ALERTE (ADR 0012)', async () => {
    await socle({ nbMouvements: 0, comptee: 50, theorique: 50 }); // seul INV1, pas de borne d'ouverture
    const v = await p4();
    expect(v?.taux_sdu_pct).not.toBeNull();     // SDU reste calculable
    expect(v?.nb_produits_conso).toBe(0);
    expect(v?.taux_conso_pct).toBe('0.0');      // traceur inventorié sans borne → 0 %
    expect(v?.score_conso).toBe('0.0');
    // score de pilier P4 = moyenne (SDU conforme 100, conso 0) = 50
    expect((await scorePilier(null))?.p_ecart_sdu).toBe('50.0');
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
    // P1 et P2 sans programme géré déclaré → NULL ; P3 sans sortie → 0 % (ADR 0012) ;
    // P4 = moyenne (SDU conforme 100, conso 0 faute de borne d'ouverture) = 50 ;
    // P5, P6 conformes
    expect(rows[0].p_completude).toBeNull();
    expect(rows[0].p_promptitude).toBeNull();
    expect(rows[0].p_regularite).toBe('0.0');
    expect(rows[0].p_ecart_sdu).toBe('50.0');
    expect(rows[0].p_concordance).toBe('100.0');
    expect(rows[0].p_ajustements).toBe('100.0');
    expect(rows[0].grille_id).not.toBeNull();
    expect(rows[0].lot_id).not.toBeNull();
  });

  it('renormalise le composite sur les seuls piliers calculables', async () => {
    // socle : P1, P2 absents → leurs poids (10 + 15) sortent du dénominateur.
    // P3 à 0 % (aucune sortie, ADR 0012), P4 hors tolérance (0), P5 sous le seuil
    // (0), P6 conforme (100).
    // Composite = (0·15 + 0·25 + 0·25 + 100·10) / (15 + 25 + 25 + 10) = 1000 / 75 = 13.3
    await socle({ comptee: 70, theorique: 100, nbMouvements: 10, nbAjustements: 0 });
    const tous = await scorePilier(null);
    expect(tous?.p_completude).toBeNull();
    expect(tous?.p_promptitude).toBeNull();
    expect(tous?.p_regularite).toBe('0.0');
    expect(tous?.p_ecart_sdu).toBe('0.0');
    expect(tous?.p_concordance).toBe('0.0');
    expect(tous?.p_ajustements).toBe('100.0');
    expect(tous?.score_composite).toBe('13.3');
    expect(tous?.classification).toBe('NON_CONFORME');
  });

  it('composite = 100 et CONFORME quand P3, P4, P5 et P6 sont tous conformes', async () => {
    await socle({
      comptee: 100, theorique: 100, nbMouvements: 10, nbAjustements: 0,
      sorties: joursAout.slice(0, 25).map((j) => ({ jour: j })), // 25 / 31 → P3 conforme
    });
    // borne d'ouverture : 22 sorties dans (03/08, 28/08] → reconstituée = 22 = déclarée
    await inventaire('INVOUV', '2026-08-03', 'I1', 122, 122);
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const tous = await scorePilier(null);
    expect(tous?.p_regularite).toBe('100.0');
    expect(tous?.p_ecart_sdu).toBe('100.0');
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
    // daté dans les 3 derniers jours du mois : la complétude P1 des inventaires
    // exige désormais cette fenêtre (ADR 0012).
    await db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ($1,'S1',$2,'2026-08-29','fn',1)`,
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

  const site = async (typeStructure: string, programmes = ['VIH']) => {
    await db.query(
      `INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, type_structure)
       VALUES ('S1','CSU',true,$1)`,
      [typeStructure],
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

  it('promptitude réquisitions : jour limite 7 pour un hôpital de référence', async () => {
    // dénominateur = programmes gérés : VIH servi à l'heure, TB non → 1 / 2
    await site('Hôpital de référence', ['VIH', 'TB']); // limite = 7
    await requisition('R1', '2026-09-07', 'VIH');
    await requisition('R2', '2026-09-08', 'TB'); // en retard
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    expect((await p2())?.promptitude_requisitions_pct).toBe('50.0');
  });

  it('promptitude réquisitions : le jour limite vient du référentiel des structures', async () => {
    // un type ajouté dans la console avec une échéance au 12 (ADR 0013)
    await db.query(
      `INSERT INTO dqa.strate_structure (type_structure, strate, jour_limite_requisition, est_district)
       VALUES ('Polyclinique', 'Polyclinique', 12, false)`,
    );
    await site('Polyclinique');
    await requisition('R1', '2026-09-12'); // le 12 ≤ 12 → à l'heure
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
