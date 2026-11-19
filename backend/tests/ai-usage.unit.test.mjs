import test from 'node:test';
import assert from 'node:assert/strict';
import { addDecimal, calculateTokenCost, calculateUsageCost, canReserveQuota, decimalToScaledInteger, finalizeQuotaUsage, nonNegativeInteger, normalizeUsageMetadata, quotaPeriodUtc, reserveQuota, scaledIntegerToDecimal, usageLimits } from '../src/ai-usage.mjs';

test('calcula períodos UTC com mudança de ano', () => {
  assert.deepEqual(quotaPeriodUtc('2026-12-31T23:59:59-03:00'), { periodStart: '2027-01-01', periodEnd: '2027-02-01' });
  assert.deepEqual(quotaPeriodUtc('2026-02-01T00:00:00Z'), { periodStart: '2026-02-01', periodEnd: '2026-03-01' });
});

test('autoriza quota suficiente, limite exato e bloqueia quota esgotada ou ausente', () => {
  const quota = { requestsLimit: 10, inputTokensLimit: 100, outputTokensLimit: 100, costLimit: '1.000000000000' };
  assert.equal(canReserveQuota({ quota, consumed: { requests: 9, inputTokens: 90, outputTokens: 90, cost: '0.9' }, reserved: {}, reservation: { requests: 1, inputTokens: 10, outputTokens: 10, cost: '0.1' } }).allowed, true);
  assert.equal(canReserveQuota({ quota, consumed: { requests: 10, inputTokens: 90, outputTokens: 90, cost: '0.9' }, reserved: {}, reservation: { requests: 1 } }).reason, 'QUOTA_EXCEEDED');
  assert.equal(canReserveQuota({ quota: null, reservation: {} }).reason, 'QUOTA_MISSING');
});

test('rejeita valores negativos, inválidos e não finitos', () => {
  for (const value of [-1, '-1', 'NaN', 'Infinity', '1e3']) assert.throws(() => decimalToScaledInteger(value));
  assert.throws(() => nonNegativeInteger(1.2));
  assert.throws(() => calculateTokenCost(-1, '1'));
  assert.throws(() => canReserveQuota({ quota: { requestsLimit: -1, inputTokensLimit: 1, outputTokensLimit: 1, costLimit: '1' }, reservation: {} }));
});

test('preserva custos muito pequenos com NUMERIC fixo e arredondamento half-up', () => {
  assert.equal(calculateTokenCost(1, '0.000000000001'), '0');
  assert.equal(calculateTokenCost(500000, '0.000000000001'), '0.000000000001');
  assert.equal(calculateTokenCost(1, '1.234567890123'), '0.000001234568');
  assert.equal(addDecimal('0.000000000001', '0.000000000002'), '0.000000000003');
  assert.equal(usageLimits.monetaryScale, 12);
});

test('não presume custo quando tarifa está ausente', () => {
  assert.equal(calculateUsageCost({ inputTokens: 10, outputTokens: 5, inputPricePerMillion: null, outputPricePerMillion: '1' }), null);
});

test('mantém consumo confirmado, estimado e desconhecido separados', () => {
  assert.deepEqual(normalizeUsageMetadata(), { source: 'unknown', inputTokens: null, outputTokens: null, totalTokens: null });
  assert.deepEqual(normalizeUsageMetadata({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }), { source: 'confirmed', inputTokens: '10', outputTokens: '5', totalTokens: '15' });
  assert.deepEqual(normalizeUsageMetadata({ inputTokens: 10 }), { source: 'estimated', inputTokens: '10', outputTokens: null, totalTokens: null });
});

test('mantém isolamento lógico ao avaliar quotas de organizações diferentes', () => {
  const quotaA = { requestsLimit: 1, inputTokensLimit: 1, outputTokensLimit: 1, costLimit: '1' };
  const quotaB = { requestsLimit: 5, inputTokensLimit: 5, outputTokensLimit: 5, costLimit: '5' };
  assert.equal(canReserveQuota({ quota: quotaA, consumed: {}, reserved: {}, reservation: { requests: 1 } }).allowed, true);
  assert.equal(canReserveQuota({ quota: quotaB, consumed: {}, reserved: {}, reservation: { requests: 1 } }).allowed, true);
});

