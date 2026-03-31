-- Claude Context Gateway: integration tables
-- Adds short-lived auth + context access for Claude AI sessions

-- ─── 1. Integrations ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claude_integrations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  client_id          TEXT        NOT NULL UNIQUE,
  client_secret_hash TEXT        NOT NULL,
  scopes             TEXT[]      NOT NULL DEFAULT '{}',
  is_active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_claude_integrations_user_id   ON claude_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_claude_integrations_client_id ON claude_integrations(client_id);
CREATE INDEX IF NOT EXISTS idx_claude_integrations_active    ON claude_integrations(user_id) WHERE is_active = TRUE;

-- ─── 2. Challenges (one-time use, 5-min TTL) ───────────────────────────────
CREATE TABLE IF NOT EXISTS claude_challenges (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID        NOT NULL REFERENCES claude_integrations(id) ON DELETE CASCADE,
  challenge_id   TEXT        NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claude_challenges_challenge_id    ON claude_challenges(challenge_id);
CREATE INDEX IF NOT EXISTS idx_claude_challenges_integration_id ON claude_challenges(integration_id);

-- ─── 3. Tokens (multi-use within 5-min TTL) ────────────────────────────────
CREATE TABLE IF NOT EXISTS claude_tokens (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash     TEXT        NOT NULL UNIQUE,
  integration_id UUID        NOT NULL REFERENCES claude_integrations(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scopes         TEXT[]      NOT NULL DEFAULT '{}',
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claude_tokens_token_hash     ON claude_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_claude_tokens_integration_id ON claude_tokens(integration_id);

-- ─── 4. Audit log (no FK on integration_id – logs survive revocation) ──────
CREATE TABLE IF NOT EXISTS claude_audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID,
  user_id        UUID,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope          TEXT,
  endpoint       TEXT,
  success        BOOLEAN     NOT NULL DEFAULT TRUE,
  failure_reason TEXT,
  payload_size   INTEGER,
  ip_address     TEXT
);

CREATE INDEX IF NOT EXISTS idx_claude_audit_log_integration_ts ON claude_audit_log(integration_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_claude_audit_log_user_ts        ON claude_audit_log(user_id, timestamp DESC);

-- ─── 5. Register module in the modules table ───────────────────────────────
INSERT INTO modules (code, name, description, route, icon, display_order, is_active)
VALUES (
  'claude_integration',
  'Claude Integrations',
  'Short-lived token gateway for Claude AI context access',
  '/api/claude',
  'bot',
  90,
  TRUE
)
ON CONFLICT (code) DO NOTHING;
