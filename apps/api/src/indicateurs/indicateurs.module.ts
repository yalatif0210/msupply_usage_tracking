import { Module } from '@nestjs/common';
import { IndicateursController } from './indicateurs.controller.js';
import { IndicateursRepository } from './indicateurs.repository.js';
import { TerritoireController } from './territoire.controller.js';
import { TerritoireRepository } from './territoire.repository.js';

@Module({
  controllers: [IndicateursController, TerritoireController],
  providers: [IndicateursRepository, TerritoireRepository],
})
export class IndicateursModule {}
