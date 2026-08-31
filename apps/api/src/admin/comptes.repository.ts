import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import type { CompteAdmin, EntreeCompte, MajCompte } from '@dqa/contracts';
import { PG_POOL } from '../database/database.module.js';
import { estDoublon } from '../commun/erreurs-pg.js';
import { hacherMotDePasse } from '../auth/password.js';

interface LigneCompte {
  id: string;
  identifiant: string;
  nom: string;
  role: CompteAdmin['role'];
  actif: boolean;
  cree_le: Date;
}

const vers = (r: LigneCompte): CompteAdmin => ({
  id: r.id,
  identifiant: r.identifiant,
  nom: r.nom,
  role: r.role,
  actif: r.actif,
  creeLe: r.cree_le.toISOString(),
});

const COLONNES = 'id, identifiant, nom, role, actif, cree_le';

@Injectable()
export class ComptesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async lister(): Promise<CompteAdmin[]> {
    const { rows } = await this.pool.query<LigneCompte>(
      `SELECT ${COLONNES} FROM dqa.utilisateur ORDER BY identifiant`,
    );
    return rows.map(vers);
  }

  async creer(e: EntreeCompte): Promise<CompteAdmin> {
    const hash = await hacherMotDePasse(e.motDePasse);
    try {
      const { rows } = await this.pool.query<LigneCompte>(
        `INSERT INTO dqa.utilisateur (identifiant, nom, role, mot_de_passe_hash)
         VALUES ($1, $2, $3, $4) RETURNING ${COLONNES}`,
        [e.identifiant, e.nom, e.role, hash],
      );
      return vers(rows[0]!);
    } catch (err) {
      if (estDoublon(err)) throw new ConflictException('Cet identifiant est déjà pris');
      throw err;
    }
  }

  async modifier(id: string, maj: MajCompte, appelantId: string): Promise<CompteAdmin> {
    if (id === appelantId && (!maj.actif || maj.role !== 'admin')) {
      throw new BadRequestException(
        'Vous ne pouvez pas vous désactiver ni retirer votre propre rôle administrateur',
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // sérialise les modifications concurrentes qui touchent des admins actifs
      await client.query(`SELECT 1 FROM dqa.utilisateur WHERE role = 'admin' AND actif = true FOR UPDATE`);

      const cible = await client.query(`SELECT 1 FROM dqa.utilisateur WHERE id = $1`, [id]);
      if (cible.rowCount === 0) throw new NotFoundException('Compte inconnu');

      const { rows } = await client.query<LigneCompte>(
        `UPDATE dqa.utilisateur SET nom = $1, role = $2, actif = $3 WHERE id = $4 RETURNING ${COLONNES}`,
        [maj.nom, maj.role, maj.actif, id],
      );
      const restants = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM dqa.utilisateur WHERE role = 'admin' AND actif = true`,
      );
      if (restants.rows[0]!.n === 0) {
        throw new BadRequestException('Au moins un administrateur actif doit subsister');
      }
      await client.query('COMMIT');
      return vers(rows[0]!);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async reinitialiserMotDePasse(id: string, motDePasse: string): Promise<void> {
    const hash = await hacherMotDePasse(motDePasse);
    const { rowCount } = await this.pool.query(
      `UPDATE dqa.utilisateur SET mot_de_passe_hash = $1 WHERE id = $2`,
      [hash, id],
    );
    if (!rowCount) throw new NotFoundException('Compte inconnu');
  }
}
