-- ============================================================================
-- Event Operations - Tag Mapping Engine (Addendum A4)
-- ============================================================================
-- Migration: Create webinar_tag_mappings table
-- Date: 2026-02-11
-- Purpose: Map Odoo x_studio_tag_ids → WordPress Event Categories
-- Pattern: User-scoped isolation, NO foreign keys
-- ============================================================================

-- CREATE TABLE: webinar_tag_mappings
CREATE TABLE webinar_tag_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  odoo_tag_id INTEGER NOT NULL,
  odoo_tag_name TEXT NOT NULL,
  wp_category_slug TEXT NOT NULL,
  wp_category_id INTEGER,
  auto_created BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_odoo_category UNIQUE (user_id, odoo_tag_id)
);

COMMENT ON TABLE webinar_tag_mappings IS 'User-owned Odoo tag → WP Event Category mappings';
COMMENT ON COLUMN webinar_tag_mappings.odoo_tag_id IS 'Odoo x_webinar_tag.id';
COMMENT ON COLUMN webinar_tag_mappings.odoo_tag_name IS 'Cached tag name for UI display';
COMMENT ON COLUMN webinar_tag_mappings.wp_category_slug IS 'WordPress tribe_events_cat slug';
COMMENT ON COLUMN webinar_tag_mappings.wp_category_id IS 'WordPress tribe_events_cat term_id (populated after first use)';
COMMENT ON COLUMN webinar_tag_mappings.auto_created IS 'True if WP category was auto-created by module';

-- INDEXES (NO foreign key - baseline pattern)
CREATE INDEX idx_webinar_tag_mappings_user_id ON webinar_tag_mappings(user_id);
CREATE INDEX idx_webinar_tag_mappings_odoo_tag_id ON webinar_tag_mappings(odoo_tag_id);
CREATE INDEX idx_webinar_tag_mappings_user_odoo ON webinar_tag_mappings(user_id, odoo_tag_id);

-- TRIGGER: Auto-update updated_at
CREATE TRIGGER webinar_tag_mappings_updated_at
  BEFORE UPDATE ON webinar_tag_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS POLICIES (TO public pattern)
ALTER TABLE webinar_tag_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tag mappings"
  ON webinar_tag_mappings FOR SELECT
  TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tag mappings"
  ON webinar_tag_mappings FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tag mappings"
  ON webinar_tag_mappings FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tag mappings"
  ON webinar_tag_mappings FOR DELETE
  TO public
  USING (auth.uid() = user_id);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ NO foreign key on user_id (baseline pattern)
-- ✅ RLS policies TO public (not TO authenticated)
-- ✅ User-scoped isolation: auth.uid() = user_id
-- ✅ Unique constraint: 1 Odoo tag → 1 WP category per user
-- ✅ Cached odoo_tag_name for UI without re-fetching Odoo
-- ============================================================================
