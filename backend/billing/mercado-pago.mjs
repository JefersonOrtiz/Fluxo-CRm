import { createHmac, timingSafeEqual } from 'node:crypto';

export class BillingError extends Error {
  constructor(status, message, code = 'billing_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function billingConfig(env = process.env) {
  let publicUrl;
  try { publicUrl = new URL(env.APP_PUBLIC_URL); } catch { /* Configuração pendente. */ }
  const enabled = Boolean(env.MP_PUBLIC_KEY && env.MP_ACCESS_TOKEN && env.MP_WEBHOOK_SECRET
    && env.JWT_SECRET?.length >= 32 && publicUrl?.protocol === 'https:');
  return {
    enabled, publicKey: enabled ? env.MP_PUBLIC_KEY : null,
    accessToken: env.MP_ACCESS_TOKEN, webhookSecret: env.MP_WEBHOOK_SECRET,
    publicUrl: publicUrl?.origin,
  };
}

// Notificação não comprova pagamento: os recursos são sempre consultados na API.
export function verifyWebhook(headers, url, secret, now = Date.now()) {
  const id = url.searchParams.get('data.id');
  const requestId = headers['x-request-id'];
  const signature = headers['x-signature'];
  if (!secret || typeof signature !== 'string' || typeof requestId !== 'string'
    || !id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return false;
  const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=')));
  if (!/^\d{10,13}$/.test(parts.ts || '') || !/^[a-fA-F0-9]{64}$/.test(parts.v1 || '')) return false;
  const timestamp = Number(parts.ts) * (parts.ts.length === 13 ? 1 : 1000);
  if (Math.abs(now - timestamp) > 300_000) return false;
  const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(parts.v1, 'hex'));
}

export function createMercadoPago(config, fetchImpl = fetch) {
  async function request(path, { method = 'GET', body, idempotencyKey } = {}) {
    let response;
    try {
      response = await fetchImpl(`https://api.mercadopago.com${path}`, {
        method, signal: AbortSignal.timeout(12_000),
        headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new BillingError(503, 'O Mercado Pago não respondeu. Atualize o status antes de tentar novamente.', 'provider_uncertain');
    }
    let data;
    try { data = await response.json(); } catch {
      throw new BillingError(503, 'Não foi possível confirmar a resposta do Mercado Pago. Atualize o status.', 'provider_uncertain');
    }
    // Não registrar corpo/resposta: podem conter tokens ou dados do pagador.
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) throw new BillingError(503, 'O Mercado Pago está temporariamente indisponível. Atualize o status.', 'provider_uncertain');
      if (response.status === 404) throw new BillingError(404, 'Registro não encontrado no Mercado Pago.', 'provider_not_found');
      throw new BillingError(422, 'O Mercado Pago não aceitou a solicitação. Confira os dados de pagamento e a configuração da aplicação.', 'provider_rejected');
    }
    return data;
  }
  const safeId = id => {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(String(id))) throw new BillingError(400, 'Identificador inválido.');
    return encodeURIComponent(id);
  };
  return {
    createSubscription: body => request('/preapproval', { method: 'POST', body }),
    getSubscription: id => request(`/preapproval/${safeId(id)}`),
    searchSubscriptions: externalReference => request(`/preapproval/search?external_reference=${encodeURIComponent(externalReference)}`),
    cancelSubscription: id => request(`/preapproval/${safeId(id)}`, { method: 'PUT', body: { status: 'cancelled' } }),
    createPix: (body, key) => request('/v1/payments', { method: 'POST', body, idempotencyKey: key }),
    getPayment: id => request(`/v1/payments/${safeId(id)}`),
    searchPayments: externalReference => request(`/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}`),
    getInvoice: id => request(`/authorized_payments/${safeId(id)}`),
    searchInvoices: id => request(`/authorized_payments/search?preapproval_id=${safeId(id)}`),
  };
}
