import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { addMonth, createBillingService, migrateBilling } from '../billing/service.mjs';
import { BillingError, billingConfig, createMercadoPago, verifyWebhook } from '../billing/mercado-pago.mjs';
import { createApiServer } from '../server.mjs';

const db = new PGlite();
let tail = Promise.resolve();
async function acquire() { const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous; return release; }
const pool = {
  async query(sql, args) { const release = await acquire(); try { return await db.query(sql, args); } finally { release(); } },
  async connect() { const release = await acquire(); return { query: (sql, args) => db.query(sql, args), release }; },
};
// PGlite usa PostgreSQL real em WASM. A extensão pgcrypto não é necessária nestes testes.
before(async () => {
  await db.exec((await readFile(new URL('../../database/init.sql', import.meta.url), 'utf8')).replace('CREATE EXTENSION IF NOT EXISTS "pgcrypto";', ''));
  await db.exec(await readFile(new URL('../billing/schema.sql', import.meta.url), 'utf8'));
  process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters-for-auth';
});
after(async () => { await db.close(); });
const config = { enabled: true, publicKey: 'TEST-public', publicUrl: 'https://crm.example', webhookSecret: 'test-secret' };
const card = { planId: 'basico', method: 'card', acceptedTerms: true, cardTokenId: 'token-transient-123456', payer: { email: 'payer@example.com' } };
const pix = { ...card, method: 'pix', cardTokenId: undefined, payer: { email: 'payer@example.com', firstName: 'Maria', lastName: 'Silva', document: '12345678901' } };

async function fixture() {
  const org = (await pool.query("INSERT INTO organizations(name) VALUES('Empresa teste') RETURNING id")).rows[0].id;
  const role = (await pool.query("INSERT INTO roles(organization_id,name,permissions) VALUES($1,'Financeiro','[\"*\"]') RETURNING id", [org])).rows[0].id;
  const user = (await pool.query("INSERT INTO users(organization_id,role_id,name,email,password_hash) VALUES($1,$2,'Admin',$3,'unused') RETURNING id", [org, role, `${randomUUID()}@example.com`])).rows[0].id;
  let time = new Date('2026-11-10T12:00:00Z');
  const subscriptions = new Map(), payments = new Map(), invoices = new Map();
  const calls = { card: [], pix: [] };
  const provider = {
    async createSubscription(body) { calls.card.push(body); const result = { ...body, id: randomUUID(), next_payment_date: body.auto_recurring.start_date, status: 'authorized' }; subscriptions.set(result.id, result); return result; },
    async getSubscription(id) { return subscriptions.get(id); },
    async searchSubscriptions(ref) { return { results: [...subscriptions.values()].filter(item => item.external_reference === ref) }; },
    async cancelSubscription(id) { const item = subscriptions.get(id); item.status = 'cancelled'; return item; },
    async createPix(body, key) { calls.pix.push({ body, key }); const result = { ...body, id: randomUUID(), currency_id: 'BRL', status: 'pending', point_of_interaction: { transaction_data: { qr_code: '000201-code', qr_code_base64: 'aW1hZ2U=' } } }; payments.set(result.id, result); return result; },
    async getPayment(id) { return payments.get(String(id)); },
    async searchPayments(ref) { return { results: [...payments.values()].filter(item => item.external_reference === ref) }; },
    async getInvoice(id) { return invoices.get(String(id)); },
    async searchInvoices(id) { return { results: [...invoices.values()].filter(item => item.preapproval_id === id) }; },
  };
  const service = createBillingService({ pool, provider, config, now: () => time });
  return { org, user, role, provider, service, calls, subscriptions, payments, invoices,
    setTime(value) { time = new Date(value); },
    async expireTrial() { time = new Date('2027-01-01T12:00:00Z'); await pool.query('UPDATE billing_accounts SET trial_ends_at=$2 WHERE organization_id=$1', [org, new Date('2026-12-01T12:00:00Z')]); },
  };
}

