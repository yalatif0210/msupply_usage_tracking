import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ProduitTraceur } from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';

interface Ligne {
  produit_code: string;
  libelle: string | null;
  actif: boolean;
  maj_le: Date;
}

const vers = (r: Ligne): ProduitTraceur => ({
  produitCode: r.produit_code,
  libelle: r.libelle,
  actif: r.actif,
  majLe: r.maj_le.toISOString(),
});

@Injectable()
export class TraceursRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async lister(): Promise<ProduitTraceur[]> {
    const { rows } = await this.pool.query<Ligne>(
      `SELECT produit_code, libelle, actif, maj_le
       FROM dqa.dim_produit_traceur ORDER BY produit_code`,
    );
    return rows.map(vers);
  }
}
