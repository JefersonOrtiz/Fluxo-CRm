import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import '../../shared/plans.js';
import { BillingError } from './mercado-pago.mjs';

export const plans = globalThis.JF_CRM_PLANS;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const asDate = value => value ? new Date(value) : null;
const cents = value => Math.round(Number(value) * 100);
export function addMonth(value) {
  const date = new Date(value), day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date;
}

export async function migrateBilling(pool) {
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
}

export function createBillingService({ pool, provider, config, now = () => new Date() }) {
  const requireConfigured = () => {
    if (!config.enabled) throw new BillingError(503, 'Os pagamentos ainda não foram habilitados nesta instalação.', 'not_configured');
  };
  async function transaction(organizationId, fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [organizationId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  const getAccount = async (db, org) => (await db.query('SELECT * FROM billing_accounts WHERE organization_id=$1', [org])).rows[0];
  const paidUntil = async (db, org) => asDate((await db.query("SELECT MAX(period_end) AS until FROM billing_payments WHERE organization_id=$1 AND status='approved'", [org])).rows[0].until);

  async function snapshot(org) {
    const account = await getAccount(pool, org);
    if (!account) return { account: null, payments: [], pendingPix: null, pendingOperation: null };
    const paid = await paidUntil(pool, org);
    const trial = asDate(account.trial_ends_at);
    const time = now();
    const accessUntil = new Date(Math.max(paid?.getTime() || 0, account.method ? trial.getTime() : 0));
    const { rows: payments } = await pool.query('SELECT provider_id,amount_cents,status,period_start,period_end,approved_at FROM billing_payments WHERE organization_id=$1 ORDER BY period_end DESC LIMIT 12', [org]);
    const { rows: operations } = await pool.query("SELECT id,method,status,provider_status,qr_code,qr_code_base64,expires_at FROM billing_operations WHERE organization_id=$1 AND (status IN ('creating','uncertain') OR (method='pix' AND provider_status='pending' AND expires_at>$2)) ORDER BY created_at DESC LIMIT 1", [org, time]);
    const pending = operations[0];
    return {
      account: { planId: account.plan_id, method: account.method, status: account.status,
        trialEndsAt: trial, paidUntil: paid, accessUntil: accessUntil.getTime() ? accessUntil : null,
        accessStatus: paid > time ? 'paid' : account.method && trial > time ? 'trial' : 'expired',
        nextPaymentAt: account.next_payment_at, recurring: account.method === 'card' && account.status === 'authorized' },
      payments,
      pendingPix: pending?.method === 'pix' && pending.status === 'ready' ? {
        operationId: pending.id, qrCode: pending.qr_code, qrCodeBase64: pending.qr_code_base64, expiresAt: pending.expires_at,
      } : null,
      pendingOperation: pending && ['creating', 'uncertain'].includes(pending.status) ? { id: pending.id, method: pending.method, status: pending.status } : null,
    };
  }

  function validateCheckout(body) {
    const allowed = ['planId', 'method', 'cardTokenId', 'payer', 'acceptedTerms'];
    if (!body || Object.keys(body).some(key => !allowed.includes(key))) throw new BillingError(400, 'Envie somente o token do cartão e os dados previstos para a assinatura.');
    const plan = plans.find(item => item.id === body.planId);
    if (!plan || !['card', 'pix'].includes(body.method) || body.acceptedTerms !== true) throw new BillingError(400, 'Escolha um plano, uma forma de pagamento e aceite as condições.');
    if (body.method === 'card' && !/^[a-zA-Z0-9_-]{10,200}$/.test(body.cardTokenId || '')) throw new BillingError(400, 'Token do cartão inválido. Preencha novamente o formulário seguro.');
    const payer = body.payer;
    if (!payer || Object.keys(payer).some(key => !['email', 'firstName', 'lastName', 'document'].includes(key))
      || typeof payer.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payer.email) || payer.email.length > 254) throw new BillingError(400, 'Informe um e-mail válido para cobrança.');
    if (body.method === 'pix' && (typeof payer.document !== 'string' || !/^\d{11}$|^\d{14}$/.test(payer.document)
      || typeof payer.firstName !== 'string' || typeof payer.lastName !== 'string'
      || !payer.firstName.trim() || !payer.lastName.trim() || payer.firstName.length > 100 || payer.lastName.length > 100)) throw new BillingError(400, 'Informe nome, sobrenome e CPF ou CNPJ do pagador.');
    return plan;
  }

  async function checkout(org, body, key) {
    requireConfigured();
    const plan = validateCheckout(body);
    if (!uuid(key)) throw new BillingError(400, 'Chave de idempotência inválida.');
    const operation = await transaction(org, async db => {
      const existing = (await db.query('SELECT * FROM billing_operations WHERE organization_id=$1 AND idempotency_key=$2', [org, key])).rows[0];
      if (existing) {
        if (existing.plan_id !== plan.id || existing.method !== body.method) throw new BillingError(409, 'Esta solicitação já foi usada para outra contratação.');
        if (existing.status === 'failed') throw new BillingError(422, 'A tentativa anterior foi recusada. Reabra o formulário para tentar novamente.');
        return null;
      }
      const count = (await db.query('SELECT COUNT(*)::int AS total FROM users WHERE organization_id=$1 AND active=true', [org])).rows[0].total;
      if (count > plan.maxUsers) throw new BillingError(409, `Sua equipe possui ${count} usuários ativos. O plano ${plan.name} permite até ${plan.maxUsers}.`);
      let account = await getAccount(db, org);
      if (!account) {
        const end = new Date(now().getTime() + plan.trialDays * 86_400_000);
        await db.query('INSERT INTO billing_accounts(organization_id,plan_id,trial_started_at,trial_ends_at) VALUES($1,$2,$3,$4)', [org, plan.id, now(), end]);
        account = await getAccount(db, org);
      }
      const pending = (await db.query("SELECT id FROM billing_operations WHERE organization_id=$1 AND status IN ('creating','uncertain') LIMIT 1", [org])).rows[0];
      if (pending) throw new BillingError(409, 'Há uma contratação aguardando confirmação. Use Atualizar status antes de tentar novamente.', 'operation_pending');
      if (account.method === 'card' && account.status !== 'cancelled') throw new BillingError(409, 'Já existe uma assinatura com cartão. Cancele a renovação antes de contratar novamente.');
      if (account.method === 'pix' && account.status !== 'cancelled' && (body.method !== 'pix' || account.plan_id !== plan.id)) throw new BillingError(409, 'Cancele a renovação atual antes de alterar o plano ou a forma de pagamento.');
      const paid = await paidUntil(db, org);
      if (body.method === 'pix') {
        await db.query("UPDATE billing_accounts SET plan_id=$2,method='pix',status='manual',provider_subscription_id=NULL,current_operation_id=NULL,next_payment_at=NULL,updated_at=now() WHERE organization_id=$1", [org, plan.id]);
        if (asDate(account.trial_ends_at) > now()) return null; // O teste não é cobrado por PIX.
        if (paid && paid.getTime() - now().getTime() > 7 * 86_400_000) throw new BillingError(409, 'O próximo PIX ficará disponível nos últimos 7 dias do período pago.');
        const unpaid = (await db.query("SELECT id FROM billing_operations WHERE organization_id=$1 AND method='pix' AND provider_status='pending' AND expires_at>$2 LIMIT 1", [org, now()])).rows[0];
        if (unpaid) return null;
      }
      const start = new Date(Math.max(now().getTime(), paid?.getTime() || 0, asDate(account.trial_ends_at).getTime()));
      const { rows } = await db.query(`INSERT INTO billing_operations(id,organization_id,idempotency_key,plan_id,method,amount_cents,status,trial_ends_at,period_start,period_end)
        VALUES($1,$2,$3,$4,$5,$6,'creating',$7,$8,$9) RETURNING *`,
      [randomUUID(), org, key, plan.id, body.method, plan.monthlyPriceCents, account.trial_ends_at, start, addMonth(start)]);
      await db.query('UPDATE billing_accounts SET current_operation_id=$2 WHERE organization_id=$1', [org, rows[0].id]);
      return rows[0];
    });
    if (!operation) return snapshot(org);
    try {
      if (body.method === 'card') {
        const start = asDate(operation.period_start);
        const resource = await provider.createSubscription({
          reason: `JF System CRM — ${plan.name}`, external_reference: operation.id,
          payer_email: body.payer.email, card_token_id: body.cardTokenId,
          auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: operation.amount_cents / 100,
            currency_id: 'BRL', ...(start > now() ? { start_date: start.toISOString() } : {}) },
          back_url: `${config.publicUrl}/#subscription`, status: 'authorized',
        });
        await applySubscription(resource, operation);
      } else {
        // Margem acima do mínimo de 30 minutos exigido pelo provedor, incluindo latência.
        const expires = new Date(now().getTime() + 60 * 60_000);
        const payer = body.payer;
        const resource = await provider.createPix({
          transaction_amount: operation.amount_cents / 100, description: `JF System CRM — ${plan.name} — mensalidade`,
          payment_method_id: 'pix', external_reference: operation.id,
          date_of_expiration: expires.toISOString(), notification_url: `${config.publicUrl}/api/billing/webhook`,
          payer: { email: payer.email, first_name: payer.firstName.trim(), last_name: payer.lastName.trim(),
            identification: { type: payer.document.length === 11 ? 'CPF' : 'CNPJ', number: payer.document } },
        }, operation.id);
        await applyPix(resource, operation);
      }
    } catch (error) {
      // Um timeout pode acontecer depois de criar uma cobrança: nunca recriar cegamente.
      const state = error.code === 'provider_rejected' || error.code === 'provider_not_found' ? 'failed' : 'uncertain';
      await pool.query("UPDATE billing_operations SET status=$2 WHERE id=$1 AND status='creating'", [operation.id, state]);
      throw error;
    }
    return snapshot(org);
  }

  function assertAmount(resource, operation, amount = resource.transaction_amount, currency = resource.currency_id) {
    if (currency !== 'BRL' || !Number.isFinite(Number(amount)) || cents(amount) !== operation.amount_cents) throw new BillingError(409, 'O valor confirmado não corresponde à mensalidade. Solicite a conferência do suporte.', 'amount_mismatch');
  }
  async function applySubscription(resource, operation) {
    if (String(resource.external_reference) !== operation.id || !resource.id || operation.method !== 'card') throw new BillingError(409, 'Assinatura não corresponde à solicitação.', 'reference_mismatch');
    assertAmount(resource, operation, resource.auto_recurring?.transaction_amount, resource.auto_recurring?.currency_id);
    if (resource.auto_recurring?.frequency !== 1 || resource.auto_recurring?.frequency_type !== 'months') throw new BillingError(409, 'Recorrência da assinatura inválida.');
    if (operation.provider_id && String(resource.id) !== operation.provider_id) throw new BillingError(409, 'Identificador da assinatura divergente.');
    await transaction(operation.organization_id, async db => {
      const previous = (await db.query('SELECT * FROM billing_operations WHERE id=$1', [operation.id])).rows[0];
      if (previous.provider_id && previous.provider_id !== String(resource.id)) throw new BillingError(409, 'Há mais de um contrato para esta referência. Solicite a conciliação do suporte.');
      const modified = asDate(resource.last_modified);
      if (modified && previous.provider_updated_at && modified < asDate(previous.provider_updated_at)) return;
      if (previous.provider_status === 'cancelled' && resource.status !== 'cancelled') return;
      await db.query("UPDATE billing_operations SET status='ready',provider_id=$2,provider_status=$3,provider_updated_at=$4 WHERE id=$1", [operation.id, String(resource.id), resource.status, modified]);
      // Uma notificação de contrato antigo nunca substitui a contratação atual.
      await db.query("UPDATE billing_accounts SET plan_id=$2,method='card',status=$3,provider_subscription_id=$4,next_payment_at=$5,updated_at=now() WHERE organization_id=$1 AND current_operation_id=$6", [operation.organization_id, operation.plan_id, resource.status, String(resource.id), resource.next_payment_date || null, operation.id]);
    });
  }
  async function applyPix(resource, operation) {
    if (resource.payment_method_id !== 'pix' || String(resource.external_reference) !== operation.id) throw new BillingError(409, 'Pagamento não corresponde à solicitação.', 'reference_mismatch');
    assertAmount(resource, operation);
    const qr = resource.point_of_interaction?.transaction_data || {};
    await transaction(operation.organization_id, async db => {
      const current = (await db.query('SELECT provider_id FROM billing_operations WHERE id=$1', [operation.id])).rows[0];
      if (current.provider_id && current.provider_id !== String(resource.id)) throw new BillingError(409, 'Há mais de um pagamento para esta referência. Solicite a conciliação do suporte.');
      const changed = await savePayment(db, resource, operation, operation.period_start, operation.period_end);
      if (!changed) return;
      await db.query("UPDATE billing_operations SET status='ready',provider_id=$2,provider_status=$3,qr_code=$4,qr_code_base64=$5,expires_at=$6,provider_updated_at=$7 WHERE id=$1", [operation.id, String(resource.id), resource.status, qr.qr_code || null, qr.qr_code_base64 || null, resource.date_of_expiration || null, resource.date_last_updated || null]);
    });
  }
  async function savePayment(db, payment, operation, start, end) {
    assertAmount(payment, operation);
    if (!payment.id || !asDate(start)?.getTime() || !asDate(end)?.getTime()) throw new BillingError(409, 'Período do pagamento inválido.');
    const previous = (await db.query('SELECT organization_id,operation_id,status,provider_updated_at FROM billing_payments WHERE provider_id=$1', [String(payment.id)])).rows[0];
    if (previous && (previous.organization_id !== operation.organization_id || previous.operation_id !== operation.id)) throw new BillingError(409, 'Pagamento já associado a outra solicitação.');
    // Estorno parcial também suspende a confirmação até conferência financeira.
    const status = Number(payment.transaction_amount_refunded) > 0 ? 'refunded' : payment.status;
    const modified = asDate(payment.date_last_updated);
    if (previous?.provider_updated_at && modified && modified < asDate(previous.provider_updated_at)) return false;
    if (previous && ['approved', 'refunded', 'charged_back', 'cancelled'].includes(previous.status) && ['pending', 'in_process'].includes(status)) return false;
    if (previous && ['refunded', 'charged_back'].includes(previous.status) && status === 'approved' && (!modified || !previous.provider_updated_at || modified <= asDate(previous.provider_updated_at))) return false;
    await db.query(`INSERT INTO billing_payments(provider_id,organization_id,operation_id,amount_cents,status,period_start,period_end,approved_at,provider_updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(provider_id) DO UPDATE SET status=EXCLUDED.status,approved_at=EXCLUDED.approved_at,provider_updated_at=EXCLUDED.provider_updated_at,updated_at=now()`,
    [String(payment.id), operation.organization_id, operation.id, operation.amount_cents, status, start, end, payment.date_approved || null, modified]);
    return true;
  }
  async function applyInvoice(invoice, expectedOperation) {
    let operation = expectedOperation || (await pool.query("SELECT * FROM billing_operations WHERE method='card' AND provider_id=$1", [String(invoice.preapproval_id)])).rows[0];
    if (!operation && invoice.preapproval_id) {
      // A fatura pode chegar antes da notificação de criação do contrato.
      const subscription = await provider.getSubscription(invoice.preapproval_id);
      if (uuid(String(subscription?.external_reference))) {
        operation = (await pool.query("SELECT * FROM billing_operations WHERE id=$1 AND method='card'", [subscription.external_reference])).rows[0];
        if (operation) {
          await applySubscription(subscription, operation);
          operation = (await pool.query('SELECT * FROM billing_operations WHERE id=$1', [operation.id])).rows[0];
        }
      }
    }
    if (!operation) return;
    if (String(invoice.preapproval_id) !== operation.provider_id) throw new BillingError(409, 'Fatura de outra assinatura.');
    assertAmount(invoice, operation);
    if (!invoice.payment?.id) return;
    const payment = await provider.getPayment(invoice.payment.id);
    const start = asDate(invoice.debit_date);
    // O provedor pode arredondar a precisão de milissegundos da data agendada.
    if (!start?.getTime() || start.getTime() < asDate(operation.period_start).getTime() - 60_000) throw new BillingError(409, 'Data da fatura inválida.');
    await transaction(operation.organization_id, db => savePayment(db, payment, operation, start, addMonth(start)));
  }
  async function processNotification(topic, id) {
    if (topic === 'subscription_preapproval') {
      const resource = await provider.getSubscription(id);
      if (!uuid(String(resource.external_reference))) return;
      const operation = (await pool.query('SELECT * FROM billing_operations WHERE id=$1', [resource.external_reference])).rows[0];
      if (operation) await applySubscription(resource, operation);
    } else if (topic === 'subscription_authorized_payment') {
      await applyInvoice(await provider.getInvoice(id));
    } else if (topic === 'payment') {
      const payment = await provider.getPayment(id);
      const saved = (await pool.query('SELECT * FROM billing_payments WHERE provider_id=$1', [String(payment.id)])).rows[0];
      let operation;
      if (uuid(String(payment.external_reference))) operation = (await pool.query('SELECT * FROM billing_operations WHERE id=$1', [payment.external_reference])).rows[0];
      if (!operation) operation = (await pool.query('SELECT o.* FROM billing_payments p JOIN billing_operations o ON o.id=p.operation_id WHERE p.provider_id=$1', [String(payment.id)])).rows[0];
      if (!operation) return; // Pagamento de outro produto do mesmo vendedor.
      if (operation.method === 'pix') await applyPix(payment, operation);
      else if (saved) await transaction(operation.organization_id, db => savePayment(db, payment, operation, saved.period_start, saved.period_end));
      else {
        const invoices = await provider.searchInvoices(operation.provider_id);
        const invoice = invoices.results?.find(item => String(item.payment?.id) === String(payment.id));
        if (invoice) await applyInvoice(invoice, operation);
      }
    }
  }

  async function refresh(org) {
    requireConfigured();
    const { rows } = await pool.query("SELECT * FROM billing_operations WHERE organization_id=$1 AND (status IN ('creating','uncertain') OR status='ready') ORDER BY created_at DESC LIMIT 12", [org]);
    for (const operation of rows) {
      if (operation.method === 'card') {
        if (operation.provider_id) {
          await applySubscription(await provider.getSubscription(operation.provider_id), operation);
          const invoices = await provider.searchInvoices(operation.provider_id);
          for (const invoice of invoices.results || []) await applyInvoice(invoice, operation);
        } else {
          const found = await provider.searchSubscriptions(operation.id);
          const matches = (found.results || []).filter(item => String(item.external_reference) === operation.id);
          if (matches.length === 1) await applySubscription(await provider.getSubscription(matches[0].id), operation);
          // Ausência na busca não prova que a criação falhou. Manter bloqueio para conciliação.
        }
      } else if (operation.provider_id) await applyPix(await provider.getPayment(operation.provider_id), operation);
      else {
        const found = await provider.searchPayments(operation.id);
        const matches = (found.results || []).filter(item => String(item.external_reference) === operation.id);
        if (matches.length === 1) await applyPix(await provider.getPayment(matches[0].id), operation);
      }
    }
    return snapshot(org);
  }

  async function cancel(org) {
    requireConfigured();
    await transaction(org, async db => {
      const account = await getAccount(db, org);
      if (!account?.method) throw new BillingError(409, 'Não há renovação para cancelar.');
      const pending = (await db.query("SELECT id FROM billing_operations WHERE organization_id=$1 AND (status IN ('creating','uncertain') OR (method='pix' AND provider_status='pending' AND expires_at>$2)) LIMIT 1", [org, now()])).rows[0];
      if (pending) throw new BillingError(409, 'Atualize o status da cobrança pendente antes de cancelar. Se houver um PIX aberto, aguarde a expiração.');
      if (account.provider_subscription_id && account.status !== 'cancelled') {
        const resource = await provider.cancelSubscription(account.provider_subscription_id);
        if (resource.status !== 'cancelled') throw new BillingError(409, 'O cancelamento ainda não foi confirmado.');
        await db.query("UPDATE billing_operations SET provider_status='cancelled' WHERE id=$1", [account.current_operation_id]);
      }
      await db.query("UPDATE billing_accounts SET status='cancelled',next_payment_at=NULL,updated_at=now() WHERE organization_id=$1", [org]);
    });
    return snapshot(org);
  }

  async function enqueue(topic, id) {
    if (!['payment', 'subscription_preapproval', 'subscription_authorized_payment'].includes(topic)) return;
    await pool.query(`INSERT INTO billing_webhook_jobs(topic,resource_id) VALUES($1,$2)
      ON CONFLICT(topic,resource_id) DO UPDATE SET generation=billing_webhook_jobs.generation+1,
      state=CASE WHEN billing_webhook_jobs.state='running' THEN 'running' ELSE 'queued' END,available_at=now()`, [topic, id]);
  }
  async function drainOne() {
    if (!config.enabled) return false;
    const db = await pool.connect();
    let job;
    try {
      await db.query('BEGIN');
      job = (await db.query("SELECT * FROM billing_webhook_jobs WHERE (state='queued' AND available_at<=now()) OR (state='running' AND leased_at<now()-interval '2 minutes') ORDER BY available_at LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];
      if (job) await db.query("UPDATE billing_webhook_jobs SET state='running',leased_at=now(),attempts=attempts+1 WHERE topic=$1 AND resource_id=$2", [job.topic, job.resource_id]);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
    if (!job) return false;
    try {
      await processNotification(job.topic, job.resource_id);
      await pool.query("UPDATE billing_webhook_jobs SET state=CASE WHEN generation=$3 THEN 'done' ELSE 'queued' END WHERE topic=$1 AND resource_id=$2", [job.topic, job.resource_id, job.generation]);
    } catch {
      const delay = Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8));
      await pool.query("UPDATE billing_webhook_jobs SET state='queued',available_at=now()+($3 * interval '1 second') WHERE topic=$1 AND resource_id=$2", [job.topic, job.resource_id, delay]);
      console.warn('billing: notificação aguardando nova tentativa');
    }
    return true;
  }
  return { snapshot, checkout, refresh, cancel, enqueue, drainOne, processNotification };
}
