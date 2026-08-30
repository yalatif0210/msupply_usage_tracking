import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';

/**
 * Base PostgreSQL éphémère pour les tests d'intégration (jamais de mock —
 * cf. CLAUDE.md §3). Démarre un conteneur, applique toutes les migrations,
 * expose l'URL via `process.env.DATABASE_URL` et rend un pool. `stop()`
 * détruit tout.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../db/migrations', import.meta.url));

export interface BaseEphemere {
  pool: Pool;
  uri: string;
  stop: () => Promise<void>;
}

async function appliquerMigrations(pool: Pool): Promise<void> {
  const noms = (await readdir(MIGRATIONS_DIR)).filter((n) => n.endsWith('.sql')).sort();
  for (const nom of noms) {
    const sql = await readFile(`${MIGRATIONS_DIR}/${nom}`, 'utf8');
    await pool.query(sql);
  }
}

export async function demarrerBaseEphemere(): Promise<BaseEphemere> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16-alpine',
  ).start();
  const uri = container.getConnectionUri();
  process.env.DATABASE_URL = uri;
  const pool = new Pool({ connectionString: uri });
  await appliquerMigrations(pool);
  return {
    pool,
    uri,
    stop: async () => {
      await pool.end();
      await container.stop();
      delete process.env.DATABASE_URL;
    },
  };
}
