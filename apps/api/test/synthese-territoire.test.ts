import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syntheseTerritoireRapportsSchema, syntheseTerritoireScoresSchema } from '@dqa/contracts';
import { AppModule } from '../src/app.module.js';
import { closePool } from '../src/db/pool.js';
import { TerritoireRepository } from '../src/indicateurs/territoire.repository.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Synthèse nationale par territoire (migration 0051) : Région, zone de
 * district, site. Comptes bruts et scores gelés fabriqués à la main, comme
 * dans `synthese-rapports.test.ts`.
 */
describe('synthèse par territoire', () => {
  let base: BaseEphemere;
  let db: Pool;
  let repo: TerritoireRepository;
  let app: INestApplication;

  const site = (id: string, region: string | null, district: string | null, type: string) =>
    db.query(
      `INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, region, district, type_structure)
       VALUES ($1,$1,true,$2,$3,$4)`,
      [id, region, district, type],
    );
  /** Comptes figés d'un site pour un programme : réquisitions et inventaires. */
  const brut = async (
    siteId: string, mois: string,
    req: { attendu: number; realise: number; aLHeure: number },
    inv: { attendu: number; realise: number; aLHeure: number },
  ) => {
    for (const [mesure, a, r, h] of [
      ['p1_requisitions', req.attendu, req.realise, null],
      ['p2_requisitions', req.attendu, null, req.aLHeure],
      ['p2_inventaires', inv.attendu, inv.realise, inv.aLHeure],
    ] as const) {
      await db.query(
        `INSERT INTO dqa.hist_pilier_brut (site_id, mois_paqd, programme_id, mesure, nb_attendu, nb_realise, nb_a_lheure)
         VALUES ($1,$2,'VIH',$3,$4,$5,$6)`,
        [siteId, mois, mesure, a, r, h],
      );
    }
  };
  const score = (siteId: string, mois: string, composite: number | null, classification: string | null) =>
    db.query(
      `INSERT INTO dqa.hist_score_site (site_id, mois_paqd, programme_id, grille_id, score_composite, classification, p_completude, p_concordance)
       VALUES ($1,$2,NULL,1,$3,$4,$3,$3)`,
      [siteId, mois, composite, classification],
    );

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    db = base.pool;
    repo = new TerritoireRepository(db);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('VIH','VIH')`);
    // NORD : zone D1 (deux ESPC + le magasin du district), zone D2 (un hôpital)
    await site('E1', 'NORD', 'D1', 'ESPC');
    await site('E2', 'NORD', 'D1', 'ESPC');
    await site('DS1', 'NORD', 'D1', 'District sanitaire');
    await site('H2', 'NORD', 'D2', 'Hôpital de référence');
    // SUD : une zone où tout est à l'heure
    await site('E3', 'SUD', 'D3', 'ESPC');
    // sans région ni district dans mSupply
    await site('X1', null, null, 'ESPC');

    await brut('E1', '2026-08', { attendu: 2, realise: 2, aLHeure: 1 }, { attendu: 2, realise: 1, aLHeure: 1 });
    await brut('E2', '2026-08', { attendu: 2, realise: 0, aLHeure: 0 }, { attendu: 2, realise: 2, aLHeure: 0 });
    await brut('DS1', '2026-08', { attendu: 1, realise: 1, aLHeure: 1 }, { attendu: 1, realise: 1, aLHeure: 1 });
    await brut('H2', '2026-08', { attendu: 1, realise: 1, aLHeure: 1 }, { attendu: 1, realise: 1, aLHeure: 1 });
    await brut('E3', '2026-08', { attendu: 1, realise: 1, aLHeure: 1 }, { attendu: 1, realise: 1, aLHeure: 1 });
    await brut('X1', '2026-08', { attendu: 1, realise: 0, aLHeure: 0 }, { attendu: 1, realise: 0, aLHeure: 0 });

    await score('E1', '2026-08', 80, 'PARTIELLEMENT_CONFORME');
    await score('E2', '2026-08', 40, 'NON_CONFORME');
    await score('DS1', '2026-08', null, null); // non mesuré
    await score('H2', '2026-08', 95, 'CONFORME');
    await score('E3', '2026-08', 60, 'NON_CONFORME');
    await score('X1', '2026-08', 20, 'NON_CONFORME');

    await db.query(`REFRESH MATERIALIZED VIEW dqa.mv_synthese_territoire_rapports`);
    await db.query(`REFRESH MATERIALIZED VIEW dqa.mv_synthese_territoire_scores`);

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

  it('une zone compte tous ses sites, magasin du district compris ; la région est la somme de ses zones', async () => {
    const r = await repo.rapports({ mois: '2026-08' });
    const d1 = r.lignes.find((l) => l.niveau === 'zone' && l.district === 'D1')!;
    expect(d1.nbSites).toBe(3);
    expect(d1.requisitions).toEqual({ attendu: 5, realise: 3, aLHeure: 2, tauxRealise: 60, tauxALHeure: 40 });
    const nord = r.lignes.find((l) => l.niveau === 'region' && l.region === 'NORD')!;
    const zonesNord = r.lignes.filter((l) => l.niveau === 'zone' && l.region === 'NORD');
    expect(nord.requisitions.attendu).toBe(zonesNord.reduce((t, z) => t + z.requisitions.attendu, 0));
    expect(nord.inventaires.aLHeure).toBe(zonesNord.reduce((t, z) => t + z.inventaires.aLHeure, 0));
  });

  it('un site sans région ni district est regroupé sous « non renseigné », jamais écarté', async () => {
    const r = await repo.rapports({ mois: '2026-08' });
    expect(r.lignes.some((l) => l.niveau === 'region' && l.region === 'Région non renseignée')).toBe(true);
    expect(r.lignes.some((l) => l.niveau === 'zone' && l.district === 'District non renseigné')).toBe(true);
  });

  it('régions puis zones triées du plus faible taux de réquisitions à l\'heure au plus élevé', async () => {
    const r = await repo.rapports({ mois: '2026-08' });
    expect(r.lignes.filter((l) => l.niveau === 'region').map((l) => l.region))
      .toEqual(['Région non renseignée', 'NORD', 'SUD']); // 0 %, 50 %, 100 %
    // chaque région est suivie de ses zones
    expect(r.lignes.map((l) => (l.niveau === 'region' ? l.region : `  ${l.district}`)))
      .toEqual(['Région non renseignée', '  District non renseigné', 'NORD', '  D1', '  D2', 'SUD', '  D3']);
  });

  it('le filtre de strate ne garde que les sites de cette strate', async () => {
    const r = await repo.rapports({ mois: '2026-08', strate: 'ESPC' });
    const d1 = r.lignes.find((l) => l.niveau === 'zone' && l.district === 'D1')!;
    expect(d1.nbSites).toBe(2); // le magasin du district sort
    expect(r.lignes.some((l) => l.district === 'D2')).toBe(false); // zone sans ESPC
  });

  it('les sites d\'une zone se chargent au dépli et somment la zone', async () => {
    const sites = await repo.sitesRapports({ mois: '2026-08', region: 'NORD', district: 'D1' });
    expect(sites.map((s) => s.siteId).sort()).toEqual(['DS1', 'E1', 'E2']);
    expect(sites.reduce((t, s) => t + s.requisitions.attendu, 0)).toBe(5);
    expect(sites.find((s) => s.siteId === 'DS1')?.typeStructure).toBe('District sanitaire');
  });

  it('scores : moyenne de zone sur ses seuls sites mesurés, répartition, détail du site', async () => {
    const s = await repo.scores({ mois: '2026-08' });
    const d1 = s.lignes.find((l) => l.niveau === 'zone' && l.district === 'D1')!;
    expect(d1).toMatchObject({ nbSites: 3, nbMesures: 2, scoreCompositeMoyen: 60 });
    expect(d1.repartition).toEqual({ CONFORME: 0, PARTIELLEMENT_CONFORME: 1, NON_CONFORME: 1, SANS_MESURE: 1 });
    const sites = await repo.sitesScores({ mois: '2026-08', region: 'NORD', district: 'D1' });
    expect(sites.map((x) => x.siteId)).toEqual(['E2', 'E1', 'DS1']); // 40, 80, non mesuré
    expect(sites[0]).toMatchObject({ classification: 'NON_CONFORME', piliersCouverts: 2 });
  });

  it('un mois dont l\'échéance n\'est pas passée est signalé', async () => {
    const mois = (await db.query<{ m: string }>(`SELECT to_char(CURRENT_DATE, 'YYYY-MM') AS m`)).rows[0]!.m;
    await score('E1', mois, 50, 'NON_CONFORME');
    const r = await repo.rapports({ mois });
    expect(r).toMatchObject({ moisPaqd: mois, moisClos: false });
    expect(r.echeance).toMatch(/-10$/);
    expect(r.lignes).toEqual([]); // aucun compte figé avant l'échéance
    await db.query(`DELETE FROM dqa.hist_score_site WHERE mois_paqd = $1`, [mois]);
  });

  it('API : contrats respectés, sites d\'une zone exigent région et district', async () => {
    const a = request.agent(app.getHttpServer());
    await a.post('/api/auth/connexion').send({ identifiant: 'lecteur', motDePasse: 'lecteur-2026' });
    const r = await a.get('/api/synthese/territoire/rapports').query({ mois: '2026-08', region: 'NORD' });
    const vue = syntheseTerritoireRapportsSchema.parse(r.body);
    expect(vue.lignes.every((l) => l.region === 'NORD')).toBe(true);
    syntheseTerritoireScoresSchema.parse((await a.get('/api/synthese/territoire/scores').query({ mois: '2026-08' })).body);
    expect((await a.get('/api/synthese/territoire/rapports/sites').query({ mois: '2026-08' })).status).toBe(400);
    expect((await a.get('/api/synthese/territoire/strates')).body).toEqual(expect.arrayContaining(['ESPC']));
  });
});
