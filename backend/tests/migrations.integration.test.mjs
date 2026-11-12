import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { runMigrations } from '../src/migrations.mjs';

if (process.env.MIGRATIONS_TEST_ALLOWED !== 'true') {
  throw new Error('Defina MIGRATIONS_TEST_ALLOWED=true somente em um banco descartável');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const initialSchema = await readFile(new URL('../../database/init.sql', import.meta.url), 'utf8');

const resetPublicSchema = async () => {
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query('GRANT ALL ON SCHEMA public TO PUBLIC');
};

before(resetPublicSchema);
after(async () => {
  await resetPublicSchema();
  await pool.end();
});

test('banco novo recebe todas as migrations em ordem', async () => {
  await runMigrations(pool);
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  assert.deepEqual(result.rows.map(row => row.version), [
    '0000_initial_schema.sql', '0001_message_delivery_and_idempotency.sql', '0002_events.sql'
  ]);
});

test('schema consolidado completo registra baseline e aplica somente migrations posteriores', async () => {
  await resetPublicSchema();
  await pool.query(initialSchema);
  await runMigrations(pool);
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  assert.deepEqual(result.rows.map(row => row.version), [
    '0000_initial_schema.sql', '0001_message_delivery_and_idempotency.sql', '0002_events.sql'
  ]);
});

test('schema incompleto não é reconhecido como baseline íntegra', async () => {
  await resetPublicSchema();
  await pool.query('CREATE TABLE organizations (id UUID PRIMARY KEY)');
  await assert.rejects(() => runMigrations(pool), /relation "organizations" already exists/);
  const result = await pool.query("SELECT to_regclass('public.schema_migrations') AS table_name");
  assert.equal(result.rows[0].table_name, 'schema_migrations');
  const applied = await pool.query('SELECT COUNT(*)::int AS count FROM schema_migrations');
  assert.equal(applied.rows[0].count, 0);
});
