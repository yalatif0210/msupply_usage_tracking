import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { programmeSiteSchema, vueProgrammesSitesSchema } from '@dqa/contracts';
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

  it('un lecteur consulte les programmes du site avec leur activité', async () => {
    await importer();
    const a = await agent('lecteur');
    const res = await a.get('/api/admin/programmes-sites');
    expect(res.status).toBe(200);
    const vue = vueProgrammesSitesSchema.parse(res.body);
    const site = vue.sites.find((s) => s.siteId === 'SITE-1');
    expect(site?.programmes).toHaveLength(1);
    expect(site?.programmes[0]).toMatchObject({ programmeId: 'PROG-1', actif: true, origine: 'fichier' });
  });

  it('un lecteur ne peut pas modifier (403)', async () => {
    const a = await agent('lecteur');
    await a.put('/api/admin/programmes-sites/SITE-1/PROG-1').send({ actif: false }).expect(403);
  });

  it('un couple inconnu renvoie 404 : un couple naît d\'un import, jamais de la console', async () => {
    const a = await agent('coordination');
    await a.put('/api/admin/programmes-sites/SITE-1/INCONNU').send({ actif: false }).expect(404);
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
