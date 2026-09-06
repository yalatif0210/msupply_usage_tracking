import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { produitTraceurSchema } from '@dqa/contracts';
import { AppModule } from '../src/app.module.js';
import { closePool } from '../src/db/pool.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

describe('administration des produits traceurs', () => {
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

  it('un lecteur peut consulter la liste (13 traceurs seedés)', async () => {
    const a = await agent('lecteur');
    const res = await a.get('/api/admin/traceurs');
    expect(res.status).toBe(200);
    z.array(produitTraceurSchema).parse(res.body);
    expect(res.body.length).toBe(13);
  });

  it('un lecteur ne peut pas modifier (403)', async () => {
    const a = await agent('lecteur');
    await a.put('/api/admin/traceurs/NOUVEAU').send({ libelle: 'x' }).expect(403);
    await a.delete('/api/admin/traceurs/3100014-ARV').expect(403);
  });

  it('la coordination ajoute, désactive et retire un traceur', async () => {
    const a = await agent('coordination');

    const ajout = await a.put('/api/admin/traceurs/TEST-001').send({ libelle: 'Produit test' });
    expect(ajout.status).toBe(200);
    expect(ajout.body).toMatchObject({ produitCode: 'TEST-001', actif: true });

    const desactive = await a.put('/api/admin/traceurs/TEST-001').send({ actif: false });
    expect(desactive.body.actif).toBe(false);
    expect(desactive.body.libelle).toBe('Produit test'); // conservé

    await a.delete('/api/admin/traceurs/TEST-001').expect(204);
    const apres = await a.get('/api/admin/traceurs');
    expect(apres.body.some((t: { produitCode: string }) => t.produitCode === 'TEST-001')).toBe(false);
  });

  it('supprimer un code inconnu renvoie 404', async () => {
    const a = await agent('coordination');
    await a.delete('/api/admin/traceurs/JAMAIS-VU').expect(404);
  });

  it('désactiver un traceur le retire du calcul P5', async () => {
    const a = await agent('coordination');
    // socle minimal : un site du périmètre, un produit traceur, un inventaire
    await base.pool.query(`INSERT INTO dqa.import_lot (nom_fichier, mois_paqd, mois_debut, mois_fin, cycle_paqd, statut)
      VALUES ('x','2026-08','2026-08-01','2026-08-31','2026-C2','valide')`);
    await base.pool.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('SX','x',true)`);
    await base.pool.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ('IX','3100014-ARV','ARV')`);
    await base.pool.query(`INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, date_inventaire, statut, lot_id_source)
      SELECT 'INVX','SX','2026-08-20','fn', id FROM dqa.import_lot WHERE nom_fichier='x'`);
    await base.pool.query(`INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
      SELECT 'INVX','IX','L',100,100, id FROM dqa.import_lot WHERE nom_fichier='x'`);

    await base.pool.query(`REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance`);
    const avant = await base.pool.query<{ taux_concordance_pct: string | null; nb_produits: number }>(
      `SELECT taux_concordance_pct, nb_produits FROM dqa.mv_p5_concordance
       WHERE site_id='SX' AND programme_id IS NULL`,
    );
    expect(Number(avant.rows[0]?.nb_produits)).toBeGreaterThan(0);

    await a.put('/api/admin/traceurs/3100014-ARV').send({ actif: false });
    await base.pool.query(`REFRESH MATERIALIZED VIEW dqa.mv_p5_concordance`);
    // le site a un inventaire du mois (ligne forcée, ADR 0012) mais plus aucun
    // traceur exploitable → concordance NON_CALCULABLE, exclue de l'agrégat.
    const apres = await base.pool.query<{ taux_concordance_pct: string | null; nb_produits: number }>(
      `SELECT taux_concordance_pct, nb_produits FROM dqa.mv_p5_concordance
       WHERE site_id='SX' AND programme_id IS NULL`,
    );
    expect(Number(apres.rows[0]?.nb_produits)).toBe(0);
    expect(apres.rows[0]?.taux_concordance_pct).toBeNull();
  });
});
