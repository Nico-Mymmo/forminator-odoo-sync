-- ============================================================================
-- Mail Signature Designer: Roles & Layered Settings
-- ============================================================================
-- Migration: 2026-02-23
--
-- Introduces:
--   1. marketing_signature_settings   – marketing layer (replaces direct global
--                                       use of signature_config for non-admin users)
--      NOTE: signature_config remains untouched for backwards compatibility.
--            marketing_signature_settings seeds from signature_config and is used
--            by all new code paths. signature_config may be retired in a future
--            migration once all consumers are updated.
--
--   2. user_signature_settings        – per-user override / toggle layer
--
--   3. Role: 'marketing_signature'    – documented in users.role.
--      The users.role column is VARCHAR, no enum constraint exists.
--      Valid values after this migration: 'user' | 'admin' | 'marketing_signature'
--
--   4. Auto-grant mail_signature_designer to marketing_signature users
--      (mirroring the existing auto-grant pattern for admins).
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- TABLE: marketing_signature_settings
-- Single-row global marketing layer (same singleton pattern as signature_config).
-- Supersedes signature_config for role-split code paths.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE marketing_signature_settings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Full marketing config blob: brandColor, brandName, websiteUrl,
  -- eventPromoEnabled, eventId/Title/Date/RegUrl/ImageUrl/Eyebrow,
  -- showBanner, bannerImageUrl, bannerLinkUrl,
  -- showDisclaimer, disclaimerText (default/fallback)
  config      JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID        -- UUID of the marketing/admin user who last saved (no FK)
);

COMMENT ON TABLE marketing_signature_settings IS
  'Global singleton marketing config layer. Max 1 row enforced via unique index. '
  'Managed by users with role=marketing_signature or role=admin. '
  'Contains branding defaults, active event promotions, banners, default disclaimer.';

COMMENT ON COLUMN marketing_signature_settings.config IS
  'Marketing layer config blob. Keys: brandColor, brandName, websiteUrl, '
  'eventPromoEnabled, eventId, eventTitle, eventDate, eventRegUrl, eventImageUrl, eventEyebrow, '
  'showBanner, bannerImageUrl, bannerLinkUrl, showDisclaimer, disclaimerText.';

-- Singleton constraint: maximum 1 row
CREATE UNIQUE INDEX marketing_signature_settings_singleton
  ON marketing_signature_settings ((true));

-- Auto-update updated_at
CREATE TRIGGER marketing_signature_settings_updated_at
  BEFORE UPDATE ON marketing_signature_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS: permissive to public – access enforced at application layer
ALTER TABLE marketing_signature_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on marketing_signature_settings"
  ON marketing_signature_settings FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Seed: copy current global config from signature_config (if it exists)
INSERT INTO marketing_signature_settings (id, config, updated_at, updated_by)
SELECT
  '00000000-0000-0000-0000-000000000002'::uuid,
  config,
  updated_at,
  updated_by
FROM signature_config
WHERE id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

-- If signature_config was empty, insert a clean default row
INSERT INTO marketing_signature_settings (id, config)
VALUES ('00000000-0000-0000-0000-000000000002'::uuid, '{}')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- TABLE: user_signature_settings
-- Per-user override layer. Each row belongs to one Google Workspace user
-- identified by their email address.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE user_signature_settings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity: Google Workspace email (matches target_user_email in push flow)
  user_email      TEXT        NOT NULL UNIQUE,

  -- ── Personal overrides (null = "not set → fall back to Odoo/marketing")
  full_name_override  TEXT,    -- Override display name (null = use Odoo name)
  role_title_override TEXT,    -- Override job title  (null = use Odoo job_title)
  phone_override      TEXT,    -- Override phone      (null = use Odoo mobile_phone)

  -- ── Visibility toggles (null = "not set → show by default")
  show_email   BOOLEAN,        -- null = true  (show email link)
  show_phone   BOOLEAN,        -- null = true  (show phone if available)

  -- ── Personal disclaimer (null = fall back to marketing disclaimer)
  show_disclaimer  BOOLEAN  NOT NULL DEFAULT false,
  disclaimer_text  TEXT,

  -- ── Personal LinkedIn promo
  linkedin_promo_enabled BOOLEAN  NOT NULL DEFAULT false,
  linkedin_url           TEXT,
  linkedin_eyebrow       TEXT     DEFAULT 'Mijn laatste LinkedIn‑post',
  linkedin_text          TEXT,
  linkedin_author_name   TEXT,
  linkedin_author_img    TEXT,
  linkedin_likes         INTEGER  DEFAULT 0,

  -- ── Audit
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID        -- UUID of the platform user who last saved (no FK)
);

COMMENT ON TABLE user_signature_settings IS
  'Per-user signature override layer. '
  'A user can override their own display name, role, phone, '
  'set visibility toggles, add a personal disclaimer, '
  'and link their LinkedIn post. '
  'NULL values mean "use fallback from Odoo / marketing layer".';

COMMENT ON COLUMN user_signature_settings.user_email IS
  'Primary Google Workspace email of the user. '
  'Matches target_user_email in signature_push_log.';

COMMENT ON COLUMN user_signature_settings.full_name_override IS
  'When set, overrides the name fetched from Google Directory / Odoo.';

COMMENT ON COLUMN user_signature_settings.show_email IS
  'When false, email address is hidden from signature. Default is true.';

COMMENT ON COLUMN user_signature_settings.show_phone IS
  'When false, phone number is hidden from signature. Default is true.';

COMMENT ON COLUMN user_signature_settings.disclaimer_text IS
  'Personal disclaimer text. When NULL, marketing default disclaimer is used.';

-- Index for quick lookup by email
CREATE INDEX idx_user_signature_settings_email
  ON user_signature_settings (user_email);

-- Auto-update updated_at
CREATE TRIGGER user_signature_settings_updated_at
  BEFORE UPDATE ON user_signature_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS: permissive to public – access enforced at application layer
ALTER TABLE user_signature_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on user_signature_settings"
  ON user_signature_settings FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────────
-- ROLE: marketing_signature
-- ──────────────────────────────────────────────────────────────────────────────
-- The users.role column is an unconstrained VARCHAR. This migration documents
-- the new valid value 'marketing_signature' via a comment. No ALTER TABLE needed.
--
-- users.role valid values after this migration:
--   'user'                   – Standard user; manages own signature only
--   'admin'                  – Full access; all modules; all push targets
--   'marketing_signature'    – Can manage marketing config and push to all users
--
COMMENT ON COLUMN users.role IS
  'Platform role. Valid values: user | admin | marketing_signature. '
  'marketing_signature may manage global marketing signature settings and push '
  'to multiple/all users.';

-- ──────────────────────────────────────────────────────────────────────────────
-- AUTO-GRANT mail_signature_designer to marketing_signature users
-- Mirrors the existing auto-grant pattern for admins in the V1 migration.
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'marketing_signature'
  AND m.code = 'mail_signature_designer'
ON CONFLICT (user_id, module_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- PUSH LOG: add push_scope column for audit visibility
-- ──────────────────────────────────────────────────────────────────────────────
-- push_scope: 'self' | 'single' | 'multi' | 'all'
ALTER TABLE signature_push_log
  ADD COLUMN IF NOT EXISTS push_scope TEXT DEFAULT 'single';

COMMENT ON COLUMN signature_push_log.push_scope IS
  'Scope of the push operation: '
  'self = user pushed own signature, '
  'single = marketing pushed one user, '
  'multi = marketing pushed selected users, '
  'all = marketing pushed entire directory.';
