import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IndicateursRepository } from '../src/indicateurs/indicateurs.repository.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Couture 1 — `ficheProduitMois` : toutes les grandeurs brutes d'un produit
 * traceur pour un site et un mois, contre un core fabriqué à la main.
 * Un produit avec deux inventaires bornants (consommation reconstituée) + un
 * produit avec un seul inventaire (consommation nulle) ; photos dans / hors du
 * mois ; comptage des jours de dispensation ; un ajustement de chaque sens ;
 * 404 sur un non-traceur et sur un site hors périmètre ; `reimporteDepuisLeGel`.
 */
describe('ficheProduitMois', () => {
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
    await db.query(`TRUNCATE dqa.hist_pilier_brut, dqa.hist_score_site, dqa.fact_stock_snapshot,
      dqa.fact_inventaire_ligne, dqa.fact_inventaire, dqa.fact_ligne_transaction, dqa.fact_transaction,
      dqa.dim_site_programme, dqa.dim_produit_traceur, dqa.dim_produit, dqa.dim_programme,
      dqa.dim_site, dqa.import_lot RESTART IDENTITY CASCADE`);
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut)
       VALUES ('t.xlsx','2026-C2','2026-08','2026-08-01','2026-08-31','valide')`,
    );
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('P1','VIH')`);
    await db.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ('S1','P1',true)`);
  });

  const produit = async (id: string, code: string, traceur: boolean) => {
    await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ($1,$2,$1)`, [id, code]);
    if (traceur) {
      await db.query(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle) VALUES ($1,$2)`, [code, `lib ${code}`]);
    }
  };
  const inventaire = async (id: string, jour: string, site = 'S1') =>
    db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ($1,$2,'P1',$3::date,'fn',1)`,
      [id, site, jour],
    );
  const ligne = async (inv: string, prod: string, theorique: number, comptee: number) =>
    db.query(
      `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
       VALUES ($1,$2,'X',$3,$4,1)`,
      [inv, prod, theorique, comptee],
    );
  const snapshot = async (jour: string, prod: string, qte: number) =>
    db.query(
      `INSERT INTO dqa.fact_stock_snapshot (date_photo, site_id, produit_id, lot, quantite_disponible, lot_id_source)
       VALUES ($1::date,'S1',$2,'X',$3,1)`,
      [jour, prod, qte],
    );
  const mouvement = async (
    id: string,
    nature: string,
    jour: string,
    prod: string,
    qte: number,
    issuAjustement = false,
  ) => {
    await db.query(
      `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, lot_id_source)
       VALUES ($1,'S1',$2,'P1','fn',$3::date,1)`,
      [id, nature, jour],
    );
    await db.query(
      `INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
       VALUES ($1,$2,$3,$4,1,$5,1)`,
      [`${id}L`, id, prod, qte, issuAjustement],
    );
  };

  /**
   * T1 (I1) : deux inventaires bornants, réceptions, dispensations, photos et
   * un ajustement de chaque sens. T2 (I2) : un seul inventaire. X3 : non traceur.
   */
  const socle = async () => {
    await produit('I1', 'T1', true);
    await produit('I2', 'T2', true);
    await produit('I3', 'X3', false);

    await inventaire('A', '2026-08-01'); // clôture de juillet = ouverture d'août (ADR 0022)
    await inventaire('B', '2026-08-31'); // clôture d'août
    await ligne('A', 'I1', 100, 90);
    await ligne('B', 'I1', 60, 50);
    await ligne('B', 'I2', 100, 95); // un seul inventaire pour T2
    await ligne('B', 'I3', 100, 40); // non traceur

    // réceptions dans l'intervalle (01, 31]
    await mouvement('RC1', 'facture_fournisseur', '2026-08-10', 'I1', 30);
    await mouvement('RC2', 'facture_fournisseur', '2026-08-20', 'I1', 10);

    // dispensations : 08-01 hors période (jour de l'ouverture), 08-12 (x2 même jour), 08-19 dans la période
    await mouvement('D0', 'dispensation', '2026-08-01', 'I1', 8);
    await mouvement('D1', 'dispensation', '2026-08-12', 'I1', 25);
    await mouvement('D2', 'dispensation', '2026-08-12', 'I1', 5);
    await mouvement('D3', 'dispensation', '2026-08-19', 'I1', 20);

    // photos : deux dans la période, une avant
    await snapshot('2026-08-15', 'I1', 70);
    await snapshot('2026-08-31', 'I1', 40);
    await snapshot('2026-07-31', 'I1', 100);

    // ajustements : un de chaque sens
    await mouvement('AJ1', 'ajustement_negatif', '2026-08-07', 'I1', 12);
    await mouvement('AJ2', 'ajustement_positif', '2026-08-09', 'I1', 7);

    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
  };

  it('produit avec deux inventaires bornants : toutes les grandeurs brutes', async () => {
    await socle();
    const f = await repo.ficheProduitMois('S1', 'T1', {});
    expect(f).not.toBeNull();
    if (f === null) throw new Error('fiche attendue');

    expect(f.moisPaqd).toBe('2026-08');
    // l'inventaire du 1er août clôture juillet : juillet est mesuré aussi
    expect(f.moisDisponibles).toEqual(['2026-08', '2026-07']);
    expect(f.produit).toEqual({ code: 'T1', libelle: 'lib T1' });
    expect(f.estDistrict).toBe(false);

    // période de P4 : de l'inventaire d'ouverture à celui de clôture
    expect(f.periode).toEqual({ debut: '2026-08-01', fin: '2026-08-31', ouvertureConnue: true, clotureConnue: true });

    // inventaires de la période portant T1, bornes comprises
    expect(f.inventaires).toEqual([
      { date: '2026-08-01', statut: 'fn', theorique: 100, comptee: 90, ecart: -10 },
      { date: '2026-08-31', statut: 'fn', theorique: 60, comptee: 50, ecart: -10 },
    ]);

    // photos : celles de la période seulement, triées
    expect(f.snapshots).toEqual([
      { datePhoto: '2026-08-15', quantiteDisponible: 70 },
      { datePhoto: '2026-08-31', quantiteDisponible: 40 },
    ]);

    // réceptions après l'ouverture, jusqu'à la clôture
    expect(f.receptions).toEqual([
      { date: '2026-08-10', quantite: 30 },
      { date: '2026-08-20', quantite: 10 },
    ]);

    // dispensations après l'ouverture (25 + 5 + 20), 2 jours distincts : le
    // total vaut la consommation déclarée de P4
    expect(f.dispensations).toEqual({ total: 50, nbJours: 2 });

    // ajustements : un de chaque sens
    expect(f.ajustements).toEqual([
      { date: '2026-08-07', quantite: 12, sens: 'negatif' },
      { date: '2026-08-09', quantite: 7, sens: 'positif' },
    ]);

    // consommation reconstituée = 90 + (30 + 10) − 50 = 80 ; déclarée = 25 + 5 + 20 = 50
    expect(f.stockDebut).toBe(90);
    expect(f.stockFin).toBe(50);
    expect(f.consommation).toEqual({ reconstituee: 80, declaree: 50, ecart: -30 });

    expect(f.calculeLe).not.toBeNull();
    expect(f.coreMajLe).not.toBeNull();
    expect(f.reimporteDepuisLeGel).toBe(false);
  });

  it('produit avec un seul inventaire : consommation et stocks bornants nuls', async () => {
    await socle();
    const f = await repo.ficheProduitMois('S1', 'T2', {});
    if (f === null) throw new Error('fiche attendue');

    expect(f.inventaires).toEqual([
      { date: '2026-08-31', statut: 'fn', theorique: 100, comptee: 95, ecart: -5 },
    ]);
    // pas d'ouverture pour T2 : la période part de l'ouverture du site
    expect(f.periode).toEqual({ debut: '2026-08-01', fin: '2026-08-31', ouvertureConnue: true, clotureConnue: true });
    expect(f.consommation).toEqual({ reconstituee: null, declaree: null, ecart: null });
    expect(f.stockDebut).toBeNull();
    expect(f.stockFin).toBeNull();
    expect(f.snapshots).toEqual([]);
    expect(f.dispensations).toEqual({ total: 0, nbJours: 0 });
  });

  it('district : les sorties déclarées sont ses distributions', async () => {
    await db.query(`UPDATE dqa.dim_site SET type_structure = 'District sanitaire' WHERE site_id = 'S1'`);
    await socle();
    await mouvement('DS1', 'distribution', '2026-08-14', 'I1', 33);
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const f = await repo.ficheProduitMois('S1', 'T1', {});
    expect(f?.estDistrict).toBe(true);
    expect(f?.dispensations).toEqual({ total: 33, nbJours: 1 });
    expect(f?.consommation.declaree).toBe(33);
  });

  it('sans inventaire du mois : la période se rabat sur les fenêtres de clôture', async () => {
    await produit('I1', 'T1', true);
    await mouvement('D1', 'dispensation', '2026-08-12', 'I1', 5);
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const f = await repo.ficheProduitMois('S1', 'T1', { mois: '2026-08' });
    if (f === null || f.moisPaqd === null) throw new Error('fiche du mois attendue');
    expect(f.periode).toEqual({ debut: '2026-07-29', fin: '2026-09-01', ouvertureConnue: false, clotureConnue: false });
    expect(f.dispensations).toEqual({ total: 5, nbJours: 1 });
  });

  it('404 (null) sur un code non traceur et sur un site hors périmètre', async () => {
    await socle();
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S9','HORS',false)`);
    expect(await repo.ficheProduitMois('S1', 'X3', {})).toBeNull();
    expect(await repo.ficheProduitMois('S1', 'INCONNU', {})).toBeNull();
    expect(await repo.ficheProduitMois('S9', 'T1', {})).toBeNull();
    expect(await repo.ficheProduitMois('INCONNU', 'T1', {})).toBeNull();
  });

  it('reimporteDepuisLeGel : vrai quand une ligne de core bouge après le gel', async () => {
    await socle();
    const avant = await repo.ficheProduitMois('S1', 'T1', {});
    expect(avant?.reimporteDepuisLeGel).toBe(false);

    await db.query(
      `UPDATE dqa.fact_inventaire SET maj_le = now() + interval '1 day' WHERE inventaire_id = 'A'`,
    );
    const apres = await repo.ficheProduitMois('S1', 'T1', {});
    expect(apres?.reimporteDepuisLeGel).toBe(true);
  });

  it('site du périmètre sans mois mesuré : fiche vide, pas 404', async () => {
    await produit('I1', 'T1', true);
    const f = await repo.ficheProduitMois('S1', 'T1', {});
    if (f === null) throw new Error('fiche attendue');
    expect(f.moisPaqd).toBeNull();
    expect(f.moisDisponibles).toEqual([]);
    expect(f.inventaires).toEqual([]);
    expect(f.reimporteDepuisLeGel).toBe(false);
  });

  it('un code = un produit : la consommation additionne les articles du code', async () => {
    await socle();
    // un second article du code T1, présent aux deux inventaires, une dispensation
    await produit('I9', 'T1', false);
    await ligne('A', 'I9', 20, 20);
    await ligne('B', 'I9', 10, 10);
    await mouvement('D9', 'dispensation', '2026-08-15', 'I9', 10);
    await db.query(`CALL dqa.rafraichir_et_geler(1)`);
    const f = await repo.ficheProduitMois('S1', 'T1', {});
    if (f === null) throw new Error('fiche attendue');
    // I1 : 90 + 40 - 50 = 80 reconstitués, 50 déclarés ; I9 : 20 - 10 = 10, 10 déclarés
    expect(f.stockDebut).toBe(110);
    expect(f.stockFin).toBe(60);
    expect(f.consommation).toEqual({ reconstituee: 90, declaree: 60, ecart: -30 });
  });
});
