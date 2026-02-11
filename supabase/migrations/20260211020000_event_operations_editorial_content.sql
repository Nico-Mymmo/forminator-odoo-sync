-- ============================================================================
-- Event Operations - Editorial Content Layer (Addendum A5)
-- ============================================================================
-- Migration: Add editorial_content column to webinar_snapshots
-- Date: 2026-02-11
-- Purpose: Enable custom WordPress descriptions with block editor
-- Pattern: JSONB column, nullable, backward compatible
-- ============================================================================

-- ADD COLUMN: editorial_content
ALTER TABLE webinar_snapshots
ADD COLUMN editorial_content JSONB DEFAULT NULL;

COMMENT ON COLUMN webinar_snapshots.editorial_content IS 
'User-authored editorial content blocks for WP description override. NULL = use Odoo description.';

-- ============================================================================
-- JSONB Structure (Application-Level Validation):
-- {
--   "blocks": [
--     { "type": "paragraph", "content": "Text here..." },
--     { "type": "shortcode", "name": "forminator_form", "attributes": { "id": "123" } }
--   ],
--   "version": 1
-- }
-- ============================================================================

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Column nullable (backward compatible - NULL = use Odoo description)
-- ✅ No RLS policy changes (column inherits webinar_snapshots policies)
-- ✅ JSONB validation handled at application level
-- ✅ No foreign keys
-- ============================================================================
