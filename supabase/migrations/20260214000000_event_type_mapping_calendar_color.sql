-- ============================================================================
-- Event Operations - Add calendar_color to event_type_wp_tag_mapping
-- ============================================================================
-- Migration: Add calendar_color column for per-mapping DaisyUI color token
-- Date: 2026-02-14
-- Purpose: Allow users to configure calendar card colors per event type
-- ============================================================================

ALTER TABLE event_type_wp_tag_mapping
  ADD COLUMN calendar_color TEXT NOT NULL DEFAULT 'primary';

COMMENT ON COLUMN event_type_wp_tag_mapping.calendar_color IS 'DaisyUI color token for calendar card (primary, secondary, accent, info, success, warning, neutral)';

-- ============================================================================
-- END MIGRATION
