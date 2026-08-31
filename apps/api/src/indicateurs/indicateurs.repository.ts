import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  LIBELLES_PILIER,
  LIBELLES_SOUS_COMPOSANTE,
  POIDS_PILIER,
  SOUS_COMPOSANTES_DU_PILIER,
  type Classification,
  type DetailSite,
  type FiltreSites,
  type MesureSousComposante,
  type Pilier,
  type Programme,
  type ScorePilier,
  type ScoreSite,
  type Site,
  type SousComposante,
} from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';

interface LigneSite {
  site_id: string;
  site_code: string | null;
  site_nom: string;
  district: string | null;
  region: string | null;
  type_structure: string | null;
}

/** Colonnes de score de pilier gelées dans hist_score_site, dans l'ordre P1..P6. */
const COLONNES_PILIER: Record<Pilier, string> = {
  P1: 'p_completude',
  P2: 'p_promptitude',
  P3: 'p_regularite',
  P4: 'p_ecart_sdu',
  P5: 'p_concordance',
  P6: 'p_ajustements',
};

/** Raison affichée pour une sous-composante d'un pilier pas encore outillé. */
const RAISON_PILIER_NON_MESURE = 'Pilier pas encore mesuré sur ce site';

const versSite = (r: LigneSite): Site => ({
  siteId: r.site_id,
  siteCode: r.site_code,
  siteNom: r.site_nom,
  district: r.district,
  region: r.region,
  typeStructure: r.type_structure,
});

const nombreOuNull = (v: string | null): number | null => (v === null ? null : Number(v));

