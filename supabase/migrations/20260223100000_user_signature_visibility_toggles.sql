-- ============================================================================
-- user_signature_settings: add show_name + show_role_title visibility toggles
-- ============================================================================
-- Migration: 2026-02-23 (part 2)
--
-- Adds per-field visibility toggles so users can hide specific fields
-- from their signature without removing the data.
--
-- show_name:       null/true = show name in signature; false = hide
-- show_role_title: null/true = show function title;    false = hide
--
-- (show_email and show_phone already existed from the previous migration)
-- ============================================================================

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS show_name       BOOLEAN,   -- null = true (show by default)
  ADD COLUMN IF NOT EXISTS show_role_title BOOLEAN;   -- null = true (show by default)

COMMENT ON COLUMN user_signature_settings.show_name IS
  'When false, the full name is hidden from the signature. Default is true.';

COMMENT ON COLUMN user_signature_settings.show_role_title IS
  'When false, the job title is hidden from the signature. Default is true.';
