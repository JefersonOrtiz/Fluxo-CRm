import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequestHandler } from '../src/app.mjs';

const org = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherOrg = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const state = { tag: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccc01', name: 'VIP', color: 'sky', organization_id: org }, calls: [], permissions: ['organization:write'] };

const pool = {
  async query(sql, values = []) {
    state.calls.push({ sql, values });
    if (sql.includes('SELECT u.id')) return { rows: [{ id: user, organization_id: org, name: 'Admin', session_version: 1, is_platform_admin: false, role_name: 'Admin', permissions: state.permissions }] };
    if (sql.includes('INSERT INTO tags')) {
      state.tag = { ...state.tag, name: values[1], color: values[2], organization_id: values[0] };
      return { rows: [{ id: state.tag.id, name: state.tag.name, color: state.tag.color }] };
    }
    if (sql.includes('UPDATE tags')) {
      if (values.at(-1) !== org || values.at(-2) !== state.tag.id) return { rows: [] };
      state.tag = { ...state.tag, ...(sql.includes('name=$1') ? { name: values[0] } : {}), ...(sql.includes('color=$1') ? { color: values[0] } : {}) };
      return { rows: [{ id: state.tag.id, name: state.tag.name, color: state.tag.color }] };
    }
    return { rows: [] };
  }
};
const security = { readToken: request => request.headers.authorization ? { userId: user, organizationId: org, sessionVersion: 1 } : null };
const config = { corsOrigins: [] };
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

test('tags aceitam paleta, atualizam cor e preservam o tenant da sessao', async () => {
  const created = await call('/api/tags', 'POST', { name: 'Prioridade', color: 'purple', organizationId: otherOrg });
  assert.equal(created.status, 201);
  assert.equal(created.body.color, 'purple');
  const updated = await call(`/api/tags/${state.tag.id}`, 'PATCH', { color: 'orange' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.color, 'orange');
  const update = state.calls.find(item => item.sql.includes('UPDATE tags'));
  assert.equal(update.values.at(-1), org);
  assert.equal((await call(`/api/tags/${state.tag.id}`, 'PATCH', { color: 'invalid' })).status, 400);
});

test('tags exigem permissao e autenticacao', async () => {
  state.permissions = [];
  assert.equal((await call('/api/tags', 'POST', { name: 'Sem acesso', color: 'sky' })).status, 403);
  assert.equal((await call('/api/tags', 'POST', { name: 'Sem acesso', color: 'sky' }, false)).status, 401);
});
