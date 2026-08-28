import { Controller, Get } from '@nestjs/common';
import { PILIERS } from '@dqa/contracts';

interface EtatSante {
  statut: 'ok';
  service: string;
  version: string;
  piliersConnus: number;
}

/** Contrôle de santé — non authentifié, utilisé par l'infra et les tests. */
@Controller('sante')
export class HealthController {
  @Get()
  sante(): EtatSante {
    return {
      statut: 'ok',
      service: '@dqa/api',
      version: process.env.npm_package_version ?? '0.0.0',
      piliersConnus: PILIERS.length,
    };
  }
}
