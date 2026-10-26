import { Module } from '@nestjs/common';
import { StocksController } from './stocks.controller.js';
import { StocksRepository } from './stocks.repository.js';

@Module({
  controllers: [StocksController],
  providers: [StocksRepository],
})
export class StocksModule {}
