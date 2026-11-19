import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0007_platform_admin_and_tenant_control.sql', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.mjs', import.meta.url), 'utf8');

test('migration cria Super Admin desativado por padrão e mantém auditoria e sessões temporárias', () => {
  assert.match(migration, /is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS platform_audit_log/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS platform_access_sessions/i);
  assert.match(migration, /expires_at TIMESTAMPTZ NOT NULL/i);
  assert.match(migration, /revoked_at TIMESTAMPTZ/i);
  assert.match(migration, /ON DELETE RESTRICT/i);
});

test('rotas de plataforma exigem privilégio global e usam isolamento por tenant', () => {
  assert.match(app, /const requirePlatformAdmin = session =>/);
  assert.match(app, /if \(!session\.isPlatformAdmin \|\| session\.platformAccess\)/);
  assert.match(app, /FROM organizations o LEFT JOIN platform_tenant_settings/);
  assert.match(app, /WHERE \(\$1='' OR o\.name ILIKE/);
  assert.match(app, /WHERE s\.token_hash=\$1 AND s\.revoked_at IS NULL AND s\.expires_at>now\(\)/);
  assert.match(app, /X-Platform-Access-Token/);
});

test('bootstrap e cadastro não promovem usuários a Super Admin', () => {
  assert.doesNotMatch(app, /INSERT INTO users\([^)]*is_platform_admin/i);
});
