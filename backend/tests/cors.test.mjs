import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCorsOrigins } from '../src/config.mjs';
import { createRequestHandler } from '../src/app.mjs';

const runRequest = async ({ method = 'GET', origin } = {}) => {
  const headers = {};
  const response = {
    setHeader(name, value) { headers[name] = value; },
    writeHead(status) { headers.status = status; return this; },
    end() { headers.ended = true; }
  };
  const request = { method, url: '/api/health', headers: origin ? { origin } : {} };
  const handler = createRequestHandler({
    pool: { query: async () => ({ rows: [{ '?column?': 1 }] }) },
    security: {},
    config: { corsOrigins: ['https://allowed.example'] }
  });
  await handler(request, response);
  return headers;
};

const runProtectedRequest = async ({ origin, authorization } = {}) => {
  const headers = {};
  const response = {
    setHeader(name, value) { headers[name] = value; },
    writeHead(status) { headers.status = status; return this; },
    end(body = '') { headers.ended = true; headers.body = body; }
  };
  const request = { method: 'GET', url: '/api/auth/me', headers: { ...(origin ? { origin } : {}), ...(authorization ? { authorization } : {}) } };
  const handler = createRequestHandler({
    pool: { query: async () => ({ rows: [{ id: 'user-1', organization_id: 'org-1', name: 'Teste', session_version: 1, role_name: 'Administrador', permissions: ['*'] }] }) },
    security: { readToken: request => request.headers.authorization === 'Bearer valido' ? { userId: 'user-1', organizationId: 'org-1', sessionVersion: 1 } : null },
    config: { corsOrigins: ['https://allowed.example'] }
  });
  await handler(request, response);
  return headers;
};

test('CORS aceita allowlist explícita e remove duplicatas', () => {
  assert.deepEqual(parseCorsOrigins('https://crm.example.com, https://staging.example.com,https://crm.example.com'), [
    'https://crm.example.com', 'https://staging.example.com'
  ]);
});

test('CORS rejeita wildcard e origens malformadas', () => {
  assert.throws(() => parseCorsOrigins('*'), /não pode usar/);
  assert.throws(() => parseCorsOrigins('https://example.com/path'), /Origem CORS inválida/);
  assert.throws(() => parseCorsOrigins('crm.example.com'), /Origem CORS inválida/);
});

test('CORS sem configuração produz allowlist vazia', () => {
  assert.deepEqual(parseCorsOrigins(''), []);
});

test('origem permitida recebe CORS e origem não permitida não recebe', async () => {
  const allowed = await runRequest({ origin: 'https://allowed.example' });
  const denied = await runRequest({ origin: 'https://evil.example' });
  assert.equal(allowed['Access-Control-Allow-Origin'], 'https://allowed.example');
  assert.equal(denied['Access-Control-Allow-Origin'], undefined);
});

test('preflight permitido mantém métodos e headers, inclusive sem Origin', async () => {
  const allowed = await runRequest({ method: 'OPTIONS', origin: 'https://allowed.example' });
  const noOrigin = await runRequest({ method: 'OPTIONS' });
  assert.equal(allowed.status, 204);
  assert.match(allowed['Access-Control-Allow-Methods'], /PATCH/);
  assert.match(allowed['Access-Control-Allow-Headers'], /Authorization/);
  assert.equal(noOrigin.status, 204);
  assert.equal(noOrigin['Access-Control-Allow-Origin'], undefined);
});

test('endpoint protegido preserva autenticação independentemente de CORS', async () => {
  const allowedValid = await runProtectedRequest({ origin: 'https://allowed.example', authorization: 'Bearer valido' });
  const allowedMissing = await runProtectedRequest({ origin: 'https://allowed.example' });
  const allowedInvalid = await runProtectedRequest({ origin: 'https://allowed.example', authorization: 'Bearer invalido' });
  const deniedValid = await runProtectedRequest({ origin: 'https://evil.example', authorization: 'Bearer valido' });
  assert.equal(allowedValid.status, 200);
  assert.equal(allowedValid['Access-Control-Allow-Origin'], 'https://allowed.example');
  assert.equal(allowedMissing.status, 401);
  assert.equal(allowedInvalid.status, 401);
  assert.equal(deniedValid.status, 200);
  assert.equal(deniedValid['Access-Control-Allow-Origin'], undefined);
});
