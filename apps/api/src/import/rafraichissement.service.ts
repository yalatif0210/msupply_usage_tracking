import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module.js';

/**
 * Rafraîchit les vues d'indicateurs et gèle le mois PAQD du lot dans
 * `hist_score_site`. S'exécute APRÈS la transaction de promotion (ADR 0003) :
 * un échec ici n'annule pas le lot déjà promu.
 */
@Injectable()
export class RafraichissementService {
  private readonly logger = new Logger(RafraichissementService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async rafraichir(lotId: number): Promise<void> {
    try {
      await this.pool.query('CALL dqa.rafraichir_et_geler($1)', [lotId]);
    } catch (err) {
      // Le lot reste « validé » : les données sont en core, seul l'affichage
      // des scores est en retard jusqu'au prochain rafraîchissement.
      this.logger.error(
        `rafraîchissement du lot ${lotId} échoué : ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}
