import { BillingError, verifyWebhook } from './mercado-pago.mjs';
import { plans } from './service.mjs';

export function checkOrigin(request, env) {
  const origin = request.headers.origin;
  const allowed = [env.APP_PUBLIC_URL, env.CORS_ORIGIN].filter(Boolean).map(value => new URL(value).origin);
  if (origin && !allowed.includes(origin)) throw new BillingError(403, 'Origem da solicitação não autorizada.');
  if (!origin && request.headers.cookie && !request.headers.authorization) throw new BillingError(403, 'Origem obrigatória para alterar a assinatura.');
}

export function createBillingHandler({ service, config, pool, env, auth, parseBody, json }) {
  return async (request, response, url) => {
    if (!url.pathname.startsWith('/api/billing/')) return false;
    response.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/api/billing/config' && request.method === 'GET') {
      json(response, 200, { enabled: config.enabled, publicKey: config.publicKey, plans });
      return true;
    }
    if (url.pathname === '/api/billing/webhook' && request.method === 'POST') {
      if (!config.enabled) throw new BillingError(503, 'Integração ainda não habilitada.');
      if (!verifyWebhook(request.headers, url, config.webhookSecret)) throw new BillingError(401, 'Notificação inválida.');
      const body = await parseBody(request);
      if (String(body.data?.id) !== url.searchParams.get('data.id')) throw new BillingError(400, 'Identificador da notificação divergente.');
      await service.enqueue(body.type, String(body.data.id));
      json(response, 200, { received: true });
      return true;
    }
    const session = auth(request);
    // Revalidar no banco: localStorage e permissões antigas do JWT não autorizam cobranças.
    const { rows } = await pool.query(`SELECT u.organization_id,r.permissions FROM users u
      JOIN roles r ON r.id=u.role_id AND r.organization_id=u.organization_id
      WHERE u.id=$1 AND u.organization_id=$2 AND u.active=true`, [session.userId, session.organizationId]);
    if (!rows[0]) throw new BillingError(401, 'Sessão inválida. Entre novamente.');
    const permissions = rows[0].permissions || [];
    if (!permissions.includes('*') && !permissions.includes('billing:write')) throw new BillingError(403, 'Somente administradores financeiros podem gerenciar a assinatura.');
    if (request.method === 'POST') checkOrigin(request, env);
    const org = rows[0].organization_id;
    let result;
    if (url.pathname === '/api/billing/subscription' && request.method === 'GET') result = await service.snapshot(org);
    else if (url.pathname === '/api/billing/checkout' && request.method === 'POST') result = await service.checkout(org, await parseBody(request), request.headers['idempotency-key']);
    else if (url.pathname === '/api/billing/refresh' && request.method === 'POST') result = await service.refresh(org);
    else if (url.pathname === '/api/billing/cancel' && request.method === 'POST') result = await service.cancel(org);
    else throw new BillingError(404, 'Rota de assinatura não encontrada.');
    json(response, 200, result);
    return true;
  };
}
