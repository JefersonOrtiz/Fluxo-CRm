CREATE TABLE IF NOT EXISTS aurora_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  type VARCHAR(10) NOT NULL CHECK (type IN ('text', 'faq')),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 50_000),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aurora_knowledge_org_active_idx
  ON aurora_knowledge_base(organization_id, active, updated_at DESC);
