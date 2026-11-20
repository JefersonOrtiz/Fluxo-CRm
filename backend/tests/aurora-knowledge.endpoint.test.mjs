import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequestHandler } from '../src/app.mjs';

const state = {
  user: { id: '11111111-1111-4111-8111-111111111111', org: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', permissions: ['ai:configuration'] },
  items: [],
  nextId: 1,
  queries: []
};

const item = (overrides = {}) => ({ id: overrides.id || `00000000-0000-4000-8000-${String(state.nextId++).padStart(12, '0')}`, title: overrides.title || 'FAQ', type: overrides.type || 'faq', content: overrides.content || 'Conteúdo seguro', active: overrides.active ?? true, updatedAt: new Date().toISOString() });
const pool = {
  async query(sql, values = []) {
    state.queries.push({ sql, values });
    if (sql.includes('SELECT u.id')) return { rows: [{ id: state.user.id, organization_id: state.user.org, name: 'Teste', session_version: 1, role_name: 'Administrador', permissions: state.user.permissions }] };
    if (sql.includes('FROM aurora_knowledge_base') && sql.includes('WHERE id=$1')) {
      return { rows: state.items.filter(entry => entry.id === values[0] && state.user.org === values[1]) };
    }
    if (sql.includes('FROM aurora_knowledge_base WHERE organization_id=$1')) return { rows: state.items.filter(() => true) };
    if (sql.includes('INSERT INTO aurora_knowledge_base')) { const created = item({ title: values[1], type: values[2], content: values[3], active: values[4] }); state.items.push(created); return { rows: [created] }; }
    if (sql.includes('UPDATE aurora_knowledge_base')) { const found = state.items.find(entry => entry.id === values[values.length - 2]); if (!found || values[values.length - 1] !== state.user.org) return { rows: [] }; return { rows: [found] }; }
    if (sql.includes('DELETE FROM aurora_knowledge_base')) { const id = values[0]; const found = state.items.find(entry => entry.id === id); if (!found || values[1] !== state.user.org) return { rows: [] }; state.items = state.items.filter(entry => entry.id !== id); return { rows: [{ id }] }; }
    return { rows: [] };
  }
};
const security = { readToken: request => request.headers.authorization ? { userId: state.user.id, organizationId: state.user.org, sessionVersion: 1 } : null };
const config = { corsOrigin: '*', bootstrapSecret: '' };
let server;
let base;

before(async () => {
  server = createServer(createRequestHandler({ pool, security, config, aiProvider: null }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (path, method = 'GET', body, token = true) => fetch(`${base}${path}`, {
  method,
  headers: { ...(token ? { Authorization: 'Bearer test' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
}).then(async response => ({ status: response.status, body: await response.json() }));

test('base exige autenticação e permissão de consulta/alteração', async () => {
  assert.equal((await call('/api/aurora/knowledge', 'GET', undefined, false)).status, 401);
  state.user.permissions = [];
  assert.equal((await call('/api/aurora/knowledge')).status, 403);
  assert.equal((await call('/api/aurora/knowledge', 'POST', { title: 'FAQ', type: 'faq', content: 'Resposta' })).status, 403);
  state.user.permissions = ['ai:configuration'];
});

test('base cadastra, lista, edita e exclui conteúdo com organização na consulta', async () => {
  const created = await call('/api/aurora/knowledge', 'POST', { title: 'Preços', type: 'text', content: 'Valores não cadastrados nesta demo.' });
  assert.equal(created.status, 201);
  const id = created.body.id;
  const listed = await call('/api/aurora/knowledge');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.items.length, 1);
  const updated = await call(`/api/aurora/knowledge/${id}`, 'PATCH', { title: 'FAQ atualizada', type: 'faq', content: 'Resposta atualizada' });
  assert.equal(updated.status, 200);
  const deleted = await call(`/api/aurora/knowledge/${id}`, 'DELETE');
  assert.equal(deleted.status, 200);
  const relevant = state.queries.filter(query => query.sql.includes('aurora_knowledge_base'));
  assert.ok(relevant.every(query => query.values.includes(state.user.org)));
});

test('base rejeita campos desconhecidos e valores inválidos', async () => {
  assert.equal((await call('/api/aurora/knowledge', 'POST', { title: 'x', type: 'pdf', content: 'x' })).status, 400);
  assert.equal((await call('/api/aurora/knowledge', 'POST', { title: 'x', type: 'text', content: '' })).status, 400);
  assert.equal((await call('/api/aurora/knowledge', 'POST', { title: 'x', type: 'text', content: 'x', url: 'https://example.com' })).status, 400);
});

test('usuário somente com sugestões pode consultar, mas não alterar', async () => {
  state.user.permissions = ['ai:suggestions'];
  assert.equal((await call('/api/aurora/knowledge')).status, 200);
  assert.equal((await call('/api/aurora/knowledge', 'POST', { title: 'FAQ', type: 'faq', content: 'Resposta' })).status, 403);
  state.user.permissions = ['ai:configuration'];
});
