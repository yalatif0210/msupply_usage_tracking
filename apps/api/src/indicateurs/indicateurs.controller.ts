import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type {
  DetailP4Produits,
  DetailPilier,
  DetailSite,
  HistoriqueSite,
  Programme,
  ScoreSite,
  SyntheseNationale,
  SyntheseRapports,
  TableauDeBord,
} from '@dqa/contracts';
import {
  detailPilierQuerySchema,
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

  /**
   * Détail ligne à ligne d'un pilier, lu en direct du core. Variantes livrées :
   * `p1`, `p2`, `p3`, `p6`. `p4` garde son handler dédié ci-dessus ; `p5` arrive
   * à un ticket ultérieur.
   */
  @Get('sites/:id/piliers/:code')
  async detailPilier(
    @Param('id') id: string,
    @Param('code') code: string,
    @Query() query: Record<string, string>,
  ): Promise<DetailPilier> {
    if (code !== 'p1' && code !== 'p2' && code !== 'p3' && code !== 'p6') {
      throw new NotFoundException(`Détail du pilier ${code} non disponible`);
    }
    const q = detailPilierQuerySchema.parse(query);
    const detail = await this.repo.detailPilier(id, code, q);
    if (!detail) throw new NotFoundException('Site hors périmètre ou inconnu');
    return detail;
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
  tableauDeBord(): Promise<TableauDeBord> {
    return this.repo.tableauDeBord();
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
