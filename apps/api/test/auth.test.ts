import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { Roles } from '../src/auth/auth.metadata.js';
import { closePool } from '../src/db/pool.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

@Controller('zone-coordination')
class ZoneCoordinationController {
  @Roles(['coordination'])
  @Get()
  secret(): { ok: true } {
    return { ok: true };
  }
}

describe('authentification', () => {
  let base: BaseEphemere;
  let app: INestApplication;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ZoneCoordinationController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await closePool();
    await base.stop();
  });

  const connecter = (identifiant: string, motDePasse: string) =>
    request(app.getHttpServer()).post('/api/auth/connexion').send({ identifiant, motDePasse });

  it('refuse une route protégée à un visiteur anonyme (401)', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/moi');
    expect(res.status).toBe(401);
  });

  it('laisse passer la route de santé sans authentification', async () => {
    const res = await request(app.getHttpServer()).get('/api/sante');
    expect(res.status).toBe(200);
  });

  it('rejette de mauvais identifiants (401)', async () => {
    const res = await connecter('coordination', 'mauvais');
    expect(res.status).toBe(401);
  });

  it('connecte un utilisateur valide et pose un cookie de session httpOnly', async () => {
    const res = await connecter('lecteur', 'lecteur-2026');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ identifiant: 'lecteur', role: 'lecteur' });
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('dqa_session=');
    expect(cookie.toLowerCase()).toContain('httponly');
  });

  it('donne accès à /moi avec la session, refuse après déconnexion', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/auth/connexion').send({ identifiant: 'lecteur', motDePasse: 'lecteur-2026' });
    const moi = await agent.get('/api/auth/moi');
    expect(moi.status).toBe(200);
    expect(moi.body.identifiant).toBe('lecteur');

    await agent.post('/api/auth/deconnexion').expect(204);
    const apres = await agent.get('/api/auth/moi');
    expect(apres.status).toBe(401);
  });

  it('applique la garde de rôle : lecteur interdit (403), coordination admis (200)', async () => {
    const lecteur = request.agent(app.getHttpServer());
    await lecteur.post('/api/auth/connexion').send({ identifiant: 'lecteur', motDePasse: 'lecteur-2026' });
    await lecteur.get('/api/zone-coordination').expect(403);

    const coord = request.agent(app.getHttpServer());
    await coord.post('/api/auth/connexion').send({ identifiant: 'coordination', motDePasse: 'coordination-2026' });
    await coord.get('/api/zone-coordination').expect(200);
  });
});
