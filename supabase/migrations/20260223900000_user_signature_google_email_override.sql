-- ============================================================================
-- Add google_email_override to user_signature_settings
-- ============================================================================
-- Some users have a different primary Google Workspace email than the address
-- they use to log in to this app. This override controls which Google account
-- is impersonated when pushing the Gmail signature via the service account.
-- When NULL, the user's login email (user_email) is used as before.
-- ============================================================================

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS google_email_override TEXT DEFAULT NULL;

COMMENT ON COLUMN user_signature_settings.google_email_override IS
  'Alternative Google Workspace primary email to impersonate when pushing the '
  'Gmail signature. When NULL (default), the login email (user_email) is used. '
  'Set by admin or by the user themselves on their profile page.';
