import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Utilisateur } from '@dqa/contracts';
import type { Pool } from 'pg';
import { PG_POOL } from '../database/database.module.js';
import { verifierMotDePasse } from './password.js';

const DUREE_SESSION_H = 12;

interface LigneUtilisateur {
  id: string;
  identifiant: string;
  nom: string;
  role: Utilisateur['role'];
  mot_de_passe_hash: string;
}

@Injectable()
export class AuthService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Vérifie les identifiants et ouvre une session. Renvoie l'id de session. */
  async connexion(
    identifiant: string,
    motDePasse: string,
  ): Promise<{ sessionId: string; utilisateur: Utilisateur; expireLe: Date }> {
    const { rows } = await this.pool.query<LigneUtilisateur>(
      `SELECT id, identifiant, nom, role, mot_de_passe_hash
       FROM dqa.utilisateur WHERE identifiant = $1 AND actif = true`,
      [identifiant],
    );
    const u = rows[0];
    if (!u || !(await verifierMotDePasse(motDePasse, u.mot_de_passe_hash))) {
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect');
    }
    const expireLe = new Date(Date.now() + DUREE_SESSION_H * 3_600_000);
    const { rows: sess } = await this.pool.query<{ id: string }>(
      `INSERT INTO dqa.session (utilisateur_id, expire_le) VALUES ($1, $2) RETURNING id`,
      [u.id, expireLe],
    );
    return {
      sessionId: sess[0]!.id,
      utilisateur: { id: u.id, identifiant: u.identifiant, nom: u.nom, role: u.role },
      expireLe,
    };
  }

  /** Charge l'utilisateur d'une session valide, ou `null`. */
  async utilisateurDeSession(sessionId: string | undefined): Promise<Utilisateur | null> {
    if (!sessionId) return null;
    const { rows } = await this.pool.query<LigneUtilisateur & { expire_le: Date }>(
      `SELECT u.id, u.identifiant, u.nom, u.role, u.mot_de_passe_hash, s.expire_le
       FROM dqa.session s JOIN dqa.utilisateur u ON u.id = s.utilisateur_id
       WHERE s.id = $1 AND s.expire_le > now() AND u.actif = true`,
      [sessionId],
    );
    const r = rows[0];
    return r ? { id: r.id, identifiant: r.identifiant, nom: r.nom, role: r.role } : null;
  }

  async deconnexion(sessionId: string | undefined): Promise<void> {
    if (sessionId) {
      await this.pool.query(`DELETE FROM dqa.session WHERE id = $1`, [sessionId]);
    }
  }
}
