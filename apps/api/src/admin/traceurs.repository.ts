import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { EntreeProduitTraceur, ProduitTraceur } from '@dqa/contracts';
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

  /** Crée ou met à jour un traceur (clé : produit_code). */
  async enregistrer(e: EntreeProduitTraceur): Promise<ProduitTraceur> {
    const { rows } = await this.pool.query<Ligne>(
      `INSERT INTO dqa.dim_produit_traceur (produit_code, libelle, actif, maj_le)
       VALUES ($1, $2, coalesce($3, true), now())
       ON CONFLICT (produit_code) DO UPDATE SET
         libelle = coalesce(EXCLUDED.libelle, dqa.dim_produit_traceur.libelle),
         actif   = coalesce($3, dqa.dim_produit_traceur.actif),
         maj_le  = now()
       RETURNING produit_code, libelle, actif, maj_le`,
      [e.produitCode, e.libelle ?? null, e.actif ?? null],
    );
    return vers(rows[0]!);
  }

  async supprimer(produitCode: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM dqa.dim_produit_traceur WHERE produit_code = $1`,
      [produitCode],
    );
    return (rowCount ?? 0) > 0;
  }
}
