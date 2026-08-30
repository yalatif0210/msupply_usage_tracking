import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detailSiteSchema } from '@dqa/contracts';
import { AppModule } from '../src/app.module.js';
import { closePool } from '../src/db/pool.js';
import { construireClasseur, optionsValides } from './helpers/classeur.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

describe('API de lecture — sites et détail P5/P6', () => {
  let base: BaseEphemere;
  let app: INestApplication;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    // le produit de la fixture devient un traceur
    await base.pool.query(
      `INSERT INTO dqa.dim_produit_traceur (produit_code, libelle) VALUES ('ARV001', 'ARV')`,
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const coord = request.agent(app.getHttpServer());
    await coord.post('/api/auth/connexion').send({ identifiant: 'coordination', motDePasse: 'coordination-2026' });
    // deux inventaires bornants pour que P5 soit calculable et concordant
    const opts = optionsValides();
    opts.jeux.find((j) => j.nom === 'INVENTAIRE_LIGNES')!.lignes[0]!.quantite_comptee = '300';
    await coord.post('/api/imports').attach('fichier', construireClasseur(opts), 'lot.xlsx');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await closePool();
    await base.stop();
  });

  const lecteur = async () => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/connexion').send({ identifiant: 'lecteur', motDePasse: 'lecteur-2026' });
    return a;
  };

  it('exige une authentification', async () => {
    const res = await request(app.getHttpServer()).get('/api/sites');
    expect(res.status).toBe(401);
  });

  it('liste les sites du périmètre avec leur score composite (P3 + P5 + P6 renormalisés)', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const s = res.body[0];
    expect(s.site.siteId).toBe('SITE-1');
    // fixture : 1 dispensation (P3 ALERTE), P5 conforme, P6 conforme
    // → (0·15 + 100·25 + 100·10) / (15 + 25 + 10) = 3500 / 50 = 70
    expect(Number(s.scoreComposite)).toBe(70);
    expect(s.classification).toBe('NON_CONFORME');
    expect(s.scoresPiliers.map((p: { pilier: string }) => p.pilier).sort()).toEqual([
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
    ]);
  });

  it('renvoie un DetailSite conforme au contrat : six piliers, composite et classification', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites/SITE-1');
    expect(res.status).toBe(200);
    const detail = detailSiteSchema.parse(res.body);
    expect(detail.piliersCouverts).toBe(3); // P3, P5, P6 outillés
    expect(detail.piliersTotal).toBe(6);
    expect(Number(detail.scoreComposite)).toBe(70);
    expect(detail.classification).toBe('NON_CONFORME');
    expect(detail.piliers.map((p) => p.pilier)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const p5 = detail.piliers.find((p) => p.pilier === 'P5')!;
    expect(p5.sousComposantes[0]?.sousComposante).toBe('concordance');
    expect(['CONFORME', 'ALERTE', 'NON_CALCULABLE']).toContain(p5.sousComposantes[0]?.statut);
    expect(p5.sousComposantes[0]?.seuil).not.toBeNull();
    const p3 = detail.piliers.find((p) => p.pilier === 'P3')!;
    expect(p3.sousComposantes[0]?.sousComposante).toBe('regularite_saisie');
    expect(p3.sousComposantes[0]?.statut).toBe('ALERTE');
    // P1, P2, P4 pas encore outillés : score null, sous-composantes NON_CALCULABLE avec raison
    const p1 = detail.piliers.find((p) => p.pilier === 'P1')!;
    expect(p1.score).toBeNull();
    expect(p1.sousComposantes).toHaveLength(3);
    expect(p1.sousComposantes.every((sc) => sc.statut === 'NON_CALCULABLE' && sc.raison !== null)).toBe(true);
  });

  it('filtre le détail par programme', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites/SITE-1').query({ programmeId: 'PROG-1' });
    expect(res.status).toBe(200);
    expect(res.body.programmeId).toBe('PROG-1');
  });

  it('404 pour un site hors périmètre ou inconnu', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites/INCONNU');
    expect(res.status).toBe(404);
  });

  it('sert les référentiels programmes et districts', async () => {
    const a = await lecteur();
    const prog = await a.get('/api/referentiel/programmes');
    expect(prog.body.some((p: { programmeCode: string | null }) => p.programmeCode === 'VIH')).toBe(true);
    const dist = await a.get('/api/referentiel/districts');
    expect(dist.body).toContain('BONDOUKOU');
  });
});
