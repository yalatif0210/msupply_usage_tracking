import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { vueStratesSchema } from '@dqa/contracts';
import { AppModule } from '../src/app.module.js';
import { closePool } from '../src/db/pool.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

describe('administration des strates de structure', () => {
  let base: BaseEphemere;
  let app: INestApplication;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    // Un site du périmètre avec un type de structure non seedé : il doit
    // remonter comme « à classer » sans jamais être ignoré.
    await base.pool.query(
      `INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, type_structure)
       VALUES ('S-INST', 'Institut X', true, 'Institut'),
              ('S-ESPC', 'ESPC Y',     true, 'ESPC'),
              ('S-HORS', 'Hors zone',  false, 'Clinique privée')`,
    );
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await closePool();
    await base.stop();
  });

  const agent = async (identifiant: string) => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/connexion').send({ identifiant, motDePasse: `${identifiant}-2026` });
    return a;
  };

  it('un lecteur consulte les correspondances seedées et les types à classer', async () => {
    const a = await agent('lecteur');
    const res = await a.get('/api/admin/strates');
    expect(res.status).toBe(200);
    const vue = vueStratesSchema.parse(res.body);

    expect(vue.mappings).toHaveLength(5); // référentiel consolidé (ADR 0013)
    const espc = vue.mappings.find((m) => m.typeStructure === 'ESPC');
    expect(espc).toMatchObject({ strate: 'ESPC', jourLimiteRequisition: 5, estDistrict: false });
    const district = vue.mappings.find((m) => m.typeStructure === 'District sanitaire');
    expect(district).toMatchObject({ strate: 'District', jourLimiteRequisition: 10, estDistrict: true });

    // « Institut » est présent dans un site du périmètre, sans correspondance.
    expect(vue.nonClasses).toContain('Institut');
    // « ESPC » est mappé : jamais listé comme non classé.
    expect(vue.nonClasses).not.toContain('ESPC');
    // Site hors périmètre : son type n'entre pas dans la liste.
    expect(vue.nonClasses).not.toContain('Clinique privée');
  });

  const corps = (over: Record<string, unknown> = {}) => ({
    strate: 'Institut',
    jourLimiteRequisition: 10,
    estDistrict: false,
    ...over,
  });

  it('un lecteur ne peut pas modifier (403)', async () => {
    const a = await agent('lecteur');
    await a.put('/api/admin/strates/Institut').send(corps()).expect(403);
    await a.delete('/api/admin/strates/ESPC').expect(403);
  });

  it('la coordination classe un type (strate + échéance + régime), le reclasse, puis le retire', async () => {
    const a = await agent('coordination');

    const ajout = await a.put('/api/admin/strates/Institut').send(corps({ jourLimiteRequisition: 8 }));
    expect(ajout.status).toBe(200);
    expect(ajout.body).toEqual({
      typeStructure: 'Institut',
      strate: 'Institut',
      jourLimiteRequisition: 8,
      estDistrict: false,
    });

    const apresAjout = await (await agent('lecteur')).get('/api/admin/strates');
    expect(apresAjout.body.nonClasses).not.toContain('Institut');

    // Upsert : la même clé écrase la strate, l'échéance et le régime.
    const reclasse = await a
      .put('/api/admin/strates/Institut')
      .send(corps({ strate: 'Non classé', estDistrict: true }));
    expect(reclasse.body).toMatchObject({ strate: 'Non classé', estDistrict: true });

    await a.delete('/api/admin/strates/Institut').expect(204);
    const apresRetrait = await (await agent('lecteur')).get('/api/admin/strates');
    expect(apresRetrait.body.nonClasses).toContain('Institut');
  });

  it('retirer une correspondance inconnue renvoie 404', async () => {
    const a = await agent('coordination');
    await a.delete('/api/admin/strates/JAMAIS-VU').expect(404);
  });

  it('un corps invalide est refusé (400)', async () => {
    const a = await agent('coordination');
    await a.put('/api/admin/strates/Institut').send(corps({ strate: '' })).expect(400);
    await a.put('/api/admin/strates/Institut').send({}).expect(400);
    await a.put('/api/admin/strates/Institut').send(corps({ jourLimiteRequisition: 0 })).expect(400);
    await a.put('/api/admin/strates/Institut').send(corps({ jourLimiteRequisition: 40 })).expect(400);
  });

  it('strate_de : correspondance seedée, sinon « Non classé »', async () => {
    // fonction SQL résolue en direct (consommée par les lectures nationales).
    const seede = await base.pool.query<{ s: string }>(`SELECT dqa.strate_de('ESPC') AS s`);
    expect(seede.rows[0]?.s).toBe('ESPC');

    const inconnu = await base.pool.query<{ s: string }>(`SELECT dqa.strate_de('Institut') AS s`);
    expect(inconnu.rows[0]?.s).toBe('Non classé');

    const nul = await base.pool.query<{ s: string }>(`SELECT dqa.strate_de(NULL) AS s`);
    expect(nul.rows[0]?.s).toBe('Non classé');

    await base.pool.query(
      `INSERT INTO dqa.strate_structure (type_structure, strate) VALUES ('Institut', 'Institut')
       ON CONFLICT (type_structure) DO UPDATE SET strate = EXCLUDED.strate`,
    );
    const apres = await base.pool.query<{ s: string }>(`SELECT dqa.strate_de('Institut') AS s`);
    expect(apres.rows[0]?.s).toBe('Institut');
    await base.pool.query(`DELETE FROM dqa.strate_structure WHERE type_structure = 'Institut'`);
  });
});
