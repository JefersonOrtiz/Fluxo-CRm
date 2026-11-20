import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0007_platform_admin_and_tenant_control.sql', import.meta.url), 'utf8');
const readonlyMigration = await readFile(new URL('../migrations/0009_platform_access_readonly.sql', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.mjs', import.meta.url), 'utf8');
const migrationFiles = ['0000_initial_schema.sql', '0001_message_delivery_and_idempotency.sql', '0002_events.sql', '0003_account_security.sql', '0004_aurora_settings.sql', '0005_aurora_knowledge_base.sql', '0006_ai_usage_and_quotas.sql', '0007_platform_admin_and_tenant_control.sql', '0008_platform_tenant_operations.sql', '0009_platform_access_readonly.sql'];

test('migration cria Super Admin desativado por padrão e mantém auditoria e sessões temporárias', () => {
  assert.match(migration, /is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS platform_audit_log/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS platform_access_sessions/i);
  assert.match(migration, /expires_at TIMESTAMPTZ NOT NULL/i);
  assert.match(migration, /revoked_at TIMESTAMPTZ/i);
  assert.match(readonlyMigration, /access_mode VARCHAR\(20\) NOT NULL DEFAULT 'readonly'/i);
  assert.match(readonlyMigration, /CHECK \(access_mode IN \('readonly'\)\)/i);
  assert.match(migration, /ON DELETE RESTRICT/i);
});

test('rotas de plataforma exigem privilégio global e usam isolamento por tenant', () => {
  assert.match(app, /const requirePlatformAdmin = session =>/);
  assert.match(app, /if \(!session\.isPlatformAdmin \|\| session\.platformAccess\)/);
  assert.match(app, /FROM organizations o LEFT JOIN platform_tenant_settings/);
  assert.match(app, /WHERE \(\$1='' OR o\.name ILIKE/);
  assert.match(app, /WHERE s\.token_hash=\$1 AND s\.revoked_at IS NULL AND s\.expires_at>now\(\)/);
  assert.match(app, /X-Platform-Access-Token/);
  assert.match(app, /Acesso temporário é somente leitura/);
  assert.match(app, /access_mode/);
  assert.match(app, /Visualização administrativa/);
  assert.match(app, /canEditOrganization: false/);
});

test('bootstrap e cadastro não promovem usuários a Super Admin', () => {
  assert.doesNotMatch(app, /INSERT INTO users\([^)]*is_platform_admin/i);
});

test('migration 0009 é aditiva e vem depois das estruturas que utiliza', () => {
  assert.equal(migrationFiles.at(-1), '0009_platform_access_readonly.sql');
  assert.match(readonlyMigration, /ALTER TABLE platform_access_sessions/i);
  assert.doesNotMatch(readonlyMigration, /DROP TABLE|DROP SCHEMA|DELETE FROM|TRUNCATE/i);
  assert.match(readonlyMigration, /ADD COLUMN IF NOT EXISTS/i);
});
