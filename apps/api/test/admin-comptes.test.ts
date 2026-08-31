import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { compteAdminSchema } from '@dqa/contracts';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { ComptesRepository } from '../src/admin/comptes.repository.js';
import { closePool } from '../src/db/pool.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

describe('administration des comptes', () => {
  let base: BaseEphemere;
  let app: INestApplication;
  let repo: ComptesRepository;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    repo = moduleRef.get(ComptesRepository);
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await closePool();
    await base.stop();
  });

  // hashes de seed de la migration 0010 (mot de passe = `<identifiant>-2026`)
  const HASHES: Record<string, string> = {
    lecteur: 'scrypt$7afdfe7eb1827390c39a01400834e78d$abb0e078ce508b6700d3d06cf57054d1a05eb0bca7cd483353c5eeb7c58eabe2',
    coordination: 'scrypt$5eadaf1e798435216a21f23bd810b221$59654ac009b923639adb18a534e16d94d08f2b77c63a3746332325686576b62b',
    admin: 'scrypt$de00cf286e86ca62b95b2d7d7cc6fb30$67f49df229816010c8e1ff3bb423dadfcd199a590dc0462742c7aa4621ed13b3',
  };

  beforeEach(async () => {
    await base.pool.query(
      `DELETE FROM dqa.utilisateur WHERE identifiant NOT IN ('lecteur', 'coordination', 'admin')`,
    );
    for (const [identifiant, hash] of Object.entries(HASHES)) {
      await base.pool.query(
        `UPDATE dqa.utilisateur SET mot_de_passe_hash = $2, actif = true,
           role = CASE identifiant WHEN 'admin' THEN 'admin' WHEN 'coordination' THEN 'coordination' ELSE 'lecteur' END,
           nom = identifiant
         WHERE identifiant = $1`,
        [identifiant, hash],
      );
    }
  });

  const agent = async (identifiant: string, motDePasse = `${identifiant}-2026`) => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/connexion').send({ identifiant, motDePasse });
    return a;
  };
  const idDe = async (identifiant: string): Promise<string> =>
    (await base.pool.query<{ id: string }>(`SELECT id FROM dqa.utilisateur WHERE identifiant = $1`, [identifiant]))
      .rows[0]!.id;

  it('un coordination ne peut pas accéder aux comptes (403)', async () => {
    const a = await agent('coordination');
    await a.get('/api/admin/comptes').expect(403);
    await a.post('/api/admin/comptes').send({}).expect(403);
  });

  it('l\'admin liste les comptes, sans aucun hash', async () => {
    const a = await agent('admin');
    const res = await a.get('/api/admin/comptes');
    expect(res.status).toBe(200);
    z.array(compteAdminSchema).parse(res.body);
    expect(res.body).toHaveLength(3);
    for (const c of res.body) {
      expect(Object.keys(c).some((k) => /mot.?de.?passe|hash/i.test(k))).toBe(false);
    }
  });

  it('crée un compte utilisable pour se connecter, refuse le doublon', async () => {
    const a = await agent('admin');
    const creation = await a
      .post('/api/admin/comptes')
      .send({ identifiant: 'district-nord', nom: 'District Nord', role: 'lecteur', motDePasse: 'motdepasse123' });
    expect(creation.status).toBe(201);
    expect(creation.body).toMatchObject({ identifiant: 'district-nord', role: 'lecteur', actif: true });

    const nouveau = await agent('district-nord', 'motdepasse123');
    await nouveau.get('/api/auth/moi').expect(200);

    await a
      .post('/api/admin/comptes')
      .send({ identifiant: 'district-nord', nom: 'x', role: 'lecteur', motDePasse: 'autresecret' })
      .expect(409);
  });

  it('met à jour nom, rôle et état actif', async () => {
    const a = await agent('admin');
    const id = await idDe('coordination');
    const maj = await a
      .put(`/api/admin/comptes/${id}`)
      .send({ nom: 'Coordination (renommée)', role: 'lecteur', actif: false });
    expect(maj.status).toBe(200);
    expect(maj.body).toMatchObject({ nom: 'Coordination (renommée)', role: 'lecteur', actif: false });
  });

  it('l\'admin ne peut pas se désactiver ni se rétrograder', async () => {
    const a = await agent('admin');
    const id = await idDe('admin');
    await a.put(`/api/admin/comptes/${id}`).send({ nom: 'Admin', role: 'admin', actif: false }).expect(400);
    await a.put(`/api/admin/comptes/${id}`).send({ nom: 'Admin', role: 'lecteur', actif: true }).expect(400);
  });

  it('refuse de retirer le dernier administrateur actif', async () => {
    // règle US 17 : atteignable seulement hors de la garde « soi-même »
    // (appelant ≠ cible) → test au niveau repository.
    const adminId = await idDe('admin');
    const autreId = await idDe('coordination');
    await expect(
      repo.modifier(adminId, { nom: 'Admin', role: 'lecteur', actif: true }, autreId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('réinitialise le mot de passe', async () => {
    const a = await agent('admin');
    const id = await idDe('coordination');
    await a.post(`/api/admin/comptes/${id}/mot-de-passe`).send({ motDePasse: 'nouveaupass99' }).expect(204);

    await request(app.getHttpServer())
      .post('/api/auth/connexion')
      .send({ identifiant: 'coordination', motDePasse: 'coordination-2026' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/connexion')
      .send({ identifiant: 'coordination', motDePasse: 'nouveaupass99' })
      .expect(200);
  });
});
