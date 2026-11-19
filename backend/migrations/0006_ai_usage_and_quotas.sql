-- Controle de utilização da Aurora IA por organização.
--
-- Estados de ai_usage:
-- reserved = quota reservada; completed = consumo contabilizado;
-- failed/timed_out/cancelled/rejected = solicitação não concluída;
-- reconciliation_pending = o provedor pode ter consumido recursos, mas o
-- consumo ainda não foi confirmado.
--
-- Política conservadora: usage_source='unknown' não libera automaticamente
-- reservas potencialmente consumidas. A reconciliação deve registrar o motivo,
-- responsável e momento da decisão antes de liberar ou confirmar a reserva.
--
-- Valores monetários usam unidades da moeda (por exemplo, USD ou BRL), com
-- precisão NUMERIC(30,12). Tarifas são expressas por milhão de tokens.

-- A constraint composta é aditiva e não altera 0000_initial_schema.sql.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_organization_id_id_key'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_organization_id_id_key UNIQUE (organization_id, id);
  END IF;
END $$;

-- Necessária para EXCLUDE USING gist com igualdade textual e intervalos.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS ai_model_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('mock', 'openai')),
  model VARCHAR(120) NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  input_price_per_million NUMERIC(30,12) NOT NULL CHECK (input_price_per_million >= 0),
  output_price_per_million NUMERIC(30,12) NOT NULL CHECK (output_price_per_million >= 0),
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  UNIQUE (provider, model, currency, effective_from),
  EXCLUDE USING gist (
    provider WITH =,
    model WITH =,
    currency WITH =,
    tstzrange(effective_from, effective_until, '[)') WITH &&
  )
);

CREATE INDEX IF NOT EXISTS ai_model_rates_lookup_idx
  ON ai_model_rates(provider, model, currency, active, effective_from DESC);

CREATE TABLE IF NOT EXISTS ai_quotas (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  requests_limit BIGINT NOT NULL CHECK (requests_limit >= 0),
  input_tokens_limit BIGINT NOT NULL CHECK (input_tokens_limit >= 0),
  output_tokens_limit BIGINT NOT NULL CHECK (output_tokens_limit >= 0),
  cost_limit NUMERIC(30,12) NOT NULL CHECK (cost_limit >= 0),
  currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  reserved_requests BIGINT NOT NULL DEFAULT 0 CHECK (reserved_requests >= 0),
  reserved_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (reserved_input_tokens >= 0),
  reserved_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (reserved_output_tokens >= 0),
  reserved_cost NUMERIC(30,12) NOT NULL DEFAULT 0 CHECK (reserved_cost >= 0),
  consumed_requests BIGINT NOT NULL DEFAULT 0 CHECK (consumed_requests >= 0),
  consumed_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (consumed_input_tokens >= 0),
  consumed_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (consumed_output_tokens >= 0),
  consumed_cost NUMERIC(30,12) NOT NULL DEFAULT 0 CHECK (consumed_cost >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period_start),
  CHECK (period_start = date_trunc('month', period_start)::date),
  CHECK (period_end = (period_start + INTERVAL '1 month')::date)
);

CREATE INDEX IF NOT EXISTS ai_quotas_period_idx
  ON ai_quotas(period_start, period_end);

CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id UUID,
  reconciled_by UUID,
  request_id UUID NOT NULL,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('mock', 'openai')),
  model VARCHAR(120) NOT NULL CHECK (char_length(model) BETWEEN 1 AND 120),
  rate_id UUID REFERENCES ai_model_rates(id) ON DELETE RESTRICT,
  provider_request_id VARCHAR(255),
  status VARCHAR(24) NOT NULL CHECK (status IN ('reserved', 'completed', 'failed', 'timed_out', 'cancelled', 'rejected', 'reconciliation_pending')),
  usage_source VARCHAR(12) NOT NULL DEFAULT 'unknown' CHECK (usage_source IN ('provider', 'estimated', 'unknown', 'none')),
  reserved_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (reserved_input_tokens >= 0),
  reserved_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (reserved_output_tokens >= 0),
  input_tokens BIGINT CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens BIGINT CHECK (output_tokens IS NULL OR output_tokens >= 0),
  estimated_cost NUMERIC(30,12) CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  actual_cost NUMERIC(30,12) CHECK (actual_cost IS NULL OR actual_cost >= 0),
  currency VARCHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  error_code VARCHAR(80),
  reconciliation_reason TEXT,
  reservation_expires_at TIMESTAMPTZ,
  reservation_released_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, user_id)
    REFERENCES users(organization_id, id)
    ON DELETE SET NULL (user_id),
  FOREIGN KEY (organization_id, reconciled_by)
    REFERENCES users(organization_id, id)
    ON DELETE SET NULL (reconciled_by),
  CHECK (status <> 'reserved' OR reservation_expires_at IS NOT NULL),
  CHECK (status <> 'reconciliation_pending' OR usage_source = 'unknown'),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_organization_request_idx
  ON ai_usage(organization_id, request_id);

CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_provider_request_idx
  ON ai_usage(provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_usage_organization_created_idx
  ON ai_usage(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_organization_status_created_idx
  ON ai_usage(organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_reservation_expiry_idx
  ON ai_usage(status, reservation_expires_at)
  WHERE status IN ('reserved', 'reconciliation_pending');
