import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { DetailSite, Programme, ScoreSite } from '@dqa/contracts';
import { filtreSitesSchema, moisPaqdSchema } from '@dqa/contracts';
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

  @Get('referentiel/programmes')
  programmes(): Promise<Programme[]> {
    return this.repo.programmes();
  }

  @Get('referentiel/districts')
  districts(): Promise<string[]> {
    return this.repo.districts();
  }
}
