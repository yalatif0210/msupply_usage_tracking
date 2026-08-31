import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { entreeGrilleSchema, type EntreeGrille, type GrilleDetail, type GrilleParametre } from '@dqa/contracts';
import { Roles } from '../auth/auth.metadata.js';
import { ZodValidationPipe } from '../commun/zod-validation.pipe.js';
import { GrilleRepository } from './grille.repository.js';

@Controller('admin/grille')
@Roles(['coordination'])
export class GrilleController {
  constructor(private readonly repo: GrilleRepository) {}

  @Get()
  lister(): Promise<GrilleParametre[]> {
    return this.repo.lister();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number): Promise<GrilleDetail> {
    return this.repo.detail(id);
  }

  @Post()
  creer(@Body(new ZodValidationPipe(entreeGrilleSchema)) entree: EntreeGrille): Promise<GrilleDetail> {
    return this.repo.creer(entree);
  }

  @Put(':id')
  modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(entreeGrilleSchema)) entree: EntreeGrille,
  ): Promise<GrilleDetail> {
    return this.repo.modifier(id, entree);
  }

  @Delete(':id')
  @HttpCode(204)
  supprimer(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.repo.supprimer(id);
  }
}
