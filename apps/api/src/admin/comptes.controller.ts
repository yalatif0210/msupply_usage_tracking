import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  entreeCompteSchema,
  majCompteSchema,
  motDePasseCompteSchema,
  type CompteAdmin,
  type EntreeCompte,
  type MajCompte,
  type MotDePasseCompte,
} from '@dqa/contracts';
import type { RequeteAuthentifiee } from '../auth/auth.guard.js';
import { Roles } from '../auth/auth.metadata.js';
import { ZodValidationPipe } from '../commun/zod-validation.pipe.js';
import { ComptesRepository } from './comptes.repository.js';

@Controller('admin/comptes')
@Roles(['admin'])
export class ComptesController {
  constructor(private readonly repo: ComptesRepository) {}

  @Get()
  lister(): Promise<CompteAdmin[]> {
    return this.repo.lister();
  }

  @Post()
  creer(@Body(new ZodValidationPipe(entreeCompteSchema)) entree: EntreeCompte): Promise<CompteAdmin> {
    return this.repo.creer(entree);
  }

  @Put(':id')
  modifier(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(majCompteSchema)) maj: MajCompte,
    @Req() req: RequeteAuthentifiee,
  ): Promise<CompteAdmin> {
    if (!req.utilisateur) throw new UnauthorizedException();
    return this.repo.modifier(id, maj, req.utilisateur.id);
  }

  @Post(':id/mot-de-passe')
  @HttpCode(204)
  reinitialiser(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(motDePasseCompteSchema)) corps: MotDePasseCompte,
  ): Promise<void> {
    return this.repo.reinitialiserMotDePasse(id, corps.motDePasse);
  }
}
