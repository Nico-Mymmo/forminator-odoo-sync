-- ============================================================================
-- Mail Signature Designer: replace show_event_promo with hidden_event_id
-- ============================================================================
-- Migration: 2026-02-23
--
-- Replaces the boolean show_event_promo with hidden_event_id TEXT.
-- Rationale: opt-out should be per-event, not permanent.
--   • hidden_event_id stores the eventId of the event the user opted out of.
--   • When marketing activates a new event (new eventId), the stored value no
--     longer matches, so the event is automatically shown again for that user.
--
-- The old show_event_promo column is retained (now unused) to avoid breaking
-- any in-flight reads; it will be removed in a future cleanup migration.
-- ============================================================================

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS hidden_event_id TEXT;

COMMENT ON COLUMN user_signature_settings.hidden_event_id IS
  'ID of the marketing event the user has opted out of. '
  'NULL = show all events (default). '
  'If this matches marketing_signature_settings.config->eventId, '
  'the event block is suppressed for this user. '
  'A new eventId from marketing automatically re-shows the event.';
