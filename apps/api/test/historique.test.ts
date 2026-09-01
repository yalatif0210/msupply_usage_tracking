import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SOUS_COMPOSANTES } from '@dqa/contracts';
import { IndicateursRepository } from '../src/indicateurs/indicateurs.repository.js';
import { demarrerBaseEphemere, type BaseEphemere } from './helpers/db.js';

/**
 * Couture B — `v_mois_cycle` (rang M+1..M+4 depuis le calendrier) et lecture
 * jointe de `hist_score_site` pour la progression d'un site sur un cycle.
 */
describe('v_mois_cycle et lecture de progression', () => {
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
    await db.query(`TRUNCATE dqa.hist_score_site, dqa.dim_site_programme, dqa.dim_site,
      dqa.dim_programme, dqa.import_lot RESTART IDENTITY CASCADE`);
  });

  const hist = async (siteId: string, prog: string | null, mois: string, composite: number | null, classif: string | null, p1: number | null = null) =>
    db.query(
      `INSERT INTO dqa.hist_score_site
         (site_id, mois_paqd, programme_id, grille_id, p_completude, score_composite, classification)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [siteId, mois, prog, gid, p1, composite, classif],
    );

  it('v_mois_cycle donne le rang du mois dans son cycle', async () => {
    const { rows } = await db.query<{ mois_paqd: string; cycle_paqd: string; rang: number }>(
      `SELECT mois_paqd, cycle_paqd, rang FROM dqa.v_mois_cycle
       WHERE mois_paqd IN ('2026-05','2026-06','2026-07','2026-08','2026-04') ORDER BY mois_paqd`,
    );
    const par = Object.fromEntries(rows.map((r) => [r.mois_paqd, r]));
    expect(par['2026-05']).toMatchObject({ cycle_paqd: '2026-C2', rang: 1 });
    expect(par['2026-06']?.rang).toBe(2);
    expect(par['2026-07']?.rang).toBe(3);
    expect(par['2026-08']?.rang).toBe(4);
    expect(par['2026-04']).toMatchObject({ cycle_paqd: '2026-C1', rang: 4 });
  });

  const points = async (siteId: string, cycle: string, prog: string | null = null) => {
    const { rows } = await db.query<{
      mois_paqd: string; rang: number; score_composite: string | null;
      classification: string | null; piliers_couverts: number;
    }>(
      `SELECT h.mois_paqd, vmc.rang, h.score_composite, h.classification,
              ((h.p_completude IS NOT NULL)::int + (h.p_promptitude IS NOT NULL)::int
             + (h.p_regularite IS NOT NULL)::int + (h.p_ecart_sdu IS NOT NULL)::int
             + (h.p_concordance IS NOT NULL)::int + (h.p_ajustements IS NOT NULL)::int) AS piliers_couverts
       FROM dqa.hist_score_site h
       JOIN dqa.v_mois_cycle vmc ON vmc.mois_paqd = h.mois_paqd
       WHERE h.site_id = $1 AND h.programme_id IS NOT DISTINCT FROM $3 AND vmc.cycle_paqd = $2
       ORDER BY vmc.rang`,
      [siteId, cycle, prog],
    );
    return rows;
  };

  it('trace les mois mesurés du cycle, ordonnés par rang, le mois sans ligne absent', async () => {
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
    await hist('S1', null, '2026-05', 60, 'NON_CONFORME', 0);
    await hist('S1', null, '2026-06', 78, 'PARTIELLEMENT_CONFORME', 100);
    // 2026-07 : aucune ligne → trou
    await hist('S1', null, '2026-08', 92, 'CONFORME', 100);
    await hist('S1', null, '2026-04', 40, 'NON_CONFORME'); // cycle 2026-C1

    const c2 = await points('S1', '2026-C2');
    expect(c2.map((p) => p.rang)).toEqual([1, 2, 4]); // juillet absent, pas de zéro
    expect(c2.map((p) => Number(p.score_composite))).toEqual([60, 78, 92]);
    expect(c2[0]?.piliers_couverts).toBe(1); // seul p_completude renseigné (à 0)
    expect(c2[2]?.classification).toBe('CONFORME');

    const c1 = await points('S1', '2026-C1');
    expect(c1).toHaveLength(1);
    expect(c1[0]?.rang).toBe(4);
  });

  it('cyclesDisponibles = cycles du site, plus récent d\'abord', async () => {
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
    await hist('S1', null, '2026-08', 92, 'CONFORME');
    await hist('S1', null, '2026-04', 40, 'NON_CONFORME');
    const { rows } = await db.query<{ cycle_paqd: string }>(
      `SELECT DISTINCT vmc.cycle_paqd FROM dqa.hist_score_site h
       JOIN dqa.v_mois_cycle vmc ON vmc.mois_paqd = h.mois_paqd
       WHERE h.site_id = 'S1' AND h.programme_id IS NULL ORDER BY vmc.cycle_paqd DESC`,
    );
    expect(rows.map((r) => r.cycle_paqd)).toEqual(['2026-C2', '2026-C1']);
  });

  it('le filtre programme isole les lignes du programme', async () => {
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
    await db.query(`INSERT INTO dqa.dim_programme (programme_id, programme_nom) VALUES ('VIH','VIH')`);
    await hist('S1', null, '2026-06', 70, 'NON_CONFORME');
    await hist('S1', null, '2026-08', 90, 'CONFORME');
    await hist('S1', 'VIH', '2026-08', 55, 'NON_CONFORME');

    const tous = await points('S1', '2026-C2', null);
    expect(tous.map((p) => Number(p.score_composite))).toEqual([70, 90]);
    const vih = await points('S1', '2026-C2', 'VIH');
    expect(vih).toHaveLength(1);
    expect(Number(vih[0]?.score_composite)).toBe(55);
  });

  // ── v_sous_composante_atteinte ──────────────────────────────────────────
  const histAtteinte = async (nom: string, valeur: number | null) => {
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
    await db.query(
      `INSERT INTO dqa.hist_score_site (site_id, mois_paqd, programme_id, grille_id, ${'sc_' + nom})
       VALUES ('S1','2026-08',NULL,$1,$2)`,
      [gid, valeur],
    );
  };
  const atteinte = async (nom: string) => {
    const { rows } = await db.query<{ taux_atteinte: string | null; statut: string }>(
      `SELECT round(taux_atteinte, 1)::text AS taux_atteinte, statut
       FROM dqa.v_sous_composante_atteinte
       WHERE site_id = 'S1' AND mois_paqd = '2026-08' AND programme_id IS NULL AND sous_composante = $1`,
      [nom],
    );
    return rows[0]!;
  };

  it('taux d\'atteinte — seuil plancher (P3, seuil 65)', async () => {
    await histAtteinte('regularite_saisie', 52); // 52 / 65 = 0.8
    expect(await atteinte('regularite_saisie')).toEqual({ taux_atteinte: '80.0', statut: 'ALERTE' });
  });

  it('taux d\'atteinte — plancher borné à 100 au-dessus du seuil', async () => {
    await histAtteinte('regularite_saisie', 71);
    expect(await atteinte('regularite_saisie')).toEqual({ taux_atteinte: '100.0', statut: 'CONFORME' });
  });

  it('taux d\'atteinte — seuil plafond (P6, seuil 5)', async () => {
    await histAtteinte('ratio_ajustements', 8); // 5 / 8 = 0.625
    expect(await atteinte('ratio_ajustements')).toEqual({ taux_atteinte: '62.5', statut: 'ALERTE' });
  });

  it('taux d\'atteinte — plafond : sous le seuil (non nul) borné à 100', async () => {
    await histAtteinte('ratio_ajustements', 3); // 5 / 3 = 1.67 → borné à 1
    expect(await atteinte('ratio_ajustements')).toEqual({ taux_atteinte: '100.0', statut: 'CONFORME' });
  });

  it('taux d\'atteinte — plafond : 0 ajustement atteint le seuil au mieux', async () => {
    await histAtteinte('ratio_ajustements', 0);
    expect(await atteinte('ratio_ajustements')).toEqual({ taux_atteinte: '100.0', statut: 'CONFORME' });
  });

  it('taux d\'atteinte — P4 : la valeur gelée est reprise telle quelle', async () => {
    await histAtteinte('ecart_sdu', 95); // seuil 90, mais pas normalisé
    expect(await atteinte('ecart_sdu')).toEqual({ taux_atteinte: '95.0', statut: 'CONFORME' });
  });

  it('taux d\'atteinte — valeur absente → NULL / NON_CALCULABLE', async () => {
    await histAtteinte('concordance', null);
    expect(await atteinte('concordance')).toEqual({ taux_atteinte: null, statut: 'NON_CALCULABLE' });
  });

  // ── historiqueSite : plage de mois + sous-composantes par point ─────────
  const histPoint = async (mois: string, composite: number, reg: number) =>
    db.query(
      `INSERT INTO dqa.hist_score_site
         (site_id, mois_paqd, programme_id, grille_id, score_composite, classification,
          p_regularite, sc_regularite_saisie)
       VALUES ('S1',$1,NULL,$2,$3,'NON_CONFORME',0,$4)`,
      [mois, gid, composite, reg],
    );

  it('historiqueSite : une plage de/à traverse les cycles, points triés par mois', async () => {
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
    await histPoint('2026-04', 40, 30); // cycle 2026-C1
    await histPoint('2026-05', 55, 45); // cycle 2026-C2
    await histPoint('2026-08', 70, 71); // cycle 2026-C2

    const h = await new IndicateursRepository(db).historiqueSite('S1', { de: '2026-04', a: '2026-08' });
    expect(h?.cyclePaqd).toBeNull(); // plage libre, pas un cycle
    expect(h?.moisDisponibles).toEqual(['2026-08', '2026-05', '2026-04']);
    expect(h?.cyclesDisponibles).toEqual(['2026-C2', '2026-C1']);
    expect(h?.points.map((p) => p.moisPaqd)).toEqual(['2026-04', '2026-05', '2026-08']);

    const dernier = h!.points.at(-1)!;
    expect(dernier.sousComposantes.map((s) => s.sousComposante)).toEqual([...SOUS_COMPOSANTES]);
    const reg = dernier.sousComposantes.find((s) => s.sousComposante === 'regularite_saisie')!;
    expect(reg.valeur).toBe(71);
    expect(reg.tauxAtteinte).toBe(100); // 71 / 65 borné
    expect(reg.statut).toBe('CONFORME');
  });

  it('historiqueSite : sans de/à, retombe sur le cycle le plus récent', async () => {
    await db.query(`INSERT INTO dqa.dim_site (site_id, site_nom, dans_perimetre_dqa) VALUES ('S1','CSU',true)`);
    await histPoint('2026-04', 40, 30);
    await histPoint('2026-08', 70, 71);
    const h = await new IndicateursRepository(db).historiqueSite('S1', {});
    expect(h?.cyclePaqd).toBe('2026-C2');
    expect(h?.points.map((p) => p.moisPaqd)).toEqual(['2026-08']);
  });
});
