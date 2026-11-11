import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));

export async function runMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('fluxo_crm_migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(160) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(migrationsDirectory)).filter(file => file.endsWith('.sql')).sort();
    const applied = await client.query('SELECT version FROM schema_migrations');
    const completed = new Set(applied.rows.map(row => row.version));
    for (const file of files) {
      if (completed.has(file)) continue;
      const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [file]);
        await client.query('COMMIT');
        console.log(`Migration aplicada: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('fluxo_crm_migrations'))").catch(() => {});
    client.release();
  }
}
