import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequestHandler } from '../src/app.mjs';
import { createAiProvider } from '../src/openai.mjs';

const ids = {
  org: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  user: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11',
  request: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21'
};

const makePool = ({ quota = true, failUsageUpdate = false } = {}) => {
  const state = {
    quota: quota ? { currency: 'USD', requests_limit: '10', input_tokens_limit: '10000', output_tokens_limit: '3000', cost_limit: '10', reserved_requests: '0', reserved_input_tokens: '0', reserved_output_tokens: '0', reserved_cost: '0', consumed_requests: '0', consumed_input_tokens: '0', consumed_output_tokens: '0', consumed_cost: '0' } : null,
    usage: new Map(),
    calls: []
  };
  const rate = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', provider: 'openai', model: 'gpt-test', currency: 'USD', input_price_per_million: '1', output_price_per_million: '2' };
  const client = {
    async query(sql, values = []) {
      state.calls.push({ sql, values });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.startsWith('SELECT id,status,organization_id,request_id')) {
        const row = state.usage.get(values[1]);
        return { rows: row ? [{ id: row.id, status: row.status, organization_id: ids.org, request_id: values[1] }] : [] };
      }
      if (sql.startsWith('SELECT organization_id,period_start,currency')) return { rows: state.quota ? [{ ...state.quota, organization_id: ids.org, period_start: new Date().toISOString().slice(0, 7) + '-01' }] : [] };
      if (sql.startsWith('SELECT id,organization_id,created_at')) {
        const row = state.usage.get(values[1]);
        return { rows: row ? [row] : [] };
      }
      if (sql.startsWith('SELECT id,organization_id,provider')) {
        const row = state.usage.get(values[1]);
        return { rows: row ? [row] : [] };
      }
      if (sql.startsWith('SELECT provider,model,currency')) return { rows: [rate] };
      if (sql.startsWith('UPDATE ai_quotas')) return { rows: [], rowCount: 1 };
      if (sql.startsWith('INSERT INTO ai_usage')) {
        const row = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', organization_id: values[0], created_at: new Date(), provider: values[3], model: values[4], rate_id: values[5], status: 'reserved', usage_source: 'estimated', currency: values[9], reserved_input_tokens: values[6], reserved_output_tokens: values[7], estimated_cost: values[8], provider_request_id: null };
        state.usage.set(values[2], row);
        return { rows: [{ id: row.id, status: row.status, organization_id: row.organization_id, request_id: values[2] }], rowCount: 1 };
      }
      if (sql.startsWith('UPDATE ai_usage')) {
        if (failUsageUpdate) throw new Error('simulated finalization failure');
        const row = state.usage.get(values.at(-1));
        if (row) {
          row.status = sql.includes("status='failed'") ? 'failed' : sql.includes("status='reconciliation_pending'") ? 'reconciliation_pending' : 'completed';
          row.usage_source = sql.includes("usage_source='none'") ? 'none' : sql.includes("usage_source='unknown'") ? 'unknown' : (values[1] || 'provider');
        }
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`SQL inesperado no cliente: ${sql}`);
    },
    release() { state.calls.push({ sql: 'RELEASE' }); }
  };
  return {
    state,
    async query(sql, values = []) {
      if (sql.includes('SELECT u.id')) return { rows: [{ id: ids.user, organization_id: ids.org, name: 'Teste', session_version: 1, role_name: 'Atendente', permissions: ['ai:suggestions'] }] };
      if (sql.includes('SELECT cv.id')) return { rows: values[0] === 'missing' ? [] : [{ id: values[0], channel: 'manual', status: 'open', contactId: 'contact', contactStage: 'Novo lead', version: '1' }] };
      if (sql.includes('SELECT DISTINCT t.name')) return { rows: [] };
      if (sql.includes('FROM messages')) return { rows: [{ id: 'message-1', conversation_id: 'conversation-1', direction: 'inbound', sender_type: 'contact', body: 'Gostaria de informações', status: 'received', sent_at: new Date().toISOString() }] };
      if (sql.includes('FROM aurora_knowledge_base')) return { rows: [{ id: 'knowledge-1', title: 'Serviços', type: 'text', content: 'A empresa oferece atendimento comercial.', active: true }] };
      if (sql.includes('SELECT master_prompt')) return { rows: [{ masterPrompt: 'Responda com clareza.', tone: 'amigavel' }] };
      if (sql.startsWith('SELECT currency FROM ai_quotas')) return { rows: state.quota ? [{ currency: state.quota.currency }] : [] };
      if (sql.startsWith('SELECT id,input_price_per_million')) return { rows: state.quota ? [{ id: rate.id, input_price_per_million: rate.input_price_per_million, output_price_per_million: rate.output_price_per_million }] : [] };
      return client.query(sql, values);
    },
    async connect() { return client; }
  };
};

const security = { readToken: request => request.headers.authorization ? { userId: ids.user, organizationId: ids.org, sessionVersion: 1 } : null };
const config = { corsOrigin: '*', aiProvider: 'openai', openAiModel: 'gpt-test' };
let server;
let base;

