-- ============================================================================
-- Create signature_push_excluded table
-- ============================================================================
-- Stores email addresses that should be skipped during bulk push operations.
-- Excluded addresses are:
--   1. Skipped in "Push alle gebruikers" (push/all and background auto-push)
--   2. Hidden from the user selection dropdown in "Selecteer gebruikers"
-- Managed by admins via the Administratie tab in the mail signature designer.
-- ============================================================================

CREATE TABLE IF NOT EXISTS signature_push_excluded (
  email      TEXT        PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE signature_push_excluded IS
  'Email addresses excluded from bulk Gmail signature push operations. '
  'Excluded users are skipped in push/all and hidden from the push-select dropdown.';
