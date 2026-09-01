import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Couture B — `mv_synthese_nationale` : agrégation de `hist_score_site` en un
 * état national par mois PAQD (national / région / district / programme),
 * contre des lignes d'historique fabriquées à la main.
 */
describe('vue mv_synthese_nationale', () => {
  let base: BaseEphemere;
  let db: Pool;
  let gid: number;

  beforeAll(async () => {
    base = await demarrerBaseEphemere();
    db = base.pool;
    gid = (await db.query<{ id: number }>(`SELECT id FROM dqa.grille_parametre WHERE version = 'v1'`)).rows[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await base.stop();
  });

  beforeEach(async () => {
    await db.query(`SET search_path TO dqa, public`);
    await db.query(`TRUNCATE dqa.hist_score_site, dqa.dim_site_programme,
      dqa.dim_site, dqa.dim_programme, dqa.import_lot RESTART IDENTITY CASCADE`);
  });

  const site = async (id: string, region: string | null, district: string | null, perimetre = true) =>
    db.query(
      `INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa, region, district)
       VALUES ($1,$1,$2,$3,$4)`,
      [id, perimetre, region, district],
    );
  const programme = async (id: string) =>
    db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ($1,$1)`, [id]);
  const gere = async (siteId: string, prog: string) =>
    db.query(`INSERT INTO dqa.dim_site_programme (site_id, programme_id, actif) VALUES ($1,$2,true)`, [siteId, prog]);

  type Piliers = Partial<Record<
    'p_completude' | 'p_promptitude' | 'p_regularite' | 'p_ecart_sdu' | 'p_concordance' | 'p_ajustements',
    number
  >>;
  const hist = async (
    siteId: string,
    prog: string | null,
    mois: string,
    composite: number | null,
    classif: string | null,
    piliers: Piliers = {},
  ) =>
    db.query(
      `INSERT INTO dqa.hist_score_site
         (site_id, mois_paqd, programme_id, grille_id,
          p_completude, p_promptitude, p_regularite, p_ecart_sdu, p_concordance, p_ajustements,
          score_composite, classification)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        siteId, mois, prog, gid,
        piliers.p_completude ?? null, piliers.p_promptitude ?? null, piliers.p_regularite ?? null,
        piliers.p_ecart_sdu ?? null, piliers.p_concordance ?? null, piliers.p_ajustements ?? null,
        composite, classif,
      ],
    );

  const syn = async (
    prog: string | null,
    region: string | null,
    district: string | null,
    mois = '2026-08',
  ) => {
    const { rows } = await db.query<{
      nb_sites: number; nb_mesures: number;
      score_composite_moyen: string | null;
      nb_conforme: number; nb_partiellement_conforme: number;
      nb_non_conforme: number; nb_sans_mesure: number;
      moy_p_completude: string | null; moy_p_ajustements: string | null;
    }>(
      `SELECT nb_sites::int, nb_mesures::int, score_composite_moyen,
              nb_conforme::int, nb_partiellement_conforme::int,
              nb_non_conforme::int, nb_sans_mesure::int,
              moy_p_completude, moy_p_ajustements
       FROM dqa.mv_synthese_nationale
       WHERE mois_paqd = $1 AND coalesce(programme_id,'') = $2
         AND coalesce(region,'') = $3 AND coalesce(district,'') = $4`,
      [mois, prog ?? '', region ?? '', district ?? ''],
    );
    return rows[0];
  };

  /** Périmètre de référence des tests : 5 sites du périmètre + 1 hors périmètre. */
  const socle = async () => {
    await Promise.all([programme('VIH'), programme('TB')]);
    await site('S1', 'NORD', 'D1');
    await site('S2', 'NORD', 'D1');
    await site('S3', 'NORD', 'D2');
    await site('S4', 'SUD', 'D3');
    await site('S5', 'SUD', 'D3'); // périmètre, aucune ligne hist → SANS MESURE
    await site('S6', 'NORD', 'D1', false); // hors périmètre
    await Promise.all([
      gere('S1', 'VIH'), gere('S2', 'VIH'), gere('S3', 'VIH'), gere('S1', 'TB'),
    ]);
    // scores « tous programmes »
    await hist('S1', null, '2026-08', 95, 'CONFORME',
      { p_completude: 100, p_promptitude: 100, p_regularite: 100, p_ecart_sdu: 100, p_concordance: 100, p_ajustements: 0 });
    await hist('S2', null, '2026-08', 75, 'PARTIELLEMENT_CONFORME',
      { p_completude: 100, p_promptitude: 0, p_regularite: 0, p_ecart_sdu: 100, p_concordance: 100, p_ajustements: 100 });
    await hist('S3', null, '2026-08', 55, 'NON_CONFORME',
      { p_completude: 0, p_promptitude: 0, p_regularite: 0, p_ecart_sdu: 0, p_concordance: 0, p_ajustements: 100 });
    await hist('S4', null, '2026-08', null, null); // ligne présente, score non calculable
    await hist('S6', null, '2026-08', 10, 'NON_CONFORME'); // hors périmètre : doit être ignoré
    // scores par programme VIH
    await hist('S1', 'VIH', '2026-08', 90, 'CONFORME');
    await hist('S2', 'VIH', '2026-08', 70, 'NON_CONFORME');
    // S3 gère VIH mais aucune ligne VIH ; S1 gère TB mais aucune ligne TB
    await db.query(`REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale`);
  };

  it('national : compte les sites du périmètre, moyenne des scores non nuls', async () => {
    await socle();
    const n = await syn(null, null, null);
    expect(n?.nb_sites).toBe(5); // S1..S5, pas S6
    expect(n?.nb_mesures).toBe(3); // S1, S2, S3
    expect(n?.score_composite_moyen).toBe('75.0'); // avg(95, 75, 55)
    expect(n?.nb_conforme).toBe(1);
    expect(n?.nb_partiellement_conforme).toBe(1);
    expect(n?.nb_non_conforme).toBe(1);
    expect(n?.nb_sans_mesure).toBe(2); // S4 (score null) + S5 (aucune ligne)
    // somme des quatre comptes = nb_sites
    expect(n!.nb_conforme + n!.nb_partiellement_conforme + n!.nb_non_conforme + n!.nb_sans_mesure).toBe(5);
  });

  it('national : moyenne par pilier sur les valeurs non nulles', async () => {
    await socle();
    const n = await syn(null, null, null);
    expect(n?.moy_p_completude).toBe('66.7'); // avg(100, 100, 0)
    expect(n?.moy_p_ajustements).toBe('66.7'); // avg(0, 100, 100)
  });

  it('par district : agrège les sites du district, exclut le hors périmètre', async () => {
    await socle();
    const d1 = await syn(null, 'NORD', 'D1');
    expect(d1?.nb_sites).toBe(2); // S1, S2 (pas S6)
    expect(d1?.score_composite_moyen).toBe('85.0'); // avg(95, 75)
    const d2 = await syn(null, 'NORD', 'D2');
    expect(d2?.nb_sites).toBe(1);
    expect(d2?.score_composite_moyen).toBe('55.0');
    const d3 = await syn(null, 'SUD', 'D3');
    expect(d3?.nb_sites).toBe(2); // S4, S5
    expect(d3?.nb_mesures).toBe(0);
    expect(d3?.score_composite_moyen).toBeNull();
    expect(d3?.nb_sans_mesure).toBe(2);
  });

  it('par région : ré-agrège par site, pas une moyenne de moyennes de districts', async () => {
    await socle();
    const nord = await syn(null, 'NORD', null);
    // avg(95, 75, 55) = 75.0 ; la moyenne des districts serait avg(85, 55) = 70.0
    expect(nord?.score_composite_moyen).toBe('75.0');
    expect(nord?.nb_sites).toBe(3);
  });

  it('par programme : score national = moyenne des composites du programme sur les sites gérant', async () => {
    await socle();
    const vih = await syn('VIH', null, null);
    expect(vih?.nb_sites).toBe(3); // S1, S2, S3 gèrent VIH
    expect(vih?.nb_mesures).toBe(2); // S1, S2 ont une ligne VIH
    expect(vih?.score_composite_moyen).toBe('80.0'); // avg(90, 70)
    expect(vih?.nb_conforme).toBe(1);
    expect(vih?.nb_non_conforme).toBe(1);
    expect(vih?.nb_sans_mesure).toBe(1); // S3 gère VIH mais aucune ligne
  });

  it('par programme : un programme géré sans aucune mesure du mois produit une ligne à NULL', async () => {
    await socle();
    const tb = await syn('TB', null, null);
    expect(tb?.nb_sites).toBe(1); // S1 gère TB
    expect(tb?.nb_mesures).toBe(0);
    expect(tb?.score_composite_moyen).toBeNull();
    expect(tb?.nb_sans_mesure).toBe(1);
  });

  it('par programme et par district', async () => {
    await socle();
    const vihD1 = await syn('VIH', 'NORD', 'D1');
    expect(vihD1?.nb_sites).toBe(2); // S1, S2
    expect(vihD1?.score_composite_moyen).toBe('80.0'); // avg(90, 70)
  });

  it('deux mois gelés sont indépendants', async () => {
    await socle();
    await hist('S1', null, '2026-07', 50, 'NON_CONFORME');
    await db.query(`REFRESH MATERIALIZED VIEW dqa.mv_synthese_nationale`);
    const juil = await syn(null, null, null, '2026-07');
    expect(juil?.nb_mesures).toBe(1);
    expect(juil?.score_composite_moyen).toBe('50.0');
    // août inchangé
    expect((await syn(null, null, null, '2026-08'))?.score_composite_moyen).toBe('75.0');
  });

  it('rafraichir_et_geler rafraîchit aussi la synthèse', async () => {
    await socle();
    await db.query(
      `UPDATE dqa.hist_score_site SET score_composite = 88, classification = 'PARTIELLEMENT_CONFORME'
       WHERE site_id = 'S3' AND mois_paqd = '2026-08' AND programme_id IS NULL`,
    );
    await db.query(`CALL dqa.rafraichir_et_geler(999)`); // lot inexistant : refresh + return, sans erreur
    // national : avg(95, 75, 88) = 86.0
    expect((await syn(null, null, null))?.score_composite_moyen).toBe('86.0');
  });

  // ── mv_synthese_sous_composante ─────────────────────────────────────────
  type ColSc =
    | 'sc_regularite_saisie' | 'sc_ratio_ajustements' | 'sc_ecart_sdu' | 'sc_ecart_consommation';
  /** Ligne d'historique avec seulement les sc_* utiles renseignés. */
  const histSc = async (
    siteId: string,
    prog: string | null,
    mois: string,
    sc: Partial<Record<ColSc, number>>,
  ) =>
    db.query(
      `INSERT INTO dqa.hist_score_site
         (site_id, mois_paqd, programme_id, grille_id,
          sc_regularite_saisie, sc_ratio_ajustements, sc_ecart_sdu, sc_ecart_consommation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        siteId, mois, prog, gid,
        sc.sc_regularite_saisie ?? null, sc.sc_ratio_ajustements ?? null,
        sc.sc_ecart_sdu ?? null, sc.sc_ecart_consommation ?? null,
      ],
    );

  const parSc = async (
    nom: string, prog: string | null, region: string | null,
    district: string | null = null, mois = '2026-08',
  ) => {
    const { rows } = await db.query<{
      nb_conforme: number; nb_alerte: number; nb_non_calculable: number;
      taux_atteinte_moyen: string | null;
    }>(
      `SELECT nb_conforme::int, nb_alerte::int, nb_non_calculable::int, taux_atteinte_moyen
       FROM dqa.mv_synthese_sous_composante
       WHERE mois_paqd = $5 AND sous_composante = $1
         AND coalesce(programme_id,'') = $2 AND coalesce(region,'') = $3
         AND coalesce(district,'') = $4`,
      [nom, prog ?? '', region ?? '', district ?? '', mois],
    );
    return rows[0];
  };

  it('sous-composante : compte CONFORME / ALERTE / NON_CALCULABLE et moyenne le taux d\'atteinte', async () => {
    await site('S1', 'NORD', 'D1');
    await site('S2', 'NORD', 'D1');
    await site('S3', 'SUD', 'D3');
    await site('S9', 'NORD', 'D1', false); // hors périmètre
    await histSc('S1', null, '2026-08', { sc_regularite_saisie: 130, sc_ratio_ajustements: 0 }); // 130/65 borné à 1 → 100 ; ratio 0 → 100
    await histSc('S2', null, '2026-08', { sc_regularite_saisie: 52, sc_ratio_ajustements: 10 }); // 52/65 → 80 ALERTE ; 5/10 → 50 ALERTE
    await histSc('S3', null, '2026-08', { sc_ecart_sdu: 95, sc_ecart_consommation: 110 }); // regularite NULL ici
    await histSc('S9', null, '2026-08', { sc_regularite_saisie: 100 }); // hors périmètre : ignoré
    await db.query(`REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante`);

    const reg = await parSc('regularite_saisie', null, null);
    expect(reg?.nb_conforme).toBe(1); // S1
    expect(reg?.nb_alerte).toBe(1); // S2
    expect(reg?.nb_non_calculable).toBe(1); // S3
    expect(reg?.taux_atteinte_moyen).toBe('90.0'); // avg(100 borné, 80)

    const ratio = await parSc('ratio_ajustements', null, null);
    expect(ratio?.taux_atteinte_moyen).toBe('75.0'); // avg(100, 50)

    const sdu = await parSc('ecart_sdu', null, null);
    expect(sdu?.nb_conforme).toBe(1); // S3 : 95 >= 90, valeur reprise telle quelle
    expect(sdu?.taux_atteinte_moyen).toBe('95.0');

    const conso = await parSc('ecart_consommation', null, null);
    expect(conso?.nb_conforme).toBe(1); // S3 : 110 >= 90
    expect(conso?.taux_atteinte_moyen).toBe('100.0'); // 110 borné à 100
  });

  it('sous-composante : respecte le filtre région', async () => {
    await site('S1', 'NORD', 'D1');
    await site('S2', 'SUD', 'D3');
    await histSc('S1', null, '2026-08', { sc_regularite_saisie: 65 });
    await histSc('S2', null, '2026-08', { sc_regularite_saisie: 52 });
    await db.query(`REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante`);
    expect((await parSc('regularite_saisie', null, 'NORD'))?.nb_conforme).toBe(1);
    expect((await parSc('regularite_saisie', null, 'NORD'))?.nb_alerte).toBe(0);
    expect((await parSc('regularite_saisie', null, 'SUD'))?.nb_alerte).toBe(1);
  });

  it('sous-composante : la variante par programme ne voit que les sites gérant', async () => {
    await Promise.all([programme('VIH')]);
    await site('S1', 'NORD', 'D1');
    await site('S2', 'NORD', 'D1');
    await Promise.all([gere('S1', 'VIH'), gere('S2', 'VIH')]);
    await histSc('S1', 'VIH', '2026-08', { sc_regularite_saisie: 65 });
    // S2 gère VIH mais aucune ligne VIH → NON_CALCULABLE
    await db.query(`REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante`);
    const reg = await parSc('regularite_saisie', 'VIH', null);
    expect(reg?.nb_conforme).toBe(1);
    expect(reg?.nb_non_calculable).toBe(1);
  });

  it('sous-composante : deux mois sont indépendants', async () => {
    await site('S1', 'NORD', 'D1');
    await histSc('S1', null, '2026-08', { sc_regularite_saisie: 65 });
    await histSc('S1', null, '2026-07', { sc_regularite_saisie: 40 });
    await db.query(`REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante`);
    expect((await parSc('regularite_saisie', null, null, null, '2026-08'))?.nb_conforme).toBe(1);
    expect((await parSc('regularite_saisie', null, null, null, '2026-07'))?.nb_alerte).toBe(1);
  });

  it('sous-composante : le grain district est disponible', async () => {
    await site('S1', 'NORD', 'D1');
    await site('S2', 'NORD', 'D2');
    await histSc('S1', null, '2026-08', { sc_regularite_saisie: 65 });
    await histSc('S2', null, '2026-08', { sc_regularite_saisie: 40 });
    await db.query(`REFRESH MATERIALIZED VIEW dqa.mv_synthese_sous_composante`);
    expect((await parSc('regularite_saisie', null, 'NORD', 'D1'))?.nb_conforme).toBe(1);
    expect((await parSc('regularite_saisie', null, 'NORD', 'D2'))?.nb_alerte).toBe(1);
  });
});
