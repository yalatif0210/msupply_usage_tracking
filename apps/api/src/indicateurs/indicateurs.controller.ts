import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type {
  DetailPilier,
  DetailPilierQuery,
  DetailSite,
  DetailSiteQuery,
  FicheProduitMois,
  FicheProduitMoisQuery,
  FiltreSites,
  HistoriqueQuery,
  HistoriqueSite,
  MethodeCalcul,
  MethodeCalculQuery,
  Programme,
  ScoreSite,
  SyntheseNationale,
  SyntheseQuery,
  SyntheseRapports,
  TableauDeBord,
} from '@dqa/contracts';
import {
  codeDetailPilierSchema,
  detailPilierQuerySchema,
  detailSiteQuerySchema,
  ficheProduitMoisQuerySchema,
  filtreSitesSchema,
  historiqueQuerySchema,
  methodeCalculQuerySchema,
  syntheseQuerySchema,
  type MoisMesure,
} from '@dqa/contracts';
import { ZodValidationPipe } from '../commun/zod-validation.pipe.js';
import { IndicateursRepository } from './indicateurs.repository.js';

@Controller()
export class IndicateursController {
  constructor(private readonly repo: IndicateursRepository) {}

  @Get('sites')
  sites(@Query(new ZodValidationPipe(filtreSitesSchema)) f: FiltreSites): Promise<ScoreSite[]> {
    return this.repo.listerSites(f);
  }

  @Get('sites/:id')
  async detailSite(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(detailSiteQuerySchema)) q: DetailSiteQuery,
  ): Promise<DetailSite> {
    const detail = await this.repo.detailSite(id, q.mois, q.programmeId);
    if (!detail) throw new NotFoundException('Site hors périmètre ou inconnu');
    return detail;
  }

  @Get('sites/:id/historique')
  async historiqueSite(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(historiqueQuerySchema)) q: HistoriqueQuery,
  ): Promise<HistoriqueSite> {
    const h = await this.repo.historiqueSite(id, q);
    if (!h) throw new NotFoundException('Site hors périmètre ou inconnu');
    return h;
  }

  /**
   * Détail ligne à ligne d'un pilier, lu en direct du core. Variantes livrées :
   * `p1`, `p2`, `p3`, `p4` (tableau produit P4 · P5 fusionné), `p6`. `p5` est
   * servi par la variante `p4`.
   */
  @Get('sites/:id/piliers/:code')
  async detailPilier(
    @Param('id') id: string,
    @Param('code') code: string,
    @Query(new ZodValidationPipe(detailPilierQuerySchema)) q: DetailPilierQuery,
  ): Promise<DetailPilier> {
    const codeDetail = codeDetailPilierSchema.safeParse(code);
    if (!codeDetail.success) {
      throw new NotFoundException(`Détail du pilier ${code} non disponible`);
    }
    const detail = await this.repo.detailPilier(id, codeDetail.data, q);
    if (!detail) throw new NotFoundException('Site hors périmètre ou inconnu');
    return detail;
  }

  /**
   * Fiche produit-mois : toutes les grandeurs brutes d'un produit traceur pour
   * un site et un mois (route partageable, transversale aux piliers P3..P6).
   * 404 si le site est hors périmètre ou si `code` n'est pas un produit traceur.
   */
  @Get('sites/:id/produits/:code')
  async ficheProduitMois(
    @Param('id') id: string,
    @Param('code') code: string,
    @Query(new ZodValidationPipe(ficheProduitMoisQuerySchema)) q: FicheProduitMoisQuery,
  ): Promise<FicheProduitMois> {
    const fiche = await this.repo.ficheProduitMois(id, code, q);
    if (!fiche) throw new NotFoundException('Produit traceur ou site introuvable');
    return fiche;
  }

  /** Grille d'un mois décrite pour les écrans de lecture : composition, seuils, règles. */
  @Get('methode-calcul')
  async methodeCalcul(
    @Query(new ZodValidationPipe(methodeCalculQuerySchema)) q: MethodeCalculQuery,
  ): Promise<MethodeCalcul> {
    const m = await this.repo.methodeCalcul(q);
    if (m === null) throw new NotFoundException('Aucune grille en vigueur pour ce mois');
    return m;
  }

  @Get('synthese')
  synthese(@Query(new ZodValidationPipe(syntheseQuerySchema)) q: SyntheseQuery): Promise<SyntheseNationale> {
    return this.repo.synthese(q);
  }

  @Get('synthese/rapports')
  syntheseRapports(@Query(new ZodValidationPipe(syntheseQuerySchema)) q: SyntheseQuery): Promise<SyntheseRapports> {
    return this.repo.syntheseRapports(q);
  }

  @Get('tableau-de-bord')
  tableauDeBord(@Query(new ZodValidationPipe(methodeCalculQuerySchema)) q: MethodeCalculQuery): Promise<TableauDeBord> {
    return this.repo.tableauDeBord(q.mois);
  }

  @Get('referentiel/programmes')
  programmes(): Promise<Programme[]> {
    return this.repo.programmes();
  }

  @Get('referentiel/districts')
  districts(): Promise<string[]> {
    return this.repo.districts();
  }

  /** Mois mesurés, du plus récent au plus ancien, avec leur état clos / provisoire. */
  @Get('referentiel/mois')
  mois(): Promise<MoisMesure[]> {
    return this.repo.moisMesures();
  }

  @Get('referentiel/regions')
  regions(): Promise<string[]> {
    return this.repo.regions();
  }
}
