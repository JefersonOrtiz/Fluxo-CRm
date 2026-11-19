ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS platform_tenant_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
  plan VARCHAR(80) NOT NULL DEFAULT 'manual',
  monthly_fee NUMERIC(30,12) NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
  billing_due_day SMALLINT CHECK (billing_due_day BETWEEN 1 AND 31),
  trial_ends_at TIMESTAMPTZ,
  user_limit INTEGER CHECK (user_limit IS NULL OR user_limit >= 0),
  ai_requests_limit BIGINT CHECK (ai_requests_limit IS NULL OR ai_requests_limit >= 0),
  ai_input_tokens_limit BIGINT CHECK (ai_input_tokens_limit IS NULL OR ai_input_tokens_limit >= 0),
  ai_output_tokens_limit BIGINT CHECK (ai_output_tokens_limit IS NULL OR ai_output_tokens_limit >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
  action VARCHAR(80) NOT NULL,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_audit_org_created_idx
  ON platform_audit_log(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_access_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash BYTEA NOT NULL UNIQUE,
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS platform_access_active_idx
  ON platform_access_sessions(token_hash, expires_at)
  WHERE revoked_at IS NULL;
