-- =============================================================================
-- Asset Manager — brand-per-map voor publieke links (link.openvme.be vs
-- link.syndicoach.be)
-- =============================================================================
-- De onderliggende opslag verandert niet: bestanden blijven gewoon op hun R2-key
-- staan en worden nog altijd via dezelfde Worker geserveerd (zie
-- src/router/public-routes.js — /assets/* is host-onafhankelijk, zowel
-- link.openvme.be als link.syndicoach.be proxyen transparant naar dezelfde
-- R2-bytes). Deze tabel bepaalt enkel welk van die twee "mooie" domeinen
-- getoond wordt wanneer een gebruiker de publieke link van een bestand
-- kopieert (zie GET /api/assets/list → objects[].publicUrl in
-- src/modules/asset-manager/routes.js).
--
-- Eén rij per map-prefix waarop een BRAND EXPLICIET is ingesteld (top-level
-- categorie óf submap — submappen hebben toch al geen eigen rij nodig in
-- asset_manager_categories, dus deze tabel is bewust generiek op prefix i.p.v.
-- gekoppeld aan die tabel). Een bestand zonder eigen/overgeërfde instelling
-- valt terug op 'openvme' (zie DEFAULT_BRAND in routes.js). Resolutie gebeurt
-- server-side door van het bestand omhoog te lopen naar de dichtstbijzijnde
-- voorouder-prefix met een rij hier.
--
-- Idempotent by design.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS asset_manager_folder_brands (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  prefix     TEXT        NOT NULL UNIQUE, -- altijd eindigend op '/', bv. 'uploads/contracten/'
  brand      TEXT        NOT NULL CHECK (brand IN ('openvme', 'syndicoach')),
  updated_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_manager_folder_brands_prefix ON asset_manager_folder_brands(prefix);

ALTER TABLE asset_manager_folder_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_manager_folder_brands_deny_all" ON asset_manager_folder_brands;
CREATE POLICY "asset_manager_folder_brands_deny_all" ON asset_manager_folder_brands
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

COMMIT;

-- =============================================================================
-- END MIGRATION
-- =============================================================================
