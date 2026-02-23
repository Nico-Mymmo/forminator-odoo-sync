-- ============================================================================
-- Mail Signature Designer: Greeting text + Company override
-- ============================================================================
-- Migration: 2026-02-23
--
-- Adds per-user editable fields for:
--   greeting_text   – e.g. "Met vriendelijke groet," (default kept in app logic)
--   show_greeting   – toggle to hide the greeting line entirely
--   company_override – e.g. "OpenVME" or a personal company name
--   show_company    – toggle to hide the company line entirely
-- ============================================================================

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS greeting_text    TEXT,
  ADD COLUMN IF NOT EXISTS show_greeting   BOOLEAN,
  ADD COLUMN IF NOT EXISTS company_override TEXT,
  ADD COLUMN IF NOT EXISTS show_company    BOOLEAN;

COMMENT ON COLUMN user_signature_settings.greeting_text IS
  'Personal greeting line. When NULL, defaults to "Met vriendelijke groet,".';

COMMENT ON COLUMN user_signature_settings.show_greeting IS
  'When false, the greeting line is hidden. NULL = true (shown).';

COMMENT ON COLUMN user_signature_settings.company_override IS
  'Personal company name. When NULL, falls back to marketing brandName or "OpenVME".';

COMMENT ON COLUMN user_signature_settings.show_company IS
  'When false, the company name line is hidden. NULL = true (shown).';
