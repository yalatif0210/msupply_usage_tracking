import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { closePool } from '../src/db/pool.js';
import { construireClasseur, optionsValides } from './helpers/classeur.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

describe('import du classeur jusqu\'au staging', () => {
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

  const agentCoordination = async () => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/connexion').send({ identifiant: 'coordination', motDePasse: 'coordination-2026' });
    return a;
  };

  it('refuse le dépôt à un lecteur (403)', async () => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/connexion').send({ identifiant: 'lecteur', motDePasse: 'lecteur-2026' });
    const res = await a
      .post('/api/imports')
      .attach('fichier', construireClasseur(optionsValides()), 'lot.xlsx');
    expect(res.status).toBe(403);
  });

  it('accepte un classeur propre : staging alimenté, lot « validé »', async () => {
    const a = await agentCoordination();
    const res = await a
      .post('/api/imports')
      .attach('fichier', construireClasseur(optionsValides()), 'lot.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('valide');
    expect(res.body.lot.moisPaqd).toBe('2026-08');
    expect(res.body.lot.statut).toBe('valide');

    const sites = await base.pool.query('SELECT * FROM dqa.stg_sites');
    expect(sites.rowCount).toBe(1);
    expect(sites.rows[0].site_id).toBe('SITE-1');
    const lignes = await base.pool.query('SELECT * FROM dqa.stg_lignes_transactions');
    expect(lignes.rowCount).toBe(1);
    // et le core est promu
    const dimSite = await base.pool.query(
      `SELECT dans_perimetre_dqa FROM dqa.dim_site WHERE site_id = 'SITE-1'`,
    );
    expect(dimSite.rows[0].dans_perimetre_dqa).toBe(true);
    const tx = await base.pool.query(
      `SELECT nature FROM dqa.fact_transaction WHERE transaction_id = 'TX-1'`,
    );
    expect(tx.rows[0].nature).toBe('dispensation');
  });

  it('rejette un classeur au compteur METADATA faux : rien en staging', async () => {
    const a = await agentCoordination();
    const opts = optionsValides();
    opts.metadata['nb_lignes_SITES'] = '99';
    const res = await a.post('/api/imports').attach('fichier', construireClasseur(opts), 'faux.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('rejete');
    expect(res.body.motif).toContain('déclarée');
    expect(res.body.anomalies.length).toBeGreaterThan(0);
    expect(res.body.anomalies.some((x: { gravite: string }) => x.gravite === 'erreur')).toBe(true);

    const { rows } = await base.pool.query(
      `SELECT statut FROM dqa.import_lot WHERE nom_fichier = 'faux.xlsx'`,
    );
    expect(rows[0].statut).toBe('rejete');
    const staged = await base.pool.query(
      `SELECT count(*)::int AS c FROM dqa.stg_sites s
       JOIN dqa.import_lot l ON l.id = s.lot_id WHERE l.nom_fichier = 'faux.xlsx'`,
    );
    expect(staged.rows[0].c).toBe(0);
  });

  it('rejette un fichier illisible', async () => {
    const a = await agentCoordination();
    const res = await a
      .post('/api/imports')
      .attach('fichier', Buffer.from('ceci n\'est pas un xlsx'), 'poubelle.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('rejete');
  });

  it('journal : liste les lots et les anomalies d\'un lot', async () => {
    const a = await agentCoordination();
    const liste = await a.get('/api/imports');
    expect(liste.status).toBe(200);
    expect(Array.isArray(liste.body)).toBe(true);
    expect(liste.body.length).toBeGreaterThanOrEqual(3);

    const lotRejete = liste.body.find((l: { statut: string }) => l.statut === 'rejete');
    const ano = await a.get(`/api/imports/${lotRejete.id}/anomalies`);
    expect(ano.status).toBe(200);
    expect(ano.body[0].gravite).toBe('erreur');
  });
});
