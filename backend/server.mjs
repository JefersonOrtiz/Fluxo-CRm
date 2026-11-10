import { createServer } from 'node:http';
import { createHmac, randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { Pool } from 'pg';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { billingConfig, createMercadoPago } from './billing/mercado-pago.mjs';
import { createBillingService, migrateBilling } from './billing/service.mjs';
import { createBillingHandler, checkOrigin } from './billing/http.mjs';

if (existsSync(new URL('./.env', import.meta.url))) process.loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
const port = Number(process.env.PORT || 3001);
const defaultPool = new Pool({ connectionString: process.env.DATABASE_URL });
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const base64url = value => Buffer.from(value).toString('base64url');
const parseBody = request => new Promise((resolve, reject) => { let data = ''; request.on('data', chunk => { data += chunk; if (data.length > 1_000_000) reject(new Error('Payload muito grande')); }); request.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON inválido')); } }); request.on('error', reject); });
const passwordHash = password => { const salt = randomBytes(16).toString('hex'); return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`; };
const passwordMatches = (password, encoded) => { const [, salt, hash] = encoded.split('$'); const derived = scryptSync(password, salt, 64); return timingSafeEqual(derived, Buffer.from(hash, 'hex')); };
const tokenSecret = (env = process.env) => { if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) { const error = new Error('Configure JWT_SECRET com ao menos 32 caracteres'); error.status = 503; throw error; } return env.JWT_SECRET; };
const signToken = (payload, env = process.env) => { const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 })); const signature = createHmac('sha256', tokenSecret(env)).update(`${header}.${body}`).digest('base64url'); return `${header}.${body}.${signature}`; };
const readToken = (request, env = process.env) => {
  const raw = request.headers.authorization?.replace(/^Bearer\s+/i, '') || request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('jf_crm_session='))?.slice(15);
  if (!raw || raw.length > 5000) return null;
  try {
    const [header, body, signature, extra] = raw.split('.');
    if (extra || !header || !body || !signature) return null;
    const expected = createHmac('sha256', tokenSecret(env)).update(`${header}.${body}`).digest('base64url');
    const actualBytes = Buffer.from(signature), expectedBytes = Buffer.from(expected);
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch { return null; }
};
const sessionCookie = (response, token, env = process.env) => response.setHeader('Set-Cookie', `jf_crm_session=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${token ? 28800 : 0}${env.APP_PUBLIC_URL?.startsWith('https:') ? '; Secure' : ''}`);
const encrypt = value => { const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64'); if (key.length !== 32) throw new Error('ENCRYPTION_KEY de 32 bytes é obrigatória para guardar credenciais'); const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }; };
const decrypt = item => { const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'base64'); const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(item.iv, 'base64')); decipher.setAuthTag(Buffer.from(item.tag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(item.data, 'base64')), decipher.final()]).toString('utf8'); };
const authorize = (request, env = process.env) => { const session = readToken(request, env); if (!session) { const error = new Error('Não autorizado'); error.status = 401; throw error; } return session; };
const requirePermission = (session, permission) => { if (!session.permissions.includes('*') && !session.permissions.includes(permission)) { const error = new Error('Sem permissão para esta ação'); error.status = 403; throw error; } };
const userPayload = row => ({ userId: row.id, organizationId: row.organization_id, name: row.name, role: row.role_name, permissions: row.permissions || [] });

export function createApiServer({ pool = defaultPool, env = process.env, provider } = {}) {
const auth = request => authorize(request, env);
const config = billingConfig(env);
const billing = createBillingService({ pool, config, provider: provider || createMercadoPago(config) });
const handleBilling = createBillingHandler({ service: billing, config, pool, env, auth, parseBody, json });
const server = createServer(async (request, response) => {
  if (request.headers.origin === env.CORS_ORIGIN) {
    response.setHeader('Access-Control-Allow-Origin', env.CORS_ORIGIN);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (request.method === 'OPTIONS') return response.writeHead(204).end();
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (await handleBilling(request, response, url)) return;
    if (url.pathname.startsWith('/api/auth/')) {
      response.setHeader('Cache-Control', 'no-store');
      if (request.method === 'POST') checkOrigin(request, env);
    }
    if (url.pathname === '/api/health') { await pool.query('SELECT 1'); return json(response, 200, { ok: true, service: 'fluxo-api' }); }
    if (url.pathname === '/api/auth/bootstrap' && request.method === 'POST') {
      const { rows: [{ count }] } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
      if (count) return json(response, 409, { error: 'A organização inicial já foi criada' });
      const body = await parseBody(request); if (!body.organizationName || !body.name || !body.email || !body.password || body.password.length < 8) return json(response, 400, { error: 'Informe organização, nome, e-mail e senha de ao menos 8 caracteres' });
      const client = await pool.connect();
      try { await client.query('BEGIN'); await client.query('LOCK TABLE users IN EXCLUSIVE MODE'); const existing = await client.query('SELECT 1 FROM users LIMIT 1'); if (existing.rows.length) { await client.query('ROLLBACK'); return json(response, 409, { error: 'A organização inicial já foi criada' }); } const org = await client.query('INSERT INTO organizations(name) VALUES($1) RETURNING id,name', [body.organizationName]); const role = await client.query("INSERT INTO roles(organization_id,name,description,permissions) VALUES($1,'Administrador','Acesso total',$2) RETURNING id,name,permissions", [org.rows[0].id, JSON.stringify(['*'])]); const user = await client.query('INSERT INTO users(organization_id,role_id,name,email,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,organization_id,name', [org.rows[0].id, role.rows[0].id, body.name, body.email.toLowerCase(), passwordHash(body.password)]); const payload = { userId: user.rows[0].id, organizationId: user.rows[0].organization_id, name: user.rows[0].name, role: role.rows[0].name, permissions: role.rows[0].permissions }; const token = signToken(payload, env); await client.query('COMMIT'); sessionCookie(response, token, env); return json(response, 201, { token, user: payload }); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    }
    if (url.pathname === '/api/auth/login' && request.method === 'POST') { const body = await parseBody(request); const { rows } = await pool.query(`SELECT u.*, r.name role_name, r.permissions FROM users u LEFT JOIN roles r ON r.id=u.role_id AND r.organization_id=u.organization_id WHERE u.email=$1 AND u.active=true`, [String(body.email || '').toLowerCase()]); if (!rows[0] || !passwordMatches(body.password || '', rows[0].password_hash)) return json(response, 401, { error: 'E-mail ou senha inválidos' }); const user = userPayload(rows[0]); await pool.query('UPDATE users SET last_seen_at=now() WHERE id=$1', [user.userId]); const token = signToken(user, env); sessionCookie(response, token, env); return json(response, 200, { token, user }); }
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') { sessionCookie(response, '', env); return json(response, 200, { ok: true }); }
    if (url.pathname === '/api/auth/me' && request.method === 'GET') return json(response, 200, { user: auth(request) });
    if (url.pathname === '/api/departments' && request.method === 'GET') { const session = auth(request); const { rows } = await pool.query('SELECT * FROM departments WHERE organization_id=$1 ORDER BY name', [session.organizationId]); return json(response, 200, rows); }
    if (url.pathname === '/api/departments' && request.method === 'POST') { const session = auth(request); requirePermission(session, 'organization:write'); const body = await parseBody(request); const { rows } = await pool.query('INSERT INTO departments(organization_id,name,color) VALUES($1,$2,$3) RETURNING *', [session.organizationId, body.name, body.color || 'jade']); return json(response, 201, rows[0]); }
    if (url.pathname === '/api/members' && request.method === 'GET') { const session = auth(request); const { rows } = await pool.query('SELECT u.id,u.name,u.email,u.active,d.name department,r.name role FROM users u LEFT JOIN departments d ON d.id=u.department_id LEFT JOIN roles r ON r.id=u.role_id WHERE u.organization_id=$1 ORDER BY u.name', [session.organizationId]); return json(response, 200, rows); }
    if (url.pathname === '/api/tags' && request.method === 'GET') { const session = auth(request); const { rows } = await pool.query('SELECT * FROM tags WHERE organization_id=$1 ORDER BY name', [session.organizationId]); return json(response, 200, rows); }
    if (url.pathname === '/api/tags' && request.method === 'POST') { const session = auth(request); requirePermission(session, 'organization:write'); const body = await parseBody(request); const { rows } = await pool.query('INSERT INTO tags(organization_id,name,color) VALUES($1,$2,$3) RETURNING *', [session.organizationId, body.name, body.color || 'sky']); return json(response, 201, rows[0]); }
    if (url.pathname === '/api/integrations/meta' && request.method === 'GET') { const session = auth(request); const { rows } = await pool.query('SELECT app_id,business_id,waba_id,phone_number_id,status,updated_at FROM integrations WHERE organization_id=$1 AND provider=$2', [session.organizationId, 'meta']); return json(response, 200, rows[0] || { status: 'not_configured' }); }
    if (url.pathname === '/api/integrations/meta' && request.method === 'PUT') { const session = auth(request); requirePermission(session, 'integrations:write'); const body = await parseBody(request); const secrets = body.accessToken || body.appSecret ? encrypt(JSON.stringify({ accessToken: body.accessToken || '', appSecret: body.appSecret || '' })) : null; const { rows } = await pool.query(`INSERT INTO integrations(organization_id,provider,app_id,business_id,waba_id,phone_number_id,secret_ciphertext,status) VALUES($1,'meta',$2,$3,$4,$5,$6,'pending') ON CONFLICT(organization_id,provider) DO UPDATE SET app_id=EXCLUDED.app_id,business_id=EXCLUDED.business_id,waba_id=EXCLUDED.waba_id,phone_number_id=EXCLUDED.phone_number_id,secret_ciphertext=COALESCE(EXCLUDED.secret_ciphertext,integrations.secret_ciphertext),updated_at=now() RETURNING app_id,business_id,waba_id,phone_number_id,status`, [session.organizationId, body.appId, body.businessId, body.wabaId, body.phoneNumberId, secrets ? JSON.stringify(secrets) : null]); return json(response, 200, rows[0]); }
    if (url.pathname === '/api/webhooks/meta' && request.method === 'GET') { if (url.searchParams.get('hub.verify_token') !== process.env.META_VERIFY_TOKEN) return response.writeHead(403).end(); return response.writeHead(200, { 'Content-Type': 'text/plain' }).end(url.searchParams.get('hub.challenge') || ''); }
    if (url.pathname === '/api/webhooks/meta' && request.method === 'POST') { await parseBody(request); return response.writeHead(200).end(); }
    return json(response, 404, { error: 'Rota não encontrada' });
  } catch (error) { if (!error.status) console.error('API: falha interna', error.code || 'unknown'); return json(response, error.status || 500, { error: error.status ? error.message : 'Erro interno ao processar a solicitação.', ...(error.code && error.status ? { code: error.code } : {}) }); }
});
server.billing = billing;
return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await migrateBilling(defaultPool);
  const server = createApiServer();
  let draining = false;
  const worker = setInterval(async () => {
    if (draining) return;
    draining = true;
    try { for (let count = 0; count < 10 && await server.billing.drainOne(); count++); }
    catch { console.warn('billing: fila temporariamente indisponível'); }
    finally { draining = false; }
  }, 5000);
  worker.unref();
  server.on('close', () => clearInterval(worker));
  server.listen(port, () => console.log(`JF System CRM API disponível em http://localhost:${port}`));
}
