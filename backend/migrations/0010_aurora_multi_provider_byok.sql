-- Multi-provider Aurora configuration and tenant BYOK.
-- This migration is additive. It does not migrate environment secrets,
-- re-encrypt existing data, or call external providers.

ALTER TABLE aurora_settings
  ADD COLUMN IF NOT EXISTS assistant_name VARCHAR(80) NOT NULL DEFAULT 'Aurora',
  ADD COLUMN IF NOT EXISTS provider_mode VARCHAR(16) NOT NULL DEFAULT 'environment',
  ADD COLUMN IF NOT EXISTS active_provider VARCHAR(20);

ALTER TABLE aurora_settings
  ADD CONSTRAINT aurora_settings_assistant_name_check
  CHECK (
    assistant_name = btrim(assistant_name)
    AND char_length(assistant_name) BETWEEN 1 AND 80
    AND assistant_name !~ '[[:cntrl:]]'
  );

ALTER TABLE aurora_settings
  ADD CONSTRAINT aurora_settings_provider_mode_check
  CHECK (provider_mode IN ('environment', 'tenant', 'disabled'));

ALTER TABLE aurora_settings
  ADD CONSTRAINT aurora_settings_active_provider_check
  CHECK (
    (provider_mode = 'tenant' AND active_provider IN ('openai', 'anthropic'))
    OR (provider_mode IN ('environment', 'disabled') AND active_provider IS NULL)
  );

CREATE TABLE aurora_provider_credentials (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model VARCHAR(120) NOT NULL CHECK (model = btrim(model) AND char_length(model) BETWEEN 1 AND 120),
  secret_ciphertext JSONB,
  credential_status VARCHAR(20) NOT NULL DEFAULT 'configured'
    CHECK (credential_status IN ('configured', 'revoked')),
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, provider),

  CONSTRAINT aurora_provider_credentials_ciphertext_status_check
    CHECK (
      (credential_status = 'configured' AND secret_ciphertext IS NOT NULL)
      OR (credential_status = 'revoked' AND secret_ciphertext IS NULL)
    ),

  CONSTRAINT aurora_provider_credentials_envelope_check
    CHECK (
      secret_ciphertext IS NULL
      OR (
        jsonb_typeof(secret_ciphertext) = 'object'
        AND secret_ciphertext ? 'version'
        AND secret_ciphertext ? 'iv'
        AND secret_ciphertext ? 'tag'
        AND secret_ciphertext ? 'data'
        AND jsonb_typeof(secret_ciphertext -> 'version') = 'number'
        AND jsonb_typeof(secret_ciphertext -> 'iv') = 'string'
        AND jsonb_typeof(secret_ciphertext -> 'tag') = 'string'
        AND jsonb_typeof(secret_ciphertext -> 'data') = 'string'
      )
    ),

  FOREIGN KEY (organization_id, created_by)
    REFERENCES users(organization_id, id)
    ON DELETE SET NULL (created_by),
  FOREIGN KEY (organization_id, updated_by)
    REFERENCES users(organization_id, id)
    ON DELETE SET NULL (updated_by)
);

CREATE INDEX aurora_provider_credentials_org_status_idx
  ON aurora_provider_credentials(organization_id, credential_status);

ALTER TABLE aurora_settings
  ADD CONSTRAINT aurora_settings_active_provider_fk
  FOREIGN KEY (organization_id, active_provider)
  REFERENCES aurora_provider_credentials(organization_id, provider)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE aurora_configuration_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID,
  action VARCHAR(60) NOT NULL CHECK (
    action IN (
      'assistant_name_updated',
      'provider_mode_updated',
      'provider_activated',
      'credential_created',
      'credential_replaced',
      'credential_revoked',
      'connection_test_started',
      'connection_test_succeeded',
      'connection_test_failed'
    )
  ),
  provider VARCHAR(20) CHECK (provider IS NULL OR provider IN ('openai', 'anthropic')),
  model VARCHAR(120),
  provider_mode VARCHAR(16) CHECK (provider_mode IS NULL OR provider_mode IN ('environment', 'tenant', 'disabled')),
  result_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  FOREIGN KEY (organization_id, actor_user_id)
    REFERENCES users(organization_id, id)
    ON DELETE SET NULL (actor_user_id)
);

CREATE INDEX aurora_configuration_audit_org_created_idx
  ON aurora_configuration_audit(organization_id, created_at DESC);

-- These names are the PostgreSQL-generated names from migration 0006.
-- Failing explicitly avoids replacing a different check constraint.
DO $$
DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'ai_model_rates'::regclass
    AND contype = 'c'
    AND conname = 'ai_model_rates_provider_check';
  IF constraint_name IS NULL THEN
    RAISE EXCEPTION 'Expected constraint ai_model_rates_provider_check was not found';
  END IF;
  EXECUTE format('ALTER TABLE ai_model_rates DROP CONSTRAINT %I', constraint_name);
END $$;

ALTER TABLE ai_model_rates
  ADD CONSTRAINT ai_model_rates_provider_check
  CHECK (provider IN ('mock', 'openai', 'anthropic'));

DO $$
DECLARE constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'ai_usage'::regclass
    AND contype = 'c'
    AND conname = 'ai_usage_provider_check';
  IF constraint_name IS NULL THEN
    RAISE EXCEPTION 'Expected constraint ai_usage_provider_check was not found';
  END IF;
  EXECUTE format('ALTER TABLE ai_usage DROP CONSTRAINT %I', constraint_name);
END $$;

ALTER TABLE ai_usage
  ADD CONSTRAINT ai_usage_provider_check
  CHECK (provider IN ('mock', 'openai', 'anthropic'));

-- Validation of configured, invalid, or revoked credentials belongs to the
-- backend. This schema keeps only an encrypted envelope or a revoked state.
