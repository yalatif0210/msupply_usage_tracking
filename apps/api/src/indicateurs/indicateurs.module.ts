import { Module } from '@nestjs/common';
import { IndicateursController } from './indicateurs.controller.js';
import { IndicateursRepository } from './indicateurs.repository.js';

@Module({
  controllers: [IndicateursController],
  providers: [IndicateursRepository],
})
export class IndicateursModule {}
