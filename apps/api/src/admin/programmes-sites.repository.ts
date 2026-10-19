import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { OrigineProgrammeSite, ProgrammeSite, SiteProgrammes, VueProgrammesSites } from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';

interface Ligne {
  site_id: string;
  site_nom: string;
  district: string | null;
  type_structure: string | null;
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

const versProgramme = (r: Ligne): ProgrammeSite => ({
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

/** Début de la période d'activité affichée : le 1er jour du mois M-2, comme la fenêtre d'extraction. */
const DEPUIS_SQL = `(date_trunc('month', CURRENT_DATE) - interval '2 months')::date`;

const SELECT_PROGRAMMES = `
  SELECT s.site_id, s.site_nom, s.district, s.type_structure,
         sp.programme_id, p.programme_code,
         coalesce(nullif(p.programme_nom, ''), sp.programme_id) AS programme_nom,
         sp.actif, sp.origine, sp.modifie_par, sp.modifie_le,
         (SELECT count(*)::int FROM dqa.fact_inventaire fi
           WHERE fi.site_id = sp.site_id AND fi.programme_id = sp.programme_id
             AND fi.statut = 'fn' AND fi.date_inventaire >= ${DEPUIS_SQL}) AS nb_inventaires,
         (SELECT count(*)::int FROM dqa.fact_requisition fr
           WHERE fr.site_id = sp.site_id AND fr.programme_id = sp.programme_id
             AND fr.mois_couvert >= to_char(${DEPUIS_SQL}, 'YYYY-MM')) AS nb_requisitions
  FROM dqa.dim_site_programme sp
  JOIN dqa.dim_site s      ON s.site_id = sp.site_id AND s.dans_perimetre_dqa
  JOIN dqa.dim_programme p ON p.programme_id = sp.programme_id`;

/**
 * Programmes éligibles par site (ADR 0020). L'activité affichée (inventaires
 * finalisés, réquisitions) couvre la même période que la fenêtre d'extraction :
 * un programme rattaché dans mSupply sans aucune activité n'est probablement
 * pas géré par le site.
 */
@Injectable()
export class ProgrammesSitesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async etat(): Promise<VueProgrammesSites> {
    const depuis = await this.pool.query<{ d: string }>(`SELECT to_char(${DEPUIS_SQL}, 'YYYY-MM-DD') AS d`);
    const { rows } = await this.pool.query<Ligne>(
      `${SELECT_PROGRAMMES} ORDER BY s.site_nom, s.site_id, programme_nom`,
    );
    const sites: SiteProgrammes[] = [];
    for (const r of rows) {
      let site = sites.at(-1);
      if (!site || site.siteId !== r.site_id) {
        site = {
          siteId: r.site_id,
          siteNom: r.site_nom,
          district: r.district,
          typeStructure: r.type_structure,
          programmes: [],
        };
        sites.push(site);
      }
      site.programmes.push(versProgramme(r));
    }
    return { activiteDepuis: depuis.rows[0]!.d, sites };
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
    const { rows } = await this.pool.query<Ligne>(
      `${SELECT_PROGRAMMES} WHERE sp.site_id = $1 AND sp.programme_id = $2`,
      [siteId, programmeId],
    );
    const r = rows[0];
    return r ? versProgramme(r) : null;
  }

  /** Recalcule les scores avec les programmes éligibles à jour (même procédure qu'après un import). */
  async recalculer(): Promise<void> {
    await this.pool.query('CALL dqa.rafraichir_et_geler(NULL)');
  }
}
