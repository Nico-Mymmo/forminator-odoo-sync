-- ============================================================================
-- Mail Signature Designer: add show_photo visibility toggle
-- ============================================================================
-- Migration: 2026-02-23
--
-- Adds show_photo BOOLEAN to user_signature_settings.
-- null = default true (show photo when available).
-- ============================================================================

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS show_photo BOOLEAN;

COMMENT ON COLUMN user_signature_settings.show_photo IS
  'When false, profile photo is hidden from the signature. '
  'NULL / true = show photo (when one is available).';