test('converte escala decimal sem ponto flutuante', () => {
  assert.equal(scaledIntegerToDecimal(decimalToScaledInteger('30.123456789012')), '30.123456789012');
  assert.equal(calculateUsageCost({ inputTokens: 1000000, outputTokens: 2000000, inputPricePerMillion: '0.000000000001', outputPricePerMillion: '0.000000000002' }), '0.000000000005');
});

const ids = {
  orgA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orgB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
  requestA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31'
  ,rateA: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
};

const fakePool = ({ quota, existing = [], failOn = '', commitFails = false, rate = true, rateCurrency = 'USD', rateModel = 'gpt-test', updateRowCount = 1 } = {}) => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql === 'BEGIN') return { rows: [] };
      if (sql.startsWith('SELECT id,status')) return { rows: existing };
      if (sql.startsWith('SELECT organization_id,period_start')) return { rows: quota ? [quota] : [] };
      if (sql.startsWith('SELECT provider,model,currency')) return { rows: rate && values[3] === rateCurrency ? [{ provider: 'openai', model: rateModel, currency: rateCurrency, input_price_per_million: '1', output_price_per_million: '2' }] : [] };
      if (sql.startsWith('UPDATE ai_quotas')) { if (failOn === 'UPDATE') throw new Error('update failed'); return { rows: [], rowCount: updateRowCount }; }
      if (sql.startsWith('INSERT INTO ai_usage')) { if (failOn === 'INSERT') throw new Error('insert failed'); return { rows: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'reserved', organization_id: values[0], request_id: values[2] }] }; }
      if (sql === 'COMMIT') { if (commitFails) throw new Error('commit failed'); return { rows: [], rowCount: 0 }; }
      if (sql === 'ROLLBACK') return { rows: [] };
      throw new Error(`unexpected SQL: ${sql}`);
    },
    release() { calls.push({ sql: 'RELEASE' }); }
  };
  return { calls, async connect() { return client; } };
};

const quotaFixture = () => ({
  organization_id: ids.orgA,
  period_start: quotaPeriodUtc().periodStart,
  requests_limit: '5', input_tokens_limit: '1000', output_tokens_limit: '1000', cost_limit: '2.000000000000', currency: 'USD',
  reserved_requests: '0', reserved_input_tokens: '0', reserved_output_tokens: '0', reserved_cost: '0',
  consumed_requests: '0', consumed_input_tokens: '0', consumed_output_tokens: '0', consumed_cost: '0'
});

