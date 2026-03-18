-- ─────────────────────────────────────────────────────────────────────────────
-- user_signature_settings — contact overrides
--
-- Adds two optional override columns so users (and alias variants) can control:
--   website_url_override  — show a custom URL instead of the marketing websiteUrl
--   email_display_override — show a custom email address instead of the sendAs
--                            address (useful for alias variants where you want
--                            to display a different address than the one Gmail
--                            would use automatically)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS website_url_override    TEXT,
  ADD COLUMN IF NOT EXISTS email_display_override  TEXT;

COMMENT ON COLUMN user_signature_settings.website_url_override IS
  'Per-user website URL override. When set, replaces the marketing websiteUrl in '
  'the compiled signature. Useful for alias variants that represent a different brand.';

COMMENT ON COLUMN user_signature_settings.email_display_override IS
  'Per-user email address shown in the signature body. '
  'When NULL the authoritative sendAs address (targetEmail) is used. '
  'Set this in an alias variant to show a specific address.';
