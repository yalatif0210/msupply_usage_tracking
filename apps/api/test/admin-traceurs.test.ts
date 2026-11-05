import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { produitTraceurSchema } from '@dqa/contracts';
import { AppModule } from '../src/app.module.js';
import { closePool } from '../src/db/pool.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

describe('consultation des produits traceurs', () => {
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

  it("la liste n'est plus modifiable dans la console (alimentée par les imports)", async () => {
    const a = await agent('coordination');
    await a.put('/api/admin/traceurs/NOUVEAU').send({ libelle: 'x' }).expect(404);
    await a.delete('/api/admin/traceurs/3100014-ARV').expect(404);
    const apres = await a.get('/api/admin/traceurs');
    expect(apres.body.length).toBe(13);
  });

  // même ordre que rafraichir_et_geler : inventaires, produits, clôtures, puis P5 (migration 0062)
  const rafraichirP5 = async () => {
    for (const vue of ['mv_inventaire_mois', 'mv_p4_ecart_produit', 'mv_cloture_mois', 'mv_p5_concordance']) {
      await base.pool.query(`REFRESH MATERIALIZED VIEW dqa.${vue}`);
    }
  };

  it("désactiver un traceur le retire de P5 : sans traceur, l'inventaire ne clôture plus le mois", async () => {
    // socle minimal : un site du périmètre, un produit traceur, un inventaire
    // fenêtre d'extraction couvrant la clôture d'août et sa marge : le mois est jugé
    await base.pool.query(`INSERT INTO dqa.import_lot
        (nom_fichier, mois_paqd, mois_debut, mois_fin, cycle_paqd, statut, fenetre_debut, fenetre_fin)
      VALUES ('x','2026-08','2026-08-01','2026-08-31','2026-C2','valide','2026-08-01','2026-09-10')`);
    await base.pool.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('SX','x',true)`);
    await base.pool.query(`INSERT INTO dqa.dim_produit (produit_id, produit_code, produit_nom) VALUES ('IX','3100014-ARV','ARV')`);
    await base.pool.query(`INSERT INTO dqa.fact_inventaire (inventaire_id, site_id, date_inventaire, statut, lot_id_source)
      SELECT 'INVX','SX','2026-08-31','fn', id FROM dqa.import_lot WHERE nom_fichier='x'`);
    await base.pool.query(`INSERT INTO dqa.fact_inventaire_ligne (inventaire_id, produit_id, lot, quantite_theorique, quantite_comptee, lot_id_source)
      SELECT 'INVX','IX','L',100,100, id FROM dqa.import_lot WHERE nom_fichier='x'`);

    await rafraichirP5();
    const avant = await base.pool.query<{ taux_concordance_pct: string | null; nb_produits: number; sanction: boolean }>(
      `SELECT taux_concordance_pct, nb_produits, sanction FROM dqa.mv_p5_concordance
       WHERE site_id='SX' AND programme_id IS NULL AND mois_paqd = '2026-08'`,
    );
    expect(avant.rows[0]).toMatchObject({ nb_produits: 1, taux_concordance_pct: '100.0', sanction: false });

    // ce que fait un import dont l'onglet PRODUITS ne contient plus ce code
    await base.pool.query(`UPDATE dqa.dim_produit_traceur SET actif = false WHERE produit_code = '3100014-ARV'`);
    await rafraichirP5();
    // l'inventaire ne porte plus aucun traceur actif : il ne clôture plus le
    // mois, qui est jugé, d'où la sanction (ADR 0022)
    const apres = await base.pool.query<{ taux_concordance_pct: string | null; nb_produits: number; sanction: boolean; cause_cloture: string }>(
      `SELECT taux_concordance_pct, nb_produits, sanction, cause_cloture FROM dqa.mv_p5_concordance
       WHERE site_id='SX' AND programme_id IS NULL AND mois_paqd = '2026-08'`,
    );
    expect(apres.rows[0]).toMatchObject({ nb_produits: 0, taux_concordance_pct: '0.0', sanction: true, cause_cloture: 'sans_cloture' });
  });
});
