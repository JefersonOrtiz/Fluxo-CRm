import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createRequestHandler } from '../src/app.mjs';

const ids = { platform: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', org: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', otherOrg: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', access: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
const tokenHash = token => createHash('sha256').update(token).digest();
const makePool = () => {
  const audit = [];
  const tenants = [{ id: ids.org, name: 'Tenant A', status: 'active', plan: 'manual', userCount: 1 }];
  const client = { async query(sql, values = []) { if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }; return pool.query(sql, values); }, release() {} };
  const pool = {
    audit, tenants,
    async connect() { return client; },
    async query(sql, values = []) {
      if (sql.includes('FROM users u') && sql.includes('u.is_platform_admin')) {
        const isPlatform = values[0] === ids.platform;
        return { rows: isPlatform ? [{ id: ids.platform, organization_id: ids.org, name: 'Platform Admin', session_version: 1, is_platform_admin: true, role_name: 'Platform', permissions: ['*'] }] : [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', organization_id: ids.org, name: 'Tenant User', session_version: 1, is_platform_admin: false, role_name: 'Admin', permissions: ['*'] }] };
      }
      if (sql.includes('FROM platform_access_sessions')) {
        const accessToken = values[0] instanceof Buffer && ['t', 'b'].find(prefix => values[0].equals(tokenHash(prefix.repeat(43))));
        const temporary = Boolean(accessToken);
        return { rows: temporary ? [{ id: ids.platform, organization_id: ids.org, access_organization_id: accessToken === 'b' ? ids.otherOrg : ids.org, access_mode: 'readonly', name: 'Platform Admin', session_version: 1, is_platform_admin: true, role_name: 'Platform', permissions: ['*'] }] : [], rowCount: temporary ? 1 : 0 };
      }
      if (sql.startsWith('SELECT id "organizationId"')) return { rows: [{ organizationId: values[0], organizationName: values[0] === ids.otherOrg ? 'Tenant B' : 'Tenant A' }], rowCount: 1 };
      if (sql.includes('FROM organizations o LEFT JOIN platform_tenant_settings')) return { rows: tenants };
      if (sql.startsWith('SELECT id FROM organizations')) return { rows: [{ id: ids.org }], rowCount: 1 };
      if (sql.startsWith('SELECT u.id "userId"')) return { rows: [{ userId: ids.platform, name: 'Platform Admin', email: 'platform@example.invalid', organizationId: values[1] === ids.otherOrg ? ids.otherOrg : ids.org, organizationName: values[1] === ids.otherOrg ? 'Tenant B' : 'Tenant A', role: 'Platform', permissions: ['*'] }], rowCount: 1 };
      if (sql.startsWith('INSERT INTO platform_access_sessions')) return { rows: [{ id: ids.access }], rowCount: 1 };
      if (sql.startsWith('INSERT INTO platform_audit_log')) { audit.push({ sql, values }); return { rows: [], rowCount: 1 }; }
      if (sql.startsWith('UPDATE platform_access_sessions')) return { rows: [], rowCount: 1 };
      if (sql.startsWith('INSERT INTO organizations')) return { rows: [{ id: ids.org, name: values[0], createdAt: new Date().toISOString() }], rowCount: 1 };
      if (sql.includes('INSERT INTO platform_tenant_settings') || sql.includes('RETURNING *')) return { rows: [{ organization_id: ids.org, status: 'active' }], rowCount: 1 };
      throw new Error(`SQL inesperado: ${sql}`);
    }
  };
  return pool;
};

const security = { readToken: request => request.headers.authorization?.includes('platform') ? { userId: ids.platform, organizationId: ids.org, sessionVersion: 1 } : { userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', organizationId: ids.org, sessionVersion: 1 } };
const config = { corsOrigin: '*', aiProvider: 'mock' };
let server; let base; let pool;
before(async () => { pool = makePool(); server = createServer(createRequestHandler({ pool, security, config, aiProvider: { suggest: async () => ({ suggestions: ['ok'] }) } })); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());
const request = (path, token = 'platform', options = {}) => fetch(`${base}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }, body: options.body && JSON.stringify(options.body) }).then(async response => ({ status: response.status, body: await response.json() }));

test('Super Admin lista e seleciona somente tenants retornados pela API', async () => { const response = await request('/api/platform/tenants'); assert.equal(response.status, 200); assert.deepEqual(response.body.tenants.map(t => t.id), [ids.org]); });
test('usuário comum não acessa funções de plataforma', async () => { const response = await request('/api/platform/tenants', 'tenant-user'); assert.equal(response.status, 403); });
test('Super Admin cria, edita e arquiva Tenant com validações', async () => { const created = await request('/api/platform/tenants', 'platform', { method: 'POST', body: { name: 'Novo Tenant', monthlyFee: '99.90', billingDueDay: 10, userLimit: '5' } }); assert.equal(created.status, 201); const updated = await request(`/api/platform/tenants/${ids.org}`, 'platform', { method: 'PATCH', body: { status: 'suspended', monthlyFee: 'invalid' } }); assert.equal(updated.status, 400); const archived = await request(`/api/platform/tenants/${ids.org}`, 'platform', { method: 'DELETE' }); assert.equal(archived.status, 200); });
test('aceita mensalidade decimal compatível com NUMERIC', async () => { const created = await request('/api/platform/tenants', 'platform', { method: 'POST', body: { name: 'Tenant Decimal', monthlyFee: '99.90' } }); assert.equal(created.status, 201); });
test('acesso temporário ao Dashboard é auditado e revogável', async () => { const issued = await request('/api/platform/dashboard-access', 'platform', { method: 'POST', body: { organizationId: ids.org } }); assert.equal(issued.status, 201); assert.equal(typeof issued.body.accessToken, 'string'); assert.equal(issued.body.expiresInSeconds, 600); const revoked = await request(`/api/platform/dashboard-access/${issued.body.accessId}/revoke`, 'platform', { method: 'POST' }); assert.equal(revoked.status, 200); assert.ok(pool.audit.some(item => item.sql.includes('dashboard_access_issued'))); assert.ok(pool.audit.some(item => item.sql.includes('dashboard_access_revoked'))); });
test('sessão temporária ausente, expirada ou revogada não autentica no CRM', async () => { const response = await request('/api/settings', 'platform', { headers: { 'X-Platform-Access-Token': 'x'.repeat(43) } }); assert.equal(response.status, 401); });

test('sessão temporária é somente leitura e não acessa rotas globais', async () => {
  const read = await request('/api/settings', 'platform', { headers: { 'X-Platform-Access-Token': 't'.repeat(43) } });
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.profile.permissions, []);
  assert.equal(read.body.canEditOrganization, false);
  const write = await request('/api/settings/profile', 'platform', { method: 'PATCH', headers: { 'X-Platform-Access-Token': 't'.repeat(43) }, body: { name: 'Alteração indevida' } });
  assert.equal(write.status, 403);
  const global = await request('/api/platform/tenants', 'platform', { headers: { 'X-Platform-Access-Token': 't'.repeat(43) } });
  assert.equal(global.status, 403);
});

test('sessão temporária bloqueia PUT e DELETE em rotas de negócio', async () => {
  const put = await request('/api/integrations/meta', 'platform', { method: 'PUT', headers: { 'X-Platform-Access-Token': 't'.repeat(43) }, body: {} });
  const del = await request('/api/contacts/ffffffff-ffff-4fff-8fff-ffffffffffff', 'platform', { method: 'DELETE', headers: { 'X-Platform-Access-Token': 't'.repeat(43) } });
  assert.equal(put.status, 403);
  assert.equal(del.status, 403);
});

test('sessão temporária expirada ou revogada é rejeitada', async () => {
  for (const token of ['e', 'r']) {
    const response = await request('/api/settings', 'platform', { headers: { 'X-Platform-Access-Token': token.repeat(43) } });
    assert.equal(response.status, 401);
  }
});

test('sessões de dois Tenants permanecem isoladas', async () => {
  const tenantA = await request('/api/settings', 'platform', { headers: { 'X-Platform-Access-Token': 't'.repeat(43) } });
  const tenantB = await request('/api/settings', 'platform', { headers: { 'X-Platform-Access-Token': 'b'.repeat(43) } });
  assert.equal(tenantA.status, 200);
  assert.equal(tenantB.status, 200);
  assert.equal(tenantA.body.profile.organizationId, ids.org);
  assert.equal(tenantB.body.profile.organizationId, ids.otherOrg);
  assert.notEqual(tenantA.body.profile.organizationId, tenantB.body.profile.organizationId);
});
