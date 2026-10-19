import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  entreeProgrammeSiteSchema,
  type EntreeProgrammeSite,
  type ProgrammeSite,
  type VueProgrammesSites,
} from '@dqa/contracts';
import type { RequeteAuthentifiee } from '../auth/auth.guard.js';
import { Roles } from '../auth/auth.metadata.js';
import { ZodValidationPipe } from '../commun/zod-validation.pipe.js';
import { ProgrammesSitesRepository } from './programmes-sites.repository.js';

@Controller('admin/programmes-sites')
export class ProgrammesSitesController {
  constructor(private readonly repo: ProgrammesSitesRepository) {}

  /** Lecture ouverte à tout utilisateur authentifié. */
  @Get()
  etat(): Promise<VueProgrammesSites> {
    return this.repo.etat();
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
}
