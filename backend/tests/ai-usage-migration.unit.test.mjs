import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(new URL('../migrations/0006_ai_usage_and_quotas.sql', import.meta.url));
const sql = await readFile(migrationPath, 'utf8');

test('migration de uso da IA preserva escopo por organização e idempotência', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ai_usage/i);
  assert.match(sql, /organization_id UUID NOT NULL REFERENCES organizations\(id\) ON DELETE RESTRICT/i);
  assert.match(sql, /request_id UUID NOT NULL/i);
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS ai_usage_organization_request_idx[\s\S]*organization_id, request_id/i);
  assert.match(sql, /REFERENCES users\(organization_id, id\)[\s\S]*ON DELETE SET NULL \(user_id\)/i);
  assert.match(sql, /users_organization_id_id_key UNIQUE \(organization_id, id\)/i);
  assert.match(sql, /FOREIGN KEY \(organization_id, user_id\)[\s\S]*REFERENCES users\(organization_id, id\)/i);
});

test('migration define quotas finitas e campos de reserva e consumo', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ai_quotas/i);
  for (const field of ['requests_limit', 'input_tokens_limit', 'output_tokens_limit', 'cost_limit', 'reserved_requests', 'reserved_input_tokens', 'reserved_output_tokens', 'reserved_cost', 'consumed_requests', 'consumed_input_tokens', 'consumed_output_tokens', 'consumed_cost']) {
    assert.match(sql, new RegExp(`\\b${field}\\b`));
  }
  assert.match(sql, /NOT NULL CHECK \(requests_limit >= 0\)/i);
  assert.match(sql, /PRIMARY KEY \(organization_id, period_start\)/i);
  assert.match(sql, /period_start = date_trunc\('month', period_start\)::date/i);
  assert.match(sql, /period_end = \(period_start \+ INTERVAL '1 month'\)::date/i);
});

test('migration registra estados, origem da medição, expiração e política conservadora', () => {
  for (const state of ['reserved', 'completed', 'failed', 'timed_out', 'cancelled', 'rejected', 'reconciliation_pending']) assert.match(sql, new RegExp(`'${state}'`));
  for (const source of ['provider', 'estimated', 'unknown', 'none']) assert.match(sql, new RegExp(`'${source}'`));
  assert.match(sql, /reservation_expires_at TIMESTAMPTZ/i);
  assert.match(sql, /não libera automaticamente/i);
  for (const field of ['provider_request_id', 'reconciled_at', 'reconciled_by', 'reconciliation_reason', 'reservation_released_at', 'updated_at', 'rate_id']) assert.match(sql, new RegExp(`\\b${field}\\b`));
});

test('migration mantém histórico de tarifas por modelo e período', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ai_model_rates/i);
  assert.match(sql, /input_price_per_million NUMERIC\(30,12\) NOT NULL/i);
  assert.match(sql, /output_price_per_million NUMERIC\(30,12\) NOT NULL/i);
  assert.match(sql, /effective_from TIMESTAMPTZ NOT NULL/i);
  assert.match(sql, /effective_until TIMESTAMPTZ/i);
  assert.match(sql, /UNIQUE \(provider, model, currency, effective_from\)/i);
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS btree_gist/i);
  assert.match(sql, /EXCLUDE USING gist/i);
});
