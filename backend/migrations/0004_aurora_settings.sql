CREATE TABLE IF NOT EXISTS aurora_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  master_prompt TEXT NOT NULL DEFAULT '' CHECK (char_length(master_prompt) <= 12_000),
  tone VARCHAR(20) NOT NULL DEFAULT 'amigavel' CHECK (tone IN ('formal', 'amigavel', 'descontraido')),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
