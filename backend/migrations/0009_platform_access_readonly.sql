-- Sessões emitidas pelo Painel Supremo são explicitamente somente leitura.
ALTER TABLE platform_access_sessions
  ADD COLUMN IF NOT EXISTS access_mode VARCHAR(20) NOT NULL DEFAULT 'readonly';

ALTER TABLE platform_access_sessions
  DROP CONSTRAINT IF EXISTS platform_access_sessions_access_mode_check;

ALTER TABLE platform_access_sessions
  ADD CONSTRAINT platform_access_sessions_access_mode_check
  CHECK (access_mode IN ('readonly'));
