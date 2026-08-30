import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module.js';
import type { ClasseurLu, LigneLue } from './lecture-classeur.js';
import { JEUX } from './contrat-jeux.js';

type Executeur = Pool | PoolClient;

@Injectable()
export class StagingService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Écrit tous les jeux du classeur dans les tables `stg_*`, pour un lot. */
  async ecrire(lotId: number, classeur: ClasseurLu, client?: PoolClient): Promise<void> {
    const exec: Executeur = client ?? this.pool;
    for (const def of JEUX) {
      const onglet = classeur.onglets.get(def.onglet);
      if (!onglet || onglet.lignes.length === 0) continue;
      await this.inserer(exec, def.table, def.colonnes, onglet.lignes, lotId);
    }
  }

  private async inserer(
    exec: Executeur,
    table: string,
    cols: readonly string[],
    lignes: readonly LigneLue[],
    lotId: number,
  ): Promise<void> {
    const colonnes = ['lot_id', 'ligne_source', ...cols].join(', ');
    // pg plafonne à ~65535 paramètres ; on borne la taille des lots
    const parLigne = cols.length + 2;
    const taille = Math.max(1, Math.floor(60000 / parLigne));

    for (let i = 0; i < lignes.length; i += taille) {
      const tranche = lignes.slice(i, i + taille);
      const valeurs: unknown[] = [];
      const groupes: string[] = [];
      let p = 1;
      for (const ligne of tranche) {
        const ph = [`$${p++}`, `$${p++}`];
        valeurs.push(lotId, ligne.ligneSource);
        for (const col of cols) {
          ph.push(`$${p++}`);
          const v = ligne.valeurs[col] ?? '';
          valeurs.push(v === '' ? null : v);
        }
        groupes.push(`(${ph.join(', ')})`);
      }
      await exec.query(
        `INSERT INTO dqa.${table} (${colonnes}) VALUES ${groupes.join(', ')}`,
        valeurs,
      );
    }
  }
}
