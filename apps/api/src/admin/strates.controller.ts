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
  entreeStrateSchema,
  type EntreeStrate,
  type StrateStructure,
  type VueStrates,
} from '@dqa/contracts';
import { Roles } from '../auth/auth.metadata.js';
import { ZodValidationPipe } from '../commun/zod-validation.pipe.js';
import { StratesRepository } from './strates.repository.js';

@Controller('admin/strates')
export class StratesController {
  constructor(private readonly repo: StratesRepository) {}

  /** Lecture ouverte à tout utilisateur authentifié. */
  @Get()
  etat(): Promise<VueStrates> {
    return this.repo.etat();
  }

  @Roles(['coordination'])
  @Put(':typeStructure')
  enregistrer(
    @Param('typeStructure') typeStructure: string,
    @Body(new ZodValidationPipe(entreeStrateSchema)) corps: EntreeStrate,
  ): Promise<StrateStructure> {
    return this.repo.enregistrer(typeStructure, corps);
  }

  @Roles(['coordination'])
  @Delete(':typeStructure')
  @HttpCode(204)
  async supprimer(@Param('typeStructure') typeStructure: string): Promise<void> {
    const ok = await this.repo.supprimer(typeStructure);
    if (!ok) throw new NotFoundException('Type de structure sans correspondance');
  }
}
