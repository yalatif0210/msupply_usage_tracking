import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IndicateursRepository } from '../src/indicateurs/indicateurs.repository.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * ADR 0022 : P4 et P5 reposent sur l'inventaire de clôture du mois (3 derniers
 * jours du mois ou 1er du mois suivant) ; l'ouverture est la clôture du mois
 * précédent. Sans clôture : 0 sur P4 et P5 ; sans ouverture : 0 sur l'écart de
 * consommation. Aucune sanction tant que les données ne couvrent pas la
 * fenêtre de clôture.
 */
describe('clôture de mois (P4, P5)', () => {
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
    await db.query(`DELETE FROM dqa.grille_parametre WHERE version <> 'v1'`);
    // lot sans fenêtre : les données sont réputées couvrir jusqu'à aujourd'hui
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('t.xlsx','2026-C2','2026-08','2026-08-01','2026-08-31','valide')`,
    );
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('P1','VIH')`);
    await db.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ('S1','P1',true)`);
    for (const [id, code] of [['I1', 'T1'], ['I2', 'T2']] as const) {
      await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ($1,$2,$1)`, [id, code]);
      await db.query(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle) VALUES ($1,$1)`, [code]);
    }
  });

  /** Grille v2, copie de la v1 avec d'autres règles, en vigueur à partir de `effet`. */
  const grilleV2 = async (effet: string, regles: Record<string, number>) => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO dqa.grille_parametre (version, effet_a_partir_de) VALUES ('v2', $1::date) RETURNING id`,
      [effet],
    );
    const id = rows[0]!.id;
    await db.query(
      `INSERT INTO dqa.grille_poids_pilier (grille_id, pilier, poids_pct)
       SELECT $1, pilier, poids_pct FROM dqa.grille_poids_pilier WHERE grille_id = dqa.grille_pour_mois('2026-01')`,
      [id],
    );
    await db.query(
      `INSERT INTO dqa.grille_seuil_sous_composante
         (grille_id, sous_composante, seuil, sens, unite, tolerance, seuil_district, retenue, poids_pct)
       SELECT $1, sous_composante, seuil, sens, unite, tolerance, seuil_district, retenue, poids_pct
       FROM dqa.grille_seuil_sous_composante WHERE grille_id = dqa.grille_pour_mois('2026-01')`,
      [id],
    );
    for (const [colonne, valeur] of Object.entries(regles)) {
      await db.query(`UPDATE dqa.grille_parametre SET ${colonne} = $2 WHERE id = $1`, [id, valeur]);
    }
  };

  const fenetreDonnees = (debut: string, fin: string) =>
    db.query(`UPDATE dqa.import_lot SET fenetre_debut = $1::date, fenetre_fin = $2::date`, [debut, fin]);
  /** Inventaire avec ses lignes : [produit, théorique, compté]. */
  const inventaire = async (id: string, jour: string, lignes: [string, number, number][]) => {
    await db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ($1,'S1','P1',$2::date,'fn',1)`,
      [id, jour],
    );
    for (const [prod, theorique, comptee] of lignes) {
      await db.query(
        `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
         VALUES ($1,$2,'X',$3,$4,1)`,
        [id, prod, theorique, comptee],
      );
    }
  };
  const dispensation = (id: string, jour: string, prod: string, qte: number) =>
    mouvement(id, 'dispensation', jour, prod, qte);
  const reception = (id: string, jour: string, prod: string, qte: number) =>
    mouvement(id, 'facture_fournisseur', jour, prod, qte);
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

  const calculer = () => db.query(`CALL dqa.rafraichir_et_geler(1)`);

  const p4p5 = async (mois = '2026-08') => {
    const { rows } = await db.query<{ taux_sdu_pct: string | null; taux_conso_pct: string | null; taux_concordance_pct: string | null }>(
      `SELECT p4.taux_sdu_pct, p4.taux_conso_pct, p5.taux_concordance_pct
       FROM dqa.mv_p4_ecart p4
       JOIN dqa.mv_p5_concordance p5 ON p5.site_id = p4.site_id AND p5.mois_paqd = p4.mois_paqd AND p5.programme_id IS NULL
       WHERE p4.site_id = 'S1' AND p4.mois_paqd = $1 AND p4.programme_id IS NULL`,
      [mois],
    );
    return rows[0];
  };
  const produits = async (mois = '2026-08') => {
    const { rows } = await db.query<{ produit_code: string; date_inventaire: string; date_debut: string | null; conso_raison_exclusion: string | null; conso_evaluable: boolean }>(
      `SELECT produit_code, to_char(date_inventaire, 'YYYY-MM-DD') AS date_inventaire,
              to_char(date_debut, 'YYYY-MM-DD') AS date_debut, conso_raison_exclusion, conso_evaluable
       FROM dqa.mv_p4_ecart_produit WHERE site_id = 'S1' AND mois_paqd = $1 AND programme_id IS NULL
       ORDER BY produit_code`,
      [mois],
    );
    return Object.fromEntries(rows.map((r) => [r.produit_code, r]));
  };

  it('mois_cloture_inventaire : 3 derniers jours du mois ou 1er du suivant', async () => {
    const { rows } = await db.query<{ d: string; m: string | null }>(
      `SELECT d::text, dqa.mois_cloture_inventaire(d::date) AS m
       FROM unnest(ARRAY['2026-08-28','2026-08-29','2026-08-31','2026-09-01','2026-09-02','2026-09-27','2026-09-28','2026-02-26']) d`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.d, r.m]))).toEqual({
      '2026-08-28': null, '2026-08-29': '2026-08', '2026-08-31': '2026-08', '2026-09-01': '2026-08',
      '2026-09-02': null, '2026-09-27': null, '2026-09-28': '2026-09', '2026-02-26': '2026-02',
    });
  });

  it('clôture le dernier jour et ouverture : P4 et P5 calculés', async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await inventaire('C', '2026-08-31', [['I1', 70, 70]]);
    await dispensation('D1', '2026-08-15', 'I1', 30);
    await calculer();
    expect(await p4p5()).toEqual({ taux_sdu_pct: '100.0', taux_conso_pct: '100.0', taux_concordance_pct: '100.0' });
    expect((await produits())['T1']).toMatchObject({ date_inventaire: '2026-08-31', date_debut: '2026-07-31', conso_evaluable: true });
  });

  it('un inventaire du 1er du mois suivant clôture le mois précédent', async () => {
    await inventaire('O', '2026-08-01', [['I1', 100, 100]]);
    await inventaire('C', '2026-09-01', [['I1', 70, 70]]);
    await dispensation('D1', '2026-08-15', 'I1', 30);
    await calculer();
    expect((await produits())['T1']).toMatchObject({ date_inventaire: '2026-09-01', date_debut: '2026-08-01', conso_evaluable: true });
    expect(await produits('2026-09')).toEqual({});
  });

  it('inventaire hors fenêtre (4e jour avant la fin) : 0 sur P4 et P5', async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await inventaire('H', '2026-08-28', [['I1', 70, 70]]);
    await calculer();
    expect(await produits()).toEqual({});
    expect(await p4p5()).toEqual({ taux_sdu_pct: '0.0', taux_conso_pct: '0.0', taux_concordance_pct: '0.0' });
  });

  it('deux inventaires dans la fenêtre : le dernier est retenu', async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await inventaire('C1', '2026-08-30', [['I1', 80, 50]]);
    await inventaire('C2', '2026-09-01', [['I1', 70, 70]]);
    await dispensation('D1', '2026-08-15', 'I1', 30);
    await calculer();
    expect((await produits())['T1']).toMatchObject({ date_inventaire: '2026-09-01', date_debut: '2026-07-31' });
    expect((await p4p5())?.taux_concordance_pct).toBe('100.0');
  });

  it('clôture sans ouverture : écart de consommation à 0, P5 calculé', async () => {
    await inventaire('C', '2026-08-31', [['I1', 70, 70]]);
    await calculer();
    expect(await p4p5()).toEqual({ taux_sdu_pct: '100.0', taux_conso_pct: '0.0', taux_concordance_pct: '100.0' });
    expect((await produits())['T1']).toMatchObject({ conso_evaluable: false, conso_raison_exclusion: 'sans_ouverture' });
  });

  it('produit absent de l\'ouverture : écarté seul, le site reste calculé', async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await inventaire('C', '2026-08-31', [['I1', 70, 70], ['I2', 10, 10]]);
    await dispensation('D1', '2026-08-15', 'I1', 30);
    await calculer();
    const p = await produits();
    expect(p['T2']).toMatchObject({ conso_evaluable: false, conso_raison_exclusion: 'absent_ouverture' });
    expect((await p4p5())?.taux_conso_pct).toBe('100.0');
  });

  it('mois dont la clôture n\'est pas couverte par les données : aucune sanction', async () => {
    await fenetreDonnees('2026-07-01', '2026-08-31');
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await dispensation('D1', '2026-08-15', 'I1', 30);
    await calculer();
    expect(await p4p5()).toEqual({ taux_sdu_pct: null, taux_conso_pct: null, taux_concordance_pct: null });
  });

  it('ouverture antérieure au début des données : pas de sanction sur la consommation', async () => {
    await fenetreDonnees('2026-08-01', '2026-09-30');
    await inventaire('C', '2026-08-31', [['I1', 70, 70]]);
    await calculer();
    expect(await p4p5()).toEqual({ taux_sdu_pct: '100.0', taux_conso_pct: null, taux_concordance_pct: '100.0' });
  });

  it('fiche site : la raison explique la sanction', async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await inventaire('H', '2026-08-20', [['I1', 70, 70]]);
    await dispensation('D1', '2026-08-15', 'I1', 30);
    await calculer();
    const d = await new IndicateursRepository(db).detailSite('S1', '2026-08', undefined);
    const sc = (pilier: string, code: string) =>
      d?.piliers.find((p) => p.pilier === pilier)?.sousComposantes.find((s) => s.sousComposante === code);
    expect(sc('P5', 'concordance')).toMatchObject({ statut: 'ALERTE', valeur: 0 });
    expect(sc('P5', 'concordance')?.raison).toBe('Inventaire du 20/08/2026 hors de la fenêtre de clôture (du 29/08/2026 au 01/09/2026) : P4 et P5 à 0');
    expect(sc('P4', 'ecart_consommation')?.raison).toBe(sc('P5', 'concordance')?.raison);
  });

  it('fiche site : clôture sans ouverture, la raison de la consommation le dit', async () => {
    await inventaire('C', '2026-08-31', [['I1', 70, 70]]);
    await calculer();
    const d = await new IndicateursRepository(db).detailSite('S1', '2026-08', undefined);
    const p4 = d?.piliers.find((p) => p.pilier === 'P4');
    const conso = p4?.sousComposantes.find((s) => s.sousComposante === 'ecart_consommation');
    expect(conso).toMatchObject({ statut: 'ALERTE', valeur: 0 });
    expect(conso?.raison).toBe("Pas d'inventaire d'ouverture (clôture du mois précédent) : écart de consommation à 0");
    expect(p4?.sousComposantes.find((s) => s.sousComposante === 'ecart_sdu')?.raison).toBeNull();
  });

  it("grille datée : la fenêtre de clôture suit la grille du mois, à partir de sa date d'effet", async () => {
    await grilleV2('2026-09-01', { jours_cloture_fin_mois: 5 });
    const { rows } = await db.query<{ d: string; m: string | null }>(
      `SELECT d::text, dqa.mois_cloture_inventaire(d::date) AS m
       FROM unnest(ARRAY['2026-08-28','2026-09-26','2026-09-25']) d`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.d, r.m]))).toEqual({
      '2026-08-28': null,       // août : grille v1, 3 derniers jours
      '2026-09-26': '2026-09',  // septembre : grille v2, 5 derniers jours
      '2026-09-25': null,
    });
  });

  it('grille datée : la note de sanction remplace le 0', async () => {
    await grilleV2('2026-08-01', { note_sanction: 40 });
    await inventaire('C', '2026-08-31', [['I1', 70, 70]]); // clôture sans ouverture
    await calculer();
    const { rows } = await db.query<{ p_ecart_sdu: string; p_concordance: string }>(
      `SELECT p_ecart_sdu, p_concordance FROM dqa.mv_score_pilier
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
    );
    expect(rows[0]).toEqual({ p_ecart_sdu: '40.0', p_concordance: '100.0' }); // consommation sanctionnée à 40
  });

  it('fiche site : une sanction à note non nulle garde son statut et sa raison', async () => {
    await grilleV2('2026-08-01', { note_sanction: 40 });
    await inventaire('C', '2026-08-31', [['I1', 70, 70]]); // clôture sans ouverture
    await calculer();
    const d = await new IndicateursRepository(db).detailSite('S1', '2026-08', undefined);
    const p4 = d?.piliers.find((p) => p.pilier === 'P4');
    const conso = p4?.sousComposantes.find((sc) => sc.sousComposante === 'ecart_consommation');
    expect(conso).toMatchObject({ note: 40, sanction: true, statut: 'ALERTE', valeur: 0 });
    expect(conso?.raison).toContain("Pas d'inventaire d'ouverture");
    expect(p4?.score).toBe(40);
    expect(d?.calcul?.regles.noteSanction).toBe(40);
  });

  it('grille datée : bornes de classification', async () => {
    const { rows } = await db.query<{ v1: string; v2: string }>(
      `SELECT dqa.classer_composite(85, dqa.grille_pour_mois('2026-01')) AS v1,
              dqa.classer_composite(85, (SELECT id FROM dqa.grille_parametre WHERE version = 'v1')) AS v2`,
    );
    expect(rows[0]).toEqual({ v1: 'PARTIELLEMENT_CONFORME', v2: 'PARTIELLEMENT_CONFORME' });
    await grilleV2('2026-08-01', { borne_conforme: 80, borne_partiellement_conforme: 60 });
    const r2 = await db.query<{ c: string; p: string }>(
      `SELECT dqa.classer_composite(85, dqa.grille_pour_mois('2026-08')) AS c,
              dqa.classer_composite(65, dqa.grille_pour_mois('2026-08')) AS p`,
    );
    expect(r2.rows[0]).toEqual({ c: 'CONFORME', p: 'PARTIELLEMENT_CONFORME' });
  });

  it('données couvrant la clôture, sans inventaire : 0 sur P4 et P5', async () => {
    await fenetreDonnees('2026-07-01', '2026-09-30');
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await dispensation('D1', '2026-08-15', 'I1', 30);
    await calculer();
    expect(await p4p5()).toEqual({ taux_sdu_pct: '0.0', taux_conso_pct: '0.0', taux_concordance_pct: '0.0' });
  });

  // ── Produits absents d'un inventaire (ticket 05) ──────────────────────────
  const ecartes = async () => {
    const { rows } = await db.query<{ produit_code: string; sens: string; qualification: string; stock_calcule: string; lot_id: string | null }>(
      `SELECT produit_code, sens, qualification, stock_calcule, lot_id::text FROM dqa.hist_produit_ecarte
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' ORDER BY sens, produit_code`,
    );
    return rows;
  };

  it("absent de l'ouverture : stock minimal positif, oubli démontré", async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await inventaire('C', '2026-08-31', [['I1', 70, 70], ['I2', 10, 10]]);
    await dispensation('D2', '2026-08-15', 'I2', 5);
    await calculer();
    // 10 comptés à la clôture + 5 sortis - 0 reçus = 15 au moins à l'ouverture
    expect(await ecartes()).toEqual([
      { produit_code: 'T2', sens: 'absent_ouverture', qualification: 'oubli_demontre', stock_calcule: '15.000', lot_id: '1' },
    ]);
  });

  it("absent de l'ouverture : tout peut venir des réceptions, cause indéterminée", async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await inventaire('C', '2026-08-31', [['I1', 70, 70], ['I2', 10, 10]]);
    await reception('R2', '2026-08-10', 'I2', 20);
    await dispensation('D2', '2026-08-15', 'I2', 5);
    await calculer();
    // 10 + 5 - 20 = -5 : le produit a pu être à 0 à l'ouverture
    expect(await ecartes()).toMatchObject([{ produit_code: 'T2', qualification: 'indetermine', stock_calcule: '-5.000' }]);
  });

  it('absent de la clôture : stock attendu positif, oubli probable ; nul, épuisé', async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100], ['I2', 10, 10]]);
    await inventaire('C', '2026-08-31', [['I1', 70, 70]]);
    await dispensation('D2', '2026-08-15', 'I2', 3);
    await calculer();
    // 10 comptés à l'ouverture + 0 reçus - 3 sortis = 7 attendus à la clôture
    expect(await ecartes()).toMatchObject([{ produit_code: 'T2', sens: 'absent_cloture', qualification: 'oubli_probable', stock_calcule: '7.000' }]);
    await dispensation('D3', '2026-08-20', 'I2', 9);
    await calculer();
    expect(await ecartes()).toMatchObject([{ produit_code: 'T2', qualification: 'epuise', stock_calcule: '-2.000' }]);
  });

  it("sans inventaire d'ouverture : pas de constat d'absence (c'est une sanction de site)", async () => {
    await inventaire('C', '2026-08-31', [['I1', 70, 70], ['I2', 10, 10]]);
    await calculer();
    expect(await ecartes()).toEqual([]);
  });

  it("historisé : un ré-import qui corrige l'absence la retire", async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await inventaire('C', '2026-08-31', [['I1', 70, 70], ['I2', 10, 10]]);
    await calculer();
    expect(await ecartes()).toHaveLength(1);
    await db.query(
      `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
       VALUES ('O','I2','X',10,10,1)`,
    );
    await calculer();
    expect(await ecartes()).toEqual([]);
  });

  it('servi par le détail P4 et compté dans la synthèse par territoire', async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100], ['I2', 10, 10]]);
    await inventaire('C', '2026-08-31', [['I1', 70, 70]]);
    await calculer();
    const d = await new IndicateursRepository(db).detailPilier('S1', 'p4', { mois: '2026-08' });
    if (d === null || d.code !== 'p4') throw new Error('variante p4 attendue');
    expect(d.produitsEcartes).toMatchObject([
      { produitCode: 'T2', sens: 'absent_cloture', qualification: 'oubli_probable', stockConnu: 10, stockCalcule: 10 },
    ]);
    const { rows } = await db.query(
      `SELECT nb_absents_ouverture, nb_oublis_ouverture, nb_absents_cloture, nb_oublis_cloture
       FROM dqa.mv_synthese_territoire_scores
       WHERE mois_paqd = '2026-08' AND niveau = 'site' AND site_id = 'S1' AND programme_id IS NULL AND strate IS NULL`,
    );
    expect(rows[0]).toEqual({ nb_absents_ouverture: 0, nb_oublis_ouverture: 0, nb_absents_cloture: 1, nb_oublis_cloture: 1 });
  });

  // ── Corrections de la revue (migration 0061) ──────────────────────────────
  it('grain programme : un programme géré sans clôture prend 0 sur P4 et P5, la raison le dit', async () => {
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('P2','PALU')`);
    // clôture du site faite sous un autre programme (P2) ; P1, géré, n'a pas la sienne
    await db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ('C2','S1','P2','2026-08-31','fn',1)`,
    );
    await db.query(
      `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
       VALUES ('C2','I1','X',70,70,1)`,
    );
    await dispensation('D1', '2026-08-15', 'I1', 30);
    await calculer();
    const { rows } = await db.query(
      `SELECT p4.taux_sdu_pct, p4.taux_conso_pct, p5.taux_concordance_pct
       FROM dqa.mv_p4_ecart p4
       JOIN dqa.mv_p5_concordance p5 ON p5.site_id = p4.site_id AND p5.mois_paqd = p4.mois_paqd AND p5.programme_id = p4.programme_id
       WHERE p4.site_id = 'S1' AND p4.mois_paqd = '2026-08' AND p4.programme_id = 'P1'`,
    );
    expect(rows[0]).toEqual({ taux_sdu_pct: '0.0', taux_conso_pct: '0.0', taux_concordance_pct: '0.0' });
    const d = await new IndicateursRepository(db).detailSite('S1', '2026-08', 'P1');
    const p5 = d?.piliers.find((p) => p.pilier === 'P5')?.sousComposantes[0];
    expect(p5).toMatchObject({ statut: 'ALERTE', valeur: 0, sanction: true });
    expect(p5?.raison).toContain('Aucun inventaire de clôture');
  });

  it('mois jugé : un trou entre deux imports suspend la sanction', async () => {
    await fenetreDonnees('2026-07-01', '2026-08-29');
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, fenetre_debut, fenetre_fin, statut)
       VALUES ('t2.xlsx','2026-C3','2026-09','2026-09-01','2026-09-30','2026-09-02','2026-09-30','valide')`,
    );
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await dispensation('D1', '2026-08-15', 'I1', 30);
    await calculer();
    // fenêtre de clôture d'août : 29/08 au 01/09 ; les 30/08, 31/08 et 01/09 ne sont couverts par aucun import
    expect(await p4p5()).toEqual({ taux_sdu_pct: null, taux_conso_pct: null, taux_concordance_pct: null });
  });

  it("un code inventorié sous un autre article à l'ouverture : raison propre, pas d'absence par code", async () => {
    await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ('I3','T1','I3')`);
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await inventaire('C', '2026-08-31', [['I3', 70, 70]]);
    await calculer();
    expect((await produits())['T1']).toMatchObject({ conso_raison_exclusion: 'autre_article_ouverture' });
    expect(await ecartes()).toEqual([]);
  });

  it('historique des produits écartés : un traceur désactivé garde son passé', async () => {
    await inventaire('O', '2026-07-31', [['I1', 100, 100]]);
    await inventaire('C', '2026-08-31', [['I1', 70, 70], ['I2', 10, 10]]);
    await calculer();
    expect(await ecartes()).toHaveLength(1);
    await db.query(`UPDATE dqa.dim_produit_traceur SET actif = false WHERE produit_code = 'T2'`);
    await calculer();
    expect(await ecartes()).toMatchObject([{ produit_code: 'T2', sens: 'absent_ouverture' }]);
  });
});
