CREATE TABLE IF NOT EXISTS platform_tenant_features (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  feature_key VARCHAR(80) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, feature_key)
);

CREATE TABLE IF NOT EXISTS platform_billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  competence DATE NOT NULL,
  amount NUMERIC(30,12) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled')),
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(30,12) CHECK (paid_amount IS NULL OR paid_amount >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, competence)
);

CREATE INDEX IF NOT EXISTS platform_features_org_idx ON platform_tenant_features(organization_id);
CREATE INDEX IF NOT EXISTS platform_billing_org_competence_idx ON platform_billing_invoices(organization_id, competence DESC);
