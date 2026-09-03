import { Module } from '@nestjs/common';
import { ComptesController } from './comptes.controller.js';
import { ComptesRepository } from './comptes.repository.js';
import { GrilleController } from './grille.controller.js';
import { GrilleRepository } from './grille.repository.js';
import { StratesController } from './strates.controller.js';
import { StratesRepository } from './strates.repository.js';
import { TraceursController } from './traceurs.controller.js';
import { TraceursRepository } from './traceurs.repository.js';

@Module({
  controllers: [TraceursController, GrilleController, ComptesController, StratesController],
  providers: [TraceursRepository, GrilleRepository, ComptesRepository, StratesRepository],
})
export class AdminModule {}
