import { Controller, Get, Query } from '@nestjs/common';
import {
  sitesTerritoireQuerySchema,
  syntheseTerritoireQuerySchema,
  type LigneTerritoireRapports,
  type LigneTerritoireScores,
  type SitesTerritoireQuery,
  type SyntheseTerritoireQuery,
  type SyntheseTerritoireRapports,
  type SyntheseTerritoireScores,
} from '@dqa/contracts';
import { ZodValidationPipe } from '../commun/zod-validation.pipe.js';
import { TerritoireRepository } from './territoire.repository.js';

/** Synthèse nationale par territoire : Région, zone de district, site. */
@Controller('synthese/territoire')
export class TerritoireController {
  constructor(private readonly repo: TerritoireRepository) {}

  @Get('rapports')
  rapports(
    @Query(new ZodValidationPipe(syntheseTerritoireQuerySchema)) q: SyntheseTerritoireQuery,
  ): Promise<SyntheseTerritoireRapports> {
    return this.repo.rapports(q);
  }

  @Get('rapports/sites')
  sitesRapports(
    @Query(new ZodValidationPipe(sitesTerritoireQuerySchema)) q: SitesTerritoireQuery,
  ): Promise<LigneTerritoireRapports[]> {
    return this.repo.sitesRapports(q);
  }

  @Get('scores')
  scores(
    @Query(new ZodValidationPipe(syntheseTerritoireQuerySchema)) q: SyntheseTerritoireQuery,
  ): Promise<SyntheseTerritoireScores> {
    return this.repo.scores(q);
  }

  @Get('scores/sites')
  sitesScores(
    @Query(new ZodValidationPipe(sitesTerritoireQuerySchema)) q: SitesTerritoireQuery,
  ): Promise<LigneTerritoireScores[]> {
    return this.repo.sitesScores(q);
  }

  @Get('strates')
  strates(): Promise<string[]> {
    return this.repo.strates();
  }
}
