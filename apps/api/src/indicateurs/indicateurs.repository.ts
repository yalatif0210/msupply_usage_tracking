import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  LIBELLES_PILIER,
  LIBELLES_SOUS_COMPOSANTE,
  POIDS_PILIER,
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

/**
 * Valeurs brutes d'une sous-composante telles que rendues par `pg` (texte) :
 * `pct` = taux mesuré, `score` = 100 / 0 / null (CONFORME / ALERTE / NON_CALCULABLE).
 * Les deux voyagent toujours ensemble.
 */
interface MesureBrute {
  pct: string | null;
  score: string | null;
}

const brute = (pct: string | null | undefined, score: string | null | undefined): MesureBrute => ({
  pct: pct ?? null,
  score: score ?? null,
});

/** Nombre de scores de pilier non nuls, calculé en SQL sur la ligne gelée `h`. */
const COMPTE_PILIERS_SQL = `(
    (h.p_completude  IS NOT NULL)::int + (h.p_promptitude IS NOT NULL)::int
  + (h.p_regularite  IS NOT NULL)::int + (h.p_ecart_sdu   IS NOT NULL)::int
  + (h.p_concordance IS NOT NULL)::int + (h.p_ajustements IS NOT NULL)::int
)`;

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
        piliers_couverts: number | null;
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
              ${COMPTE_PILIERS_SQL} AS piliers_couverts,
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
      piliersCouverts: r.piliers_couverts ?? 0,
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
      piliers_couverts: number | null;
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
      promptitude_inventaires_pct: string | null;
      promptitude_requisitions_pct: string | null;
      p2_score_inventaires: string | null;
      p2_score_requisitions: string | null;
      taux_regularite_pct: string | null;
      taux_sdu_pct: string | null;
      taux_conso_pct: string | null;
      score_sdu: string | null;
      score_conso: string | null;
      taux_concordance_pct: string | null;
      ratio_ajustements_pct: string | null;
      seuil_completude: string | null;
      seuil_promptitude: string | null;
      seuil_regularite: string | null;
      seuil_ecart_sdu: string | null;
      seuil_ecart_conso: string | null;
      seuil_concordance: string | null;
      seuil_ajustements: string | null;
    }>(
      `SELECT h.score_composite, h.classification,
              ${COMPTE_PILIERS_SQL} AS piliers_couverts,
              h.p_completude, h.p_promptitude, h.p_regularite,
              h.p_ecart_sdu, h.p_concordance, h.p_ajustements,
              p1.completude_inventaires_pct, p1.completude_requisitions_pct, p1.completude_receptions_pct,
              p1.score_inventaires, p1.score_requisitions, p1.score_receptions,
              p2.promptitude_inventaires_pct, p2.promptitude_requisitions_pct,
              p2.score_inventaires AS p2_score_inventaires,
              p2.score_requisitions AS p2_score_requisitions,
              p3.taux_regularite_pct,
              p4.taux_sdu_pct, p4.taux_conso_pct, p4.score_sdu, p4.score_conso,
              p5.taux_concordance_pct, p6.ratio_ajustements_pct,
              sc1.seuil AS seuil_completude,
              sc2.seuil AS seuil_promptitude,
              sc3.seuil AS seuil_regularite,
              sc4s.seuil AS seuil_ecart_sdu, sc4c.seuil AS seuil_ecart_conso,
              sc5.seuil AS seuil_concordance, sc6.seuil AS seuil_ajustements
       FROM dqa.hist_score_site h
       LEFT JOIN dqa.mv_p1_completude p1
              ON p1.site_id = h.site_id AND p1.mois_paqd = h.mois_paqd
             AND p1.programme_id IS NOT DISTINCT FROM h.programme_id
       LEFT JOIN dqa.mv_p2_promptitude p2
              ON p2.site_id = h.site_id AND p2.mois_paqd = h.mois_paqd
             AND p2.programme_id IS NOT DISTINCT FROM h.programme_id
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
       LEFT JOIN dqa.grille_seuil_sous_composante sc2
              ON sc2.grille_id = h.grille_id AND sc2.sous_composante = 'promptitude_inventaires'
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

    const piliers: ScorePilier[] = [
      this.pilierP1(h?.p_completude ?? null, h?.seuil_completude ?? null, {
        inv: brute(h?.completude_inventaires_pct, h?.score_inventaires),
        req: brute(h?.completude_requisitions_pct, h?.score_requisitions),
        rec: brute(h?.completude_receptions_pct, h?.score_receptions),
      }),
      this.pilierP2(h?.p_promptitude ?? null, h?.seuil_promptitude ?? null, {
        inv: brute(h?.promptitude_inventaires_pct, h?.p2_score_inventaires),
        req: brute(h?.promptitude_requisitions_pct, h?.p2_score_requisitions),
      }),
      this.pilierP3(h?.p_regularite ?? null, h?.seuil_regularite ?? null,
        brute(h?.taux_regularite_pct, h?.p_regularite)),
      this.pilierP4(h?.p_ecart_sdu ?? null, {
        sdu: brute(h?.taux_sdu_pct, h?.score_sdu),
        seuilSdu: h?.seuil_ecart_sdu ?? null,
        conso: brute(h?.taux_conso_pct, h?.score_conso),
        seuilConso: h?.seuil_ecart_conso ?? null,
      }),
      this.pilierP5(h?.p_concordance ?? null, h?.seuil_concordance ?? null,
        brute(h?.taux_concordance_pct, h?.p_concordance)),
      this.pilierP6(h?.p_ajustements ?? null, h?.seuil_ajustements ?? null,
        brute(h?.ratio_ajustements_pct, h?.p_ajustements)),
    ];

    return {
      site: versSite(siteRow),
      moisPaqd: mois,
      moisDisponibles,
      programmeId: prog,
      piliersCouverts: h?.piliers_couverts ?? 0,
      piliersTotal: 6,
      scoreComposite: nombreOuNull(h?.score_composite ?? null),
      classification: h?.classification ?? null,
      piliers,
    };
  }

  /** Une sous-composante rendue : statut binaire dérivé du score de sous-composante. */
  private mesure(
    sc: SousComposante,
    m: MesureBrute,
    seuil: string | null,
    raisonNC: string,
  ): MesureSousComposante {
    const statut = m.score === null ? 'NON_CALCULABLE' : Number(m.score) >= 100 ? 'CONFORME' : 'ALERTE';
    return {
      sousComposante: sc,
      libelle: LIBELLES_SOUS_COMPOSANTE[sc],
      valeur: nombreOuNull(m.pct),
      unite: 'pct',
      seuil: nombreOuNull(seuil),
      statut,
      raison: statut === 'NON_CALCULABLE' ? raisonNC : null,
    };
  }

  private pilierP1(
    score: string | null,
    seuil: string | null,
    m: { inv: MesureBrute; req: MesureBrute; rec: MesureBrute },
  ): ScorePilier {
    const raisonProg = 'Aucun programme géré déclaré pour ce site';
    return this.envelopper('P1', score, [
      this.mesure('completude_inventaires', m.inv, seuil, raisonProg),
      this.mesure('completude_requisitions', m.req, seuil, raisonProg),
      this.mesure('completude_receptions', m.rec, seuil,
        'Aucune facture fournisseur adressée au site ce mois'),
    ]);
  }

  private pilierP2(
    score: string | null,
    seuil: string | null,
    m: { inv: MesureBrute; req: MesureBrute },
  ): ScorePilier {
    return this.envelopper('P2', score, [
      this.mesure('promptitude_inventaires', m.inv, seuil, 'Aucun inventaire finalisé ce mois'),
      this.mesure('promptitude_requisitions', m.req, seuil, 'Aucune réquisition couvrant ce mois'),
    ]);
  }

  private pilierP3(score: string | null, seuil: string | null, m: MesureBrute): ScorePilier {
    return this.envelopper('P3', score, [
      this.mesure('regularite_saisie', m, seuil, 'Aucune sortie de stock exploitable sur le mois'),
    ]);
  }

  private pilierP4(
    score: string | null,
    m: { sdu: MesureBrute; seuilSdu: string | null; conso: MesureBrute; seuilConso: string | null },
  ): ScorePilier {
    return this.envelopper('P4', score, [
      this.mesure('ecart_sdu', m.sdu, m.seuilSdu, 'Aucun produit traceur inventorié ce mois'),
      this.mesure('ecart_consommation', m.conso, m.seuilConso,
        'Aucun produit évaluable : deux inventaires bornants et une consommation reconstituée positive sont requis'),
    ]);
  }

  private pilierP5(score: string | null, seuil: string | null, m: MesureBrute): ScorePilier {
    return this.envelopper('P5', score, [
      this.mesure('concordance', m, seuil, 'Aucun inventaire finalisé exploitable pour le mois'),
    ]);
  }

  private pilierP6(score: string | null, seuil: string | null, m: MesureBrute): ScorePilier {
    return this.envelopper('P6', score, [
      this.mesure('ratio_ajustements', m, seuil, 'Aucun mouvement de stock pour le mois'),
    ]);
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
