// Funções puras para quota e consumo. Não acessam banco nem serviços externos.
// Valores monetários são unidades da moeda com 12 casas decimais, compatíveis
// com NUMERIC(30,12). Tarifas são unidades da moeda por milhão de tokens.

const SCALE = 12;
const SCALE_FACTOR = 10n ** BigInt(SCALE);
const MILLION = 1_000_000n;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const fail = message => { throw new TypeError(message); };

export const quotaPeriodUtc = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) fail('Data inválida');
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
};

export const nonNegativeInteger = (value, label = 'valor') => {
  if (typeof value === 'bigint') return value >= 0n ? value : fail(`${label} não pode ser negativo`);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value)) return BigInt(value);
  fail(`${label} deve ser um inteiro não negativo`);
};

export const decimalToScaledInteger = (value, label = 'valor') => {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') fail(`${label} inválido`);
  const text = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) fail(`${label} deve ser decimal não negativo`);
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > SCALE) fail(`${label} excede ${SCALE} casas decimais`);
  return BigInt(whole) * SCALE_FACTOR + BigInt((fraction + '0'.repeat(SCALE)).slice(0, SCALE));
};

export const scaledIntegerToDecimal = value => {
  const scaled = nonNegativeInteger(value, 'valor escalado');
  const whole = scaled / SCALE_FACTOR;
  const fraction = (scaled % SCALE_FACTOR).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
};

export const addDecimal = (...values) => scaledIntegerToDecimal(values.reduce((sum, value) => sum + decimalToScaledInteger(value), 0n));

export const calculateTokenCost = (tokens, pricePerMillion) => {
  const tokenCount = nonNegativeInteger(tokens, 'tokens');
  const price = decimalToScaledInteger(pricePerMillion, 'tarifa');
  const numerator = tokenCount * price;
  const quotient = numerator / MILLION;
  const remainder = numerator % MILLION;
  const rounded = remainder * 2n >= MILLION ? quotient + 1n : quotient;
  return scaledIntegerToDecimal(rounded);
};

export const calculateUsageCost = ({ inputTokens, outputTokens, inputPricePerMillion, outputPricePerMillion }) => {
  if (inputTokens === null || inputTokens === undefined || outputTokens === null || outputTokens === undefined) return null;
  if (inputPricePerMillion === null || inputPricePerMillion === undefined || outputPricePerMillion === null || outputPricePerMillion === undefined) return null;
  return addDecimal(calculateTokenCost(inputTokens, inputPricePerMillion), calculateTokenCost(outputTokens, outputPricePerMillion));
};

export const normalizeUsageMetadata = ({ inputTokens = null, outputTokens = null, totalTokens = null } = {}) => {
  const present = [inputTokens, outputTokens, totalTokens].filter(value => value !== null && value !== undefined);
  if (!present.length) return { source: 'unknown', inputTokens: null, outputTokens: null, totalTokens: null };
  const normalized = {
    inputTokens: inputTokens === null || inputTokens === undefined ? null : nonNegativeInteger(inputTokens, 'inputTokens').toString(),
    outputTokens: outputTokens === null || outputTokens === undefined ? null : nonNegativeInteger(outputTokens, 'outputTokens').toString(),
    totalTokens: totalTokens === null || totalTokens === undefined ? null : nonNegativeInteger(totalTokens, 'totalTokens').toString()
  };
  return { ...normalized, source: present.length === 3 ? 'confirmed' : 'estimated' };
};

export const canReserveQuota = ({ quota, consumed, reserved, reservation }) => {
  if (!quota) return { allowed: false, reason: 'QUOTA_MISSING' };
  const fields = ['requests', 'inputTokens', 'outputTokens', 'cost'];
  const values = {};
  for (const field of fields) {
    const convert = field === 'cost' ? decimalToScaledInteger : nonNegativeInteger;
    values[field] = {
      limit: convert(quota[`${field}Limit`], `${field}Limit`),
      consumed: convert(consumed?.[field] ?? 0, `${field}Consumed`),
      reserved: convert(reserved?.[field] ?? 0, `${field}Reserved`),
      next: convert(reservation?.[field] ?? 0, `${field}Reservation`)
    };
    if (values[field].consumed + values[field].reserved + values[field].next > values[field].limit) return { allowed: false, reason: 'QUOTA_EXCEEDED', field };
  }
  return { allowed: true, reason: null };
};

const validUuid = (value, label) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail(`${label} inválido`);
  return value;
};

