import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  detailStockQuerySchema,
  suiviStocksQuerySchema,
  type DetailStock,
  type DetailStockQuery,
  type SuiviStocks,
  type SuiviStocksQuery,
} from '@dqa/contracts';
import { ZodValidationPipe } from '../commun/zod-validation.pipe.js';
import { StocksRepository } from './stocks.repository.js';

/** Suivi des stocks : CMM reconstituée et stock projeté à une date choisie. */
@Controller('stocks')
export class StocksController {
  constructor(private readonly repo: StocksRepository) {}

  @Get()
  suivi(@Query(new ZodValidationPipe(suiviStocksQuerySchema)) q: SuiviStocksQuery): Promise<SuiviStocks> {
    return this.repo.suivi(q);
  }

  @Get(':siteId/:code')
  async detail(
    @Param('siteId') siteId: string,
    @Param('code') code: string,
    @Query(new ZodValidationPipe(detailStockQuerySchema)) q: DetailStockQuery,
  ): Promise<DetailStock> {
    const d = await this.repo.detail(siteId, code, q);
    if (!d) throw new NotFoundException('Aucun stock compté connu à cette date pour ce site et ce produit');
    return d;
  }
}
