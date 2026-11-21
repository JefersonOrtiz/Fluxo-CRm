import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../migrations/0010_aurora_multi_provider_byok.sql', import.meta.url), 'utf8');

test('0010 keeps Aurora as the default and defines explicit tenant provider modes', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS assistant_name VARCHAR\(80\) NOT NULL DEFAULT 'Aurora'/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS provider_mode VARCHAR\(16\) NOT NULL DEFAULT 'environment'/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS active_provider VARCHAR\(20\)/i);
  assert.match(sql, /provider_mode IN \('environment', 'tenant', 'disabled'\)/i);
  assert.match(sql, /assistant_name = btrim\(assistant_name\)/i);
  assert.match(sql, /char_length\(assistant_name\) BETWEEN 1 AND 80/i);
  assert.match(sql, /assistant_name !~ '\[\[:cntrl:\]\]'/i);
});

test('0010 isolates credentials by organization and provider', () => {
  assert.match(sql, /CREATE TABLE aurora_provider_credentials/i);
  assert.match(sql, /organization_id UUID NOT NULL REFERENCES organizations\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /PRIMARY KEY \(organization_id, provider\)/i);
  assert.match(sql, /provider IN \('openai', 'anthropic'\)/i);
  assert.match(sql, /FOREIGN KEY \(organization_id, created_by\)[\s\S]*REFERENCES users\(organization_id, id\)[\s\S]*ON DELETE SET NULL \(created_by\)/i);
  assert.match(sql, /FOREIGN KEY \(organization_id, updated_by\)[\s\S]*REFERENCES users\(organization_id, id\)[\s\S]*ON DELETE SET NULL \(updated_by\)/i);
  assert.match(sql, /FOREIGN KEY \(organization_id, active_provider\)[\s\S]*REFERENCES aurora_provider_credentials\(organization_id, provider\)[\s\S]*DEFERRABLE INITIALLY DEFERRED/i);
});

test('0010 requires an encrypted envelope or revoked state without plaintext fields', () => {
  assert.match(sql, /secret_ciphertext JSONB/i);
  assert.match(sql, /credential_status IN \('configured', 'revoked'\)/i);
  assert.match(sql, /credential_status = 'configured' AND secret_ciphertext IS NOT NULL/i);
  assert.match(sql, /credential_status = 'revoked' AND secret_ciphertext IS NULL/i);
  for (const field of ['version', 'iv', 'tag', 'data']) assert.match(sql, new RegExp(`secret_ciphertext \\? '${field}'`));
  assert.doesNotMatch(sql, /api[_ ]?key|access[_ ]?token|plaintext/i);
});

test('0010 audits tenant configuration without generic sensitive payload fields', () => {
  assert.match(sql, /CREATE TABLE aurora_configuration_audit/i);
  assert.match(sql, /organization_id UUID NOT NULL REFERENCES organizations\(id\) ON DELETE CASCADE/i);
  assert.match(sql, /FOREIGN KEY \(organization_id, actor_user_id\)[\s\S]*REFERENCES users\(organization_id, id\)[\s\S]*ON DELETE SET NULL \(actor_user_id\)/i);
  assert.match(sql, /CREATE INDEX aurora_configuration_audit_org_created_idx/i);
  assert.doesNotMatch(sql, /metadata JSONB|audit_secret|audit_ciphertext/i);
});

test('0010 verifies existing constraint names and expands supported providers to Anthropic', () => {
  assert.match(sql, /conname = 'ai_model_rates_provider_check'/i);
  assert.match(sql, /conname = 'ai_usage_provider_check'/i);
  assert.match(sql, /CHECK \(provider IN \('mock', 'openai', 'anthropic'\)\)/i);
  assert.match(sql, /Validation of configured, invalid, or revoked credentials belongs to the[\s\S]*backend/i);
});
