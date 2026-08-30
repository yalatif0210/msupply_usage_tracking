import { Module } from '@nestjs/common';
import { TraceursController } from './traceurs.controller.js';
import { TraceursRepository } from './traceurs.repository.js';

@Module({
  controllers: [TraceursController],
  providers: [TraceursRepository],
})
export class AdminModule {}
