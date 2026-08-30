import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AnomalieImport, LotImport } from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';

interface LigneLot {
  id: string; // bigint → renvoyé en texte par pg
  nom_fichier: string;
  cycle_paqd: string | null;
  mois_paqd: string | null;
  recu_le: Date;
  importe_le: Date | null;
  statut: LotImport['statut'];
  motif_rejet: string | null;
  nb_lignes_declarees: Record<string, number>;
  nb_lignes_reelles: Record<string, number>;
}

function versLot(r: LigneLot): LotImport {
  return {
    id: Number(r.id),
    nomFichier: r.nom_fichier,
    cyclePaqd: r.cycle_paqd,
    moisPaqd: r.mois_paqd,
    recuLe: r.recu_le.toISOString(),
    importeLe: r.importe_le ? r.importe_le.toISOString() : null,
    statut: r.statut,
    motifRejet: r.motif_rejet,
    nbLignesDeclarees: r.nb_lignes_declarees ?? {},
    nbLignesReelles: r.nb_lignes_reelles ?? {},
  };
}

const CHAMPS_LOT = `id, nom_fichier, cycle_paqd, mois_paqd, recu_le, importe_le,
  statut, motif_rejet, nb_lignes_declarees, nb_lignes_reelles`;

@Injectable()
export class ImportRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listerLots(): Promise<LotImport[]> {
    const { rows } = await this.pool.query<LigneLot>(
      `SELECT ${CHAMPS_LOT} FROM dqa.import_lot ORDER BY recu_le DESC`,
    );
    return rows.map(versLot);
  }

  async lot(id: number): Promise<LotImport | null> {
    const { rows } = await this.pool.query<LigneLot>(
      `SELECT ${CHAMPS_LOT} FROM dqa.import_lot WHERE id = $1`,
      [id],
    );
    return rows[0] ? versLot(rows[0]) : null;
  }

  async anomaliesDuLot(id: number): Promise<AnomalieImport[]> {
    const { rows } = await this.pool.query<{
      onglet: string | null;
      ligne_source: number | null;
      gravite: AnomalieImport['gravite'];
      code: string;
      message: string;
      valeur_brute: string | null;
    }>(
      `SELECT onglet, ligne_source, gravite, code, message, valeur_brute
       FROM dqa.import_anomalie WHERE lot_id = $1
       ORDER BY CASE gravite WHEN 'erreur' THEN 0 WHEN 'avertissement' THEN 1 ELSE 2 END,
                onglet NULLS FIRST, ligne_source NULLS FIRST, id`,
      [id],
    );
    return rows.map((r) => ({
      onglet: r.onglet,
      ligneSource: r.ligne_source,
      gravite: r.gravite,
      code: r.code,
      message: r.message,
      valeurBrute: r.valeur_brute,
    }));
  }
}
