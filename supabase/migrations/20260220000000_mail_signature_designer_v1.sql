-- ============================================================================
-- Mail Signature Designer V1 - Database Foundation
-- ============================================================================
-- Migration: Create signature_config and signature_push_log tables
-- Date: 2026-02-20
-- Pattern: Global tables (no user-scope), permissive RLS TO public
--          Singleton config via unique index, NO foreign keys (baseline)
-- ============================================================================

-- TABLE: signature_config
-- Holds exactly ONE global signature configuration (singleton enforced)
CREATE TABLE signature_config (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  config      JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID
);

COMMENT ON TABLE signature_config IS 'Global singleton signature config. Max 1 row enforced via unique index.';
COMMENT ON COLUMN signature_config.config IS 'Full config as JSONB: brandColor, showPhoto, showCTA, showBanner, showDisclaimer, ctaText, ctaUrl, bannerImageUrl, bannerLinkUrl, disclaimerText';
COMMENT ON COLUMN signature_config.updated_by IS 'UUID of the user who last saved (no FK constraint)';

-- SINGLETON CONSTRAINT: technically allows max 1 row
CREATE UNIQUE INDEX signature_config_singleton ON signature_config ((true));

-- TRIGGER: Auto-update updated_at
CREATE TRIGGER signature_config_updated_at
  BEFORE UPDATE ON signature_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS (global table - permissive TO public, access enforced by module-auth layer)
ALTER TABLE signature_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on signature_config"
  ON signature_config FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- ============================================================================

-- TABLE: signature_push_log
-- Append-only audit log for every signature push operation
CREATE TABLE signature_push_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email       TEXT,
  pushed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_user_email TEXT,
  sendas_email      TEXT,
  success           BOOLEAN     NOT NULL DEFAULT false,
  error_message     TEXT,
  html_hash         TEXT,
  metadata          JSONB       NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE signature_push_log IS 'Audit log for every Gmail signature push attempt';
COMMENT ON COLUMN signature_push_log.actor_email IS 'Email of the user who triggered the push';
COMMENT ON COLUMN signature_push_log.target_user_email IS 'Email of the Google Workspace user targeted';
COMMENT ON COLUMN signature_push_log.sendas_email IS 'Primary sendAs address updated in Gmail';
COMMENT ON COLUMN signature_push_log.html_hash IS 'SHA-256 (truncated) of the HTML pushed, for deduplication/audit';
COMMENT ON COLUMN signature_push_log.metadata IS 'Extra info: warnings, batch info, etc.';

-- INDEX for efficient log queries
CREATE INDEX idx_signature_push_log_pushed_at ON signature_push_log (pushed_at DESC);
CREATE INDEX idx_signature_push_log_actor_email ON signature_push_log (actor_email);
CREATE INDEX idx_signature_push_log_success ON signature_push_log (success);

-- RLS (global table - permissive TO public)
ALTER TABLE signature_push_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on signature_push_log"
  ON signature_push_log FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- MODULE REGISTRATION
-- ============================================================================

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'mail_signature_designer',
  'Signature Designer',
  'Build and push Gmail signatures via Google Workspace domain-wide delegation',
  '/mail-signatures',
  'mail',
  true,
  false,
  7
)
ON CONFLICT (code) DO NOTHING;

-- AUTO-GRANT TO ADMIN
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'mail_signature_designer'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ NO foreign keys (baseline pattern)
-- ✅ RLS policies TO public, permissive USING (true) WITH CHECK (true)
-- ✅ Global tables: no user_id scope (access enforced by module-auth in index.js)
-- ✅ Singleton: CREATE UNIQUE INDEX ... ((true)) + fixed UUID in code
-- ✅ JSONB config column (like project_templates.blueprint_data)
-- ✅ Module registration in same migration
-- ✅ Auto-grant admin
-- ============================================================================
