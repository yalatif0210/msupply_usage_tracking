import { Controller, Get, Query } from '@nestjs/common';
import { suiviStocksQuerySchema, type SuiviStocks, type SuiviStocksQuery } from '@dqa/contracts';
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
}
