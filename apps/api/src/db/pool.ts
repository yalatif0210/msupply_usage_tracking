import { Pool } from 'pg';

let pool: Pool | undefined;

/**
 * Pool PostgreSQL partagé. La connexion est paresseuse : le pool se construit
 * sans erreur même sans `DATABASE_URL`, l'échec ne survient qu'à la première
 * requête (utile pour les tests qui ne touchent pas la base).
 */
export function getPool(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
