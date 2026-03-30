-- ============================================================================
-- CX Powerboard V6 — Schema additions
-- ============================================================================
-- 1. Extend cx_activity_mapping with include_in_streak + keep_done_confirmed_at
-- 2. Create cx_daily_completions for streak tracking
-- ============================================================================

-- ============================================================================
-- 1. Extend cx_activity_mapping
-- ============================================================================

ALTER TABLE cx_activity_mapping
  ADD COLUMN IF NOT EXISTS include_in_streak    BOOLEAN   NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS keep_done_confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN cx_activity_mapping.include_in_streak IS
  'When true, pending activities of this type gate the daily cleared_queue flag (streak). '
  'Set to false for opportunistic types that should not block streak completion.';

COMMENT ON COLUMN cx_activity_mapping.keep_done_confirmed_at IS
  'Timestamp when keep_done=true was verified in Odoo for this type. '
  'NULL = not yet confirmed. Dashboard shows dataWarning when any tracked type is unconfirmed.';

-- ============================================================================
-- 2. cx_daily_completions
-- ============================================================================
-- One row per platform user per calendar day (Odoo timezone).
-- Written by cron (every 15 min) and by dashboard API (when isDoneForToday=true).
-- cleared_queue: once set to true, never reverts to false.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cx_daily_completions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day               DATE        NOT NULL,
  completed_count   INTEGER     NOT NULL DEFAULT 0,
  remaining_count   INTEGER     NOT NULL DEFAULT 0,
  cleared_queue     BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(platform_user_id, day)
);

COMMENT ON TABLE cx_daily_completions IS
  'Daily aggregate snapshot per CX user. Used for streak calculation. '
  'cleared_queue=true means all streak-relevant tasks were cleared at some point during that day.';

COMMENT ON COLUMN cx_daily_completions.cleared_queue IS
  'True if all include_in_streak activities (overdue+today) were at 0 at any point during this day. '
  'Never reverted from true to false once set.';

CREATE INDEX IF NOT EXISTS idx_cdcomp_user_day
  ON cx_daily_completions (platform_user_id, day DESC);

CREATE TRIGGER cx_daily_completions_updated_at
  BEFORE UPDATE ON cx_daily_completions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE cx_daily_completions ENABLE ROW LEVEL SECURITY;

-- Users can read their own rows; managers/admin can read all
CREATE POLICY "cx_daily_completions_select_own"
  ON cx_daily_completions FOR SELECT
  TO public
  USING (auth.uid() = platform_user_id);
