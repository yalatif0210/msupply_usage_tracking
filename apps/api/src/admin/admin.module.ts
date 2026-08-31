import { Module } from '@nestjs/common';
import { GrilleController } from './grille.controller.js';
import { GrilleRepository } from './grille.repository.js';
import { TraceursController } from './traceurs.controller.js';
import { TraceursRepository } from './traceurs.repository.js';

@Module({
  controllers: [TraceursController, GrilleController],
  providers: [TraceursRepository, GrilleRepository],
})
export class AdminModule {}
