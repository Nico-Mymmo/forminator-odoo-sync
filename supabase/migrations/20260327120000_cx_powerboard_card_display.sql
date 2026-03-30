-- ============================================================================
-- CX Powerboard: Card Display Customisation
-- ============================================================================
-- Adds per-card display settings to both config tables:
--   card_color_mode      — 'auto' (threshold-based) | 'fixed' (always one color)
--   card_fixed_color     — DaisyUI color name used when mode='fixed'
--   card_threshold_steps — JSONB array of {field, value, color} steps for 'auto' mode
--                          field: 'overdue' | 'today' | 'remaining'
--                          color: DaisyUI color name (error|warning|info|primary|etc.)
--                          Steps are evaluated highest-value-first; first match wins.
--   card_compact_pills   — collapse 3 pills (achterstallig/vandaag/gedaan) into 1
--   card_show_sparkline  — show mini 14-day history chart below the card
--
-- Also creates cx_activity_daily_snapshot for sparkline history.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- cx_team_activity_configs
-- ----------------------------------------------------------------------------
ALTER TABLE cx_team_activity_configs
  ADD COLUMN IF NOT EXISTS card_color_mode      TEXT    NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS card_fixed_color     TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_threshold_steps JSONB   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_compact_pills   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_show_sparkline  BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE cx_team_activity_configs
  DROP CONSTRAINT IF EXISTS cx_team_configs_card_color_mode_check;
ALTER TABLE cx_team_activity_configs
  ADD CONSTRAINT cx_team_configs_card_color_mode_check
  CHECK (card_color_mode IN ('auto', 'fixed'));

-- ----------------------------------------------------------------------------
-- cx_user_personal_configs
-- ----------------------------------------------------------------------------
ALTER TABLE cx_user_personal_configs
  ADD COLUMN IF NOT EXISTS card_color_mode      TEXT    NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS card_fixed_color     TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_threshold_steps JSONB   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_compact_pills   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_show_sparkline  BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE cx_user_personal_configs
  DROP CONSTRAINT IF EXISTS cx_user_configs_card_color_mode_check;
ALTER TABLE cx_user_personal_configs
  ADD CONSTRAINT cx_user_configs_card_color_mode_check
  CHECK (card_color_mode IN ('auto', 'fixed'));

-- ----------------------------------------------------------------------------
-- cx_activity_daily_snapshot  — daily per-type completion history for sparklines
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cx_activity_daily_snapshot (
  id               BIGSERIAL    PRIMARY KEY,
  user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type_id BIGINT       NOT NULL,
  snapshot_date    DATE         NOT NULL,
  completed_count  INT          NOT NULL DEFAULT 0,
  remaining_count  INT          NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_type_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS cx_activity_daily_snapshot_user_date
  ON cx_activity_daily_snapshot (user_id, snapshot_date DESC);

ALTER TABLE cx_activity_daily_snapshot ENABLE ROW LEVEL SECURITY;

-- Users can read their own snapshots
CREATE POLICY "cx_activity_daily_snapshot_select"
  ON cx_activity_daily_snapshot FOR SELECT TO authenticated
  USING (user_id = auth.uid());
