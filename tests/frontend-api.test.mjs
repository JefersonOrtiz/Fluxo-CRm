import test from 'node:test';
import assert from 'node:assert/strict';

await import('../js/api.js');

const { createClient, ApiError, SESSION_KEY } = globalThis.FluxoApiClient;

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

test('login normaliza a requisição e persiste somente token e usuário na sessão', async () => {
  const storage = createStorage();
  const client = createClient({
    baseUrl: '/api/',
    storage,
    fetch: async (url, options) => {
      assert.equal(url, '/api/auth/login');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, undefined);
      assert.deepEqual(JSON.parse(options.body), { email: 'admin@empresa.com', password: 'senha-segura' });
      return jsonResponse({ token: 'token-assinado', user: { userId: 'u1', name: 'Admin' }, ignored: 'valor' });
    }
  });

  const session = await client.login('admin@empresa.com', 'senha-segura');

  assert.deepEqual(session, {
    token: 'token-assinado',
    user: { userId: 'u1', name: 'Admin' },
    platformAccess: false
  });
  assert.deepEqual(JSON.parse(storage.getItem(SESSION_KEY)), session);
  assert.equal(storage.getItem(SESSION_KEY).includes('senha-segura'), false);
});

test('resposta 401 limpa a sessão e retorna erro normalizado', async () => {
  const session = { token: 'expirado', user: { userId: 'u1', name: 'Admin' } };
  const storage = createStorage({ [SESSION_KEY]: JSON.stringify(session) });
  const client = createClient({
    storage,
    fetch: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer expirado');
      return jsonResponse({ error: 'Não autorizado' }, 401);
    }
  });

  await assert.rejects(client.me(), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'UNAUTHORIZED');
    return true;
  });
  assert.equal(storage.getItem(SESSION_KEY), null);
});

test('indisponibilidade de rede produz erro estável', async () => {
  const client = createClient({
    storage: createStorage(),
    fetch: async () => { throw new TypeError('connection refused'); }
  });

  await assert.rejects(client.login('a@b.com', 'senha'), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'NETWORK_ERROR');
    return true;
  });
});

test('JSON inválido é rejeitado como resposta inválida', async () => {
  const client = createClient({
    storage: createStorage(),
    fetch: async () => new Response('{incompleto', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  });

  await assert.rejects(client.login('a@b.com', 'senha'), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'INVALID_RESPONSE');
    return true;
  });
});
