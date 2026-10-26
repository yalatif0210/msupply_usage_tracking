import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { suiviStocksSchema, type LigneStock } from '@dqa/contracts';
import { AppModule } from '../src/app.module.js';
import { closePool } from '../src/db/pool.js';
import { StocksRepository } from '../src/stocks/stocks.repository.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Suivi des stocks (migration 0053) : CMM reconstituée et déclarée, stock
 * projeté « comme si l'on était à t ». Inventaires, réceptions et sorties
 * fabriqués à la main ; valeurs attendues calculées dans les commentaires.
 */
describe('suivi des stocks', () => {
  let base: BaseEphemere;
  let db: Pool;
  let repo: StocksRepository;
  let app: INestApplication;

  const site = (id: string, type: string) =>
    db.query(
      `INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, region, district, type_structure)
       VALUES ($1,$1,true,'NORD','D1',$2)`,
      [id, type],
    );
  const produit = async (id: string, code: string) => {
    await db.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ($1,$2,$1)`, [id, code]);
    await db.query(`INSERT INTO dqa.dim_produit_traceur (produit_code, libelle) VALUES ($1,$2)`, [code, `lib ${code}`]);
  };
  let n = 0;
  const inventaire = async (siteId: string, jour: string, prod: string, comptee: number, programme = 'P1') => {
    const id = `INV${++n}`;
    await db.query(
      `INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, programme_id, date_inventaire, statut, lot_id_source)
       VALUES ($1,$2,$3,$4::date,'fn',1)`,
      [id, siteId, programme, jour],
    );
    await db.query(
      `INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
       VALUES ($1,$2,'L',$3,$3,1)`,
      [id, prod, comptee],
    );
  };
  const mouvement = async (siteId: string, nature: string, jour: string, prod: string, qte: number) => {
    const id = `MV${++n}`;
    await db.query(
      `INSERT INTO dqa.fact_transaction (transaction_id, site_id, nature, programme_id, statut, date_confirmation, date_finalisation, lot_id_source)
       VALUES ($1,$2,$3,'P1','fn',$4::date,$4::date,1)`,
      [id, siteId, nature, jour],
    );
    await db.query(
      `INSERT INTO dqa.fact_ligne_transaction (ligne_id, transaction_id, produit_id, quantite, taille_conditionnement, issu_ajustement, lot_id_source)
       VALUES ($1,$2,$3,$4,1,false,1)`,
      [`${id}L`, id, prod, qte],
    );
  };
  const ligne = (lignes: LigneStock[], siteId: string, code: string) => {
    const l = lignes.find((x) => x.siteId === siteId && x.produitCode === code);
    if (!l) throw new Error(`${siteId} ${code} absent`);
    return l;
  };

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    db = base.pool;
    repo = new StocksRepository(db);
    await db.query(
      `INSERT INTO dqa.import_lot (nom_fichier, cycle_paqd, mois_paqd, mois_debut, mois_fin, statut, fenetre_debut, fenetre_fin)
       VALUES ('t.xlsx','2026-C3','2026-10','2026-10-01','2026-10-31','valide','2026-06-01','2026-10-10')`,
    );
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('P1','VIH'), ('P2','PALU')`);
    await site('S1', 'ESPC');
    await site('S2', 'District sanitaire');
    await produit('I1', 'T1');
    await produit('I2', 'T2');
    await produit('I3', 'T3');

    // T1 à S1 : inventaires mensuels ; à t = 10/10, fin = 29/09, début = le plus
    // proche de 29/09 - 90 = 01/07, soit le 30/06 (91 jours).
    await inventaire('S1', '2026-06-30', 'I1', 100);
    await inventaire('S1', '2026-07-31', 'I1', 80);
    await inventaire('S1', '2026-08-30', 'I1', 60);
    await inventaire('S1', '2026-09-29', 'I1', 50);
    await mouvement('S1', 'facture_fournisseur', '2026-08-10', 'I1', 40);
    await mouvement('S1', 'dispensation', '2026-07-15', 'I1', 20);
    await mouvement('S1', 'dispensation', '2026-09-10', 'I1', 25);
    await mouvement('S1', 'facture_fournisseur', '2026-10-05', 'I1', 10); // après la borne, connue à t
    await mouvement('S1', 'facture_fournisseur', '2026-10-20', 'I1', 100); // après t : ignorée

    // T2 à S1 : un seul inventaire → non calculable
    await inventaire('S1', '2026-09-29', 'I2', 30);
    // T3 à S1 : aucune sortie (compté stable) → sorties non positives
    await inventaire('S1', '2026-07-01', 'I3', 10, 'P2');
    await inventaire('S1', '2026-09-29', 'I3', 10, 'P2');

    // T1 au district S2 : la CMM déclarée compte les distributions
    await inventaire('S2', '2026-07-01', 'I1', 300);
    await inventaire('S2', '2026-09-29', 'I1', 120);
    await mouvement('S2', 'distribution', '2026-08-01', 'I1', 150);
    await mouvement('S2', 'dispensation', '2026-08-02', 'I1', 999);

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

  it('CMM reconstituée et déclarée sur les bornes 30/06 → 29/09, en jours réels', async () => {
    const { lignes } = await repo.suivi({ date: '2026-10-10' });
    const t1 = ligne(lignes, 'S1', 'T1');
    if (!t1.cmm.calculable) throw new Error('T1 doit être calculable');
    // sorties = 100 + 40 - 50 = 90 sur 91 jours → 90 / 91 × 30,4 = 30,1 ; déclarée 45 → 15,0
    expect(t1.cmm).toMatchObject({
      dateDebut: '2026-06-30', stockDebut: 100, jours: 91, nbMois: 3,
      receptions: 40, sortiesReconstituees: 90, declaree: 45, cmmReconstituee: 30.1, cmmDeclaree: 15,
    });
    expect(t1).toMatchObject({ dateFin: '2026-09-29', stockFin: 50, receptionsApresFin: 10 });
  });

  it('stock projeté à t : réception connue ajoutée, réception postérieure ignorée ; rupture et couverture', async () => {
    const { lignes } = await repo.suivi({ date: '2026-10-10' });
    const t1 = ligne(lignes, 'S1', 'T1');
    if (!t1.cmm.calculable) throw new Error('T1 doit être calculable');
    // 50 + 10 - 90/91 × 11 jours = 49,1 ; 0 atteint 61 jours après le 29/09 = 29/11
    expect(t1.cmm.stockProjete).toBe(49.1);
    expect(t1.cmm.dateRupture).toBe('2026-11-29');
    expect(t1.cmm.couvertureJours).toBe(50);
  });

  it('date t passée : un inventaire postérieur à t est ignoré', async () => {
    const { lignes } = await repo.suivi({ date: '2026-09-15' });
    const t1 = ligne(lignes, 'S1', 'T1');
    expect(t1.dateFin).toBe('2026-08-30');
    expect(t1.stockFin).toBe(60);
    expect(lignes.some((l) => l.produitCode === 'T2')).toBe(false); // inventorié le 29/09 seulement
  });

  it('non calculable : un seul inventaire, ou aucune sortie', async () => {
    const { lignes } = await repo.suivi({ date: '2026-10-10' });
    expect(ligne(lignes, 'S1', 'T2').cmm).toEqual({ calculable: false, raison: 'un_seul_inventaire' });
    expect(ligne(lignes, 'S1', 'T3').cmm).toEqual({ calculable: false, raison: 'sorties_non_positives' });
  });

  it('un district compte ses distributions ; programme parent = celui de l\'inventaire', async () => {
    const { lignes } = await repo.suivi({ date: '2026-10-10' });
    const d = ligne(lignes, 'S2', 'T1');
    if (!d.cmm.calculable) throw new Error('S2 T1 doit être calculable');
    expect(d.cmm.declaree).toBe(150);
    expect(ligne(lignes, 'S1', 'T3')).toMatchObject({ programmeId: 'P2', programmeNom: 'PALU' });
    expect(ligne(lignes, 'S1', 'T1').programmeNom).toBe('VIH');
  });

  it('API : date par défaut = fin de fenêtre du dernier import, filtre programme, contrat respecté', async () => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/connexion').send({ identifiant: 'lecteur', motDePasse: 'lecteur-2026' });
    const r = suiviStocksSchema.parse((await a.get('/api/stocks')).body);
    expect(r).toMatchObject({ date: '2026-10-10', dateParDefaut: '2026-10-10' });
    const p2 = suiviStocksSchema.parse((await a.get('/api/stocks').query({ programmeId: 'P2' })).body);
    expect(p2.lignes.map((l) => l.produitCode)).toEqual(['T3']);
    expect((await a.get('/api/stocks').query({ date: '10/10/2026' })).status).toBe(400);
  });
});
