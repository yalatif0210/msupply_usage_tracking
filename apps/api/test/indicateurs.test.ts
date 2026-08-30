import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Couture B — vues P5/P6 et gel de l'historique, contre des données de core
 * fabriquées à la main.
 */
describe('vues P5/P6 et gel', () => {
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
  }) => {
    const {
      perimetre = true, comptee = 100, theorique = 100,
      avecInventaire = true, nbAjustements = 0, nbMouvements = 4,
    } = opts;
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('t.xlsx','2026-C2','2026-08','2026-08-01','2026-08-31','valide')`,
    );
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',$1)`, [perimetre]);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('P1','VIH')`);
    await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ('I1','ARV','ARV')`);
    for (let i = 0; i < nbMouvements; i++) {
      const ajust = i < nbAjustements;
      await db.query(
        `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, lot_id_source)
         VALUES ($1,'S1',$2,'P1','fn',$3::date,1)`,
        [`T${i}`, ajust ? 'ajustement_negatif' : 'dispensation', `2026-08-${10 + i}`],
      );
      await db.query(
        `INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
         VALUES ($1,$2,'I1',1,1,$3,1)`,
        [`L${i}`, `T${i}`, ajust],
      );
    }
    if (avecInventaire) {
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

  it('gèle le mois du lot dans hist_score_site avec les six colonnes de pilier', async () => {
    await socle({});
    const { rows } = await db.query(
      `SELECT mois_paqd, p_completude, p_promptitude, p_regularite, p_ecart_sdu,
              p_concordance, p_ajustements, score_composite, classification, grille_id, lot_id
       FROM dqa.hist_score_site WHERE site_id = 'S1' AND programme_id IS NULL`,
    );
    expect(rows[0].mois_paqd).toBe('2026-08');
    // P1..P4 pas encore outillés → NULL ; P5/P6 gelés
    expect(rows[0].p_completude).toBeNull();
    expect(rows[0].p_promptitude).toBeNull();
    expect(rows[0].p_regularite).toBeNull();
    expect(rows[0].p_ecart_sdu).toBeNull();
    expect(rows[0].p_concordance).toBe('100.0');
    expect(rows[0].p_ajustements).toBe('100.0');
    expect(rows[0].grille_id).not.toBeNull();
    expect(rows[0].lot_id).not.toBeNull();
  });

  it('renormalise le composite sur les seuls piliers calculables (P5 + P6)', async () => {
    // P5 sous le seuil (0), P6 conforme (100). Poids grille v1 : P5 = 25, P6 = 10.
    // Composite renormalisé = (0·25 + 100·10) / (25 + 10) = 1000 / 35 = 28.6.
    await socle({ comptee: 70, theorique: 100, nbMouvements: 10, nbAjustements: 0 });
    const tous = await scorePilier(null);
    expect(tous?.p_concordance).toBe('0.0');
    expect(tous?.p_ajustements).toBe('100.0');
    expect(tous?.score_composite).toBe('28.6');
    expect(tous?.classification).toBe('NON_CONFORME');
  });

  it('composite = 100 et CONFORME quand P5 et P6 sont tous deux conformes', async () => {
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
