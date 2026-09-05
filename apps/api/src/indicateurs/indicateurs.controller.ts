import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type {
  DetailPilier,
  DetailSite,
  FicheProduitMois,
  HistoriqueSite,
  Programme,
  ScoreSite,
  SyntheseNationale,
  SyntheseRapports,
  TableauDeBord,
} from '@dqa/contracts';
import {
  codeDetailPilierSchema,
  detailPilierQuerySchema,
  ficheProduitMoisQuerySchema,
  filtreSitesSchema,
  historiqueQuerySchema,
  moisPaqdSchema,
  syntheseQuerySchema,
} from '@dqa/contracts';
import { IndicateursRepository } from './indicateurs.repository.js';

@Controller()
export class IndicateursController {
  constructor(private readonly repo: IndicateursRepository) {}

  @Get('sites')
  sites(@Query() query: Record<string, string>): Promise<ScoreSite[]> {
    const f = filtreSitesSchema.parse(query);
    return this.repo.listerSites(f);
  }

  @Get('sites/:id')
  async detailSite(
    @Param('id') id: string,
    @Query('mois') mois?: string,
    @Query('programmeId') programmeId?: string,
  ): Promise<DetailSite> {
    const moisValide = mois ? moisPaqdSchema.parse(mois) : undefined;
    const detail = await this.repo.detailSite(id, moisValide, programmeId || undefined);
    if (!detail) throw new NotFoundException('Site hors périmètre ou inconnu');
    return detail;
  }

  @Get('sites/:id/historique')
  async historiqueSite(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ): Promise<HistoriqueSite> {
    const q = historiqueQuerySchema.parse(query);
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
    @Query() query: Record<string, string>,
  ): Promise<DetailPilier> {
    const codeDetail = codeDetailPilierSchema.safeParse(code);
    if (!codeDetail.success) {
      throw new NotFoundException(`Détail du pilier ${code} non disponible`);
    }
    const q = detailPilierQuerySchema.parse(query);
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
    @Query() query: Record<string, string>,
  ): Promise<FicheProduitMois> {
    const q = ficheProduitMoisQuerySchema.parse(query);
    const fiche = await this.repo.ficheProduitMois(id, code, q);
    if (!fiche) throw new NotFoundException('Produit traceur ou site introuvable');
    return fiche;
  }

  @Get('synthese')
  synthese(@Query() query: Record<string, string>): Promise<SyntheseNationale> {
    const q = syntheseQuerySchema.parse(query);
    return this.repo.synthese(q);
  }

  @Get('synthese/rapports')
  syntheseRapports(@Query() query: Record<string, string>): Promise<SyntheseRapports> {
    const q = syntheseQuerySchema.parse(query);
    return this.repo.syntheseRapports(q);
  }

  @Get('tableau-de-bord')
  tableauDeBord(@Query('mois') mois?: string): Promise<TableauDeBord> {
    const moisValide = mois ? moisPaqdSchema.parse(mois) : undefined;
    return this.repo.tableauDeBord(moisValide);
  }

  @Get('referentiel/programmes')
  programmes(): Promise<Programme[]> {
    return this.repo.programmes();
  }

  @Get('referentiel/districts')
  districts(): Promise<string[]> {
    return this.repo.districts();
  }

  @Get('referentiel/regions')
  regions(): Promise<string[]> {
    return this.repo.regions();
  }
}
