import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  detailPilierSchema,
  detailSiteSchema,
  historiqueSiteSchema,
  syntheseNationaleSchema,
} from '@dqa/contracts';
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
    // pour un ESPC, limite 5), P3 ALERTE (0), P5 = 100, P6 = 100.
    // P4 : SDU conforme (100) mais écart consommation à 0 % (un seul inventaire
    // du mois, pas de borne d'ouverture — ADR 0012) → P4 = 50.
    // → (100·10 + 100·15 + 0·15 + 50·25 + 100·25 + 100·10) / 100 = 7250 / 100 = 72.5
    expect(Number(s.scoreComposite)).toBe(72.5);
    expect(s.classification).toBe('NON_CONFORME');
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
    expect(Number(detail.scoreComposite)).toBe(72.5);
    expect(detail.classification).toBe('NON_CONFORME');
    expect(detail.piliers.map((p) => p.pilier)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const p5 = detail.piliers.find((p) => p.pilier === 'P5')!;
    expect(p5.sousComposantes[0]?.sousComposante).toBe('concordance');
    expect(['CONFORME', 'ALERTE', 'NON_CALCULABLE']).toContain(p5.sousComposantes[0]?.statut);
    expect(p5.sousComposantes[0]?.seuil).not.toBeNull();
    const p3 = detail.piliers.find((p) => p.pilier === 'P3')!;
    expect(p3.sousComposantes[0]?.sousComposante).toBe('regularite_saisie');
    expect(p3.sousComposantes[0]?.statut).toBe('ALERTE');
    // P4 : écart SDU conforme ; écart consommation à 0 % / ALERTE (un seul
    // inventaire du mois, pas de borne d'ouverture — ADR 0012)
    const p4 = detail.piliers.find((p) => p.pilier === 'P4')!;
    expect(p4.sousComposantes.map((sc) => sc.sousComposante)).toEqual(['ecart_sdu', 'ecart_consommation']);
    expect(p4.sousComposantes[0]?.statut).toBe('CONFORME');
    expect(p4.sousComposantes[1]?.statut).toBe('ALERTE');
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
    // une seule structure importée : SITE-1, NON CONFORME (composite 72,5 —
    // écart consommation à 0 % faute de borne d'ouverture, ADR 0012)
    expect(s.national.nbSites).toBe(1);
    expect(s.national.nbMesures).toBe(1);
    expect(Number(s.national.scoreCompositeMoyen)).toBe(72.5);
    expect(s.national.repartition.NON_CONFORME).toBe(1);
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
    const pt = h.points[0]!;
    expect(pt.rang).toBe(4);
    expect(pt.moisPaqd).toBe('2026-08');
    // scoresPiliers ordonné P1..P6, valeurs des p_* gelés (P3 = régularité ALERTE)
    expect(pt.scoresPiliers.map((s) => s.pilier)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    expect(pt.scoresPiliers.find((s) => s.pilier === 'P3')?.score).toBe(0);
    expect(pt.scoresPiliers.find((s) => s.pilier === 'P1')?.score).toBe(100);
    expect(pt.piliersCouverts).toBe(6);
    // les dix valeurs de sous-composante gelées, ordre du contrat, statut déduit du seuil
    expect(pt.sousComposantes.map((s) => s.sousComposante)).toEqual([
      'completude_inventaires', 'completude_requisitions', 'completude_receptions',
      'promptitude_inventaires', 'promptitude_requisitions', 'regularite_saisie',
      'ecart_sdu', 'ecart_consommation', 'concordance', 'ratio_ajustements',
    ]);
    const reg = pt.sousComposantes.find((s) => s.sousComposante === 'regularite_saisie')!;
    expect(reg.seuil).toBe(65);
    expect(reg.statut).toBe('ALERTE'); // 1 jour / 31 sous le seuil
    expect(typeof reg.valeur).toBe('number');
    const inv = pt.sousComposantes.find((s) => s.sousComposante === 'completude_inventaires')!;
    expect(inv.statut).toBe('CONFORME'); // 100 % >= 100
  });

  it('GET /api/sites/:id/historique : 404 hors périmètre, cycle absent → plus récent', async () => {
    const a = await lecteur();
    expect((await a.get('/api/sites/INCONNU/historique')).status).toBe(404);
    // cycle absent de la liste du site → retombe sur le plus récent
    const res = await a.get('/api/sites/SITE-1/historique').query({ cycle: '2025-C1' });
    expect(historiqueSiteSchema.parse(res.body).cyclePaqd).toBe('2026-C2');
  });

  it('GET /api/sites/:id/historique?programmeId= restreint la courbe au programme', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites/SITE-1/historique').query({ programmeId: 'PROG-1' });
    const h = historiqueSiteSchema.parse(res.body);
    expect(h.programmeId).toBe('PROG-1');
    expect(h.points.length).toBeGreaterThan(0);
  });

  it('GET /api/sites/:id/piliers/p4 rend la variante P4 (tableau produit P4 · P5) conforme au contrat', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites/SITE-1/piliers/p4');
    expect(res.status).toBe(200);
    const d = detailPilierSchema.parse(res.body);
    if (d.code !== 'p4') throw new Error('variante p4 attendue');
    expect(d.moisPaqd).toBe('2026-08');
    // un seul traceur inventorié (ARV001), un seul inventaire → conso non évaluable
    expect(d.produits).toHaveLength(1);
    const ligne = d.produits[0]!;
    expect(ligne.produitCode).toBe('ARV001');
    expect(ligne.sdu.conforme).toBe(true); // 300 = 300
    // concordance par produit = least/greatest = 100 % → conforme
    expect(ligne.concordance.tauxPct).toBe(100);
    expect(ligne.concordance.conforme).toBe(true);
    expect(ligne.consommation.evaluable).toBe(false);
    if (!ligne.consommation.evaluable) {
      expect(ligne.consommation.raisonExclusion).toBe('aucune_borne');
    }
    // la variante porte l'horodatage du gel et le drapeau de ré-import
    expect(d.calculeLe).not.toBeNull();
    expect(d.reimporteDepuisLeGel).toBe(false);
  });

  it('GET /api/sites/:id/piliers/p4 : 404 hors périmètre, filtre programme', async () => {
    const a = await lecteur();
    expect((await a.get('/api/sites/INCONNU/piliers/p4')).status).toBe(404);
    const res = await a.get('/api/sites/SITE-1/piliers/p4').query({ programmeId: 'PROG-1' });
    const d = detailPilierSchema.parse(res.body);
    if (d.code !== 'p4') throw new Error('variante p4 attendue');
    expect(d.programmeId).toBe('PROG-1');
    expect(d.produits).toHaveLength(1);
  });
});
