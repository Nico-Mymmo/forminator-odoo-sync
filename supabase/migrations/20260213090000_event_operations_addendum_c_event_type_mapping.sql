-- ============================================================================
-- Event Operations - Addendum C Event Type Mapping
-- ============================================================================
-- Migration: Create event_type_wp_tag_mapping table
-- Date: 2026-02-13
-- Purpose: Deterministic Odoo event type -> WordPress tag mapping
-- Pattern: User-scoped isolation, NO foreign keys
-- ============================================================================

CREATE TABLE event_type_wp_tag_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  odoo_event_type_id INTEGER NOT NULL,
  wp_tag_id INTEGER NOT NULL,
  wp_tag_slug TEXT NOT NULL,
  wp_tag_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_event_type_mapping UNIQUE (user_id, odoo_event_type_id)
);

COMMENT ON TABLE event_type_wp_tag_mapping IS 'User-owned Odoo event type -> WordPress tag mappings';
COMMENT ON COLUMN event_type_wp_tag_mapping.odoo_event_type_id IS 'Odoo many2one ID from x_webinar_event_type_id (integer)';
COMMENT ON COLUMN event_type_wp_tag_mapping.wp_tag_id IS 'Canonical WordPress tag ID used for sync decisions';
COMMENT ON COLUMN event_type_wp_tag_mapping.wp_tag_slug IS 'Snapshot for display only';
COMMENT ON COLUMN event_type_wp_tag_mapping.wp_tag_name IS 'Snapshot for display only';

CREATE INDEX idx_event_type_wp_tag_mapping_user_id ON event_type_wp_tag_mapping(user_id);
CREATE INDEX idx_event_type_wp_tag_mapping_user_wp_tag_id ON event_type_wp_tag_mapping(user_id, wp_tag_id);

CREATE TRIGGER event_type_wp_tag_mapping_updated_at
  BEFORE UPDATE ON event_type_wp_tag_mapping
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE event_type_wp_tag_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own event type mappings"
  ON event_type_wp_tag_mapping FOR SELECT
  TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own event type mappings"
  ON event_type_wp_tag_mapping FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own event type mappings"
  ON event_type_wp_tag_mapping FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own event type mappings"
  ON event_type_wp_tag_mapping FOR DELETE
  TO public
  USING (auth.uid() = user_id);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ odoo_event_type_id uses INTEGER (Odoo many2one id)
-- ✅ No foreign keys
-- ✅ Unique(user_id, odoo_event_type_id)
-- ✅ user-scoped RLS (auth.uid() = user_id)
-- ✅ WP tag snapshot fields included (slug + name)
-- ============================================================================
