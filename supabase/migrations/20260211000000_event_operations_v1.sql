-- ============================================================================
-- Event Operations V1 - Database Foundation
-- ============================================================================
-- Migration: Create webinar_snapshots table with RLS and module registration
-- Date: 2026-02-11
-- Pattern: User-scoped isolation, NO foreign keys (baseline compliance)
-- ============================================================================

-- TABLE: webinar_snapshots
CREATE TABLE webinar_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  odoo_webinar_id INTEGER NOT NULL,
  odoo_snapshot JSONB NOT NULL,
  wp_snapshot JSONB,
  computed_state TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE webinar_snapshots IS 'User-owned webinar sync state snapshots';
COMMENT ON COLUMN webinar_snapshots.odoo_snapshot IS 'x_webinar record snapshot';
COMMENT ON COLUMN webinar_snapshots.wp_snapshot IS 'WordPress Tribe Event snapshot';
COMMENT ON COLUMN webinar_snapshots.computed_state IS 'Enum: not_published | published | out_of_sync | archived | deleted';

-- INDEX (NO foreign key - baseline pattern)
CREATE INDEX idx_webinar_snapshots_user_id ON webinar_snapshots(user_id);
CREATE INDEX idx_webinar_snapshots_odoo_webinar_id ON webinar_snapshots(odoo_webinar_id);
CREATE UNIQUE INDEX idx_webinar_snapshots_user_webinar ON webinar_snapshots(user_id, odoo_webinar_id);

-- RLS POLICIES (TO public pattern)
ALTER TABLE webinar_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots"
  ON webinar_snapshots FOR SELECT
  TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own snapshots"
  ON webinar_snapshots FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own snapshots"
  ON webinar_snapshots FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own snapshots"
  ON webinar_snapshots FOR DELETE
  TO public
  USING (auth.uid() = user_id);

-- TRIGGER: Auto-update updated_at
CREATE TRIGGER webinar_snapshots_updated_at
  BEFORE UPDATE ON webinar_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- MODULE REGISTRATION
INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'event_operations',
  'Event Operations',
  'Manage Odoo webinar publication to WordPress',
  '/events',
  'calendar',
  true,
  false,
  5
)
ON CONFLICT (code) DO NOTHING;

-- AUTO-GRANT TO ADMIN
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'event_operations'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um 
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ NO foreign key on user_id (baseline pattern)
-- ✅ RLS policies TO public (not TO authenticated)
-- ✅ User-scoped isolation: auth.uid() = user_id
-- ✅ JSONB snapshots (like project_templates.blueprint_data)
-- ✅ Module registration in same migration
-- ============================================================================
