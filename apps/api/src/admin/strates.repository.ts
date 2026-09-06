import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { StrateStructure, VueStrates } from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';

interface Ligne {
  type_structure: string;
  strate: string;
  jour_limite_requisition: number;
  est_district: boolean;
}

const vers = (r: Ligne): StrateStructure => ({
  typeStructure: r.type_structure,
  strate: r.strate,
  jourLimiteRequisition: Number(r.jour_limite_requisition),
  estDistrict: r.est_district,
});

@Injectable()
export class StratesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Les correspondances enregistrées plus les `type_structure` présents dans
   * `dim_site` (périmètre DQA) qui n'en ont pas : l'admin voit ce qu'il reste
   * à classer avant que les totaux nationaux le rangent sous « Non classé ».
   */
  async etat(): Promise<VueStrates> {
    const mappings = await this.pool.query<Ligne>(
      `SELECT type_structure, strate, jour_limite_requisition, est_district
       FROM dqa.strate_structure ORDER BY type_structure`,
    );
    const nonClasses = await this.pool.query<{ type_structure: string }>(
      `SELECT DISTINCT s.type_structure
       FROM dqa.dim_site s
       WHERE s.dans_perimetre_dqa
         AND s.type_structure IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM dqa.strate_structure m WHERE m.type_structure = s.type_structure
         )
       ORDER BY s.type_structure`,
    );
    return {
      mappings: mappings.rows.map(vers),
      nonClasses: nonClasses.rows.map((r) => r.type_structure),
    };
  }

  /** Crée ou met à jour un type de structure (clé : type_structure). */
  async enregistrer(
    typeStructure: string,
    entree: { strate: string; jourLimiteRequisition: number; estDistrict: boolean },
  ): Promise<StrateStructure> {
    const { rows } = await this.pool.query<Ligne>(
      `INSERT INTO dqa.strate_structure
         (type_structure, strate, jour_limite_requisition, est_district, maj_le)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (type_structure) DO UPDATE SET
         strate = EXCLUDED.strate,
         jour_limite_requisition = EXCLUDED.jour_limite_requisition,
         est_district = EXCLUDED.est_district,
         maj_le = now()
       RETURNING type_structure, strate, jour_limite_requisition, est_district`,
      [typeStructure, entree.strate, entree.jourLimiteRequisition, entree.estDistrict],
    );
    return vers(rows[0]!);
  }

  async supprimer(typeStructure: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM dqa.strate_structure WHERE type_structure = $1`,
      [typeStructure],
    );
    return (rowCount ?? 0) > 0;
  }
}
