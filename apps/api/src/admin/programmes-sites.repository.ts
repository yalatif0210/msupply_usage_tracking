import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  TAILLE_PAGE_PROGRAMMES_SITES,
  type OrigineProgrammeSite,
  type ProgrammeSite,
  type ProgrammesDuSite,
  type RequeteProgrammesSites,
  type ResumeProgrammesSite,
  type VueProgrammesSites,
} from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';

interface LigneProgramme {
  programme_id: string;
  programme_code: string | null;
  programme_nom: string;
  actif: boolean;
  origine: OrigineProgrammeSite;
  modifie_par: string | null;
  modifie_le: Date | null;
  nb_inventaires: number;
  nb_requisitions: number;
}

interface LigneResume {
  site_id: string;
  site_nom: string;
  district: string | null;
  type_structure: string | null;
  nb_programmes: number;
  nb_eligibles: number;
  nb_sans_activite: number;
  nb_eligibles_sans_activite: number;
  nb_modifies: number;
}

const versProgramme = (r: LigneProgramme): ProgrammeSite => ({
  programmeId: r.programme_id,
  programmeCode: r.programme_code,
  programmeNom: r.programme_nom,
  actif: r.actif,
  origine: r.origine,
  modifiePar: r.modifie_par,
  modifieLe: r.modifie_le ? r.modifie_le.toISOString() : null,
  nbInventaires: r.nb_inventaires,
  nbRequisitions: r.nb_requisitions,
});

const versResume = (r: LigneResume): ResumeProgrammesSite => ({
  siteId: r.site_id,
  siteNom: r.site_nom,
  district: r.district,
  typeStructure: r.type_structure,
  nbProgrammes: r.nb_programmes,
  nbEligibles: r.nb_eligibles,
  nbSansActivite: r.nb_sans_activite,
  nbEligiblesSansActivite: r.nb_eligibles_sans_activite,
  nbModifies: r.nb_modifies,
});

/** Début de la période d'activité : le 1er jour du mois M-2, comme la fenêtre d'extraction. */
const DEPUIS_SQL = `(date_trunc('month', CURRENT_DATE) - interval '2 months')::date`;

/**
 * Activité de chaque couple site x programme du périmètre, agrégée en une
 * passe par table (et non une sous-requête par ligne) : la requête reste
 * linéaire quand la liste couvre des milliers de sites. `$1` filtre un site.
 */
const ACTIVITE_SQL = `
  WITH inv AS (
    SELECT site_id, programme_id, count(*)::int AS n
    FROM dqa.fact_inventaire
    WHERE statut = 'fn' AND date_inventaire >= ${DEPUIS_SQL}
      AND ($1::text IS NULL OR site_id = $1)
    GROUP BY site_id, programme_id
  ),
  req AS (
    SELECT site_id, programme_id, count(*)::int AS n
    FROM dqa.fact_requisition
    WHERE mois_couvert >= to_char(${DEPUIS_SQL}, 'YYYY-MM')
      AND ($1::text IS NULL OR site_id = $1)
    GROUP BY site_id, programme_id
  ),
  activite AS (
    SELECT sp.site_id, sp.programme_id, sp.actif, sp.origine, sp.modifie_par, sp.modifie_le,
           coalesce(inv.n, 0) AS nb_inventaires, coalesce(req.n, 0) AS nb_requisitions,
           (coalesce(inv.n, 0) = 0 AND coalesce(req.n, 0) = 0) AS sans_activite
    FROM dqa.dim_site_programme sp
    JOIN dqa.dim_site s ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
    LEFT JOIN inv ON inv.site_id = sp.site_id AND inv.programme_id = sp.programme_id
    LEFT JOIN req ON req.site_id = sp.site_id AND req.programme_id = sp.programme_id
    WHERE $1::text IS NULL OR sp.site_id = $1
  )`;

/**
 * Programmes éligibles par site (ADR 0020), conçus pour une liste de
 * plusieurs milliers de sites : la liste est un résumé par site, filtré et
 * paginé côté serveur ; les programmes d'un site se lisent à la demande.
 */
