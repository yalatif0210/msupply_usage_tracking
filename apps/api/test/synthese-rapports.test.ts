import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IndicateursRepository } from '../src/indicateurs/indicateurs.repository.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Couture 1 — `mv_synthese_rapports` + `IndicateursRepository.syntheseRapports` :
 * agrégation par strate de structure des comptes P1 / P2 (réquisitions et
 * inventaires de fin de mois), contre des lignes `hist_pilier_brut` fabriquées
 * à la main (grain par programme géré, comme le figeage réel).
 */
describe('synthèse « rapports & inventaires »', () => {
  let base: BaseEphemere;
  let db: Pool;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    db = base.pool;
  }, 120_000);

  afterAll(async () => {
    await base.stop();
  });

  beforeEach(async () => {
    await db.query(`SET search_path TO dqa, public`);
    await db.query(`TRUNCATE dqa.hist_pilier_brut, dqa.fact_inventaire, dqa.dim_site_programme,
      dqa.dim_site, dqa.dim_programme, dqa.import_lot RESTART IDENTITY CASCADE`);
  });

  const site = async (
    id: string,
    region: string | null,
    typeStructure: string | null,
    perimetre = true,
  ) =>
    db.query(
      `INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, region, district, type_structure)
       VALUES ($1,$1,$2,$3,'D1',$4)`,
      [id, perimetre, region, typeStructure],
    );
  const programme = async (id: string) =>
    db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ($1,$1)`, [id]);
  const gere = async (siteId: string, prog: string) =>
    db.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ($1,$2,true)`, [siteId, prog]);

  /** Insère les trois mesures P1 / P2 d'un (site, programme, mois). */
  const brut = async (
    siteId: string,
    prog: string | null,
    mois: string,
    req: { attendu: number; realise: number; aLHeure: number },
    inv: { attendu: number; realise: number; aLHeure: number },
  ) => {
    const lignes: [string, number | null, number | null, number | null][] = [
      ['p1_requisitions', req.attendu, req.realise, null],
      ['p2_requisitions', req.attendu, null, req.aLHeure],
      ['p2_inventaires', inv.attendu, inv.realise, inv.aLHeure],
    ];
    for (const [mesure, a, r, h] of lignes) {
      await db.query(
        `INSERT INTO dqa.hist_pilier_brut
           (site_id, mois_paqd, programme_id, mesure, nb_attendu, nb_realise, nb_a_lheure)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [siteId, mois, prog, mesure, a, r, h],
      );
    }
    // Depuis l'ADR 0019, attendus, réalisés et à l'heure des inventaires
    // viennent tous trois de la mesure P2 gelée.
  };

  const rafraichir = () => db.query(`REFRESH MATERIALIZED VIEW dqa.mv_synthese_rapports`);
  const repo = () => new IndicateursRepository(db);

  /**
   * Socle : strate ESPC (S1 + S2, région NORD), strate « Hôpital de référence »
   * (S3, région SUD), « Non classé » (S4 type « Institut », région SUD), un
   * site hors périmètre.
   */
  const socle = async () => {
    await Promise.all([programme('VIH'), programme('TB')]);
    await site('S1', 'NORD', 'ESPC');
    await site('S2', 'NORD', 'ESPC');
    await site('S3', 'SUD', 'Hôpital de référence');
    await site('S4', 'SUD', 'Institut');
    await site('S5', 'NORD', 'ESPC', false); // hors périmètre
    await Promise.all([
      gere('S1', 'VIH'), gere('S1', 'TB'), gere('S2', 'VIH'),
      gere('S3', 'VIH'), gere('S4', 'VIH'), gere('S5', 'VIH'),
    ]);

    // S1 : VIH nominal (tout à l'heure), TB en retard ; + ligne agrégée programme NULL
    await brut('S1', 'VIH', '2026-08', { attendu: 1, realise: 1, aLHeure: 1 }, { attendu: 1, realise: 1, aLHeure: 1 });
    await brut('S1', 'TB', '2026-08', { attendu: 1, realise: 0, aLHeure: 0 }, { attendu: 1, realise: 1, aLHeure: 0 });
    await brut('S1', null, '2026-08', { attendu: 2, realise: 1, aLHeure: 1 }, { attendu: 2, realise: 2, aLHeure: 1 }); // ne doit PAS être compté
    // S2 : VIH, réquisition réalisée mais en retard
    await brut('S2', 'VIH', '2026-08', { attendu: 1, realise: 1, aLHeure: 0 }, { attendu: 1, realise: 1, aLHeure: 1 });
    // S3 (Hôpital de référence) : VIH nominal
    await brut('S3', 'VIH', '2026-08', { attendu: 1, realise: 1, aLHeure: 1 }, { attendu: 1, realise: 1, aLHeure: 1 });
    // S4 (Non classé) : VIH, rien réalisé
    await brut('S4', 'VIH', '2026-08', { attendu: 1, realise: 0, aLHeure: 0 }, { attendu: 1, realise: 0, aLHeure: 0 });
    // S5 hors périmètre : ignoré
    await brut('S5', 'VIH', '2026-08', { attendu: 9, realise: 9, aLHeure: 9 }, { attendu: 9, realise: 9, aLHeure: 9 });

    await rafraichir();
  };

  it('agrège par strate ; la ligne agrégée programme NULL n\'est pas comptée', async () => {
    await socle();
    const r = await repo().syntheseRapports({});
    expect(r.moisPaqd).toBe('2026-08');

    const cs = r.strates.find((l) => l.strate === 'ESPC');
    // ESPC = S1(VIH+TB) + S2(VIH) : réquisitions attendu 1+1+1 = 3
    expect(cs?.requisitions).toEqual({ attendu: 3, realise: 2, aLHeure: 1 });
    expect(cs?.inventaires).toEqual({ attendu: 3, realise: 3, aLHeure: 2 });

    const hg = r.strates.find((l) => l.strate === 'Hôpital de référence');
    expect(hg?.requisitions).toEqual({ attendu: 1, realise: 1, aLHeure: 1 });
  });

  it('range un type_structure non mappé sous « Non classé »', async () => {
    await socle();
    const r = await repo().syntheseRapports({});
    const nc = r.strates.find((l) => l.strate === 'Non classé');
    expect(nc).toBeDefined();
    expect(nc?.requisitions).toEqual({ attendu: 1, realise: 0, aLHeure: 0 });
  });

  it('la ligne de total est la somme des strates (pas une moyenne de moyennes)', async () => {
    await socle();
    const r = await repo().syntheseRapports({});
    // CS(3) + HG(1) + Non classé(1) = 5 réquisitions attendues
    expect(r.total.requisitions).toEqual({ attendu: 5, realise: 3, aLHeure: 2 });
    expect(r.total.inventaires).toEqual({ attendu: 5, realise: 4, aLHeure: 3 });
  });

  it('le filtre région ré-agrège sur les sites de la région', async () => {
    await socle();
    const nord = await repo().syntheseRapports({ region: 'NORD' });
    expect(nord.strates.map((l) => l.strate)).toEqual(['ESPC']);
    expect(nord.strates[0]?.requisitions).toEqual({ attendu: 3, realise: 2, aLHeure: 1 });
    expect(nord.total.requisitions).toEqual({ attendu: 3, realise: 2, aLHeure: 1 });

    const sud = await repo().syntheseRapports({ region: 'SUD' });
    expect(sud.strates.map((l) => l.strate).sort()).toEqual(['Hôpital de référence', 'Non classé']);
    expect(sud.total.requisitions).toEqual({ attendu: 2, realise: 1, aLHeure: 1 });
  });

  it('le filtre programme restreint aux comptes de ce programme géré', async () => {
    await socle();
    const vih = await repo().syntheseRapports({ programmeId: 'VIH' });
    const cs = vih.strates.find((l) => l.strate === 'ESPC');
    // ESPC sur VIH seul : S1(1) + S2(1) = 2 réquisitions attendues
    expect(cs?.requisitions).toEqual({ attendu: 2, realise: 2, aLHeure: 1 });

    const tb = await repo().syntheseRapports({ programmeId: 'TB' });
    const csTb = tb.strates.find((l) => l.strate === 'ESPC');
    expect(csTb?.requisitions).toEqual({ attendu: 1, realise: 0, aLHeure: 0 });
  });

  it('cas limite : une strate où tout est à l\'heure et une où rien n\'est réalisé', async () => {
    await Promise.all([programme('VIH'), programme('TB')]);
    await site('T1', 'NORD', 'CHU');
    await site('T2', 'NORD', 'District sanitaire');
    await Promise.all([gere('T1', 'VIH'), gere('T1', 'TB'), gere('T2', 'VIH')]);
    // CHU : deux programmes, réquisition et inventaire réalisés pile à l'heure.
    await brut('T1', 'VIH', '2026-08', { attendu: 1, realise: 1, aLHeure: 1 }, { attendu: 1, realise: 1, aLHeure: 1 });
    await brut('T1', 'TB', '2026-08', { attendu: 1, realise: 1, aLHeure: 1 }, { attendu: 1, realise: 1, aLHeure: 1 });
    // District : rien réalisé
    await brut('T2', 'VIH', '2026-08', { attendu: 3, realise: 0, aLHeure: 0 }, { attendu: 3, realise: 0, aLHeure: 0 });
    await rafraichir();

    const r = await repo().syntheseRapports({});
    const chu = r.strates.find((l) => l.strate === 'CHU');
    expect(chu?.requisitions).toEqual({ attendu: 2, realise: 2, aLHeure: 2 });
    expect(chu?.inventaires).toEqual({ attendu: 2, realise: 2, aLHeure: 2 });
    const chr = r.strates.find((l) => l.strate === 'District');
    expect(chr?.requisitions).toEqual({ attendu: 3, realise: 0, aLHeure: 0 });
  });

  it('une strate sans site pour le mois n\'a pas de ligne', async () => {
    await socle();
    const r = await repo().syntheseRapports({});
    expect(r.strates.some((l) => l.strate === 'CHU')).toBe(false);
    expect(r.strates.some((l) => l.strate === 'District')).toBe(false);
  });

  it('sans aucun compte gelé : mois null, strates vides, total à zéro', async () => {
    await rafraichir();
    const r = await repo().syntheseRapports({});
    expect(r.moisPaqd).toBeNull();
    expect(r.strates).toEqual([]);
    expect(r.total).toEqual({
      requisitions: { attendu: 0, realise: 0, aLHeure: 0 },
      inventaires: { attendu: 0, realise: 0, aLHeure: 0 },
    });
  });

  it('deux mois sont indépendants ; le plus récent par défaut', async () => {
    await Promise.all([programme('VIH')]);
    await site('S1', 'NORD', 'ESPC');
    await gere('S1', 'VIH');
    await brut('S1', 'VIH', '2026-07', { attendu: 1, realise: 0, aLHeure: 0 }, { attendu: 1, realise: 0, aLHeure: 0 });
    await brut('S1', 'VIH', '2026-08', { attendu: 1, realise: 1, aLHeure: 1 }, { attendu: 1, realise: 1, aLHeure: 1 });
    await rafraichir();

    const parDefaut = await repo().syntheseRapports({});
    expect(parDefaut.moisPaqd).toBe('2026-08');
    expect(parDefaut.strates[0]?.requisitions.realise).toBe(1);
    expect(parDefaut.moisDisponibles).toEqual(['2026-08', '2026-07']);

    const juillet = await repo().syntheseRapports({ mois: '2026-07' });
    expect(juillet.strates[0]?.requisitions.realise).toBe(0);
  });
});
