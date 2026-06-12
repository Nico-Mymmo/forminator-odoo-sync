-- =============================================================================
-- TABLE: saved_searches
-- Gebruikers kunnen wizard-zoekopdrachten opslaan (state snapshot + naam)
-- =============================================================================

CREATE TABLE IF NOT EXISTS saved_searches (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  wizard_state JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches(user_id);