@Injectable()
export class ProgrammesSitesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  private async activiteDepuis(): Promise<string> {
    const { rows } = await this.pool.query<{ d: string }>(`SELECT to_char(${DEPUIS_SQL}, 'YYYY-MM-DD') AS d`);
    return rows[0]!.d;
  }

  async etat(requete: RequeteProgrammesSites): Promise<VueProgrammesSites> {
    const taillePage = TAILLE_PAGE_PROGRAMMES_SITES;
    const q = requete.q?.trim() ? requete.q.trim().toLocaleLowerCase('fr') : null;
    const params = [null, q, requete.district ?? null, requete.filtre ?? 'tous'];
    const filtreSql = `${ACTIVITE_SQL},
      resume AS (
        SELECT s.site_id, s.site_nom, s.district, s.type_structure,
               count(*)::int                                                  AS nb_programmes,
               (count(*) FILTER (WHERE a.actif))::int                         AS nb_eligibles,
               (count(*) FILTER (WHERE a.sans_activite))::int                 AS nb_sans_activite,
               (count(*) FILTER (WHERE a.actif AND a.sans_activite))::int     AS nb_eligibles_sans_activite,
               (count(*) FILTER (WHERE a.origine = 'application'))::int       AS nb_modifies
        FROM activite a
        JOIN dqa.dim_site s ON s.site_id = a.site_id
        GROUP BY s.site_id, s.site_nom, s.district, s.type_structure
      ),
      filtre AS (
        SELECT r.* FROM resume r
        WHERE ($2::text IS NULL
               OR strpos(lower(r.site_nom), $2) > 0
               OR strpos(lower(coalesce(r.district, '')), $2) > 0
               OR EXISTS (SELECT 1 FROM dqa.dim_site_programme sp
                          JOIN dqa.dim_programme p ON p.programme_id = sp.programme_id
                          WHERE sp.site_id = r.site_id
                            AND (strpos(lower(p.programme_nom), $2) > 0
                                 OR strpos(lower(coalesce(p.programme_code, '')), $2) > 0)))
          AND ($3::text IS NULL OR r.district = $3)
          AND ($4 = 'tous'
               OR ($4 = 'a_revoir' AND r.nb_eligibles_sans_activite > 0)
               OR ($4 = 'modifies' AND r.nb_modifies > 0))
      )`;

    // Un compte d'abord : une page demandée au-delà de la dernière retombe sur celle-ci.
    const totaux = await this.pool.query<{ total: number; total_ea: number }>(
      `${filtreSql}
       SELECT count(*)::int AS total, coalesce(sum(nb_eligibles_sans_activite), 0)::int AS total_ea FROM filtre`,
      params,
    );
    const total = totaux.rows[0]?.total ?? 0;
    const derniere = Math.max(1, Math.ceil(total / taillePage));
    const page = Math.min(Math.max(1, requete.page ?? 1), derniere);

    const { rows } = await this.pool.query<LigneResume>(
      `${filtreSql}
       SELECT f.* FROM filtre f
       ORDER BY f.site_nom, f.site_id
       LIMIT $5 OFFSET $6`,
      [...params, taillePage, (page - 1) * taillePage],
    );

    return {
      activiteDepuis: await this.activiteDepuis(),
      page,
      taillePage,
      totalSites: total,
      totalEligiblesSansActivite: totaux.rows[0]?.total_ea ?? 0,
      sites: rows.map(versResume),
    };
  }

  /** Les programmes d'un site du périmètre ; `null` si le site est inconnu ou hors périmètre. */
  async programmesDuSite(siteId: string): Promise<ProgrammesDuSite | null> {
    const site = await this.pool.query(
      `SELECT 1 FROM dqa.dim_site WHERE site_id = $1 AND dans_perimetre_dqa`,
      [siteId],
    );
    if (!site.rowCount) return null;
    const { rows } = await this.pool.query<LigneProgramme>(
      `${ACTIVITE_SQL}
       SELECT a.programme_id, p.programme_code,
              coalesce(nullif(p.programme_nom, ''), a.programme_id) AS programme_nom,
              a.actif, a.origine, a.modifie_par, a.modifie_le, a.nb_inventaires, a.nb_requisitions
       FROM activite a
       JOIN dqa.dim_programme p ON p.programme_id = a.programme_id
       ORDER BY a.sans_activite DESC, programme_nom`,
      [siteId],
    );
    return { siteId, activiteDepuis: await this.activiteDepuis(), programmes: rows.map(versProgramme) };
  }

  /** `null` si le couple n'existe pas : un couple naît d'un import, jamais de la console. */
  async modifier(
    siteId: string,
    programmeId: string,
    actif: boolean,
    identifiant: string,
  ): Promise<ProgrammeSite | null> {
    const maj = await this.pool.query(
      `UPDATE dqa.dim_site_programme
          SET actif = $3, origine = 'application', modifie_par = $4, modifie_le = now(), maj_le = now()
        WHERE site_id = $1 AND programme_id = $2`,
      [siteId, programmeId, actif, identifiant],
    );
    if (!maj.rowCount) return null;
    const programmes = await this.programmesDuSite(siteId);
    return programmes?.programmes.find((p) => p.programmeId === programmeId) ?? null;
  }

  /**
   * Désactive d'un coup les programmes encore éligibles d'un site qui n'ont
   * aucune activité depuis le 1er du mois M-2 (le cas le plus fréquent :
   * listes rattachées dans mSupply mais non gérées). Chaque couple passe en
   * origine `application`, comme une bascule une à une.
   */
  async desactiverSansActivite(siteId: string, identifiant: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      `UPDATE dqa.dim_site_programme sp
          SET actif = false, origine = 'application', modifie_par = $2, modifie_le = now(), maj_le = now()
        WHERE sp.site_id = $1 AND sp.actif
          AND NOT EXISTS (SELECT 1 FROM dqa.fact_inventaire fi
                          WHERE fi.site_id = sp.site_id AND fi.programme_id = sp.programme_id
                            AND fi.statut = 'fn' AND fi.date_inventaire >= ${DEPUIS_SQL})
          AND NOT EXISTS (SELECT 1 FROM dqa.fact_requisition fr
                          WHERE fr.site_id = sp.site_id AND fr.programme_id = sp.programme_id
                            AND fr.mois_couvert >= to_char(${DEPUIS_SQL}, 'YYYY-MM'))`,
      [siteId, identifiant],
    );
    return rowCount ?? 0;
  }

  /** Recalcule les scores avec les programmes éligibles à jour (même procédure qu'après un import). */
  async recalculer(): Promise<void> {
    await this.pool.query('CALL dqa.rafraichir_et_geler(NULL)');
  }
}
