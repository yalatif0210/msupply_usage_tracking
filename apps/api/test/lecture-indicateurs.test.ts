import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detailSiteSchema, historiqueSiteSchema, syntheseNationaleSchema } from '@dqa/contracts';
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

  it('liste les sites du périmètre avec leur score composite (six piliers renormalisés)', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const s = res.body[0];
    expect(s.site.siteId).toBe('SITE-1');
    // fixture : P1 = 100, P2 = 100 (inventaire le 29/08 + réquisition le 05/09
    // pour un ESPC, limite 5), P3 ALERTE (0), P4 = 100, P5 = 100, P6 = 100
    // → (100·10 + 100·15 + 0·15 + 100·25 + 100·25 + 100·10) / 100 = 8500 / 100 = 85
    expect(Number(s.scoreComposite)).toBe(85);
    expect(s.classification).toBe('PARTIELLEMENT_CONFORME');
    expect(s.piliersCouverts).toBe(6);
    expect(s.scoresPiliers.map((p: { pilier: string }) => p.pilier).sort()).toEqual([
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
    ]);
  });

  it('renvoie un DetailSite conforme au contrat : six piliers, composite et classification', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites/SITE-1');
    expect(res.status).toBe(200);
    const detail = detailSiteSchema.parse(res.body);
    expect(detail.piliersCouverts).toBe(6); // les six piliers sont mesurés
    expect(detail.piliersTotal).toBe(6);
    expect(Number(detail.scoreComposite)).toBe(85);
    expect(detail.classification).toBe('PARTIELLEMENT_CONFORME');
    expect(detail.piliers.map((p) => p.pilier)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const p5 = detail.piliers.find((p) => p.pilier === 'P5')!;
    expect(p5.sousComposantes[0]?.sousComposante).toBe('concordance');
    expect(['CONFORME', 'ALERTE', 'NON_CALCULABLE']).toContain(p5.sousComposantes[0]?.statut);
    expect(p5.sousComposantes[0]?.seuil).not.toBeNull();
    const p3 = detail.piliers.find((p) => p.pilier === 'P3')!;
    expect(p3.sousComposantes[0]?.sousComposante).toBe('regularite_saisie');
    expect(p3.sousComposantes[0]?.statut).toBe('ALERTE');
    // P4 : écart SDU calculable (conforme), écart consommation NON_CALCULABLE (un seul inventaire)
    const p4 = detail.piliers.find((p) => p.pilier === 'P4')!;
    expect(p4.sousComposantes.map((sc) => sc.sousComposante)).toEqual(['ecart_sdu', 'ecart_consommation']);
    expect(p4.sousComposantes[0]?.statut).toBe('CONFORME');
    expect(p4.sousComposantes[1]?.statut).toBe('NON_CALCULABLE');
    // P1 : inventaires + réquisitions conformes, réceptions NON_CALCULABLE (aucune facture)
    const p1 = detail.piliers.find((p) => p.pilier === 'P1')!;
    expect(p1.sousComposantes.map((sc) => sc.sousComposante)).toEqual([
      'completude_inventaires', 'completude_requisitions', 'completude_receptions',
    ]);
    expect(p1.sousComposantes[2]?.statut).toBe('NON_CALCULABLE');
    expect(Number(p1.score)).toBe(100);
    // P2 : promptitude inventaires + réquisitions, toutes deux à l'heure
    const p2 = detail.piliers.find((p) => p.pilier === 'P2')!;
    expect(p2.sousComposantes.map((sc) => sc.sousComposante)).toEqual([
      'promptitude_inventaires', 'promptitude_requisitions',
    ]);
    expect(p2.sousComposantes[0]?.statut).toBe('CONFORME');
    expect(p2.sousComposantes[1]?.statut).toBe('CONFORME');
    expect(Number(p2.score)).toBe(100);
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

  it('sert les référentiels programmes, districts et régions', async () => {
    const a = await lecteur();
    const prog = await a.get('/api/referentiel/programmes');
    expect(prog.body.some((p: { programmeCode: string | null }) => p.programmeCode === 'VIH')).toBe(true);
    const dist = await a.get('/api/referentiel/districts');
    expect(dist.body).toContain('BONDOUKOU');
    const reg = await a.get('/api/referentiel/regions');
    expect(reg.body).toContain('GONTOUGO');
  });

  it('GET /api/synthese exige une authentification', async () => {
    const res = await request(app.getHttpServer()).get('/api/synthese');
    expect(res.status).toBe(401);
  });

  it('GET /api/synthese rend une synthèse conforme au contrat', async () => {
    const a = await lecteur();
    const res = await a.get('/api/synthese');
    expect(res.status).toBe(200);
    const s = syntheseNationaleSchema.parse(res.body);
    expect(s.moisPaqd).toBe('2026-08');
    expect(s.moisDisponibles).toContain('2026-08');
    // une seule structure importée : SITE-1, PARTIELLEMENT CONFORME (composite 85)
    expect(s.national.nbSites).toBe(1);
    expect(s.national.nbMesures).toBe(1);
    expect(Number(s.national.scoreCompositeMoyen)).toBe(85);
    expect(s.national.repartition.PARTIELLEMENT_CONFORME).toBe(1);
    expect(
      s.national.repartition.CONFORME +
        s.national.repartition.PARTIELLEMENT_CONFORME +
        s.national.repartition.NON_CONFORME +
        s.national.repartition.SANS_MESURE,
    ).toBe(s.national.nbSites);
    expect(s.national.moyennesPiliers.map((m) => m.pilier)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    // ventilation par district
    const bondoukou = s.parDistrict.find((d) => d.district === 'BONDOUKOU');
    expect(bondoukou?.nbSites).toBe(1);
    // scores par programme : VIH géré par SITE-1
    const vih = s.parProgramme.find((p) => p.programmeNom === 'VIH');
    expect(vih).toBeDefined();
    expect(vih?.nbSites).toBe(1);
  });

  it('GET /api/synthese?programmeId= restreint le national et les districts au programme', async () => {
    const a = await lecteur();
    const res = await a.get('/api/synthese').query({ programmeId: 'PROG-1' });
    expect(res.status).toBe(200);
    const s = syntheseNationaleSchema.parse(res.body);
    expect(s.programmeId).toBe('PROG-1');
    expect(s.national.nbSites).toBe(1); // SITE-1 gère PROG-1
    // la section « par programme » reste tous programmes
    expect(s.parProgramme.some((p) => p.programmeId === 'PROG-1')).toBe(true);
  });

  it('GET /api/synthese?region= restreint districts et programmes à la région', async () => {
    const a = await lecteur();
    const dedans = await a.get('/api/synthese').query({ region: 'GONTOUGO' });
    expect(syntheseNationaleSchema.parse(dedans.body).parDistrict.length).toBeGreaterThan(0);
    const dehors = await a.get('/api/synthese').query({ region: 'INEXISTANTE' });
    const s = syntheseNationaleSchema.parse(dehors.body);
    expect(s.parDistrict).toHaveLength(0);
    expect(s.parProgramme).toHaveLength(0);
  });

  it('GET /api/sites/:id/historique rend une progression conforme au contrat', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites/SITE-1/historique');
    expect(res.status).toBe(200);
    const h = historiqueSiteSchema.parse(res.body);
    expect(h.cyclePaqd).toBe('2026-C2');
    expect(h.cyclesDisponibles).toEqual(['2026-C2']);
    // un seul mois importé (2026-08 = M+4 du cycle C2)
    expect(h.points).toHaveLength(1);
    expect(h.points[0]?.rang).toBe(4);
    expect(h.points[0]?.scoresPiliers).toHaveLength(6);
  });

  it('GET /api/sites/:id/historique : 404 hors périmètre, cycle inconnu → plus récent', async () => {
    const a = await lecteur();
    expect((await a.get('/api/sites/INCONNU/historique')).status).toBe(404);
    const res = await a.get('/api/sites/SITE-1/historique').query({ cycle: 'BIDON' });
    expect(historiqueSiteSchema.parse(res.body).cyclePaqd).toBe('2026-C2');
  });

  it('GET /api/sites/:id/historique?programmeId= restreint la courbe au programme', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites/SITE-1/historique').query({ programmeId: 'PROG-1' });
    const h = historiqueSiteSchema.parse(res.body);
    expect(h.programmeId).toBe('PROG-1');
    expect(h.points.length).toBeGreaterThan(0);
  });
});