test('reserva quota com transação, contexto autenticado e sem dados de conteúdo', async () => {
  const pool = fakePool({ quota: quotaFixture() });
  const result = await reserveQuota({ pool, authContext: { organizationId: ids.orgA, userId: ids.userA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'USD', reservation: { requests: 1, inputTokens: 10, outputTokens: 20, cost: '0.000000000123' }, reservationExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(result.reserved, true);
  assert.match(pool.calls[0].sql, /^BEGIN$/);
  assert.ok(pool.calls.some(call => call.sql.includes('FOR UPDATE')));
  assert.ok(pool.calls.some(call => call.sql === 'COMMIT'));
  assert.ok(pool.calls.some(call => call.sql.includes('INSERT INTO ai_usage')));
  assert.equal(pool.calls.some(call => JSON.stringify(call.values || []).includes('prompt')), false);
  assert.equal(pool.calls.at(-1).sql, 'RELEASE');
});

test('bloqueia quota ausente e insuficiente sem criar reserva', async () => {
  const absent = fakePool();
  assert.deepEqual((await reserveQuota({ pool: absent, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'USD', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() })).reason, 'QUOTA_MISSING');
  const insufficient = fakePool({ quota: { ...quotaFixture(), requests_limit: '0' } });
  const result = await reserveQuota({ pool: insufficient, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'USD', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() });
  assert.equal(result.reason, 'QUOTA_EXCEEDED');
  assert.equal(insufficient.calls.some(call => call.sql.includes('UPDATE ai_quotas')), false);
  assert.equal(insufficient.calls.some(call => call.sql.includes('INSERT INTO ai_usage')), false);
});

test('request repetido é idempotente e não atualiza quota', async () => {
  const pool = fakePool({ quota: quotaFixture(), existing: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', status: 'reserved', organization_id: ids.orgA, request_id: ids.requestA }] });
  const result = await reserveQuota({ pool, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'USD', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() });
  assert.equal(result.idempotent, true);
  assert.equal(pool.calls.some(call => call.sql.includes('UPDATE ai_quotas')), false);
  assert.equal(pool.calls.some(call => call.sql.includes('INSERT INTO ai_usage')), false);
});

test('faz rollback e libera conexão em erro SQL ou falha de commit', async () => {
  for (const options of [{ failOn: 'INSERT' }, { commitFails: true }]) {
    const pool = fakePool({ quota: quotaFixture(), ...options });
    await assert.rejects(() => reserveQuota({ pool, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'USD', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() }));
    assert.ok(pool.calls.some(call => call.sql === 'ROLLBACK'));
    assert.equal(pool.calls.at(-1).sql, 'RELEASE');
  }
});

test('não reserva financeiramente o mock e não chama provedor externo', async () => {
  let connected = false;
  const result = await reserveQuota({ pool: { async connect() { connected = true; } }, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'mock', model: 'mock', reservation: { requests: 1, cost: '9' }, reservationExpiresAt: new Date().toISOString() });
  assert.deepEqual(result, { reserved: false, reason: 'MOCK_NO_FINANCIAL_RESERVATION', requestId: ids.requestA });
  assert.equal(connected, false);
});

test('mantém isolamento lógico ao reservar para organizações distintas', async () => {
  const poolA = fakePool({ quota: quotaFixture() });
  const poolB = fakePool({ quota: { ...quotaFixture(), organization_id: ids.orgB } });
  const common = { provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'USD', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() };
  assert.equal((await reserveQuota({ ...common, pool: poolA, authContext: { organizationId: ids.orgA }, requestId: ids.requestA })).reserved, true);
  assert.equal((await reserveQuota({ ...common, pool: poolB, authContext: { organizationId: ids.orgB }, requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })).reserved, true);
  assert.equal(poolA.calls.find(call => call.sql.includes('SELECT organization_id,period_start')).values[0], ids.orgA);
  assert.equal(poolB.calls.find(call => call.sql.includes('SELECT organization_id,period_start')).values[0], ids.orgB);
});

test('seleciona currency com FOR UPDATE e aceita quota e tarifa em BRL', async () => {
  const pool = fakePool({ quota: { ...quotaFixture(), currency: 'BRL' }, rateCurrency: 'BRL' });
  const result = await reserveQuota({ pool, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'BRL', reservation: { requests: 1, cost: '0.10' }, reservationExpiresAt: new Date().toISOString() });
  const quotaSelect = pool.calls.find(call => call.sql.includes('FROM ai_quotas'));
  assert.equal(result.reserved, true);
  assert.match(quotaSelect.sql, /SELECT organization_id,period_start,currency,/);
  assert.match(quotaSelect.sql, /FOR UPDATE/);
});

test('rejeita moeda de tarifa diferente da quota e não autoriza currency ausente', async () => {
  const mismatch = fakePool({ quota: { ...quotaFixture(), currency: 'BRL' }, rateCurrency: 'USD' });
  assert.equal((await reserveQuota({ pool: mismatch, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'BRL', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() })).reason, 'RATE_INVALID');
  const absent = fakePool({ quota: { ...quotaFixture(), currency: undefined }, rateCurrency: 'BRL' });
  assert.equal((await reserveQuota({ pool: absent, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'BRL', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() })).reason, 'CURRENCY_MISMATCH');
});

test('mantém custo individual em reservas distintas e atualiza o agregado solicitado', async () => {
  const first = fakePool({ quota: quotaFixture() });
  const second = fakePool({ quota: { ...quotaFixture(), reserved_cost: '0.25' } });
  const common = { authContext: { organizationId: ids.orgA }, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'USD', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() };
  await reserveQuota({ ...common, pool: first, requestId: ids.requestA, reservation: { requests: 1, cost: '0.10' } });
  await reserveQuota({ ...common, pool: second, requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', reservation: { requests: 1, cost: '0.25' } });
  const firstInsert = first.calls.find(call => call.sql.startsWith('INSERT INTO ai_usage'));
  const secondInsert = second.calls.find(call => call.sql.startsWith('INSERT INTO ai_usage'));
  assert.equal(firstInsert.values[8], '0.1');
  assert.equal(secondInsert.values[8], '0.25');
  assert.equal(first.calls.find(call => call.sql.startsWith('UPDATE ai_quotas')).values[3], '0.1');
  assert.equal(second.calls.find(call => call.sql.startsWith('UPDATE ai_quotas')).values[3], '0.25');
});

test('rejeita tarifa ausente, inválida, incompatível ou fora da vigência antes de atualizar quota', async () => {
  const missing = fakePool({ quota: quotaFixture(), rate: false });
  assert.equal((await reserveQuota({ pool: missing, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'USD', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() })).reason, 'RATE_INVALID');
  assert.equal(missing.calls.some(call => call.sql.startsWith('UPDATE ai_quotas')), false);
  await assert.rejects(() => reserveQuota({ pool: fakePool({ quota: quotaFixture() }), authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: 'invalid', currency: 'USD', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() }));
  const incompatible = fakePool({ quota: quotaFixture() });
  assert.equal((await reserveQuota({ pool: incompatible, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'BRL', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() })).reason, 'CURRENCY_MISMATCH');
  assert.equal(incompatible.calls.some(call => call.sql.startsWith('UPDATE ai_quotas')), false);
});

test('exige rowCount exatamente um e faz rollback quando atualização financeira não ocorre', async () => {
  const zero = fakePool({ quota: quotaFixture(), updateRowCount: 0 });
  await assert.rejects(() => reserveQuota({ pool: zero, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'USD', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() }));
  assert.ok(zero.calls.some(call => call.sql === 'ROLLBACK'));
  const one = fakePool({ quota: quotaFixture(), updateRowCount: 1 });
  assert.equal((await reserveQuota({ pool: one, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, provider: 'openai', model: 'gpt-test', rateId: ids.rateA, currency: 'USD', reservation: { requests: 1 }, reservationExpiresAt: new Date().toISOString() })).reserved, true);
});

const finalizePool = ({ status = 'reserved', rate = true, failOn = '', commitFails = false, updateRowCount = 1 } = {}) => {
  const calls = [];
  const reservation = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', organization_id: ids.orgA, created_at: new Date(), provider: 'openai', model: 'gpt-test', rate_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', currency: 'USD', status, reserved_input_tokens: '100', reserved_output_tokens: '100', estimated_cost: '0.000300000000', provider_request_id: null };
  const quota = { organization_id: ids.orgA, period_start: quotaPeriodUtc().periodStart, currency: 'USD', reserved_input_tokens: '100', reserved_output_tokens: '100', reserved_cost: '0.000300000000', consumed_input_tokens: '0', consumed_output_tokens: '0', consumed_cost: '0', reserved_requests: '1', consumed_requests: '0' };
  const client = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') { if (sql === 'COMMIT' && commitFails) throw new Error('commit failed'); return { rows: [] }; }
    if (sql.startsWith('SELECT id,organization_id,created_at')) return { rows: [reservation] };
    if (sql.startsWith('SELECT organization_id,period_start')) return { rows: [quota] };
    if (sql.startsWith('SELECT id,organization_id,provider')) return { rows: [reservation] };
    if (sql.startsWith('SELECT provider,model,currency')) return { rows: rate ? [{ provider: 'openai', model: 'gpt-test', currency: 'USD', input_price_per_million: '1', output_price_per_million: '2' }] : [] };
    if (sql.startsWith('UPDATE ai_quotas') || sql.startsWith('UPDATE ai_usage')) { if (failOn === 'UPDATE' && sql.startsWith('UPDATE ai_quotas')) throw new Error('sql failed'); return { rows: [], rowCount: updateRowCount }; }
    throw new Error(`unexpected SQL: ${sql}`);
  }, release() { calls.push({ sql: 'RELEASE' }); } };
  return { calls, async connect() { return client; } };
};

test('finaliza reserva com tokens completos usando tarifa histórica', async () => {
  const pool = finalizePool();
  const result = await finalizeQuotaUsage({ pool, authContext: { organizationId: ids.orgA, userId: ids.userA }, requestId: ids.requestA, result: { providerRequestId: 'resp-1', usage: { inputTokens: 100, outputTokens: 50 } } });
  assert.equal(result.status, 'completed');
  assert.equal(result.usageSource, 'provider');
  assert.equal(result.actualCost, '0.0002');
  assert.ok(pool.calls.some(call => call.sql.includes('FOR UPDATE')));
  assert.equal(pool.calls.at(-1).sql, 'RELEASE');
});

test('finalização repetida é idempotente e reserva inexistente é rejeitada', async () => {
  const done = finalizePool({ status: 'completed' });
  assert.equal((await finalizeQuotaUsage({ pool: done, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, result: {} })).idempotent, true);
  const missing = finalizePool();
  const original = missing.connect;
  missing.connect = async () => { const client = await original(); const query = client.query; client.query = async (sql, values) => sql.startsWith('SELECT id,organization_id,created_at') ? { rows: [] } : query.call(client, sql, values); return client; };
  assert.equal((await finalizeQuotaUsage({ pool: missing, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, result: {} })).reason, 'RESERVATION_NOT_FOUND');
});

test('falha anterior libera reserva, timeout ambíguo mantém reconciliação pendente', async () => {
  const failed = finalizePool();
  assert.equal((await finalizeQuotaUsage({ pool: failed, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, failure: 'failed_before_provider', result: {} })).status, 'failed');
  const timeout = finalizePool();
  const result = await finalizeQuotaUsage({ pool: timeout, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, failure: 'timeout', result: { providerRequestId: 'resp-timeout' } });
  assert.equal(result.status, 'reconciliation_pending');
});

test('metadados parciais, tarifa ausente ou consumo acima da reserva não inventam custo', async () => {
  const partial = finalizePool();
  assert.equal((await finalizeQuotaUsage({ pool: partial, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, result: { usage: { inputTokens: 10 } } })).status, 'reconciliation_pending');
  const noRate = finalizePool({ rate: false });
  assert.equal((await finalizeQuotaUsage({ pool: noRate, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, result: { usage: { inputTokens: 100, outputTokens: 100 } } })).reason, 'RATE_MISMATCH');
  const excess = finalizePool();
  const result = await finalizeQuotaUsage({ pool: excess, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, result: { usage: { inputTokens: 101, outputTokens: 100 } } });
  assert.equal(result.reason, 'RESERVATION_EXCEEDED');
});

test('finalização faz rollback em erro SQL ou COMMIT e não chama serviços externos', async () => {
  for (const options of [{ failOn: 'UPDATE' }, { commitFails: true }]) {
    const pool = finalizePool(options);
    await assert.rejects(() => finalizeQuotaUsage({ pool, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, result: { usage: { inputTokens: 100, outputTokens: 50 } } }));
    assert.ok(pool.calls.some(call => call.sql === 'ROLLBACK'));
    assert.equal(pool.calls.at(-1).sql, 'RELEASE');
  }
});

test('finalização rejeita rowCount inesperado e faz rollback', async () => {
  const pool = finalizePool({ updateRowCount: 0 });
  await assert.rejects(() => finalizeQuotaUsage({ pool, authContext: { organizationId: ids.orgA }, requestId: ids.requestA, result: { usage: { inputTokens: 100, outputTokens: 50 } } }));
  assert.ok(pool.calls.some(call => call.sql === 'ROLLBACK'));
  assert.equal(pool.calls.at(-1).sql, 'RELEASE');
});
