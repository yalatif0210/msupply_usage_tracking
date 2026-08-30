import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

describe('GET /api/sante', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('répond 200 avec un statut ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/sante');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ statut: 'ok', service: '@dqa/api', piliersConnus: 6 });
  });
});
