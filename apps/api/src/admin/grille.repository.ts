import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type {
  EntreeGrille,
  GrilleDetail,
  GrilleParametre,
  PoidsPilier,
  SeuilSousComposante,
} from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';
import { estDoublon, estReferenceViolee } from '../commun/erreurs-pg.js';

interface LigneGrille {
  id: number;
  version: string;
  effet_a_partir_de: Date;
  cree_le: Date;
  statut: GrilleParametre['statut'];
}

const jour = (d: Date): string => d.toISOString().slice(0, 10);

const versGrille = (r: LigneGrille): GrilleParametre => ({
  id: r.id,
  version: r.version,
  effetAPartirDe: jour(r.effet_a_partir_de),
  creeLe: r.cree_le.toISOString(),
  statut: r.statut,
  modifiable: r.statut === 'planifiee',
});

const SELECT_GRILLE = `
  SELECT g.id::int AS id, g.version, g.effet_a_partir_de, g.cree_le,
         CASE
           WHEN g.effet_a_partir_de > CURRENT_DATE THEN 'planifiee'
           WHEN g.id = dqa.grille_pour_mois(to_char(CURRENT_DATE, 'YYYY-MM')) THEN 'en_vigueur'
           ELSE 'passee'
         END AS statut
  FROM dqa.grille_parametre g`;

/** Traduit une erreur pg en exception HTTP parlante. */
const traduire = (err: unknown): Error => {
  if (estDoublon(err)) return new ConflictException('Une version a déjà cette date d\'effet');
  if (estReferenceViolee(err)) {
    return new ConflictException('Version référencée par un score gelé : suppression impossible');
  }
  return err instanceof Error ? err : new Error(String(err));
};

@Injectable()
export class GrilleRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async lister(): Promise<GrilleParametre[]> {
    const { rows } = await this.pool.query<LigneGrille>(
      `${SELECT_GRILLE} ORDER BY g.effet_a_partir_de DESC`,
    );
    return rows.map(versGrille);
  }

  async detail(id: number): Promise<GrilleDetail> {
    const g = await this.pool.query<LigneGrille>(`${SELECT_GRILLE} WHERE g.id = $1`, [id]);
    if (g.rowCount === 0) throw new NotFoundException('Version de grille inconnue');

    const poids = await this.pool.query<{ pilier: PoidsPilier['pilier']; poids_pct: string }>(
      `SELECT pilier, poids_pct FROM dqa.grille_poids_pilier WHERE grille_id = $1 ORDER BY pilier`,
      [id],
    );
    const seuils = await this.pool.query<{
      sous_composante: SeuilSousComposante['sousComposante'];
      seuil: string;
      sens: SeuilSousComposante['sens'];
      tolerance: string | null;
    }>(
      `SELECT sous_composante, seuil, sens, tolerance
       FROM dqa.grille_seuil_sous_composante WHERE grille_id = $1 ORDER BY sous_composante`,
      [id],
    );

    return {
      ...versGrille(g.rows[0]!),
      poids: poids.rows.map((r) => ({ pilier: r.pilier, poidsPct: Number(r.poids_pct) })),
      seuils: seuils.rows.map((r) => ({
        sousComposante: r.sous_composante,
        seuil: Number(r.seuil),
        sens: r.sens,
        tolerance: r.tolerance === null ? null : Number(r.tolerance),
      })),
    };
  }

  async creer(e: EntreeGrille): Promise<GrilleDetail> {
    await this.exigerDateFuture(e.effetAPartirDe);
    const id = await this.enTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO dqa.grille_parametre (version, effet_a_partir_de) VALUES ($1, $2) RETURNING id`,
        [e.version, e.effetAPartirDe],
      );
      const nouvelId = Number(rows[0]!.id);
      await this.ecrireDetail(client, nouvelId, e);
      return nouvelId;
    });
    return this.detail(id);
  }

  async modifier(id: number, e: EntreeGrille): Promise<GrilleDetail> {
    await this.exigerPlanifiee(id);
    await this.exigerDateFuture(e.effetAPartirDe);
    await this.enTransaction(async (client) => {
      await client.query(
        `UPDATE dqa.grille_parametre SET version = $1, effet_a_partir_de = $2 WHERE id = $3`,
        [e.version, e.effetAPartirDe, id],
      );
      await client.query(`DELETE FROM dqa.grille_poids_pilier WHERE grille_id = $1`, [id]);
      await client.query(`DELETE FROM dqa.grille_seuil_sous_composante WHERE grille_id = $1`, [id]);
      await this.ecrireDetail(client, id, e);
    });
    return this.detail(id);
  }

  private async enTransaction<T>(travail: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await travail(client);
      await client.query('COMMIT');
      return r;
    } catch (err) {
      await client.query('ROLLBACK');
      throw traduire(err);
    } finally {
      client.release();
    }
  }

  async supprimer(id: number): Promise<void> {
    await this.exigerPlanifiee(id);
    try {
      await this.pool.query(`DELETE FROM dqa.grille_parametre WHERE id = $1`, [id]);
    } catch (err) {
      throw traduire(err);
    }
  }

  private async ecrireDetail(client: PoolClient, id: number, e: EntreeGrille): Promise<void> {
    for (const p of e.poids) {
      await client.query(
        `INSERT INTO dqa.grille_poids_pilier (grille_id, pilier, poids_pct) VALUES ($1, $2, $3)`,
        [id, p.pilier, p.poidsPct],
      );
    }
    for (const s of e.seuils) {
      await client.query(
        `INSERT INTO dqa.grille_seuil_sous_composante
           (grille_id, sous_composante, seuil, sens, unite, tolerance)
         VALUES ($1, $2, $3, $4, 'pct', $5)`,
        [id, s.sousComposante, s.seuil, s.sens, s.tolerance],
      );
    }
  }

  private async exigerDateFuture(effetAPartirDe: string): Promise<void> {
    const { rows } = await this.pool.query<{ aujourdhui: Date }>(`SELECT CURRENT_DATE AS aujourdhui`);
    if (effetAPartirDe <= jour(rows[0]!.aujourdhui)) {
      throw new BadRequestException(
        'La date d\'effet doit être dans le futur : une grille ne modifie jamais un score déjà calculé',
      );
    }
  }

  private async exigerPlanifiee(id: number): Promise<void> {
    const { rows } = await this.pool.query<{ planifiee: boolean }>(
      `SELECT effet_a_partir_de > CURRENT_DATE AS planifiee FROM dqa.grille_parametre WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundException('Version de grille inconnue');
    if (!rows[0]!.planifiee) {
      throw new ConflictException('Version en vigueur ou passée : figée (ADR 0003)');
    }
  }
}
