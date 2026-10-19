import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TAILLE_PAGE_PROGRAMMES_SITES,
  programmeSiteSchema,
  programmesDuSiteSchema,
  resultatDesactivationSchema,
  vueProgrammesSitesSchema,
} from '@dqa/contracts';
import { AppModule } from '../src/app.module.js';
import { closePool } from '../src/db/pool.js';
import { construireClasseur, optionsValides } from './helpers/classeur.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/** Programmes éligibles administrés dans la console (ADR 0020). */
describe('administration des programmes éligibles', () => {
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

  const agent = async (identifiant: string) => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/connexion').send({ identifiant, motDePasse: `${identifiant}-2026` });
    return a;
  };

  const importer = async (mutation: (o: ReturnType<typeof optionsValides>) => void = () => {}) => {
    const opts = optionsValides();
    mutation(opts);
    const a = await agent('coordination');
    const res = await a.post('/api/imports').attach('fichier', construireClasseur(opts), 'p.xlsx');
    expect(res.body.statut).toBe('valide');
  };

  const actif = async (programmeId: string) => {
    const { rows } = await base.pool.query<{ actif: boolean; origine: string }>(
      `SELECT actif, origine FROM dqa.dim_site_programme WHERE site_id = 'SITE-1' AND programme_id = $1`,
      [programmeId],
    );
    return rows[0];
  };

  it('un lecteur consulte la liste résumée puis les programmes d\'un site', async () => {
    await importer();
    const a = await agent('lecteur');
    const res = await a.get('/api/admin/programmes-sites');
    expect(res.status).toBe(200);
    const vue = vueProgrammesSitesSchema.parse(res.body);
    expect(vue).toMatchObject({ page: 1, taillePage: TAILLE_PAGE_PROGRAMMES_SITES, totalSites: 1 });
    expect(vue.sites[0]).toMatchObject({ siteId: 'SITE-1', nbProgrammes: 1, nbEligibles: 1, nbModifies: 0 });

    const det = programmesDuSiteSchema.parse((await a.get('/api/admin/programmes-sites/SITE-1')).body);
    expect(det.programmes[0]).toMatchObject({ programmeId: 'PROG-1', actif: true, origine: 'fichier' });
    expect((await a.get('/api/admin/programmes-sites/INCONNU')).status).toBe(404);
  });

  it('pagine et filtre côté serveur : recherche, district, sites à revoir', async () => {
    // 30 sites de plus, dont un seul porte un programme éligible sans activité
    const { pool } = base;
    await pool.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('PX','Projet X') ON CONFLICT DO NOTHING`);
    for (let i = 1; i <= 30; i++) {
      const id = `S${String(i).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO dqa.dim_site (site_id, site_nom, district, dans_perimetre_dqa) VALUES ($1,$2,$3,true)`,
        [id, `CSU ${id}`, i % 2 ? 'NORD' : 'SUD'],
      );
      if (i === 7) {
        await pool.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ($1,'PX',true)`, [id]);
      }
      await pool.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ($1,'PROG-1',false)`, [id]);
    }
    const a = await agent('lecteur');
    const p1 = vueProgrammesSitesSchema.parse((await a.get('/api/admin/programmes-sites')).body);
    expect(p1.totalSites).toBe(31);
    expect(p1.sites).toHaveLength(TAILLE_PAGE_PROGRAMMES_SITES);
    const p2 = vueProgrammesSitesSchema.parse((await a.get('/api/admin/programmes-sites').query({ page: 2 })).body);
    expect(p2.sites).toHaveLength(31 - TAILLE_PAGE_PROGRAMMES_SITES);
    // page au-delà de la dernière : retombe sur la dernière
    expect(vueProgrammesSitesSchema.parse((await a.get('/api/admin/programmes-sites').query({ page: 99 })).body).page).toBe(2);

    expect(vueProgrammesSitesSchema.parse((await a.get('/api/admin/programmes-sites').query({ district: 'NORD' })).body).totalSites).toBe(15);
    const projet = vueProgrammesSitesSchema.parse((await a.get('/api/admin/programmes-sites').query({ q: 'projet x' })).body);
    expect(projet.sites.map((s) => s.siteId)).toEqual(['S07']);
    const aRevoir = vueProgrammesSitesSchema.parse((await a.get('/api/admin/programmes-sites').query({ filtre: 'a_revoir' })).body);
    expect(aRevoir.sites.map((s) => s.siteId)).toContain('S07');
    expect(aRevoir.totalEligiblesSansActivite).toBeGreaterThanOrEqual(1);
  });

  it('un lecteur ne peut pas modifier (403)', async () => {
    const a = await agent('lecteur');
    await a.put('/api/admin/programmes-sites/SITE-1/PROG-1').send({ actif: false }).expect(403);
    await a.post('/api/admin/programmes-sites/S07/desactiver-sans-activite').expect(403);
  });

  it('un couple inconnu renvoie 404 : un couple naît d\'un import, jamais de la console', async () => {
    const a = await agent('coordination');
    await a.put('/api/admin/programmes-sites/SITE-1/INCONNU').send({ actif: false }).expect(404);
  });

  it('la désactivation groupée ne touche que les programmes éligibles sans activité', async () => {
    const a = await agent('coordination');
    const res = await a.post('/api/admin/programmes-sites/S07/desactiver-sans-activite');
    expect(resultatDesactivationSchema.parse(res.body)).toEqual({ nbDesactives: 1 });
    const { rows } = await base.pool.query<{ actif: boolean; origine: string; modifie_par: string }>(
      `SELECT actif, origine, modifie_par FROM dqa.dim_site_programme WHERE site_id = 'S07' AND programme_id = 'PX'`,
    );
    expect(rows[0]).toEqual({ actif: false, origine: 'application', modifie_par: 'coordination' });
  });

  it('un import n\'écrase pas un statut fixé dans la console', async () => {
    const a = await agent('coordination');
    const res = await a.put('/api/admin/programmes-sites/SITE-1/PROG-1').send({ actif: false });
    expect(res.status).toBe(200);
    expect(programmeSiteSchema.parse(res.body)).toMatchObject({
      actif: false, origine: 'application', modifiePar: 'coordination',
    });

    // Le fichier déclare toujours le programme actif.
    await importer();
    expect(await actif('PROG-1')).toEqual({ actif: false, origine: 'application' });
  });

  it('un couple nouveau du fichier entre avec le statut du fichier', async () => {
    await importer((o) => {
      const sp = o.jeux.find((j) => j.nom === 'SITE_PROGRAMME')!;
      sp.lignes.push({ site_id: 'SITE-1', programme_id: 'PROG-2', programme_code: 'PALU', programme_nom: 'Paludisme', actif: 'NON' });
      o.metadata['nb_lignes_SITE_PROGRAMME'] = String(sp.lignes.length);
    });
    expect(await actif('PROG-2')).toEqual({ actif: false, origine: 'fichier' });

    // Toujours d'origine fichier : un import suivant peut le réactiver.
    await importer((o) => {
      const sp = o.jeux.find((j) => j.nom === 'SITE_PROGRAMME')!;
      sp.lignes.push({ site_id: 'SITE-1', programme_id: 'PROG-2', programme_code: 'PALU', programme_nom: 'Paludisme', actif: 'OUI' });
      o.metadata['nb_lignes_SITE_PROGRAMME'] = String(sp.lignes.length);
    });
    expect(await actif('PROG-2')).toEqual({ actif: true, origine: 'fichier' });
  });

  it('la coordination lance le recalcul des scores', async () => {
    const a = await agent('coordination');
    await a.post('/api/admin/programmes-sites/recalcul').expect(204);
    const l = await agent('lecteur');
    await l.post('/api/admin/programmes-sites/recalcul').expect(403);
  });
});
