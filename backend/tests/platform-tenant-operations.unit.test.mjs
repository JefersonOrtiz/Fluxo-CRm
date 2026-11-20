import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0008_platform_tenant_operations.sql', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.mjs', import.meta.url), 'utf8');

test('migration cria operações por tenant com integridade financeira', () => {
  for (const table of ['platform_tenant_features', 'platform_billing_invoices']) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration, /organization_id UUID NOT NULL REFERENCES organizations\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /amount NUMERIC\(30,12\) NOT NULL CHECK \(amount >= 0\)/);
  assert.match(migration, /UNIQUE \(organization_id, competence\)/);
});

test('endpoints administrativos previstos estão implementados no backend', () => {
  for (const route of ['/api/platform/tenant-users', '/api/platform/features', '/api/platform/audit', '/api/platform/connections', '/api/platform/billing']) assert.match(app, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(app, /requirePlatformAdmin\(session\)/);
  assert.match(app, /WHERE organization_id=\$1/);
});
