import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type {
  DetailStock,
  DetailStockQuery,
  LigneStock,
  RaisonCmmNonCalculable,
  StatutStock,
  SuiviStocks,
  SuiviStocksQuery,
} from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';

interface LigneStockBrute {
  site_id: string;
  site_nom: string;
  region: string | null;
  district: string | null;
  programme_id: string | null;
  programme_nom: string | null;
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
  statut: StatutStock;
  date_photo: string | null;
  stock_msupply: string | null;
  stock_projete_photo: string | null;
}

const versLigne = (r: LigneStockBrute): LigneStock => ({
  siteId: r.site_id,
  siteNom: r.site_nom,
  region: r.region,
  district: r.district,
  programmeId: r.programme_id,
  programmeNom: r.programme_nom,
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
  statut: r.statut,
  photo:
    r.date_photo !== null && r.stock_msupply !== null
      ? {
          date: r.date_photo,
          stockMsupply: Number(r.stock_msupply),
          stockProjete: r.stock_projete_photo === null ? null : Number(r.stock_projete_photo),
        }
      : null,
});

/**
 * Suivi des stocks : lit `dqa.stocks_a_date(t)` (migration 0061, par code produit), qui
 * calcule CMM, projection, statut et comparaison à la photo mSupply « comme si
 * l'on était à t ». Rien n'est recalculé ici.
 */
@Injectable()
export class StocksRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async suivi(q: SuiviStocksQuery): Promise<SuiviStocks> {
    const ref = (
      await this.pool.query<{ d: string; seuil: string }>(
        `SELECT to_char(dqa.date_reference_stocks(), 'YYYY-MM-DD') AS d,
                coalesce((SELECT valeur FROM dqa.parametre_suivi WHERE cle = 'seuil_couverture_rupture_jours'), 15) AS seuil`,
      )
    ).rows[0];
    if (ref === undefined) throw new Error('date de référence introuvable');
    const defaut = ref.d;
    const date = q.date ?? defaut;

    const { rows } = await this.pool.query<LigneStockBrute>(
      `SELECT x.site_id, s.site_nom, s.region, s.district,
              x.programme_id, pg.programme_nom,
              x.produit_code, x.libelle,
              to_char(x.date_debut, 'YYYY-MM-DD') AS date_debut, x.stock_debut,
              to_char(x.date_fin, 'YYYY-MM-DD') AS date_fin, x.stock_fin,
              x.jours, x.nb_mois, x.receptions, x.sorties_reconstituees, x.declaree,
              x.cmm_reconstituee, x.cmm_declaree, x.raison_non_calcul,
              x.receptions_apres_fin, x.stock_projete_t,
              to_char(x.date_rupture, 'YYYY-MM-DD') AS date_rupture, x.couverture_jours, x.statut,
              to_char(x.date_photo, 'YYYY-MM-DD') AS date_photo, x.stock_msupply, x.stock_projete_photo
       FROM dqa.stocks_a_date($1::date) x
       JOIN dqa.dim_site s ON s.site_id = x.site_id AND s.dans_perimetre_dqa
       LEFT JOIN dqa.dim_programme pg ON pg.programme_id = x.programme_id
       WHERE ($2::text IS NULL OR s.region = $2)
         AND ($3::text IS NULL OR s.district = $3)
         AND ($4::text IS NULL OR x.site_id = $4)
         AND ($5::text IS NULL OR x.programme_id = $5)
         AND ($6::text IS NULL OR x.statut = $6)
       ORDER BY s.region NULLS LAST, s.district NULLS LAST, s.site_nom,
                pg.programme_nom NULLS LAST, x.libelle, x.produit_code`,
      [date, q.region ?? null, q.district ?? null, q.siteId ?? null, q.programmeId ?? null, q.statut ?? null],
    );
    return { date, dateParDefaut: defaut, seuilCouvertureJours: Number(ref.seuil), lignes: rows.map(versLigne) };
  }

  /**
   * Détail d'un couple : série de `dqa.serie_stock` et faits lus des vues de
   * la migration 0061, mêmes règles que la projection. `null` si le couple
   * n'a aucun inventaire connu à t (ou n'est pas un traceur du périmètre).
   */
  async detail(siteId: string, code: string, q: DetailStockQuery): Promise<DetailStock | null> {
    const suivi = await this.suivi({ date: q.date, siteId });
    const ligne = suivi.lignes.find((l) => l.produitCode === code);
    if (!ligne) return null;
    const t = suivi.date;
    const depuis = ligne.cmm.calculable ? ligne.cmm.dateDebut : ligne.dateFin;
    const params = [siteId, code, depuis, t];

    const [serie, inventaires, receptions, photos] = await Promise.all([
      this.pool.query<{ jour: string; stock_projete: string | null }>(
        `SELECT to_char(jour, 'YYYY-MM-DD') AS jour, stock_projete FROM dqa.serie_stock($1, $2, $3::date)`,
        [siteId, code, t],
      ),
      this.pool.query<{ d: string; comptee: string | null }>(
        `SELECT to_char(date_inventaire, 'YYYY-MM-DD') AS d, comptee FROM dqa.v_stock_compte_jour
         WHERE site_id = $1 AND produit_code = $2 AND date_inventaire BETWEEN $3::date AND $4::date
         ORDER BY date_inventaire`,
        params,
      ),
      this.pool.query<{ d: string; reception: string }>(
        `SELECT to_char(jour, 'YYYY-MM-DD') AS d, reception FROM dqa.v_mouvement_stock_jour
         WHERE site_id = $1 AND produit_code = $2 AND reception > 0 AND jour > $3::date AND jour <= $4::date
         ORDER BY jour`,
        params,
      ),
      this.pool.query<{ d: string; stock_msupply: string }>(
        `SELECT to_char(date_photo, 'YYYY-MM-DD') AS d, stock_msupply FROM dqa.v_photo_stock_jour
         WHERE site_id = $1 AND produit_code = $2 AND date_photo BETWEEN $3::date AND $4::date
         ORDER BY date_photo`,
        params,
      ),
    ]);

    return {
      date: t,
      seuilCouvertureJours: suivi.seuilCouvertureJours,
      ligne,
      serie: serie.rows.map((r) => ({ jour: r.jour, stockProjete: r.stock_projete === null ? null : Number(r.stock_projete) })),
      inventaires: inventaires.rows.map((r) => ({ date: r.d, compte: Number(r.comptee ?? 0) })),
      receptions: receptions.rows.map((r) => ({ jour: r.d, quantite: Number(r.reception) })),
      photos: photos.rows.map((r) => ({ date: r.d, stockMsupply: Number(r.stock_msupply) })),
    };
  }
}
