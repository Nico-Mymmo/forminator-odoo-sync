-- Add last_used_at and expires_at to claude_integrations
-- Koppelingen verlopen na 3 dagen inactiviteit; actief gebruik reset de timer.

ALTER TABLE claude_integrations
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 days');

-- Bestaande actieve koppelingen krijgen 3 dagen vanaf nu
UPDATE claude_integrations
SET expires_at = NOW() + INTERVAL '3 days'
WHERE is_active = TRUE;

-- Index voor efficiënte opschoning van verlopen koppelingen
CREATE INDEX IF NOT EXISTS idx_claude_integrations_expires_at
  ON claude_integrations (expires_at)
  WHERE is_active = TRUE;
