-- ============================================================================
-- Mail Signature Designer: add show_event_promo visibility toggle
-- ============================================================================
-- Migration: 2026-02-23
--
-- Adds show_event_promo BOOLEAN to user_signature_settings.
-- null / true = show marketing event block (default).
-- false       = user opts out; event promo is suppressed even when marketing
--               has an active event.
-- ============================================================================

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS show_event_promo BOOLEAN;

COMMENT ON COLUMN user_signature_settings.show_event_promo IS
  'When false, the marketing event promotion block is hidden from this user''s '
  'signature even when marketing has an active event. NULL / true = show (default).';
