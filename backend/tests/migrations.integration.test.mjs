import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { runMigrations } from '../src/migrations.mjs';
import { validateMigrationTestTarget } from './migration-target.unit.mjs';

const migrationTarget = validateMigrationTestTarget({ allowed: process.env.MIGRATIONS_TEST_ALLOWED, databaseUrl: process.env.DATABASE_URL });
const initialSchema = await readFile(new URL('../../database/init.sql', import.meta.url), 'utf8');
const expectedMigrations = [
  '0000_initial_schema.sql',
  '0001_message_delivery_and_idempotency.sql',
  '0002_events.sql',
  '0003_account_security.sql',
  '0004_aurora_settings.sql',
  '0005_aurora_knowledge_base.sql',
  '0006_ai_usage_and_quotas.sql',
  '0007_platform_admin_and_tenant_control.sql',
  '0008_platform_tenant_operations.sql',
  '0009_platform_access_readonly.sql',
  '0010_aurora_multi_provider_byok.sql'
];

const identitySql = 'SELECT current_database() AS database, current_user AS user, inet_server_addr() AS address, inet_server_port() AS port';

const createGuardedPool = rawPool => ({
  async connect() {
    const rawClient = await rawPool.connect();
    let verified = false;
    const verify = async () => {
      const result = await rawClient.query(identitySql);
      const row = result.rows[0];
      if (row.database !== migrationTarget.database || String(row.port) !== migrationTarget.port || row.address !== migrationTarget.hostname) {
        throw new Error('destino PostgreSQL conectado não corresponde ao alvo autorizado');
      }
      verified = true;
    };
    return {
      async query(sql, values) {
        if (!verified) await verify();
        return rawClient.query(sql, values);
      },
      release() { rawClient.release(); }
    };
  },
  async query(sql, values) {
    const client = await this.connect();
    try { return await client.query(sql, values); } finally { client.release(); }
  },
  async end() { return rawPool.end(); }
});

const rawPool = new Pool({ connectionString: process.env.DATABASE_URL });
const pool = createGuardedPool(rawPool);

const resetPublicSchema = async () => {
  const client = await pool.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await client.query('GRANT USAGE, CREATE ON SCHEMA public TO CURRENT_USER');
  } finally {
    client.release();
  }
};

before(resetPublicSchema);
after(async () => {
  try {
    await resetPublicSchema();
  } finally {
    await pool.end();
  }
});

test('banco novo recebe todas as migrations em ordem', async () => {
  await runMigrations(pool);
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  assert.deepEqual(result.rows.map(row => row.version), expectedMigrations);
});

test('schema consolidado completo registra baseline e aplica somente migrations posteriores', async () => {
  await resetPublicSchema();
  await pool.query(initialSchema);
  await runMigrations(pool);
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  assert.deepEqual(result.rows.map(row => row.version), expectedMigrations);
});

test('schema incompleto não é reconhecido como baseline íntegra', async () => {
  await resetPublicSchema();
  await pool.query('CREATE TABLE organizations (id UUID PRIMARY KEY)');
  await assert.rejects(
  () => runMigrations(pool),
    error => {
      assert.equal(error.code, '42P07');
      return true;
    }
  );
  const result = await pool.query("SELECT to_regclass('public.schema_migrations') AS table_name");
  assert.equal(result.rows[0].table_name, 'schema_migrations');
  const applied = await pool.query('SELECT COUNT(*)::int AS count FROM schema_migrations');
  assert.equal(applied.rows[0].count, 0);
});
