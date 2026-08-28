import { Pool } from 'pg';

/**
 * Chaîne de connexion PostgreSQL. Aucune valeur par défaut de production : la
 * variable doit être fournie par l'environnement (Docker Compose, CI, .env).
 */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL manquante');
  }
  return url;
}

let pool: Pool | undefined;

export function getPool(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl() });
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
