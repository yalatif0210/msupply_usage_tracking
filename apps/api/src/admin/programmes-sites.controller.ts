import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  entreeProgrammeSiteSchema,
  requeteProgrammesSitesSchema,
  type EntreeProgrammeSite,
  type ProgrammeSite,
  type ProgrammesDuSite,
  type RequeteProgrammesSites,
  type ResultatDesactivation,
  type VueProgrammesSites,
} from '@dqa/contracts';
import type { RequeteAuthentifiee } from '../auth/auth.guard.js';
import { Roles } from '../auth/auth.metadata.js';
import { ZodValidationPipe } from '../commun/zod-validation.pipe.js';
import { ProgrammesSitesRepository } from './programmes-sites.repository.js';

@Controller('admin/programmes-sites')
export class ProgrammesSitesController {
  constructor(private readonly repo: ProgrammesSitesRepository) {}

  /** Lecture ouverte à tout utilisateur authentifié : une page de sites résumés. */
  @Get()
  etat(
    @Query(new ZodValidationPipe(requeteProgrammesSitesSchema)) requete: RequeteProgrammesSites,
  ): Promise<VueProgrammesSites> {
    return this.repo.etat(requete);
  }

  /**
   * Les scores ne se recalculent pas à chaque bascule (un recalcul prend
   * plusieurs secondes sur les données réelles) : la coordination fait ses
   * choix, puis lance le recalcul. L'import suivant recalcule aussi.
   */
  @Roles(['coordination'])
  @Post('recalcul')
  @HttpCode(204)
  recalculer(): Promise<void> {
    return this.repo.recalculer();
  }

  @Get(':siteId')
  async programmesDuSite(@Param('siteId') siteId: string): Promise<ProgrammesDuSite> {
    const p = await this.repo.programmesDuSite(siteId);
    if (!p) throw new NotFoundException('Site inconnu ou hors périmètre');
    return p;
  }

  @Roles(['coordination'])
  @Post(':siteId/desactiver-sans-activite')
  async desactiverSansActivite(
    @Param('siteId') siteId: string,
    @Req() req: RequeteAuthentifiee,
  ): Promise<ResultatDesactivation> {
    if (!req.utilisateur) throw new UnauthorizedException();
    return { nbDesactives: await this.repo.desactiverSansActivite(siteId, req.utilisateur.identifiant) };
  }

  @Roles(['coordination'])
  @Put(':siteId/:programmeId')
  async modifier(
    @Param('siteId') siteId: string,
    @Param('programmeId') programmeId: string,
    @Body(new ZodValidationPipe(entreeProgrammeSiteSchema)) corps: EntreeProgrammeSite,
    @Req() req: RequeteAuthentifiee,
  ): Promise<ProgrammeSite> {
    if (!req.utilisateur) throw new UnauthorizedException();
    const p = await this.repo.modifier(siteId, programmeId, corps.actif, req.utilisateur.identifiant);
    if (!p) throw new NotFoundException('Programme non rattaché à ce site');
    return p;
  }
}
