import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { closePool } from '../src/db/pool.js';
import { construireClasseur, optionsValides } from './helpers/classeur.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

describe('promotion staging → core', () => {
  let base: BaseEphemere;
  let app: INestApplication;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await closePool();
    await base.stop();
  });

  const deposer = async (buffer: Buffer, nom: string) => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/connexion').send({ identifiant: 'coordination', motDePasse: 'coordination-2026' });
    return a.post('/api/imports').attach('fichier', buffer, nom);
  };

  const compte = async (table: string): Promise<number> => {
    const { rows } = await base.pool.query<{ c: string }>(`SELECT count(*)::text AS c FROM dqa.${table}`);
    return Number(rows[0]!.c);
  };

  it('promeut sites, produits, programmes, transactions, inventaires', async () => {
    const res = await deposer(construireClasseur(optionsValides()), 'p1.xlsx');
    expect(res.body.statut).toBe('valide');
    expect(await compte('dim_site')).toBe(1);
    expect(await compte('dim_produit')).toBe(1);
    expect(await compte('dim_programme')).toBe(1);
    expect(await compte('dim_site_programme')).toBe(1);
    expect(await compte('fact_transaction')).toBe(1);
    expect(await compte('fact_ligne_transaction')).toBe(1);
    expect(await compte('fact_inventaire')).toBe(1);
    expect(await compte('fact_inventaire_ligne')).toBe(1);
    expect(await compte('fact_stock_snapshot')).toBe(1);

    const l = await base.pool.query(
      `SELECT lot_id_source FROM dqa.fact_transaction WHERE transaction_id = 'TX-1'`,
    );
    expect(l.rows[0].lot_id_source).not.toBeNull();
  });

  it('le gel des comptes bruts est câblé dans le flux d\'import (Couture 2)', async () => {
    const res = await deposer(construireClasseur(optionsValides()), 'brut.xlsx');
    expect(res.body.statut).toBe('valide');

    // hist_pilier_brut peuplée pour le mois du lot
    const brut = await base.pool.query<{ mesure: string; nb_attendu: number; nb_realise: number; lot_id: number }>(
      `SELECT mesure, nb_attendu, nb_realise, lot_id FROM dqa.hist_pilier_brut
       WHERE site_id = 'SITE-1' AND mois_paqd = '2026-08' AND programme_id IS NULL
       ORDER BY mesure`,
    );
    expect(brut.rows.length).toBeGreaterThan(0);
    expect(brut.rows.every((r) => r.lot_id !== null)).toBe(true);

    // réconciliation : le couple p3_regularite figé correspond au taux sc_regularite_saisie
    const p3 = brut.rows.find((r) => r.mesure === 'p3_regularite');
    if (p3) {
      const hist = await base.pool.query<{ sc: string | null }>(
        `SELECT sc_regularite_saisie AS sc FROM dqa.hist_score_site
         WHERE site_id = 'SITE-1' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
      );
      const taux = Math.round((p3.nb_realise / p3.nb_attendu) * 1000) / 10;
      expect(Number(hist.rows[0]!.sc)).toBeCloseTo(taux, 1);
    }
  });

  it('ré-importer le même classeur laisse le core identique', async () => {
    await deposer(construireClasseur(optionsValides()), 'p2a.xlsx');
    const avant = await base.pool.query(
      `SELECT count(*)::int AS c, max(quantite) AS q FROM dqa.fact_ligne_transaction`,
    );
    await deposer(construireClasseur(optionsValides()), 'p2b.xlsx');
    const apres = await base.pool.query(
      `SELECT count(*)::int AS c, max(quantite) AS q FROM dqa.fact_ligne_transaction`,
    );
    expect(apres.rows[0]).toEqual(avant.rows[0]);
  });

  it('un classeur corrigé pour le même mois remplace les données', async () => {
    await deposer(construireClasseur(optionsValides()), 'p3a.xlsx');
    const corrige = optionsValides();
    corrige.jeux.find((j) => j.nom === 'LIGNES_TRANSACTIONS')!.lignes[0]!['quantite'] = '99';
    await deposer(construireClasseur(corrige), 'p3b.xlsx');
    const { rows } = await base.pool.query(
      `SELECT quantite FROM dqa.fact_ligne_transaction WHERE ligne_id = 'L-1'`,
    );
    expect(Number(rows[0].quantite)).toBe(99);
  });

  it('une ligne à référence absente n\'est pas promue et devient une anomalie', async () => {
    const opts = optionsValides();
    // une 2e ligne de transaction pointant une transaction inexistante
    opts.jeux.find((j) => j.nom === 'LIGNES_TRANSACTIONS')!.lignes.push({
      ligne_id: 'L-ORPHELINE', transaction_id: 'TX-FANTOME', produit_id: 'ITEM-1',
      programme_id: 'PROG-1', lot: 'X', quantite: '1', taille_conditionnement: '1',
      type_ligne: 'stock_out', issu_ajustement: 'NON', date_peremption: '',
    });
    opts.metadata['nb_lignes_LIGNES_TRANSACTIONS'] = '2';
    const res = await deposer(construireClasseur(opts), 'p4.xlsx');
    expect(res.body.statut).toBe('valide');
    const promue = await base.pool.query(
      `SELECT 1 FROM dqa.fact_ligne_transaction WHERE ligne_id = 'L-ORPHELINE'`,
    );
    expect(promue.rowCount).toBe(0);
    expect(
      res.body.anomalies.some((x: { code: string }) => x.code === 'REFERENCE_NON_PROMUE'),
    ).toBe(true);
  });

  it('promeut les réquisitions avec leur mois couvert dérivé', async () => {
    const res = await deposer(construireClasseur(optionsValides()), 'req1.xlsx');
    expect(res.body.statut).toBe('valide');
    const { rows } = await base.pool.query(
      `SELECT site_id, programme_id, mois_couvert, date_soumission, lot_id_source
       FROM dqa.fact_requisition WHERE requisition_id = 'R-1'`,
    );
    expect(rows[0].mois_couvert).toBe('2026-08');
    expect(rows[0].site_id).toBe('SITE-1');
    expect(rows[0].programme_id).toBe('PROG-1');
    expect(rows[0].lot_id_source).not.toBeNull();
  });

  it('ré-importer laisse fact_requisition identique (upsert requisition_id)', async () => {
    await deposer(construireClasseur(optionsValides()), 'req2a.xlsx');
    const avant = await compte('fact_requisition');
    await deposer(construireClasseur(optionsValides()), 'req2b.xlsx');
    expect(await compte('fact_requisition')).toBe(avant);
  });

  it('une réquisition à mois_couvert_debut mal formé n\'entre pas en core', async () => {
    const opts = optionsValides();
    const req = opts.jeux.find((j) => j.nom === 'REQUISITIONS')!.lignes[0]!;
    req['requisition_id'] = 'R-MALFORMEE';
    req['mois_couvert_debut'] = 'jamais';
    const res = await deposer(construireClasseur(opts), 'req3.xlsx');
    expect(res.body.statut).toBe('valide');
    const promue = await base.pool.query(
      `SELECT 1 FROM dqa.fact_requisition WHERE requisition_id = 'R-MALFORMEE'`,
    );
    expect(promue.rowCount).toBe(0);
    expect(
      res.body.anomalies.some((x: { code: string }) => x.code === 'MOIS_COUVERT_INVALIDE'),
    ).toBe(true);
  });

  it('une réquisition à site inconnu n\'est pas promue et devient une anomalie', async () => {
    const opts = optionsValides();
    opts.jeux.find((j) => j.nom === 'REQUISITIONS')!.lignes.push({
      requisition_id: 'R-ORPHELINE', site_id: 'SITE-FANTOME', programme_id: 'PROG-1', periode_id: '',
      mois_couvert_debut: '2026-08-01', mois_couvert_fin: '2026-08-31', date_soumission: '2026-09-05',
      date_inventaire_ref: '2026-08-29', date_reception: '', statut: 'fn',
      statut_autorisation: 'authorised', type_requisition: 'Ordinaire',
    });
    opts.metadata['nb_lignes_REQUISITIONS'] = '2';
    const res = await deposer(construireClasseur(opts), 'req4.xlsx');
    expect(res.body.statut).toBe('valide');
    const promue = await base.pool.query(
      `SELECT 1 FROM dqa.fact_requisition WHERE requisition_id = 'R-ORPHELINE'`,
    );
    expect(promue.rowCount).toBe(0);
    expect(
      res.body.anomalies.some(
        (x: { code: string; onglet: string | null }) =>
          x.code === 'REFERENCE_NON_PROMUE' && x.onglet === 'REQUISITIONS',
      ),
    ).toBe(true);
  });

  it('la quantité d\'une ligne est déjà en unités : jamais multipliée par le conditionnement', async () => {
    // fixture L-1 : quantite 30, taille_conditionnement 30 (ADR 0017)
    const res = await deposer(construireClasseur(optionsValides()), 'unites.xlsx');
    expect(res.body.statut).toBe('valide');
    const { rows } = await base.pool.query<{ q: string; t: string }>(
      `SELECT quantite_unitaire::text AS q, taille_conditionnement::text AS t
       FROM dqa.fact_ligne_transaction WHERE ligne_id = 'L-1'`,
    );
    expect(Number(rows[0]?.q)).toBe(30);
    expect(Number(rows[0]?.t)).toBe(30);
  });

  it('canevas v2.4 : facture si promue avec sa finalisation et sa livraison liée, rc en encaissement', async () => {
    const opts = optionsValides();
    const tx = opts.jeux.find((j) => j.nom === 'TRANSACTIONS')!;
    const base0 = tx.lignes[0]!;
    tx.lignes.push(
      { ...base0, transaction_id: 'TX-SI', nature: 'facture_fournisseur', type_transaction: 'si', mode: 'store',
        statut: 'fn', date_saisie: '2026-08-11', date_finalisation: '2026-08-14',
        transaction_liee_id: 'TX-DISTRICT', date_finalisation_liee: '2026-08-09' },
      // script antérieur au v2.4 : rc libellé « reception »
      { ...base0, transaction_id: 'TX-RC', nature: 'reception', type_transaction: 'rc', mode: 'store',
        date_finalisation: '', transaction_liee_id: '', date_finalisation_liee: '' },
    );
    opts.metadata['nb_lignes_TRANSACTIONS'] = String(tx.lignes.length);
    const res = await deposer(construireClasseur(opts), 'v24.xlsx');
    expect(res.body.statut).toBe('valide');
    const { rows } = await base.pool.query<{
      transaction_id: string; nature: string; fin: string | null; liee: string | null; fin_liee: string | null;
    }>(
      `SELECT transaction_id, nature, date_finalisation::text AS fin, transaction_liee_id AS liee,
              date_finalisation_liee::text AS fin_liee
       FROM dqa.fact_transaction WHERE transaction_id IN ('TX-SI', 'TX-RC') ORDER BY transaction_id`,
    );
    expect(rows).toEqual([
      { transaction_id: 'TX-RC', nature: 'encaissement', fin: null, liee: null, fin_liee: null },
      { transaction_id: 'TX-SI', nature: 'facture_fournisseur', fin: '2026-08-14', liee: 'TX-DISTRICT', fin_liee: '2026-08-09' },
    ]);
  });

  it('le type mSupply d\'origine du site est conservé à côté du type retenu', async () => {
    const opts = optionsValides();
    const site = opts.jeux.find((j) => j.nom === 'SITES')!.lignes[0]!;
    site['site_nom'] = 'CHR PUBLIC de BONDOUKOU';
    site['type_structure'] = 'CHR';
    site['type_structure_msupply'] = 'ESPC';
    const res = await deposer(construireClasseur(opts), 'type.xlsx');
    expect(res.body.statut).toBe('valide');
    const { rows } = await base.pool.query<{ t: string; m: string }>(
      `SELECT type_structure AS t, type_structure_msupply AS m FROM dqa.dim_site WHERE site_id = 'SITE-1'`,
    );
    expect(rows[0]).toEqual({ t: 'CHR', m: 'ESPC' });
    expect((res.body.anomalies as { code: string }[]).some((a) => a.code === 'TYPE_STRUCTURE_CONFLIT')).toBe(true);
  });

  it('un même lot réparti sur plusieurs lignes de stock est agrégé en une photo', async () => {
    // mSupply scinde un lot en plusieurs item_line (emplacements, conditionnements) :
    // lot du 2026-10-12 rejeté par l'upsert faute d'agrégation.
    const opts = optionsValides();
    const stock = opts.jeux.find((j) => j.nom === 'STOCK_ACTUEL')!;
    const base0 = stock.lignes[0]!;
    stock.lignes.push(
      { ...base0, quantite_disponible: '30', date_peremption: '2027-03-31' },
      { ...base0, lot: '', quantite_disponible: '5', date_peremption: '' },
      { ...base0, lot: '', quantite_disponible: '7', date_peremption: '' },
    );
    opts.metadata['nb_lignes_STOCK_ACTUEL'] = '4';
    const res = await deposer(construireClasseur(opts), 'stock-scinde.xlsx');
    expect(res.body.statut).toBe('valide');
    const { rows } = await base.pool.query<{ lot: string; q: string; peremption: string | null }>(
      `SELECT lot, quantite_disponible::text AS q, to_char(date_peremption, 'YYYY-MM-DD') AS peremption
       FROM dqa.fact_stock_snapshot
       WHERE date_photo = '2026-08-18' AND site_id = 'SITE-1' AND produit_id = 'ITEM-1'
       ORDER BY lot`,
    );
    expect(rows.map((r) => [r.lot, Number(r.q), r.peremption])).toEqual([
      ['', 12, null],
      ['LOT7', 300, '2027-03-31'],
    ]);
  });

  const traceurs = async (): Promise<Record<string, boolean>> => {
    const { rows } = await base.pool.query<{ produit_code: string; actif: boolean }>(
      `SELECT produit_code, actif FROM dqa.dim_produit_traceur`,
    );
    return Object.fromEntries(rows.map((r) => [r.produit_code, r.actif]));
  };

  it('les produits du lot deviennent traceurs, les absents sont désactivés', async () => {
    await base.pool.query(
      `INSERT INTO dqa.dim_produit_traceur (produit_code, actif) VALUES ('ANCIEN-01', true)
       ON CONFLICT (produit_code) DO UPDATE SET actif = true`,
    );
    const res = await deposer(construireClasseur(optionsValides()), 'traceurs.xlsx');
    expect(res.body.statut).toBe('valide');
    const t = await traceurs();
    expect(t['ARV001']).toBe(true);
    expect(t['ANCIEN-01']).toBe(false);
    const { rows } = await base.pool.query(
      `SELECT libelle FROM dqa.dim_produit_traceur WHERE produit_code = 'ARV001'`,
    );
    expect(rows[0].libelle).toBe('TDF/3TC/DTG');
  });

  it('un lot sans aucun produit ne vide pas la liste des traceurs', async () => {
    await deposer(construireClasseur(optionsValides()), 'traceurs-avant.xlsx');
    const opts = optionsValides();
    opts.jeux.find((j) => j.nom === 'PRODUITS')!.lignes = [];
    opts.metadata['nb_lignes_PRODUITS'] = '0';
    const res = await deposer(construireClasseur(opts), 'sans-produit.xlsx');
    expect(res.body.statut).toBe('valide');
    expect((await traceurs())['ARV001']).toBe(true);
  });

  it('l\'import complète le calendrier autour des mois du lot', async () => {
    await base.pool.query(`DELETE FROM dqa.dim_temps WHERE jour >= DATE '2025-06-01'`);
    const res = await deposer(construireClasseur(optionsValides()), 'calendrier.xlsx');
    expect(res.body.statut).toBe('valide');
    const { rows } = await base.pool.query<{ debut: string; fin: string; cycle: string }>(
      `SELECT to_char(min(jour), 'YYYY-MM-DD') AS debut, to_char(max(jour), 'YYYY-MM-DD') AS fin,
              (SELECT cycle_paqd FROM dqa.dim_temps WHERE jour = DATE '2026-09-01') AS cycle
       FROM dqa.dim_temps`,
    );
    expect(rows[0]).toEqual({ debut: '2025-01-01', fin: '2027-12-31', cycle: '2026-C3' });
    const jours = await base.pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM dqa.dim_temps WHERE jour BETWEEN DATE '2025-01-01' AND DATE '2027-12-31'`,
    );
    expect(Number(jours.rows[0]!.c)).toBe(1095);
  });

  it('un échec de promotion annule tout : staging et core intacts, lot non validé', async () => {
    // provoque un doublon de clé primaire d'inventaire dans le même lot
    const opts = optionsValides();
    const inv = opts.jeux.find((j) => j.nom === 'INVENTAIRES')!;
    inv.lignes.push({ ...inv.lignes[0]! });
    opts.metadata['nb_lignes_INVENTAIRES'] = '2';
    const avantCore = await compte('fact_inventaire');
    const res = await deposer(construireClasseur(opts), 'p5.xlsx');
    expect(res.body.statut).toBe('rejete');
    expect(await compte('fact_inventaire')).toBe(avantCore);
    const staged = await base.pool.query(
      `SELECT count(*)::int AS c FROM dqa.stg_inventaires s
       JOIN dqa.import_lot l ON l.id = s.lot_id WHERE l.nom_fichier = 'p5.xlsx'`,
    );
    expect(staged.rows[0].c).toBe(0);
    const lot = await base.pool.query(`SELECT statut FROM dqa.import_lot WHERE nom_fichier = 'p5.xlsx'`);
    expect(lot.rows[0].statut).toBe('rejete');
  });
});
