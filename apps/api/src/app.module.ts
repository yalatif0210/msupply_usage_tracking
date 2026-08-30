import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { ImportModule } from './import/import.module.js';
import { IndicateursModule } from './indicateurs/indicateurs.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, ImportModule, IndicateursModule, AdminModule],
  controllers: [HealthController],
})
export class AppModule {}
