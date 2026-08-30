import { Module } from '@nestjs/common';
import { ImportController } from './import.controller.js';
import { ImportRepository } from './import.repository.js';
import { ImportService } from './import.service.js';
import { StagingService } from './staging.service.js';
import { ValidationService } from './validation.service.js';

@Module({
  controllers: [ImportController],
  providers: [ImportService, ValidationService, StagingService, ImportRepository],
  exports: [ImportRepository],
})
export class ImportModule {}