@Injectable()
export class IndicateursRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async programmes(): Promise<Programme[]> {
    const { rows } = await this.pool.query<{ programme_id: string; programme_code: string | null; programme_nom: string }>(
      `SELECT programme_id, programme_code, programme_nom FROM dqa.dim_programme ORDER BY programme_nom`,
    );
    return rows.map((r) => ({
      programmeId: r.programme_id,
      programmeCode: r.programme_code,
      programmeNom: r.programme_nom,
    }));
  }

  async districts(): Promise<string[]> {
    const { rows } = await this.pool.query<{ district: string }>(
      `SELECT DISTINCT district FROM dqa.dim_site
       WHERE dans_perimetre_dqa AND district IS NOT NULL ORDER BY district`,
    );
    return rows.map((r) => r.district);
  }

  async listerSites(filtres: FiltreSites): Promise<ScoreSite[]> {
    const cond: string[] = ['s.dans_perimetre_dqa'];
    const params: unknown[] = [];
    if (filtres.district) {
      params.push(filtres.district);
      cond.push(`s.district = $${params.length}`);
    }
    if (filtres.region) {
      params.push(filtres.region);
      cond.push(`s.region = $${params.length}`);
    }
    params.push(filtres.programmeId ?? null);
    const idxProg = params.length;
    if (filtres.programmeId) {
      cond.push(`EXISTS (SELECT 1 FROM dqa.dim_site_programme sp
        WHERE sp.site_id = s.site_id AND sp.programme_id = $${idxProg})`);
    }

    const { rows } = await this.pool.query<
      LigneSite & {
        mois_paqd: string | null;
        score_composite: string | null;
        classification: Classification | null;
        p_completude: string | null;
        p_promptitude: string | null;
        p_regularite: string | null;
        p_ecart_sdu: string | null;
        p_concordance: string | null;
        p_ajustements: string | null;
      }
    >(
      `WITH dernier AS (
         SELECT h.site_id, max(h.mois_paqd) AS mois_paqd
         FROM dqa.hist_score_site h
         WHERE h.programme_id IS NOT DISTINCT FROM $${idxProg}
         GROUP BY h.site_id
       )
       SELECT s.site_id, s.site_code, s.site_nom, s.district, s.region, s.type_structure,
              d.mois_paqd, h.score_composite, h.classification,
              h.p_completude, h.p_promptitude, h.p_regularite,
              h.p_ecart_sdu, h.p_concordance, h.p_ajustements
       FROM dqa.dim_site s
       LEFT JOIN dernier d ON d.site_id = s.site_id
       LEFT JOIN dqa.hist_score_site h
              ON h.site_id = s.site_id AND h.mois_paqd = d.mois_paqd
             AND h.programme_id IS NOT DISTINCT FROM $${idxProg}
       WHERE ${cond.join(' AND ')}
       ORDER BY h.score_composite ASC NULLS LAST, s.site_nom`,
      params,
    );

    return rows.map((r) => ({
      site: versSite(r),
      moisPaqd: r.mois_paqd,
      scoreComposite: nombreOuNull(r.score_composite),
      classification: r.classification,
      scoresPiliers: [
        { pilier: 'P1', score: nombreOuNull(r.p_completude) },
        { pilier: 'P2', score: nombreOuNull(r.p_promptitude) },
        { pilier: 'P3', score: nombreOuNull(r.p_regularite) },
        { pilier: 'P4', score: nombreOuNull(r.p_ecart_sdu) },
        { pilier: 'P5', score: nombreOuNull(r.p_concordance) },
        { pilier: 'P6', score: nombreOuNull(r.p_ajustements) },
      ],
    }));
  }

  async detailSite(
    siteId: string,
    moisDemande: string | undefined,
    programmeId: string | undefined,
  ): Promise<DetailSite | null> {
    const site = await this.pool.query<LigneSite>(
      `SELECT site_id, site_code, site_nom, district, region, type_structure
       FROM dqa.dim_site WHERE site_id = $1 AND dans_perimetre_dqa`,
      [siteId],
    );
    if (site.rowCount === 0) return null;
    const siteRow = site.rows[0]!;

    const prog = programmeId ?? null;
    const moisRows = await this.pool.query<{ mois_paqd: string }>(
      `SELECT DISTINCT mois_paqd FROM dqa.hist_score_site
       WHERE site_id = $1 AND programme_id IS NOT DISTINCT FROM $2
       ORDER BY mois_paqd DESC`,
      [siteId, prog],
    );
    const moisDisponibles = moisRows.rows.map((r) => r.mois_paqd);
    const mois =
      moisDemande && moisDisponibles.includes(moisDemande) ? moisDemande : moisDisponibles[0];

    if (!mois) {
      return {
        site: versSite(siteRow),
        moisPaqd: null,
        moisDisponibles: [],
        programmeId: prog,
        piliersCouverts: 0,
        piliersTotal: 6,
        scoreComposite: null,
        classification: null,
        piliers: [],
      };
    }

    const { rows } = await this.pool.query<{
      score_composite: string | null;
      classification: Classification | null;
      p_completude: string | null;
      p_promptitude: string | null;
      p_regularite: string | null;
      p_ecart_sdu: string | null;
      p_concordance: string | null;
      p_ajustements: string | null;
      completude_inventaires_pct: string | null;
      completude_requisitions_pct: string | null;
      completude_receptions_pct: string | null;
      score_inventaires: string | null;
      score_requisitions: string | null;
      score_receptions: string | null;
      taux_regularite_pct: string | null;
      taux_sdu_pct: string | null;
      taux_conso_pct: string | null;
      score_sdu: string | null;
      score_conso: string | null;
      taux_concordance_pct: string | null;
      ratio_ajustements_pct: string | null;
      seuil_completude: string | null;
      seuil_regularite: string | null;
      seuil_ecart_sdu: string | null;
      seuil_ecart_conso: string | null;
      seuil_concordance: string | null;
      seuil_ajustements: string | null;
    }>(
      `SELECT h.score_composite, h.classification,
              h.p_completude, h.p_promptitude, h.p_regularite,
              h.p_ecart_sdu, h.p_concordance, h.p_ajustements,
              p1.completude_inventaires_pct, p1.completude_requisitions_pct, p1.completude_receptions_pct,
              p1.score_inventaires, p1.score_requisitions, p1.score_receptions,
              p3.taux_regularite_pct,
              p4.taux_sdu_pct, p4.taux_conso_pct, p4.score_sdu, p4.score_conso,
              p5.taux_concordance_pct, p6.ratio_ajustements_pct,
              sc1.seuil AS seuil_completude,
              sc3.seuil AS seuil_regularite,
              sc4s.seuil AS seuil_ecart_sdu, sc4c.seuil AS seuil_ecart_conso,
              sc5.seuil AS seuil_concordance, sc6.seuil AS seuil_ajustements
       FROM dqa.hist_score_site h
       LEFT JOIN dqa.mv_p1_completude p1
              ON p1.site_id = h.site_id AND p1.mois_paqd = h.mois_paqd
             AND p1.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.mv_p3_regularite p3
              ON p3.site_id = h.site_id AND p3.mois_paqd = h.mois_paqd
             AND p3.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.mv_p4_ecart p4
              ON p4.site_id = h.site_id AND p4.mois_paqd = h.mois_paqd
             AND p4.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.mv_p5_concordance p5
              ON p5.site_id = h.site_id AND p5.mois_paqd = h.mois_paqd
             AND p5.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.mv_p6_ajustements p6
              ON p6.site_id = h.site_id AND p6.mois_paqd = h.mois_paqd
             AND p6.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.grille_seuil_sous_composante sc1
              ON sc1.grille_id = h.grille_id AND sc1.sous_composante = 'completude_inventaires'
       LEFT JOIN dqa.grille_seuil_sous_composante sc3
              ON sc3.grille_id = h.grille_id AND sc3.sous_composante = 'regularite_saisie'
       LEFT JOIN dqa.grille_seuil_sous_composante sc4s
              ON sc4s.grille_id = h.grille_id AND sc4s.sous_composante = 'ecart_sdu'
       LEFT JOIN dqa.grille_seuil_sous_composante sc4c
              ON sc4c.grille_id = h.grille_id AND sc4c.sous_composante = 'ecart_consommation'
       LEFT JOIN dqa.grille_seuil_sous_composante sc5
              ON sc5.grille_id = h.grille_id AND sc5.sous_composante = 'concordance'
       LEFT JOIN dqa.grille_seuil_sous_composante sc6
              ON sc6.grille_id = h.grille_id AND sc6.sous_composante = 'ratio_ajustements'
       WHERE h.site_id = $1 AND h.mois_paqd = $2 AND h.programme_id IS NOT DISTINCT FROM $3`,
      [siteId, mois, prog],
    );
    const h = rows[0];

    const scoresPiliers: Record<Pilier, string | null> = {
      P1: h?.p_completude ?? null,
      P2: h?.p_promptitude ?? null,
      P3: h?.p_regularite ?? null,
      P4: h?.p_ecart_sdu ?? null,
      P5: h?.p_concordance ?? null,
      P6: h?.p_ajustements ?? null,
    };

    const piliers: ScorePilier[] = [
      this.pilierP1(scoresPiliers.P1, {
        seuil: h?.seuil_completude ?? null,
        invPct: h?.completude_inventaires_pct ?? null,
        invScore: h?.score_inventaires ?? null,
        reqPct: h?.completude_requisitions_pct ?? null,
        reqScore: h?.score_requisitions ?? null,
        recPct: h?.completude_receptions_pct ?? null,
        recScore: h?.score_receptions ?? null,
      }),
      this.pilierNonMesure('P2'),
      this.pilierP3(scoresPiliers.P3, h?.taux_regularite_pct ?? null, h?.seuil_regularite ?? null),
      this.pilierP4(scoresPiliers.P4, {
        tauxSdu: h?.taux_sdu_pct ?? null,
        scoreSdu: h?.score_sdu ?? null,
        seuilSdu: h?.seuil_ecart_sdu ?? null,
        tauxConso: h?.taux_conso_pct ?? null,
        scoreConso: h?.score_conso ?? null,
        seuilConso: h?.seuil_ecart_conso ?? null,
      }),
      this.pilierP5(scoresPiliers.P5, h?.taux_concordance_pct ?? null, h?.seuil_concordance ?? null),
      this.pilierP6(scoresPiliers.P6, h?.ratio_ajustements_pct ?? null, h?.seuil_ajustements ?? null),
    ];

    const piliersCouverts = piliers.filter((p) => p.score !== null).length;

    return {
      site: versSite(siteRow),
      moisPaqd: mois,
      moisDisponibles,
      programmeId: prog,
      piliersCouverts,
      piliersTotal: 6,
      scoreComposite: nombreOuNull(h?.score_composite ?? null),
      classification: h?.classification ?? null,
      piliers,
    };
  }

  private mesure(
    sc: SousComposante,
    score: string | null,
    valeur: string | null,
    seuil: string | null,
    unite: MesureSousComposante['unite'],
    raisonNC: string,
  ): MesureSousComposante {
    const statut = score === null ? 'NON_CALCULABLE' : Number(score) >= 100 ? 'CONFORME' : 'ALERTE';
    return {
      sousComposante: sc,
      libelle: LIBELLES_SOUS_COMPOSANTE[sc],
      valeur: valeur === null ? null : Number(valeur),
      unite,
      seuil: seuil === null ? null : Number(seuil),
      statut,
      raison: statut === 'NON_CALCULABLE' ? raisonNC : null,
    };
  }

  private pilierP1(
    score: string | null,
    p1: {
      seuil: string | null;
      invPct: string | null; invScore: string | null;
      reqPct: string | null; reqScore: string | null;
      recPct: string | null; recScore: string | null;
    },
  ): ScorePilier {
    const inv = this.mesure('completude_inventaires', p1.invScore, p1.invPct, p1.seuil, 'pct',
      'Aucun programme géré déclaré pour ce site');
    const req = this.mesure('completude_requisitions', p1.reqScore, p1.reqPct, p1.seuil, 'pct',
      'Aucun programme géré déclaré pour ce site');
    const rec = this.mesure('completude_receptions', p1.recScore, p1.recPct, p1.seuil, 'pct',
      'Aucune facture fournisseur adressée au site ce mois');
    return this.envelopper('P1', score, [inv, req, rec]);
  }

  private pilierP3(score: string | null, taux: string | null, seuil: string | null): ScorePilier {
    const m = this.mesure('regularite_saisie', score, taux, seuil, 'pct',
      'Aucune sortie de stock exploitable sur le mois');
    return this.envelopper('P3', score, [m]);
  }

  private pilierP4(
    score: string | null,
    p4: {
      tauxSdu: string | null; scoreSdu: string | null; seuilSdu: string | null;
      tauxConso: string | null; scoreConso: string | null; seuilConso: string | null;
    },
  ): ScorePilier {
    const sdu = this.mesure('ecart_sdu', p4.scoreSdu, p4.tauxSdu, p4.seuilSdu, 'pct',
      'Aucun produit traceur inventorié ce mois');
    const conso = this.mesure('ecart_consommation', p4.scoreConso, p4.tauxConso, p4.seuilConso, 'pct',
      'Aucun produit évaluable : deux inventaires bornants et une consommation reconstituée positive sont requis');
    return this.envelopper('P4', score, [sdu, conso]);
  }

  private pilierP5(score: string | null, taux: string | null, seuil: string | null): ScorePilier {
    const m = this.mesure('concordance', score, taux, seuil, 'pct',
      'Aucun inventaire finalisé exploitable pour le mois');
    return this.envelopper('P5', score, [m]);
  }

  private pilierP6(score: string | null, ratio: string | null, seuil: string | null): ScorePilier {
    const m = this.mesure('ratio_ajustements', score, ratio, seuil, 'pct',
      'Aucun mouvement de stock pour le mois');
    return this.envelopper('P6', score, [m]);
  }

  /** Pilier dont la vue d'indicateur n'existe pas encore : score null, sous-composantes NON_CALCULABLE. */
  private pilierNonMesure(pilier: Pilier): ScorePilier {
    const sousComposantes = SOUS_COMPOSANTES_DU_PILIER[pilier].map((sc): MesureSousComposante => ({
      sousComposante: sc,
      libelle: LIBELLES_SOUS_COMPOSANTE[sc],
      valeur: null,
      unite: 'pct',
      seuil: null,
      statut: 'NON_CALCULABLE',
      raison: RAISON_PILIER_NON_MESURE,
    }));
    return this.envelopper(pilier, null, sousComposantes);
  }

  private envelopper(
    pilier: Pilier,
    score: string | null,
    sousComposantes: MesureSousComposante[],
  ): ScorePilier {
    return {
      pilier,
      libelle: LIBELLES_PILIER[pilier],
      poids: POIDS_PILIER[pilier] * 100,
      score: score === null ? null : Number(score),
      sousComposantes,
    };
  }
}
