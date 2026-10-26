import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { LigneStock, RaisonCmmNonCalculable, SuiviStocks, SuiviStocksQuery } from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';

interface LigneStockBrute {
  site_id: string;
  site_nom: string;
  region: string | null;
  district: string | null;
  programme_id: string | null;
  programme_nom: string | null;
  produit_id: string;
  produit_code: string;
  libelle: string;
  date_debut: string | null;
  stock_debut: string | null;
  date_fin: string;
  stock_fin: string;
  jours: number | null;
  nb_mois: number | null;
  receptions: string;
  sorties_reconstituees: string | null;
  declaree: string;
  cmm_reconstituee: string | null;
  cmm_declaree: string | null;
  raison_non_calcul: RaisonCmmNonCalculable | null;
  receptions_apres_fin: string;
  stock_projete_t: string | null;
  date_rupture: string | null;
  couverture_jours: string | null;
}

const versLigne = (r: LigneStockBrute): LigneStock => ({
  siteId: r.site_id,
  siteNom: r.site_nom,
  region: r.region,
  district: r.district,
  programmeId: r.programme_id,
  programmeNom: r.programme_nom,
  produitId: r.produit_id,
  produitCode: r.produit_code,
  libelle: r.libelle,
  dateFin: r.date_fin,
  stockFin: Number(r.stock_fin),
  receptionsApresFin: Number(r.receptions_apres_fin),
  cmm:
    r.raison_non_calcul === null && r.date_debut !== null && r.cmm_reconstituee !== null
      ? {
          calculable: true,
          dateDebut: r.date_debut,
          stockDebut: Number(r.stock_debut),
          jours: r.jours ?? 0,
          nbMois: r.nb_mois ?? 0,
          receptions: Number(r.receptions),
          sortiesReconstituees: Number(r.sorties_reconstituees),
          declaree: Number(r.declaree),
          cmmReconstituee: Number(r.cmm_reconstituee),
          cmmDeclaree: Number(r.cmm_declaree),
          stockProjete: Number(r.stock_projete_t),
          dateRupture: r.date_rupture,
          couvertureJours: Number(r.couverture_jours),
        }
      : { calculable: false, raison: r.raison_non_calcul ?? 'un_seul_inventaire' },
});

/**
 * Suivi des stocks : lit `dqa.stocks_a_date(t)` (migration 0053), qui calcule
 * CMM et projection « comme si l'on était à t ». Rien n'est recalculé ici.
 */
@Injectable()
export class StocksRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async suivi(q: SuiviStocksQuery): Promise<SuiviStocks> {
    const defaut = (
      await this.pool.query<{ d: string }>(`SELECT to_char(dqa.date_reference_stocks(), 'YYYY-MM-DD') AS d`)
    ).rows[0]?.d;
    if (defaut === undefined) throw new Error('date de référence introuvable');
    const date = q.date ?? defaut;

    const { rows } = await this.pool.query<LigneStockBrute>(
      `SELECT x.site_id, s.site_nom, s.region, s.district,
              x.programme_id, pg.programme_nom,
              x.produit_id, x.produit_code, x.libelle,
              to_char(x.date_debut, 'YYYY-MM-DD') AS date_debut, x.stock_debut,
              to_char(x.date_fin, 'YYYY-MM-DD') AS date_fin, x.stock_fin,
              x.jours, x.nb_mois, x.receptions, x.sorties_reconstituees, x.declaree,
              x.cmm_reconstituee, x.cmm_declaree, x.raison_non_calcul,
              x.receptions_apres_fin, x.stock_projete_t,
              to_char(x.date_rupture, 'YYYY-MM-DD') AS date_rupture, x.couverture_jours
       FROM dqa.stocks_a_date($1::date) x
       JOIN dqa.dim_site s ON s.site_id = x.site_id AND s.dans_perimetre_dqa
       LEFT JOIN dqa.dim_programme pg ON pg.programme_id = x.programme_id
       WHERE ($2::text IS NULL OR s.region = $2)
         AND ($3::text IS NULL OR s.district = $3)
         AND ($4::text IS NULL OR x.site_id = $4)
         AND ($5::text IS NULL OR x.programme_id = $5)
       ORDER BY s.region NULLS LAST, s.district NULLS LAST, s.site_nom,
                pg.programme_nom NULLS LAST, x.libelle, x.produit_code`,
      [date, q.region ?? null, q.district ?? null, q.siteId ?? null, q.programmeId ?? null],
    );
    return { date, dateParDefaut: defaut, lignes: rows.map(versLigne) };
  }
}
