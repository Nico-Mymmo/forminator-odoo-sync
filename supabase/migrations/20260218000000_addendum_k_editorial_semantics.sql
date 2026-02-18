-- ============================================================================
-- Addendum K - Editorial Semantics & WordPress Linking
-- ============================================================================
-- Migration: Add editorial_mode, wp_event_id, selected_form_id to webinar_snapshots
-- Date: 2026-02-18
-- Purpose: Fix form re-addition bug, enable WP linking, explicit editorial modes
-- Pattern: Nullable columns, backward compatible, application-level validation
-- ============================================================================

-- ADD COLUMN: wp_event_id (PRIMARY WordPress link)
ALTER TABLE webinar_snapshots
ADD COLUMN wp_event_id BIGINT DEFAULT NULL;

COMMENT ON COLUMN webinar_snapshots.wp_event_id IS 
'WordPress event ID from wp_snapshot.id, used as primary link source. NULL if not yet published.';

CREATE INDEX idx_webinar_snapshots_wp_event_id ON webinar_snapshots(wp_event_id);

-- ADD COLUMN: editorial_mode (explicit editorial intent)
ALTER TABLE webinar_snapshots
ADD COLUMN editorial_mode TEXT DEFAULT 'never_edited' NOT NULL;

COMMENT ON COLUMN webinar_snapshots.editorial_mode IS 
'Editorial mode enum: never_edited, custom, use_odoo_plain, empty. Determines description and form behavior.';

-- ADD COLUMN: selected_form_id (dedicated form selection, decoupled from editorial_content)
ALTER TABLE webinar_snapshots
ADD COLUMN selected_form_id TEXT DEFAULT NULL;

COMMENT ON COLUMN webinar_snapshots.selected_form_id IS 
'Forminator form ID for registration shortcode. NULL = no form, value = insert [forminator_form id="..."]';

-- ============================================================================
-- DATA MIGRATION: Set editorial_mode for existing records
-- ============================================================================
-- Records with editorial_content: set to 'custom'
-- Records without editorial_content: keep 'never_edited' (default)

UPDATE webinar_snapshots
SET editorial_mode = 'custom'
WHERE editorial_content IS NOT NULL
  AND (editorial_content->>'blocks') IS NOT NULL
  AND jsonb_array_length((editorial_content->'blocks')::jsonb) > 0;

-- Extract wp_event_id from wp_snapshot.id if exists
UPDATE webinar_snapshots
SET wp_event_id = (wp_snapshot->>'id')::BIGINT
WHERE wp_snapshot IS NOT NULL
  AND wp_snapshot->>'id' IS NOT NULL
  AND (wp_snapshot->>'id')::BIGINT > 0;

-- ============================================================================
-- VALIDATION CONSTRAINT: editorial_mode enum
-- ============================================================================
-- Application-level validation preferred, but add check constraint for safety

ALTER TABLE webinar_snapshots
ADD CONSTRAINT webinar_snapshots_editorial_mode_check
CHECK (editorial_mode IN ('never_edited', 'custom', 'use_odoo_plain', 'empty'));

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Rollback Instructions:
-- ALTER TABLE webinar_snapshots DROP COLUMN wp_event_id;
-- ALTER TABLE webinar_snapshots DROP COLUMN editorial_mode;
-- ALTER TABLE webinar_snapshots DROP COLUMN selected_form_id;
-- DROP INDEX idx_webinar_snapshots_wp_event_id;
-- ============================================================================
-- Compliance Notes:
-- ✅ All columns nullable or with safe defaults (backward compatible)
-- ✅ Existing records migrated (editorial_content -> editorial_mode)
-- ✅ No RLS policy changes (columns inherit webinar_snapshots policies)
-- ✅ wp_event_id indexed for linking lookups
-- ✅ Check constraint on editorial_mode enum
-- ============================================================================

