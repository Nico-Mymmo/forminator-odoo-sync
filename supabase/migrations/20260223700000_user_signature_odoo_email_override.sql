-- ============================================================================
-- Add odoo_email_override to user_signature_settings
-- ============================================================================
-- Some users have a different email in Odoo than the one they use to log in.
-- This override lets admins (or the user themselves) specify the Odoo work_email
-- so that Odoo employee data (job_title, phone) is fetched correctly.
-- When NULL, the user's login email is used as before.
-- ============================================================================

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS odoo_email_override TEXT DEFAULT NULL;

COMMENT ON COLUMN user_signature_settings.odoo_email_override IS
  'Alternative Odoo work_email to use when looking up this user in Odoo. '
  'When NULL (default), the login email (user_email) is used. '
  'Set by admin or by the user themselves on their profile page.';
