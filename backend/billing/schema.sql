-- Aplicada automaticamente no início da API, inclusive em bases existentes.
CREATE TABLE IF NOT EXISTS billing_accounts (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id),
  plan_id TEXT NOT NULL,
  method TEXT CHECK (method IN ('card', 'pix')),
  status TEXT NOT NULL DEFAULT 'pending',
  trial_started_at TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ NOT NULL,
  provider_subscription_id TEXT UNIQUE,
  current_operation_id UUID,
  next_payment_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS current_operation_id UUID;

CREATE TABLE IF NOT EXISTS billing_operations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  idempotency_key UUID NOT NULL,
  plan_id TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('card', 'pix')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'uncertain')),
  provider_id TEXT,
  provider_status TEXT,
  provider_updated_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  qr_code TEXT,
  qr_code_base64 TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (method, provider_id)
);
CREATE INDEX IF NOT EXISTS billing_operations_org ON billing_operations(organization_id, created_at DESC);
ALTER TABLE billing_operations ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS billing_payments (
  provider_id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  operation_id UUID NOT NULL REFERENCES billing_operations(id),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  provider_updated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_payments_org ON billing_payments(organization_id, period_end DESC);
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS provider_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS billing_webhook_jobs (
  topic TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  leased_at TIMESTAMPTZ,
  PRIMARY KEY(topic, resource_id)
);
