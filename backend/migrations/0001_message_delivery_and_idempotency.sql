ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_message_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_status_check'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_status_check
      CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_client_id_idx
  ON messages(conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
