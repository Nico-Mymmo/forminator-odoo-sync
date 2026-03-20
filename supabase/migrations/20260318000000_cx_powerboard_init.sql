-- ============================================================================
-- CX Powerboard V1 - Database Foundation
-- ============================================================================
-- Migration: Add odoo_uid to users, create CX tables, register module
-- Date: 2026-03-18
-- Pattern: Worker service-role writes (bypasses RLS); RLS is defense-in-depth
--          NO role CHECK constraint on users.role (validated at app layer only;
--          see 20260223600000_relax_users_role_constraint.sql)
-- ============================================================================

-- ============================================================================
-- 1. EXTEND USERS TABLE
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS odoo_uid INTEGER UNIQUE;

COMMENT ON COLUMN users.odoo_uid IS 'Odoo res.users.id for this platform user. Used by CX Powerboard cron for activity attribution.';

-- ============================================================================
-- 2. cx_activity_mapping
-- ============================================================================
-- Source of truth: which Odoo activity types are tracked and which are wins.
-- Managed by cx_powerboard_manager / admin via the Settings UI.
-- ============================================================================

CREATE TABLE cx_activity_mapping (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_activity_type_id   INTEGER     NOT NULL UNIQUE,
  odoo_activity_type_name TEXT        NOT NULL,
  priority_weight         INTEGER     NOT NULL DEFAULT 1
                            CHECK (priority_weight BETWEEN 1 AND 10),
  is_win                  BOOLEAN     NOT NULL DEFAULT false,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cx_activity_mapping IS 'Maps Odoo activity types to CX priority weights and win flags';
COMMENT ON COLUMN cx_activity_mapping.priority_weight IS '1 (lowest) to 10 (highest). Used to sort activity queue.';
COMMENT ON COLUMN cx_activity_mapping.is_win IS 'When true, completing this activity type counts as a win';

CREATE INDEX idx_cam_type_id ON cx_activity_mapping (odoo_activity_type_id);

-- Trigger: keep updated_at current
CREATE TRIGGER cx_activity_mapping_updated_at
  BEFORE UPDATE ON cx_activity_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE cx_activity_mapping ENABLE ROW LEVEL SECURITY;

-- Anyone can read (module access enforced at the Worker layer)
CREATE POLICY "cx_activity_mapping_select"
  ON cx_activity_mapping FOR SELECT
  TO public
  USING (true);

-- Only admin or cx_powerboard_manager can write
-- Note: Worker uses service_role (bypasses RLS); these policies protect direct DB access
CREATE POLICY "cx_activity_mapping_modify"
  ON cx_activity_mapping FOR ALL
  TO public
  USING (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() ->> 'role',
      ''
    ) IN ('admin', 'cx_powerboard_manager')
  )
  WITH CHECK (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() ->> 'role',
      ''
    ) IN ('admin', 'cx_powerboard_manager')
  );

-- ============================================================================
-- 3. cx_seen_activities
-- ============================================================================
-- Running log of open Odoo activities currently tracked by the cron job.
-- Acts as "previous state" for poll-and-diff win detection.
-- Written exclusively by the cron job (service_role). Never by users.
-- ============================================================================

CREATE TABLE cx_seen_activities (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_activity_id     INTEGER     NOT NULL UNIQUE,
  odoo_user_id         INTEGER     NOT NULL,
  platform_user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  activity_type_id     INTEGER     NOT NULL,
  activity_type_name   TEXT        NOT NULL,
  odoo_deadline        DATE,
  first_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cx_seen_activities IS 'Open Odoo activities being tracked by the CX Powerboard cron job';
COMMENT ON COLUMN cx_seen_activities.platform_user_id IS 'Resolved at first-seen time via users.odoo_uid = odoo_user_id';
COMMENT ON COLUMN cx_seen_activities.last_seen_at IS 'Updated on every cron run while the activity remains open in Odoo';

CREATE INDEX idx_csa_odoo_activity_id ON cx_seen_activities (odoo_activity_id);
CREATE INDEX idx_csa_platform_user    ON cx_seen_activities (platform_user_id);

-- RLS
ALTER TABLE cx_seen_activities ENABLE ROW LEVEL SECURITY;

-- Users can read their own rows; managers/admin can read all
CREATE POLICY "cx_seen_activities_select_own"
  ON cx_seen_activities FOR SELECT
  TO public
  USING (auth.uid() = platform_user_id);

-- ============================================================================
-- 4. cx_processed_wins
-- ============================================================================
-- Immutable ledger of detected wins. Written by cron job, never updated.
-- UNIQUE on odoo_activity_id is the idempotency key for concurrent cron runs.
-- ============================================================================

CREATE TABLE cx_processed_wins (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_activity_id     INTEGER     NOT NULL UNIQUE,
  platform_user_id     UUID        NOT NULL REFERENCES users(id),
  activity_type_id     INTEGER     NOT NULL,
  activity_type_name   TEXT        NOT NULL,
  priority_weight      INTEGER     NOT NULL,
  won_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  cron_run_id          TEXT        NOT NULL
);

COMMENT ON TABLE cx_processed_wins IS 'Immutable ledger of CX wins detected by the cron job';
COMMENT ON COLUMN cx_processed_wins.odoo_activity_id IS 'Idempotency key: unique prevents double-counting on concurrent cron runs';
COMMENT ON COLUMN cx_processed_wins.cron_run_id IS 'ISO timestamp of the cron execution that detected this win';

CREATE INDEX idx_cpw_platform_user ON cx_processed_wins (platform_user_id, won_at DESC);
CREATE INDEX idx_cpw_odoo_id       ON cx_processed_wins (odoo_activity_id);

-- RLS
ALTER TABLE cx_processed_wins ENABLE ROW LEVEL SECURITY;

-- Users can read their own wins; managers/admin can read all
CREATE POLICY "cx_processed_wins_select_own"
  ON cx_processed_wins FOR SELECT
  TO public
  USING (auth.uid() = platform_user_id);

-- ============================================================================
-- 5. MODULE REGISTRATION
-- ============================================================================

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'cx_powerboard',
  'CX Powerboard',
  'Activity priority queue and automated win detection for CX teams.',
  '/cx-powerboard',
  'trophy',
  true,
  false,
  50
)
ON CONFLICT (code) DO NOTHING;

-- AUTO-GRANT TO EXISTING ADMIN USERS
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'cx_powerboard'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ odoo_uid added with ADD COLUMN IF NOT EXISTS (safe to re-run)
-- ✅ NO role CHECK constraint change (app-layer validation only; see relax migration)
-- ✅ UNIQUE on cx_processed_wins.odoo_activity_id (cron idempotency)
-- ✅ UNIQUE on cx_seen_activities.odoo_activity_id (upsert safety)
-- ✅ RLS enabled; Worker uses service_role (bypasses RLS at runtime)
-- ✅ Module registration with ON CONFLICT DO NOTHING
-- ✅ Auto-grant to existing admin users
-- ============================================================================
