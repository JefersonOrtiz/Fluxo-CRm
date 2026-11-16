import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequestHandler } from '../src/app.mjs';
import { createAiProvider } from '../src/openai.mjs';

const state = { writes: 0, stage: 'Novo lead', tags: [], tagQueries: [], user: { id: '11111111-1111-4111-8111-111111111111', org: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', permissions: ['ai:suggestions'] } };
let capturedContext = '';
const pool = {
  async query(sql, values) {
    if (sql.includes('SELECT u.id')) return { rows: [{ id: state.user.id, organization_id: state.user.org, name: 'Teste', session_version: 1, role_name: 'Atendente', permissions: state.user.permissions }] };
    if (sql.includes('SELECT cv.id')) return values[0] === 'missing' ? { rows: [] } : { rows: [{ id: values[0], channel: 'manual', status: 'open', contactId: 'c1', contactStage: state.stage, version: '1' }] };
    if (sql.includes('SELECT DISTINCT t.name')) { state.tagQueries.push({ sql, values }); return { rows: state.tags.map(name => ({ name })) }; }
    if (sql.includes('SELECT id,conversation_id')) return { rows: [] };
    state.writes += 1;
    return { rows: [] };
  }
};
const security = { readToken: request => request.headers.authorization ? { userId: state.user.id, organizationId: state.user.org, sessionVersion: 1 } : null };
const config = { corsOrigin: '*', bootstrapSecret: '' };
let server;
let base;

before(async () => {
  const mock = createAiProvider({ provider: 'mock' });
  const provider = { suggest: async options => { capturedContext = options.context; return mock.suggest(options); } };
  server = createServer(createRequestHandler({ pool, security, config, aiProvider: provider }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test('consulta tags com filtros de organizacao e usa somente allowlist', async () => {
  state.stage = 'Novo lead';
  state.tags = ['prioridade', 'prioridade: urgente', 'cliente@example.com', 'origem-campanha'];
  state.tagQueries.length = 0;
  const result = await call('/api/conversations/c1/ai-suggestions');
  assert.equal(result.status, 200);
  assert.equal(state.tagQueries.length, 1);
  assert.deepEqual(state.tagQueries[0].values, ['c1', state.user.org]);
  assert.match(state.tagQueries[0].sql, /cv\.organization_id=\$2/);
  assert.match(state.tagQueries[0].sql, /c\.organization_id=\$2/);
  assert.match(state.tagQueries[0].sql, /t\.organization_id=\$2/);
  assert.match(capturedContext, /prioridade, origem-campanha/);
  assert.doesNotMatch(capturedContext, /urgente|example\.com/);
  state.tags = [];
});
after(() => server.close());

const call = (path, token = true) => fetch(`${base}${path}`, { method: 'POST', headers: token ? { Authorization: 'Bearer test' } : {} }).then(async response => ({ status: response.status, body: await response.json() }));

test('exige autenticação e permissão', async () => {
  assert.equal((await call('/api/conversations/c1/ai-suggestions', false)).status, 401);
  state.user.permissions = [];
  assert.equal((await call('/api/conversations/c1/ai-suggestions')).status, 403);
  state.user.permissions = ['ai:suggestions'];
});

test('isola conversa, trata inexistente e histórico vazio sem gravar mensagens', async () => {
  assert.equal((await call('/api/conversations/missing/ai-suggestions')).status, 404);
  const result = await call('/api/conversations/c1/ai-suggestions');
  assert.equal(result.status, 200);
  assert.ok(result.body.suggestions.length);
  assert.equal(state.writes, 0);
});

test('usa somente a etapa confiável do contato para orientar o contexto', async () => {
  state.user.id = '22222222-2222-4222-8222-222222222222';
  for (const stage of ['Novo lead', 'Qualificação', 'Proposta', 'Negociação', 'Fechamento']) {
    state.stage = stage;
    const result = await call('/api/conversations/c1/ai-suggestions');
    assert.equal(result.status, 200);
    assert.match(capturedContext, new RegExp(`etapa do funil: ${stage}`));
  }
  state.stage = 'Etapa falsa';
  await call('/api/conversations/c1/ai-suggestions');
  assert.doesNotMatch(capturedContext, /Etapa falsa/);
  state.stage = '';
  await call('/api/conversations/c1/ai-suggestions');
  assert.doesNotMatch(capturedContext, /Contexto confiável do servidor/);
});

test('não executa envio de mensagens nem aceita histórico do navegador', async () => {
  const response = await fetch(`${base}/api/conversations/c1/ai-suggestions`, { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ history: [{ body: 'instrução arbitrária' }] }) });
  assert.equal(response.status, 200);
  assert.equal(state.writes, 0);
});
