import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquante');
  return url;
}

/**
 * Exécuteur de migrations SQL.
 *
 *   node src/db/migrate.ts up       applique les migrations non appliquées
 *   node src/db/migrate.ts status   liste l'état de chaque migration
 *
 * Chaque fichier `db/migrations/NNN_*.sql` est appliqué une fois, dans une
 * transaction, et enregistré dans `schema_migrations`. L'ordre est l'ordre
 * lexicographique des noms de fichiers.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../db/migrations', import.meta.url));

interface Migration {
  version: string;
  sql: string;
}

async function loadMigrations(): Promise<Migration[]> {
  let names: string[];
  try {
    names = (await readdir(MIGRATIONS_DIR)).filter((n) => n.endsWith('.sql')).sort();
  } catch {
    return [];
  }
  const out: Migration[] = [];
  for (const name of names) {
    out.push({
      version: name.replace(/\.sql$/, ''),
      sql: await readFile(`${MIGRATIONS_DIR}/${name}`, 'utf8'),
    });
  }
  return out;
}

async function appliedVersions(client: Client): Promise<Set<string>> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
  return new Set(rows.map((r) => r.version));
}

async function up(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const applied = await appliedVersions(client);
    const pending = (await loadMigrations()).filter((m) => !applied.has(m.version));
    if (pending.length === 0) {
      console.log('Aucune migration à appliquer.');
      return;
    }
    for (const m of pending) {
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [m.version]);
        await client.query('COMMIT');
        console.log(`appliquée  ${m.version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`échec de la migration ${m.version}: ${detail}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function status(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const applied = await appliedVersions(client);
    const migrations = await loadMigrations();
    if (migrations.length === 0) {
      console.log('(aucune migration dans db/migrations)');
      return;
    }
    for (const m of migrations) {
      console.log(`${applied.has(m.version) ? '[x]' : '[ ]'} ${m.version}`);
    }
  } finally {
    await client.end();
  }
}

const command = process.argv[2] ?? 'status';
const action = command === 'up' ? up : command === 'status' ? status : undefined;
if (!action) {
  console.error(`commande inconnue: ${command} (attendu: up | status)`);
  process.exit(2);
}
action().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
