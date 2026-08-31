import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { grilleDetailSchema, grilleParametreSchema, SOUS_COMPOSANTES } from '@dqa/contracts';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { closePool } from '../src/db/pool.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

describe('administration de la grille de paramètres', () => {
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

  beforeEach(async () => {
    await base.pool.query(`DELETE FROM dqa.grille_parametre WHERE version <> 'v1'`);
  });

  const agent = async (identifiant: string) => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/connexion').send({ identifiant, motDePasse: `${identifiant}-2026` });
    return a;
  };

  const SEUILS = SOUS_COMPOSANTES.map((sc) => ({
    sousComposante: sc,
    seuil: sc === 'ratio_ajustements' ? 5 : sc === 'regularite_saisie' ? 65 : 90,
    sens: sc === 'ratio_ajustements' ? ('inf' as const) : ('sup' as const),
    tolerance: sc === 'ecart_sdu' || sc === 'ecart_consommation' ? 2 : null,
  }));
  const POIDS = [
    { pilier: 'P1' as const, poidsPct: 10 },
    { pilier: 'P2' as const, poidsPct: 15 },
    { pilier: 'P3' as const, poidsPct: 15 },
    { pilier: 'P4' as const, poidsPct: 25 },
    { pilier: 'P5' as const, poidsPct: 25 },
    { pilier: 'P6' as const, poidsPct: 10 },
  ];
  const entree = (over: Record<string, unknown> = {}) => ({
    version: 'v2',
    effetAPartirDe: '2030-01-01',
    poids: POIDS,
    seuils: SEUILS,
    ...over,
  });

  it('la coordination liste les versions ; la v1 est en vigueur', async () => {
    const a = await agent('coordination');
    const res = await a.get('/api/admin/grille');
    expect(res.status).toBe(200);
    z.array(grilleParametreSchema).parse(res.body);
    const v1 = res.body.find((g: { version: string }) => g.version === 'v1');
    expect(v1.statut).toBe('en_vigueur');
    expect(v1.modifiable).toBe(false);
  });

  it('un lecteur ne peut ni lire ni écrire (403)', async () => {
    const a = await agent('lecteur');
    await a.get('/api/admin/grille').expect(403);
    await a.post('/api/admin/grille').send(entree()).expect(403);
  });

  it('crée une version future valide et la relit', async () => {
    const a = await agent('coordination');
    const res = await a.post('/api/admin/grille').send(entree());
    expect(res.status).toBe(201);
    const d = grilleDetailSchema.parse(res.body);
    expect(d.statut).toBe('planifiee');
    expect(d.modifiable).toBe(true);
    expect(d.poids).toHaveLength(6);

    const relu = await a.get(`/api/admin/grille/${d.id}`);
    expect(grilleDetailSchema.parse(relu.body).seuils).toHaveLength(SOUS_COMPOSANTES.length);
  });

  it('refuse une date d\'effet passée', async () => {
    const a = await agent('coordination');
    await a.post('/api/admin/grille').send(entree({ effetAPartirDe: '2020-01-01' })).expect(400);
  });

  it('refuse deux versions à la même date d\'effet (409)', async () => {
    const a = await agent('coordination');
    await a.post('/api/admin/grille').send(entree()).expect(201);
    await a.post('/api/admin/grille').send(entree({ version: 'v2bis' })).expect(409);
  });

  it('refuse une somme de poids ≠ 100', async () => {
    const a = await agent('coordination');
    const poids = POIDS.map((p, i) => (i === 0 ? { ...p, poidsPct: 50 } : p));
    await a.post('/api/admin/grille').send(entree({ poids })).expect(400);
  });

  it('refuse une tolérance manquante sur l\'écart SDU', async () => {
    const a = await agent('coordination');
    const seuils = SEUILS.map((s) => (s.sousComposante === 'ecart_sdu' ? { ...s, tolerance: null } : s));
    await a.post('/api/admin/grille').send(entree({ seuils })).expect(400);
  });

  it('modifie une version planifiée mais pas la v1 en vigueur', async () => {
    const a = await agent('coordination');
    const { body } = await a.post('/api/admin/grille').send(entree());
    const maj = await a.put(`/api/admin/grille/${body.id}`).send(entree({ version: 'v2-corrigee' }));
    expect(maj.status).toBe(200);
    expect(maj.body.version).toBe('v2-corrigee');

    const v1Id = (await a.get('/api/admin/grille')).body.find((g: { version: string }) => g.version === 'v1').id;
    await a.put(`/api/admin/grille/${v1Id}`).send(entree({ effetAPartirDe: '2031-01-01' })).expect(409);
  });

  it('supprime une version planifiée mais pas la v1', async () => {
    const a = await agent('coordination');
    const { body } = await a.post('/api/admin/grille').send(entree());
    await a.delete(`/api/admin/grille/${body.id}`).expect(204);
    const v1Id = (await a.get('/api/admin/grille')).body.find((g: { version: string }) => g.version === 'v1').id;
    await a.delete(`/api/admin/grille/${v1Id}`).expect(409);
  });

  it('créer une version future ne change pas un score déjà gelé (ADR 0003)', async () => {
    const a = await agent('coordination');
    await base.pool.query(
      `INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('SG','x',true)
       ON CONFLICT DO NOTHING`,
    );
    await base.pool.query(
      `INSERT INTO dqa.hist_score_site (site_id, mois_paqd, grille_id, score_composite, classification)
       SELECT 'SG', '2026-03', dqa.grille_pour_mois('2026-03'), 82.0, 'PARTIELLEMENT_CONFORME'`,
    );
    const avant = await base.pool.query(
      `SELECT grille_id, score_composite FROM dqa.hist_score_site WHERE site_id = 'SG' AND mois_paqd = '2026-03'`,
    );
    await a.post('/api/admin/grille').send(entree()).expect(201);
    const apres = await base.pool.query(
      `SELECT grille_id, score_composite FROM dqa.hist_score_site WHERE site_id = 'SG' AND mois_paqd = '2026-03'`,
    );
    expect(apres.rows[0]).toEqual(avant.rows[0]);
  });
});