test('catálogo, calendário e configuração exigem todos os segredos e HTTPS', async () => {
  assert.equal(billingConfig({}).enabled, false);
  assert.equal(billingConfig({ MP_PUBLIC_KEY: 'public' }).publicKey, null);
  const env = { MP_PUBLIC_KEY: 'public', MP_ACCESS_TOKEN: 'private', MP_WEBHOOK_SECRET: 'secret', JWT_SECRET: 'x'.repeat(32), APP_PUBLIC_URL: 'https://crm.example/path' };
  assert.equal(billingConfig(env).enabled, true);
  assert.equal(billingConfig({ ...env, APP_PUBLIC_URL: 'http://localhost:3000' }).enabled, false);
  assert.equal(addMonth('2027-01-31T12:00:00Z').toISOString(), '2027-02-28T12:00:00.000Z');
  assert.equal(addMonth('2028-01-31T12:00:00Z').toISOString(), '2028-02-29T12:00:00.000Z');
  const migrator = { query: sql => db.exec(sql) };
  await migrateBilling(migrator); await migrateBilling(migrator);
});
test('cartão usa valor do catálogo, agenda após teste e não persiste o token', async () => {
  const f = await fixture();
  const result = await f.service.checkout(f.org, card, randomUUID());
  assert.equal(result.account.accessStatus, 'trial');
  assert.equal(result.account.recurring, true);
  assert.equal(result.account.trialEndsAt.toISOString(), '2026-11-25T12:00:00.000Z');
  assert.equal(f.calls.card[0].auto_recurring.transaction_amount, 499);
  assert.equal(f.calls.card[0].auto_recurring.start_date, '2026-11-25T12:00:00.000Z');
  assert.equal(f.calls.card[0].card_token_id, card.cardTokenId);
  const stored = await pool.query('SELECT * FROM billing_operations WHERE organization_id=$1', [f.org]);
  assert.equal(JSON.stringify(stored).includes(card.cardTokenId), false);
  assert.deepEqual(result.payments, []); // Contrato autorizado não equivale a mensalidade paga.
  await assert.rejects(f.service.checkout(f.org, { ...card, transaction_amount: 1 }, randomUUID()), { status: 400 });
  await assert.rejects(f.service.checkout(f.org, { ...card, cardNumber: '4111111111111111', cvv: '123' }, randomUUID()), { status: 400 });
});
test('cada plano mantém preço, teste e quantidade de usuários definidos', async () => {
  for (const [planId, amount, days] of [['basico', 499, 15], ['essencial', 799, 30], ['profissional', 1099, 30]]) {
    const f = await fixture();
    const result = await f.service.checkout(f.org, { ...card, planId }, randomUUID());
    assert.equal(f.calls.card[0].auto_recurring.transaction_amount, amount);
    assert.equal((new Date(result.account.trialEndsAt) - new Date('2026-11-10T12:00:00Z')) / 86400000, days);
  }
  const f = await fixture();
  for (let i = 0; i < 3; i++) await pool.query("INSERT INTO users(organization_id,role_id,name,email,password_hash) VALUES($1,$2,'Outro',$3,'unused')", [f.org, f.role, `${randomUUID()}@example.com`]);
  await assert.rejects(f.service.checkout(f.org, card, randomUUID()), { status: 409 });
  assert.equal(f.calls.card.length, 0);
});
test('cliques repetidos e requisições concorrentes geram um só contrato', async () => {
  const f = await fixture(), key = randomUUID();
  await Promise.all([f.service.checkout(f.org, card, key), f.service.checkout(f.org, card, key)]);
  assert.equal(f.calls.card.length, 1);
  await assert.rejects(f.service.checkout(f.org, card, randomUUID()), { status: 409 });
  await assert.rejects(f.service.checkout(f.org, { ...card, planId: 'essencial' }, key), { status: 409 });
});
test('PIX inicia o teste sem cobrança, depois gera QR e exige pagamento aprovado', async () => {
  const f = await fixture();
  let result = await f.service.checkout(f.org, pix, randomUUID());
  assert.equal(result.account.accessStatus, 'trial');
  assert.equal(f.calls.pix.length, 0);
  await f.expireTrial();
  result = await f.service.checkout(f.org, pix, randomUUID());
  assert.equal(result.account.accessStatus, 'expired');
  assert.equal(result.pendingPix.qrCode, '000201-code');
  const payment = [...f.payments.values()][0];
  assert.equal(f.calls.pix[0].body.transaction_amount, 499);
  assert.equal(f.calls.pix[0].key, payment.external_reference);
  assert.equal(new Date(payment.date_of_expiration) - new Date('2027-01-01T12:00:00Z'), 3600000);
  await f.service.checkout(f.org, pix, randomUUID());
  assert.equal(f.calls.pix.length, 1);
  payment.status = 'approved'; payment.date_approved = '2027-01-01T12:01:00Z';
  await f.service.processNotification('payment', payment.id);
  await f.service.processNotification('payment', payment.id);
  result = await f.service.snapshot(f.org);
  assert.equal(result.account.accessStatus, 'paid');
  assert.equal(result.payments.length, 1);
  assert.equal(result.account.paidUntil.toISOString(), '2027-02-01T12:00:00.000Z');
  assert.equal(result.pendingPix, null);
  payment.status = 'refunded';
  await f.service.processNotification('payment', payment.id);
  assert.equal((await f.service.snapshot(f.org)).account.accessStatus, 'expired');
});
test('valor e moeda divergentes nunca confirmam pagamento', async () => {
  const f = await fixture();
  await f.service.checkout(f.org, pix, randomUUID()); await f.expireTrial();
  await f.service.checkout(f.org, pix, randomUUID());
  const payment = [...f.payments.values()][0]; payment.status = 'approved'; payment.transaction_amount = 1;
  await assert.rejects(f.service.processNotification('payment', payment.id), { code: 'amount_mismatch' });
  payment.transaction_amount = 499; payment.currency_id = 'USD';
  await assert.rejects(f.service.processNotification('payment', payment.id), { code: 'amount_mismatch' });
  assert.equal((await f.service.snapshot(f.org)).account.accessStatus, 'expired');
});
test('timeout não cria outra cobrança; conciliação recupera contrato criado no provedor', async () => {
  const f = await fixture(), create = f.provider.createSubscription;
  f.provider.createSubscription = async body => { await create(body); throw new BillingError(503, 'Timeout', 'provider_uncertain'); };
  await assert.rejects(f.service.checkout(f.org, card, randomUUID()), { status: 503 });
  assert.equal((await f.service.snapshot(f.org)).pendingOperation.status, 'uncertain');
  await assert.rejects(f.service.checkout(f.org, card, randomUUID()), { status: 409 });
  const recovered = await f.service.refresh(f.org);
  assert.equal(recovered.pendingOperation, null);
  assert.equal(recovered.account.recurring, true);
  assert.equal(f.calls.card.length, 1);
});
test('PIX também é recuperado por referência depois de timeout', async () => {
  const f = await fixture();
  await f.service.checkout(f.org, pix, randomUUID()); await f.expireTrial();
  const create = f.provider.createPix;
  f.provider.createPix = async (body, key) => { await create(body, key); throw new BillingError(503, 'Timeout', 'provider_uncertain'); };
  await assert.rejects(f.service.checkout(f.org, pix, randomUUID()));
  const recovered = await f.service.refresh(f.org);
  assert.equal(recovered.pendingOperation, null); assert.ok(recovered.pendingPix);
  assert.equal(f.calls.pix.length, 1);
});
test('notificação atrasada não reverte pagamento aprovado ou estornado', async () => {
  const f = await fixture();
  await f.service.checkout(f.org, pix, randomUUID()); await f.expireTrial(); await f.service.checkout(f.org, pix, randomUUID());
  const payment = [...f.payments.values()][0];
  payment.status = 'approved'; payment.date_last_updated = '2027-01-01T12:03:00Z';
  await f.service.processNotification('payment', payment.id);
  payment.status = 'pending'; payment.date_last_updated = '2027-01-01T12:02:00Z';
  await f.service.processNotification('payment', payment.id);
  assert.equal((await f.service.snapshot(f.org)).account.accessStatus, 'paid');
  payment.status = 'refunded'; payment.date_last_updated = '2027-01-01T12:04:00Z';
  await f.service.processNotification('payment', payment.id);
  payment.status = 'approved'; payment.date_last_updated = '2027-01-01T12:03:00Z';
  await f.service.processNotification('payment', payment.id);
  const result = await f.service.snapshot(f.org);
  assert.equal(result.account.accessStatus, 'expired'); assert.equal(result.payments[0].status, 'refunded');
});
test('fatura recebida antes do contrato concilia a criação incerta', async () => {
  const f = await fixture(), create = f.provider.createSubscription;
  f.provider.createSubscription = async body => { await create(body); throw new BillingError(503, 'Timeout', 'provider_uncertain'); };
  await assert.rejects(f.service.checkout(f.org, card, randomUUID()));
  const subscription = [...f.subscriptions.values()][0];
  f.setTime('2026-11-26T12:00:00Z');
  const invoice = { id: randomUUID(), preapproval_id: subscription.id, currency_id: 'BRL', transaction_amount: 499, debit_date: '2026-11-25T12:00:00Z', payment: { id: randomUUID() } };
  f.invoices.set(invoice.id, invoice);
  f.payments.set(invoice.payment.id, { id: invoice.payment.id, status: 'approved', currency_id: 'BRL', transaction_amount: 499 });
  await f.service.processNotification('subscription_authorized_payment', invoice.id);
  const result = await f.service.snapshot(f.org);
  assert.equal(result.account.accessStatus, 'paid'); assert.equal(result.pendingOperation, null);
});
test('fatura aceita o arredondamento de milissegundos do provedor', async () => {
  const f = await fixture(); f.setTime('2026-11-10T12:00:00.900Z');
  await f.service.checkout(f.org, card, randomUUID());
  const subscription = [...f.subscriptions.values()][0];
  const invoice = { id: randomUUID(), preapproval_id: subscription.id, currency_id: 'BRL', transaction_amount: 499, debit_date: '2026-11-25T12:00:00Z', payment: { id: randomUUID() } };
  f.invoices.set(invoice.id, invoice);
  f.payments.set(invoice.payment.id, { id: invoice.payment.id, status: 'approved', currency_id: 'BRL', transaction_amount: 499 });
  await f.service.processNotification('subscription_authorized_payment', invoice.id);
  assert.equal((await f.service.snapshot(f.org)).payments[0].status, 'approved');
});
test('fatura do cartão confirma um único período; cancelamento não renova o teste', async () => {
  const f = await fixture();
  await f.service.checkout(f.org, card, randomUUID());
  const subscription = [...f.subscriptions.values()][0];
  f.setTime('2026-11-26T12:00:00Z');
  assert.equal((await f.service.snapshot(f.org)).account.accessStatus, 'expired');
  const payment = { id: '123', status: 'approved', transaction_amount: 499, currency_id: 'BRL', date_approved: '2026-11-25T12:01:00Z' };
  const invoice = { id: '456', preapproval_id: subscription.id, transaction_amount: 499, currency_id: 'BRL', debit_date: '2026-11-25T12:00:00Z', payment: { id: 123 } };
  f.payments.set('123', payment); f.invoices.set('456', invoice);
  await f.service.processNotification('subscription_authorized_payment', '456');
  await f.service.processNotification('subscription_authorized_payment', '456');
  const paid = await f.service.cancel(f.org);
  assert.equal(paid.account.status, 'cancelled'); assert.equal(paid.account.accessStatus, 'paid');
  assert.equal(paid.payments.length, 1);
  const again = await f.service.checkout(f.org, card, randomUUID());
  assert.equal(again.account.trialEndsAt.toISOString(), '2026-11-25T12:00:00.000Z');
  assert.equal(f.calls.card[1].auto_recurring.start_date, '2026-12-25T12:00:00.000Z');
  await f.service.processNotification('subscription_preapproval', subscription.id);
  assert.equal((await f.service.snapshot(f.org)).account.status, 'authorized'); // Contrato antigo não substitui novo.
  payment.status = 'charged_back';
  await f.service.processNotification('payment', '123');
  assert.equal((await f.service.snapshot(f.org)).account.accessStatus, 'expired');
});
test('webhook exige HMAC válido, identificador e timestamp recente', () => {
  const time = Date.now(), ts = String(Math.floor(time / 1000));
  const url = new URL('https://crm.example/api/billing/webhook?data.id=AB123');
  const sign = timestamp => createHmac('sha256', 'secret').update(`id:ab123;request-id:request;ts:${timestamp};`).digest('hex');
  const headers = { 'x-request-id': 'request', 'x-signature': `ts=${ts},v1=${sign(ts)}` };
  assert.equal(verifyWebhook(headers, url, 'secret', time), true);
  assert.equal(verifyWebhook(headers, url, 'wrong', time), false);
  assert.equal(verifyWebhook(headers, url, 'secret', time + 600000), false);
  assert.equal(verifyWebhook({ ...headers, 'x-signature': `ts=${ts},v1=${'💥'.repeat(32)}` }, url, 'secret', time), false);
  assert.equal(verifyWebhook(headers, new URL('https://crm.example'), 'secret'), false);
});
test('fila persiste e processa notificação repetida de forma idempotente', async () => {
  const f = await fixture();
  await f.service.checkout(f.org, pix, randomUUID()); await f.expireTrial(); await f.service.checkout(f.org, pix, randomUUID());
  const payment = [...f.payments.values()][0]; payment.status = 'approved';
  await f.service.enqueue('payment', payment.id); await f.service.enqueue('payment', payment.id);
  assert.equal(await f.service.drainOne(), true);
  assert.equal(await f.service.drainOne(), false);
  assert.equal((await f.service.snapshot(f.org)).payments.length, 1);
});
test('cliente do provedor envia credencial só ao Mercado Pago e sanitiza erros', async () => {
  const calls = [];
  const provider = createMercadoPago({ accessToken: 'secret-access' }, async (url, options) => {
    calls.push({ url, options }); return { ok: false, status: 400, async json() { return { message: 'private provider response with tokens' }; } };
  });
  await assert.rejects(provider.createPix({ amount: 499 }, 'key'), error => error.code === 'provider_rejected' && !error.message.includes('private'));
  assert.equal(calls[0].url, 'https://api.mercadopago.com/v1/payments');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-access');
  assert.equal(calls[0].options.headers['X-Idempotency-Key'], 'key');
});
test('HTTP isola a organização, revalida permissões e não revela chaves privadas', async () => {
  const f = await fixture(), other = await fixture();
  await f.service.checkout(f.org, pix, randomUUID());
  const env = { ...process.env, APP_PUBLIC_URL: 'https://crm.example', CORS_ORIGIN: 'http://localhost:3000', MP_PUBLIC_KEY: 'public', MP_ACCESS_TOKEN: 'do-not-expose', MP_WEBHOOK_SECRET: 'secret' };
  const server = createApiServer({ pool, provider: f.provider, env });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (user, org) => {
    const h = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
    const b = Buffer.from(JSON.stringify({ userId: user, organizationId: org, permissions: ['*'], exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    return `${h}.${b}.${createHmac('sha256', process.env.JWT_SECRET).update(`${h}.${b}`).digest('base64url')}`;
  };
  const request = (path, headers, body) => fetch(`${base}/api/${path}`, { headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  try {
    const configuration = await (await request('billing/config')).text();
    assert.ok(configuration.includes('"enabled":true')); assert.equal(configuration.includes('do-not-expose'), false);
    assert.equal((await request('billing/subscription')).status, 401);
    assert.equal((await request('billing/subscription', { Authorization: 'Bearer malformed' })).status, 401);
    const own = { Authorization: `Bearer ${token(f.user, f.org)}` };
    const otherSession = { Authorization: `Bearer ${token(other.user, other.org)}` };
    assert.equal((await (await request('billing/subscription', otherSession)).json()).account, null);
    assert.equal((await request('billing/checkout', { ...own, Origin: 'https://evil.example' }, card)).status, 403);
    assert.equal((await request('billing/checkout', { Cookie: `jf_crm_session=${token(f.user, f.org)}` }, card)).status, 403);
    assert.equal((await request('billing/subscription', { Authorization: `Bearer ${token(f.user, other.org)}` })).status, 401);
    const salt = 'test-salt', password = 'test-password-123';
    await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [f.user, `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`]);
    const email = (await pool.query('SELECT email FROM users WHERE id=$1', [f.user])).rows[0].email;
    const login = await request('auth/login', { Origin: 'https://crm.example' }, { email, password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Secure/);
    assert.equal((await request('billing/subscription', { Cookie: cookie.split(';')[0] })).status, 200);
    const logout = await request('auth/logout', { Origin: 'https://crm.example', Cookie: cookie.split(';')[0] }, {});
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    await pool.query("UPDATE roles SET permissions='[]' WHERE id=$1", [f.role]);
    assert.equal((await request('billing/subscription', own)).status, 403);
    assert.equal((await request('billing/webhook?data.id=123', {}, { type: 'payment', data: { id: '123' } })).status, 401);
    const ts = String(Math.floor(Date.now() / 1000)), resource = randomUUID();
    const signature = createHmac('sha256', 'secret').update(`id:${resource};request-id:request;ts:${ts};`).digest('hex');
    const signed = { 'x-request-id': 'request', 'x-signature': `ts=${ts},v1=${signature}` };
    assert.equal((await request(`billing/webhook?data.id=${resource}`, signed, { type: 'payment', data: { id: resource } })).status, 200);
    assert.equal((await request(`billing/webhook?data.id=${resource}`, signed, { type: 'payment', data: { id: 'wrong' } })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
