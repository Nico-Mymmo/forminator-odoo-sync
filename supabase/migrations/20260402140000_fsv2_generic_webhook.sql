-- FSV2: Add generic/Zapier webhook support
-- Adds source_type and webhook_token columns to fs_v2_integrations.

ALTER TABLE fs_v2_integrations
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'forminator',
  ADD COLUMN IF NOT EXISTS webhook_token TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fsv2_integrations_webhook_token
  ON fs_v2_integrations(webhook_token)
  WHERE webhook_token IS NOT NULL;
