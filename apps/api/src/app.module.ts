import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { ImportModule } from './import/import.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, ImportModule],
  controllers: [HealthController],
})
export class AppModule {}