const reservationValues = reservation => ({
  requests: nonNegativeInteger(reservation?.requests ?? 0, 'requests'),
  inputTokens: nonNegativeInteger(reservation?.inputTokens ?? 0, 'inputTokens'),
  outputTokens: nonNegativeInteger(reservation?.outputTokens ?? 0, 'outputTokens'),
  cost: decimalToScaledInteger(reservation?.cost ?? '0', 'cost')
});

const validCurrency = value => {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) fail('currency inválida');
  return value;
};

const expectSingleUpdate = (result, label) => {
  if (!result || result.rowCount !== 1) throw new Error(`${label} não afetou exatamente uma linha`);
  return result;
};

export const reserveQuota = async ({ pool, authContext, requestId, provider, model, rateId = null, currency = null, reservation, reservationExpiresAt }) => {
  if (!pool || typeof pool.connect !== 'function') fail('Pool PostgreSQL inválido');
  const organizationId = validUuid(authContext?.organizationId, 'organizationId');
  const userId = authContext?.userId === null || authContext?.userId === undefined ? null : validUuid(authContext.userId, 'userId');
  const id = validUuid(requestId, 'requestId');
  if (provider === 'mock') return { reserved: false, reason: 'MOCK_NO_FINANCIAL_RESERVATION', requestId: id };
  if (provider !== 'openai') fail('provider inválido');
  if (typeof model !== 'string' || !model.trim()) fail('model inválido');
  validUuid(rateId, 'rateId');
  validCurrency(currency);
  const expires = new Date(reservationExpiresAt);
  if (Number.isNaN(expires.getTime())) fail('reservationExpiresAt inválido');
  const requested = reservationValues(reservation);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT id,status,organization_id,request_id
      FROM ai_usage WHERE organization_id=$1 AND request_id=$2`, [organizationId, id]);
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return { reserved: false, idempotent: true, existing: existing.rows[0] };
    }
    const quotaResult = await client.query(`SELECT organization_id,period_start,currency,requests_limit,input_tokens_limit,output_tokens_limit,cost_limit,
      reserved_requests,reserved_input_tokens,reserved_output_tokens,reserved_cost,
      consumed_requests,consumed_input_tokens,consumed_output_tokens,consumed_cost
      FROM ai_quotas WHERE organization_id=$1 AND period_start=$2 FOR UPDATE`, [organizationId, quotaPeriodUtc().periodStart]);
    const quota = quotaResult.rows[0];
    if (!quota) {
      await client.query('ROLLBACK');
      return { reserved: false, reason: 'QUOTA_MISSING' };
    }
    if (currency !== quota.currency) {
      await client.query('ROLLBACK');
      return { reserved: false, reason: 'CURRENCY_MISMATCH' };
    }
    const rateAt = new Date().toISOString();
    const rateResult = await client.query(`SELECT provider,model,currency,input_price_per_million,output_price_per_million
      FROM ai_model_rates WHERE id=$1 AND provider=$2 AND model=$3 AND currency=$4
      AND effective_from <= $5 AND (effective_until IS NULL OR effective_until > $5) FOR SHARE`,
    [rateId, provider, model.trim(), currency, rateAt]);
    if (!rateResult.rows[0]) {
      await client.query('ROLLBACK');
      return { reserved: false, reason: 'RATE_INVALID' };
    }
    const existingAfterLock = await client.query(`SELECT id,status,organization_id,request_id
      FROM ai_usage WHERE organization_id=$1 AND request_id=$2`, [organizationId, id]);
    if (existingAfterLock.rows[0]) {
      await client.query('COMMIT');
      return { reserved: false, idempotent: true, existing: existingAfterLock.rows[0] };
    }
    const decision = canReserveQuota({
      quota: { requestsLimit: quota.requests_limit, inputTokensLimit: quota.input_tokens_limit, outputTokensLimit: quota.output_tokens_limit, costLimit: quota.cost_limit },
      consumed: { requests: quota.consumed_requests, inputTokens: quota.consumed_input_tokens, outputTokens: quota.consumed_output_tokens, cost: quota.consumed_cost },
      reserved: { requests: quota.reserved_requests, inputTokens: quota.reserved_input_tokens, outputTokens: quota.reserved_output_tokens, cost: quota.reserved_cost },
      reservation: { requests: requested.requests, inputTokens: requested.inputTokens, outputTokens: requested.outputTokens, cost: scaledIntegerToDecimal(requested.cost) }
    });
    if (!decision.allowed) {
      await client.query('ROLLBACK');
      return { reserved: false, reason: decision.reason, field: decision.field || null };
    }
    const quotaUpdate = await client.query(`UPDATE ai_quotas SET reserved_requests=reserved_requests+$1,
      reserved_input_tokens=reserved_input_tokens+$2,
      reserved_output_tokens=reserved_output_tokens+$3,
      reserved_cost=reserved_cost+$4,updated_at=now()
      WHERE organization_id=$5 AND period_start=$6`, [requested.requests.toString(), requested.inputTokens.toString(), requested.outputTokens.toString(), scaledIntegerToDecimal(requested.cost), organizationId, quota.period_start]);
    expectSingleUpdate(quotaUpdate, 'Reserva de quota');
    const inserted = await client.query(`INSERT INTO ai_usage(
      organization_id,user_id,request_id,provider,model,rate_id,status,usage_source,
      reserved_input_tokens,reserved_output_tokens,estimated_cost,currency,
      reservation_expires_at,started_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,'reserved','estimated',$7,$8,$9,$10,$11,now(),now())
      RETURNING id,status,organization_id,request_id`, [organizationId, userId, id, provider, model.trim(), rateId, requested.inputTokens.toString(), requested.outputTokens.toString(), scaledIntegerToDecimal(requested.cost), currency, expires.toISOString()]);
    await client.query('COMMIT');
    return { reserved: true, idempotent: false, usage: inserted.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const usageResultValues = result => {
  const usage = result?.usage || {};
  const input = usage.inputTokens ?? usage.input_tokens;
  const output = usage.outputTokens ?? usage.output_tokens;
  return { input, output, complete: input !== null && input !== undefined && output !== null && output !== undefined };
};

export const finalizeQuotaUsage = async ({ pool, authContext, requestId, result, failure = null }) => {
  if (!pool || typeof pool.connect !== 'function') fail('Pool PostgreSQL inválido');
  const organizationId = validUuid(authContext?.organizationId, 'organizationId');
  const id = validUuid(requestId, 'requestId');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const preview = await client.query(`SELECT id,organization_id,created_at,provider,model,rate_id,currency,status,
      reserved_input_tokens,reserved_output_tokens,estimated_cost,provider_request_id
      FROM ai_usage WHERE organization_id=$1 AND request_id=$2`, [organizationId, id]);
    if (!preview.rows[0]) {
      await client.query('ROLLBACK');
      return { finalized: false, reason: 'RESERVATION_NOT_FOUND' };
    }
    const reservation = preview.rows[0];
    const period = quotaPeriodUtc(reservation.created_at);
    const quotaResult = await client.query(`SELECT organization_id,period_start,currency,
      reserved_requests,reserved_input_tokens,reserved_output_tokens,reserved_cost,
      consumed_requests,consumed_input_tokens,consumed_output_tokens,consumed_cost
      FROM ai_quotas WHERE organization_id=$1 AND period_start=$2 FOR UPDATE`, [organizationId, period.periodStart]);
    if (!quotaResult.rows[0]) {
      await client.query('ROLLBACK');
      return { finalized: false, reason: 'QUOTA_MISSING' };
    }
    const lockedResult = await client.query(`SELECT id,organization_id,provider,model,rate_id,currency,status,
      reserved_input_tokens,reserved_output_tokens,estimated_cost,provider_request_id
      FROM ai_usage WHERE organization_id=$1 AND request_id=$2 FOR UPDATE`, [organizationId, id]);
    const locked = lockedResult.rows[0];
    if (!locked) {
      await client.query('ROLLBACK');
      return { finalized: false, reason: 'RESERVATION_NOT_FOUND' };
    }
    if (locked.status !== 'reserved' && locked.status !== 'reconciliation_pending') {
      await client.query('COMMIT');
      return { finalized: false, idempotent: true, status: locked.status };
    }
    const quota = quotaResult.rows[0];
    const usage = usageResultValues(result);
    const ambiguous = failure === 'timeout' || failure === 'provider_unknown' || !usage.complete;
    if (ambiguous && failure !== 'failed_before_provider' && !result?.estimatedUsage) {
      const pendingUpdate = await client.query(`UPDATE ai_usage SET status='reconciliation_pending',usage_source='unknown',
        provider_request_id=COALESCE($1,provider_request_id),reconciliation_reason=$2,updated_at=now()
        WHERE organization_id=$3 AND request_id=$4`, [result?.providerRequestId || null, failure || 'Metadados de consumo ausentes', organizationId, id]);
      expectSingleUpdate(pendingUpdate, 'Reconciliação da reserva');
      await client.query('COMMIT');
      return { finalized: false, status: 'reconciliation_pending' };
    }
    if (failure === 'failed_before_provider') {
      const quotaUpdate = await client.query(`UPDATE ai_quotas SET reserved_input_tokens=reserved_input_tokens-$1,
        reserved_output_tokens=reserved_output_tokens-$2,reserved_cost=reserved_cost-$3,updated_at=now()
        WHERE organization_id=$4 AND period_start=$5`, [locked.reserved_input_tokens, locked.reserved_output_tokens, locked.estimated_cost || '0', organizationId, period.periodStart]);
      expectSingleUpdate(quotaUpdate, 'Liberação de quota');
      const usageUpdate = await client.query(`UPDATE ai_usage SET status='failed',usage_source='none',reservation_released_at=now(),updated_at=now()
        WHERE organization_id=$1 AND request_id=$2`, [organizationId, id]);
      expectSingleUpdate(usageUpdate, 'Finalização da falha');
      await client.query('COMMIT');
      return { finalized: true, status: 'failed' };
    }
    const rateResult = await client.query(`SELECT provider,model,currency,input_price_per_million,output_price_per_million
      FROM ai_model_rates WHERE id=$1 FOR SHARE`, [locked.rate_id]);
    const rate = rateResult.rows[0];
    if (!rate || rate.provider !== locked.provider || rate.model !== locked.model || rate.currency !== locked.currency) {
      await client.query('ROLLBACK');
      return { finalized: false, status: 'reconciliation_pending', reason: 'RATE_MISMATCH' };
    }
    const inputTokens = result?.estimatedUsage?.inputTokens ?? usage.input;
    const outputTokens = result?.estimatedUsage?.outputTokens ?? usage.output;
    const cost = result?.estimatedUsage?.cost || calculateUsageCost({ inputTokens, outputTokens, inputPricePerMillion: rate.input_price_per_million, outputPricePerMillion: rate.output_price_per_million });
    if (cost === null) {
      await client.query('ROLLBACK');
      return { finalized: false, status: 'reconciliation_pending', reason: 'USAGE_INCOMPLETE' };
    }
    const exceedsReservation = nonNegativeInteger(inputTokens, 'inputTokens') > nonNegativeInteger(locked.reserved_input_tokens, 'reserved_input_tokens')
      || nonNegativeInteger(outputTokens, 'outputTokens') > nonNegativeInteger(locked.reserved_output_tokens, 'reserved_output_tokens')
      || decimalToScaledInteger(cost) > decimalToScaledInteger(locked.estimated_cost || '0');
    if (exceedsReservation) {
      const mismatchUpdate = await client.query(`UPDATE ai_usage SET status='reconciliation_pending',usage_source='unknown',
        provider_request_id=COALESCE($1,provider_request_id),reconciliation_reason=$2,updated_at=now()
        WHERE organization_id=$3 AND request_id=$4`, [result?.providerRequestId || null, 'Consumo excede a reserva; reconciliação necessária', organizationId, id]);
      expectSingleUpdate(mismatchUpdate, 'Reconciliação por excesso');
      await client.query('COMMIT');
      return { finalized: false, status: 'reconciliation_pending', reason: 'RESERVATION_EXCEEDED' };
    }
    const source = result?.estimatedUsage ? 'estimated' : 'provider';
    const quotaUpdate = await client.query(`UPDATE ai_quotas SET reserved_input_tokens=reserved_input_tokens-$1,
      reserved_output_tokens=reserved_output_tokens-$2,reserved_cost=reserved_cost-$3,
      consumed_input_tokens=consumed_input_tokens+$4,consumed_output_tokens=consumed_output_tokens+$5,
      consumed_cost=consumed_cost+$6,consumed_requests=consumed_requests+1,updated_at=now()
      WHERE organization_id=$7 AND period_start=$8`, [locked.reserved_input_tokens, locked.reserved_output_tokens, locked.estimated_cost || '0', inputTokens, outputTokens, cost, organizationId, period.periodStart]);
    expectSingleUpdate(quotaUpdate, 'Contabilização da quota');
    const usageUpdate = await client.query(`UPDATE ai_usage SET status='completed',usage_source=$1,input_tokens=$2,output_tokens=$3,
      actual_cost=$4,provider_request_id=COALESCE($5,provider_request_id),completed_at=now(),updated_at=now()
      WHERE organization_id=$6 AND request_id=$7`, [source, inputTokens, outputTokens, cost, result?.providerRequestId || null, organizationId, id]);
    expectSingleUpdate(usageUpdate, 'Finalização do uso');
    await client.query('COMMIT');
    return { finalized: true, status: 'completed', usageSource: source, actualCost: cost };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

export const usageLimits = Object.freeze({ monetaryScale: SCALE, monetaryUnit: 'currency units', tariffUnit: 'currency units per million tokens' });
