import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import {
  entreeProduitTraceurSchema,
  type EntreeProduitTraceur,
  type ProduitTraceur,
} from '@dqa/contracts';
import { Roles } from '../auth/auth.metadata.js';
import { ZodValidationPipe } from '../commun/zod-validation.pipe.js';
import { TraceursRepository } from './traceurs.repository.js';

@Controller('admin/traceurs')
export class TraceursController {
  constructor(private readonly repo: TraceursRepository) {}

  /** Lecture ouverte à tout utilisateur authentifié. */
  @Get()
  lister(): Promise<ProduitTraceur[]> {
    return this.repo.lister();
  }

  @Roles(['coordination'])
  @Put(':code')
  enregistrer(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(entreeProduitTraceurSchema.partial()))
    corps: Partial<EntreeProduitTraceur>,
  ): Promise<ProduitTraceur> {
    return this.repo.enregistrer({ ...corps, produitCode: code });
  }

  @Roles(['coordination'])
  @Delete(':code')
  @HttpCode(204)
  async supprimer(@Param('code') code: string): Promise<void> {
    const ok = await this.repo.supprimer(code);
    if (!ok) throw new NotFoundException('Code traceur inconnu');
  }
}
