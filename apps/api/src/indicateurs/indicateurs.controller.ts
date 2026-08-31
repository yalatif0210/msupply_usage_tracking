import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type {
  DetailP4Produits,
  DetailSite,
  HistoriqueSite,
  Programme,
  ScoreSite,
  SyntheseNationale,
} from '@dqa/contracts';
import {
  detailSiteQuerySchema,
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

  @Get('sites/:id/piliers/p4')
  async detailP4Produits(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ): Promise<DetailP4Produits> {
    const q = detailSiteQuerySchema.parse(query);
    const detail = await this.repo.detailP4Produits(id, q.mois, q.programmeId);
    if (!detail) throw new NotFoundException('Site hors périmètre ou inconnu');
    return detail;
  }

  @Get('synthese')
  synthese(@Query() query: Record<string, string>): Promise<SyntheseNationale> {
    const q = syntheseQuerySchema.parse(query);
    return this.repo.synthese(q);
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
