import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  detailPilierSchema,
  detailSiteSchema,
  historiqueSiteSchema,
  methodeCalculSchema,
  syntheseNationaleSchema,
  tableauDeBordSchema,
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
    // fixture : P1 = 100 (réquisition du mois), P2 = 100 (inventaire le 29/08 + réquisition le 05/09
    // pour un ESPC, limite 5), P3 ALERTE (0), P5 = 100, P6 = 100.
    // P4 non calculable : la conformité SDU n'est pas retenue dans le score
    // (grille, migration 0057) et la conformité consommation ne l'est pas encore :
    // la fenêtre d'extraction s'arrête au 18/08, août n'est pas jugé (ADR 0022).
    // → (100·10 + 100·15 + 0·15 + 100·25 + 100·10) / 75 = 6000 / 75 = 80
    expect(Number(s.scoreComposite)).toBe(80);
    expect(s.classification).toBe('PARTIELLEMENT_CONFORME');
    expect(s.piliersCouverts).toBe(5);
    expect(s.scoresPiliers.map((p: { pilier: string }) => p.pilier).sort()).toEqual([
      'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
    ]);
  });

  it('renvoie un DetailSite conforme au contrat : six piliers, composite et classification', async () => {
    const a = await lecteur();
    const res = await a.get('/api/sites/SITE-1');
    expect(res.status).toBe(200);
    const detail = detailSiteSchema.parse(res.body);
    expect(detail.piliersCouverts).toBe(5); // P4 non calculable (voir plus haut)
    expect(detail.piliersTotal).toBe(6);
    expect(Number(detail.scoreComposite)).toBe(80);
    expect(detail.classification).toBe('PARTIELLEMENT_CONFORME');
    expect(detail.piliers.map((p) => p.pilier)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const p5 = detail.piliers.find((p) => p.pilier === 'P5')!;
    expect(p5.sousComposantes[0]?.sousComposante).toBe('concordance');
    expect(['CONFORME', 'ALERTE', 'NON_CALCULABLE']).toContain(p5.sousComposantes[0]?.statut);
    expect(p5.sousComposantes[0]?.seuil).not.toBeNull();
    const p3 = detail.piliers.find((p) => p.pilier === 'P3')!;
    expect(p3.sousComposantes[0]?.sousComposante).toBe('regularite_saisie');
    expect(p3.sousComposantes[0]?.statut).toBe('ALERTE');
    // P4 : écart SDU conforme ; écart consommation non calculable, août n'étant
    // pas encore jugé (fenêtre d'extraction close au 18/08, ADR 0022)
    const p4 = detail.piliers.find((p) => p.pilier === 'P4')!;
    expect(p4.sousComposantes.map((sc) => sc.sousComposante)).toEqual(['ecart_sdu', 'ecart_consommation']);
    expect(p4.sousComposantes[0]?.statut).toBe('CONFORME');
    expect(p4.sousComposantes[1]?.statut).toBe('NON_CALCULABLE');
    // composition de la grille : SDU mesurée mais non retenue, consommation seule
    expect(p4.sousComposantes[0]).toMatchObject({ retenue: false, poidsDansPilierPct: 0 });
    expect(p4.sousComposantes[1]).toMatchObject({ retenue: true, poidsDansPilierPct: 100 });
    // P1 : réquisitions conformes, réceptions NON_CALCULABLE (aucune facture) ;
    // l'inventaire a quitté P1 (ADR 0019)
    const p1 = detail.piliers.find((p) => p.pilier === 'P1')!;
    expect(p1.sousComposantes.map((sc) => sc.sousComposante)).toEqual([
      'completude_requisitions', 'completude_receptions',
    ]);
    expect(p1.sousComposantes[1]?.statut).toBe('NON_CALCULABLE');
    expect(p1.sousComposantes[1]?.raison).toContain('Aucune facture');
    // suivi des réceptions, hors score
    expect(detail.suiviReceptions.facturesEnAttente).toEqual([]);
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
    // une seule structure importée : SITE-1, PARTIELLEMENT CONFORME (composite 80 ;
    // P4 non calculable, voir plus haut)
    expect(s.national.nbSites).toBe(1);
    expect(s.national.nbMesures).toBe(1);
    expect(Number(s.national.scoreCompositeMoyen)).toBe(80);
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
    const pt = h.points[0]!;
    expect(pt.rang).toBe(4);
    expect(pt.moisPaqd).toBe('2026-08');
    // scoresPiliers ordonné P1..P6, valeurs des p_* gelés (P3 = régularité ALERTE)
    expect(pt.scoresPiliers.map((s) => s.pilier)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    expect(pt.scoresPiliers.find((s) => s.pilier === 'P3')?.score).toBe(0);
    expect(pt.scoresPiliers.find((s) => s.pilier === 'P1')?.score).toBe(100);
    expect(pt.piliersCouverts).toBe(5);
    // les neuf valeurs de sous-composante gelées, ordre du contrat, statut déduit du seuil
    expect(pt.sousComposantes.map((s) => s.sousComposante)).toEqual([
      'completude_requisitions', 'completude_receptions',
      'promptitude_inventaires', 'promptitude_requisitions', 'regularite_saisie',
      'ecart_sdu', 'ecart_consommation', 'concordance', 'ratio_ajustements',
    ]);
    const reg = pt.sousComposantes.find((s) => s.sousComposante === 'regularite_saisie')!;
    expect(reg.seuil).toBe(65);
    expect(reg.statut).toBe('ALERTE'); // 1 jour / 31 sous le seuil
    expect(typeof reg.valeur).toBe('number');
    const req = pt.sousComposantes.find((s) => s.sousComposante === 'completude_requisitions')!;
    expect(req.statut).toBe('CONFORME'); // 100 % >= 100
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
      expect(ligne.consommation).toMatchObject({ raison: 'sans_ouverture', compteAuDenominateur: false });
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

  // ── Transparence du calcul (ticket 04) ─────────────────────────────────────
  it('GET /api/sites/:id : la décomposition redonne exactement les scores affichés', async () => {
    const a = await lecteur();
    const detail = detailSiteSchema.parse((await a.get('/api/sites/SITE-1')).body);
    expect(detail.calcul?.grille.version).toBe('v1');
    expect(detail.calcul?.regles).toMatchObject({ borneConforme: 90, bornePartiellementConforme: 75 });
    for (const pil of detail.piliers) {
      const notes = pil.sousComposantes.filter((sc) => sc.retenue && sc.note !== null);
      if (pil.score === null) {
        expect(notes).toHaveLength(0);
        continue;
      }
      const poids = notes.reduce((t, sc) => t + sc.poidsDansPilierPct, 0);
      expect(pil.poidsCalculables).toBe(poids);
      const moyenne = notes.reduce((t, sc) => t + (sc.note ?? 0) * sc.poidsDansPilierPct, 0) / poids;
      expect(pil.score).toBeCloseTo(Math.round(moyenne * 10) / 10, 5);
    }
    const calculables = detail.piliers.filter((p) => p.score !== null);
    const poidsPiliers = calculables.reduce((t, p) => t + p.poids, 0);
    expect(detail.calcul?.poidsPiliersCalculables).toBe(poidsPiliers);
    const composite = calculables.reduce((t, p) => t + (p.score ?? 0) * p.poids, 0) / poidsPiliers;
    expect(detail.scoreComposite).toBeCloseTo(Math.round(composite * 10) / 10, 5);
    // poids des piliers lus dans la grille v1
    expect(detail.piliers.map((p) => p.poids)).toEqual([10, 15, 15, 25, 25, 10]);
  });

  it('GET /api/methode-calcul décrit la grille du mois', async () => {
    const a = await lecteur();
    const res = await a.get('/api/methode-calcul?mois=2026-08');
    expect(res.status).toBe(200);
    const m = methodeCalculSchema.parse(res.body);
    expect(m.moisPaqd).toBe('2026-08');
    expect(m.grille.version).toBe('v1');
    expect(m.piliers.map((p) => p.pilier)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const p4 = m.piliers.find((p) => p.pilier === 'P4')!;
    expect(p4.sousComposantes.map((sc) => [sc.sousComposante, sc.retenue, sc.poidsDansPilierPct])).toEqual([
      ['ecart_sdu', false, 0],
      ['ecart_consommation', true, 100],
    ]);
    expect(m.regles.joursClotureFinMois).toBe(3);
    // sans mois : dernier mois mesuré
    expect(methodeCalculSchema.parse((await a.get('/api/methode-calcul')).body).moisPaqd).toBe('2026-08');
    // un mois antérieur à toute grille
    await a.get('/api/methode-calcul?mois=2020-01').expect(404);
    await request(app.getHttpServer()).get('/api/methode-calcul').expect(401);
  });

  it('GET /api/methode-calcul suit la grille datée : une v2 décrit ses mois', async () => {
    const a = await lecteur();
    await base.pool.query(
      `INSERT INTO dqa.grille_parametre (version, effet_a_partir_de, jours_marge_jugement, note_sanction)
       VALUES ('v2', '2026-09-01', 5, 40)`,
    );
    try {
      await base.pool.query(
        `INSERT INTO dqa.grille_poids_pilier (grille_id, pilier, poids_pct)
         SELECT (SELECT id FROM dqa.grille_parametre WHERE version = 'v2'), pilier, poids_pct
         FROM dqa.grille_poids_pilier WHERE grille_id = dqa.grille_pour_mois('2026-08')`,
      );
      await base.pool.query(
        `INSERT INTO dqa.grille_seuil_sous_composante
           (grille_id, sous_composante, seuil, sens, unite, tolerance, seuil_district, retenue, poids_pct)
         SELECT (SELECT id FROM dqa.grille_parametre WHERE version = 'v2'), sous_composante, seuil, sens, unite,
                tolerance, seuil_district, retenue, poids_pct
         FROM dqa.grille_seuil_sous_composante WHERE grille_id = dqa.grille_pour_mois('2026-08')`,
      );
      const sept = methodeCalculSchema.parse((await a.get('/api/methode-calcul?mois=2026-09')).body);
      expect(sept.grille.version).toBe('v2');
      expect(sept.regles).toMatchObject({ joursMargeJugement: 5, noteSanction: 40 });
      // août garde la v1
      const aout = methodeCalculSchema.parse((await a.get('/api/methode-calcul?mois=2026-08')).body);
      expect(aout.grille.version).toBe('v1');
      expect(aout.regles).toMatchObject({ joursMargeJugement: 3, noteSanction: 0 });
    } finally {
      await base.pool.query(`DELETE FROM dqa.grille_parametre WHERE version = 'v2'`);
    }
  });

  it('GET /api/tableau-de-bord sert les règles de la grille du mois affiché', async () => {
    const a = await lecteur();
    const t = tableauDeBordSchema.parse((await a.get('/api/tableau-de-bord')).body);
    expect(t.regles).toMatchObject({ borneConforme: 90, bornePartiellementConforme: 75 });
  });

  it('paramètres de requête invalides : 400, jamais 500', async () => {
    const a = await lecteur();
    const refuses = [
      '/api/sites/SITE-1?mois=2026-13',
      '/api/sites/SITE-1?mois=août',
      '/api/sites/SITE-1/piliers/p4?mois=2026-00',
      '/api/sites/SITE-1/produits/T1?mois=26-08',
      '/api/methode-calcul?mois=2026-8',
      '/api/tableau-de-bord?mois=demain',
      '/api/synthese?mois=2026-13',
    ];
    for (const url of refuses) {
      const res = await a.get(url);
      expect(res.status, url).toBe(400);
    }
    // un programme vide vaut « tous programmes »
    expect((await a.get('/api/sites/SITE-1?programmeId=')).status).toBe(200);
  });
});
