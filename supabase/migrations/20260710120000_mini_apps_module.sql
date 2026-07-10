-- ============================================================================
-- Mini-Apps Module
-- ============================================================================
-- Migration: 2026-07-10
-- Nieuwe module waarmee collega's zelfgemaakte single-file HTML/JS "mini-apps"
-- kunnen uploaden, gebruiken (gesandboxed in een iframe) en tweaken via een
-- ingebouwde code-editor.
--
-- Opslag: de HTML-inhoud zelf staat NIET in de database, maar in R2
-- (binding env.R2_ASSETS, key-prefix "mini-apps/") — zie
-- src/modules/mini-apps/lib/r2-client.js. Deze tabel bevat alleen metadata.
--
-- Sharing-patroon: overgenomen van project_templates
-- (20260130000000_addendum_n_visibility.sql) — visibility-enum +
-- shared_user_ids UUID[]-kolom, geen apart join-tabel.
--
-- RLS: de Worker gebruikt altijd de service_role-key (bypasst RLS, zie
-- getSupabaseClient in src/lib/database.js) — de daadwerkelijke
-- zichtbaarheids-/rechtencontrole gebeurt in src/modules/mini-apps/routes.js.
-- Deze policies zijn puur defense-in-depth tegen direct database-verkeer
-- buiten de Worker om (zelfde patroon als cx_powerboard_init.sql).
-- ============================================================================

-- ─── Tabel ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mini_apps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            VARCHAR NOT NULL,
  description      TEXT,
  owner_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility       VARCHAR NOT NULL DEFAULT 'private',
  shared_user_ids  UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  r2_key           TEXT NOT NULL,
  size_bytes       INTEGER,
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mini_apps
  ADD CONSTRAINT mini_apps_visibility_check
  CHECK (visibility IN ('private', 'shared', 'specific'));

CREATE INDEX IF NOT EXISTS idx_mini_apps_owner        ON mini_apps(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_mini_apps_visibility   ON mini_apps(visibility);
CREATE INDEX IF NOT EXISTS idx_mini_apps_shared_users ON mini_apps USING GIN(shared_user_ids);

-- ─── RLS (defense-in-depth — zie opmerking bovenaan) ────────────────────────

ALTER TABLE mini_apps ENABLE ROW LEVEL SECURITY;

-- Eigenaar, of shared-met-iedereen, of expliciet gedeeld met deze user
CREATE POLICY "mini_apps_select"
  ON mini_apps FOR SELECT
  TO public
  USING (
    auth.uid() = owner_user_id
    OR visibility = 'shared'
    OR (visibility = 'specific' AND auth.uid() = ANY(shared_user_ids))
  );

-- Alleen de eigenaar mag aanmaken/bewerken/verwijderen
CREATE POLICY "mini_apps_owner_write"
  ON mini_apps FOR ALL
  TO public
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- ─── Trigger: updated_at ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mini_apps_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mini_apps_updated_at ON mini_apps;
CREATE TRIGGER trg_mini_apps_updated_at
  BEFORE UPDATE ON mini_apps
  FOR EACH ROW
  EXECUTE FUNCTION mini_apps_set_updated_at();

-- ─── MODULE REGISTRATION ─────────────────────────────────────────────────────

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'mini_apps',
  'Mini-apps',
  'Upload, gebruik en tweak zelfgemaakte single-file HTML/JS mini-apps — privé of gedeeld met collega''s',
  '/mini-apps',
  'puzzle',
  true,
  false,
  110
)
ON CONFLICT (code) DO NOTHING;

-- AUTO-GRANT AAN ALLE ACTIEVE GEBRUIKERS
-- (in tegenstelling tot asset_manager: dit is een tool voor iedereen, niet
-- enkel admins)
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'mini_apps'
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ON CONFLICT (code) DO NOTHING, IF NOT EXISTS, DROP TRIGGER IF EXISTS
-- ✅ RLS enabled + policies (defense-in-depth, Worker gebruikt service_role)
-- ✅ Auto-grant aan alle actieve users (geen admin-only tool)
-- ✅ display_order = 110 (na admin_helpers = 100)
-- ✅ Geen file-inhoud in de database — enkel metadata (R2 bevat de HTML)
-- ============================================================================