before(async () => {
  const provider = { suggest: async options => ({ suggestions: ['Resposta simulada'], provider: 'openai', usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 }, providerRequestId: 'provider-simulado', ...options }) };
  server = createServer(createRequestHandler({ pool: makePool(), security, config, aiProvider: provider }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const post = (path, body = {}, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async response => ({ status: response.status, body: await response.json() }));

test('mantém o mock sem quota financeira e sem chamada externa', async () => {
  const calls = { count: 0 };
  const provider = { suggest: async () => { calls.count++; return { suggestions: ['Mock local'] }; } };
  const pool = makePool({ quota: false });
  const local = createServer(createRequestHandler({ pool, security, config: { ...config, aiProvider: 'mock' }, aiProvider: provider }));
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${local.address().port}`;
  const response = await fetch(`${url}/api/aurora/test`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Olá' }) });
  assert.equal(response.status, 200);
  assert.equal(calls.count, 1);
  await new Promise(resolve => local.close(resolve));
});

test('laboratório reserva antes do provedor e preserva contrato, Prompt Mestre e Base', async () => {
  const pool = makePool();
  const events = [];
  const provider = { suggest: async options => { events.push('provider'); assert.match(options.masterPrompt, /clareza/); assert.match(options.knowledgeContext, /atendimento comercial/); return { suggestions: ['Resposta simulada'], usage: { inputTokens: 20, outputTokens: 8 }, providerRequestId: 'provider-1' }; } };
  const local = createServer(createRequestHandler({ pool, security, config, aiProvider: provider }));
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${local.address().port}`;
  const response = await fetch(`${url}/api/aurora/test`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json', 'Idempotency-Key': ids.request }, body: JSON.stringify({ message: 'Quais serviços existem?' }) });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).suggestions, ['Resposta simulada']);
  assert.deepEqual(events, ['provider']);
  assert.equal(pool.state.usage.get(ids.request).status, 'completed');
  await new Promise(resolve => local.close(resolve));
});

test('quota rejeitada impede provedor e quota ausente não é tratada como ilimitada', async () => {
  const pool = makePool({ quota: false });
  let calls = 0;
  const provider = { suggest: async () => { calls++; return { suggestions: ['não deveria'] }; } };
  const local = createServer(createRequestHandler({ pool, security, config, aiProvider: provider }));
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${local.address().port}`;
  const response = await fetch(`${url}/api/conversations/conversation-1/ai-suggestions`, { method: 'POST', headers: { Authorization: 'Bearer test' } });
  assert.equal(response.status, 429);
  assert.equal(calls, 0);
  await new Promise(resolve => local.close(resolve));
});

test('endpoint de conversa preserva até duas sugestões e finaliza consumo', async () => {
  const pool = makePool();
  let calls = 0;
  const provider = { suggest: async options => { calls++; assert.match(options.context, /client:/); return { suggestions: ['Consultiva', 'Objetiva'], usage: { inputTokens: 30, outputTokens: 12 }, providerRequestId: 'conversation-provider' }; } };
  const local = createServer(createRequestHandler({ pool, security, config, aiProvider: provider }));
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${local.address().port}`;
  const response = await fetch(`${url}/api/conversations/conversation-1/ai-suggestions`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Idempotency-Key': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa23' } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).suggestions, ['Consultiva', 'Objetiva']);
  assert.equal(calls, 1);
  await new Promise(resolve => local.close(resolve));
});

test('Idempotency-Key repetida não executa segunda chamada paga', async () => {
  const pool = makePool();
  let calls = 0;
  const provider = { suggest: async () => { calls++; return { suggestions: ['Resposta'], usage: { inputTokens: 20, outputTokens: 8 } }; } };
  const local = createServer(createRequestHandler({ pool, security, config, aiProvider: provider }));
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${local.address().port}`;
  const headers = { Authorization: 'Bearer test', 'Content-Type': 'application/json', 'Idempotency-Key': ids.request };
  const first = await fetch(`${url}/api/aurora/test`, { method: 'POST', headers, body: JSON.stringify({ message: 'Olá' }) });
  const second = await fetch(`${url}/api/aurora/test`, { method: 'POST', headers, body: JSON.stringify({ message: 'Olá novamente' }) });
  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(calls, 1);
  await new Promise(resolve => local.close(resolve));
});

test('timeout ambíguo preserva reserva e falha pré-envio libera reserva', async () => {
  const pool = makePool();
  const provider = { suggest: async () => { const error = new Error('timeout'); error.code = 'AI_TIMEOUT'; throw error; } };
  const local = createServer(createRequestHandler({ pool, security, config, aiProvider: provider }));
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${local.address().port}`;
  const timeoutKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa22';
  const response = await fetch(`${url}/api/aurora/test`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json', 'Idempotency-Key': timeoutKey }, body: JSON.stringify({ message: 'Olá' }) });
  assert.equal(response.status, 504);
  assert.equal(pool.state.usage.get(timeoutKey).status, 'reconciliation_pending');
  await new Promise(resolve => local.close(resolve));

  const prePool = makePool();
  const preProvider = { suggest: async () => { const error = new Error('cliente indisponível'); error.code = 'AI_CLIENT_UNAVAILABLE'; throw error; } };
  const preLocal = createServer(createRequestHandler({ pool: prePool, security, config, aiProvider: preProvider }));
  await new Promise(resolve => preLocal.listen(0, '127.0.0.1', resolve));
  const preKey = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa24';
  const preResponse = await fetch(`http://127.0.0.1:${preLocal.address().port}/api/aurora/test`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json', 'Idempotency-Key': preKey }, body: JSON.stringify({ message: 'Olá' }) });
  assert.equal(preResponse.status, 502);
  assert.equal(prePool.state.usage.get(preKey).status, 'failed');
  await new Promise(resolve => preLocal.close(resolve));
});
