-- =============================================================================
-- Asset Manager — dynamische categorieen (top-level mappen)
-- =============================================================================
-- Tot nu toe waren de categorieen van de Asset Library hardcoded op twee
-- plekken (ASSET_CATEGORY_PREFIXES in src/modules/asset-manager/routes.js +
-- statische <li>/<a data-prefix> markup in ui.js). Deze tabel maakt het
-- mogelijk om vanuit de UI een nieuwe top-level map toe te voegen zonder
-- code-deploy. De vijf bestaande categorieen (public/, banners/, events/,
-- logos/, uploads/) blijven hardcoded/ingebakken (routes.js) -- deze tabel
-- bevat alleen de EXTRA, door gebruikers toegevoegde categorieen.
--
-- Alle databasetoegang loopt via getSupabaseClient(env) (service_role,
-- bypasst RLS) -- zie src/lib/database.js. RLS + deny-all policy volgens het
-- vaste patroon uit 20260821120000_fix_rls_disabled_in_public.sql.
--
-- Idempotent by design.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS asset_manager_categories (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix       TEXT        NOT NULL UNIQUE, -- altijd eindigend op '/', bv. 'contracten/'
  label        TEXT        NOT NULL,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_manager_categories_prefix ON asset_manager_categories(prefix);

ALTER TABLE asset_manager_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_manager_categories_deny_all" ON asset_manager_categories;
CREATE POLICY "asset_manager_categories_deny_all" ON asset_manager_categories
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

COMMIT;

-- =============================================================================
-- END MIGRATION
-- =============================================================================
