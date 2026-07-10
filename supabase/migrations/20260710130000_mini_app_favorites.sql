-- ============================================================================
-- Mini-Apps — Favorieten
-- ============================================================================
-- Migration: 2026-07-10
-- Laat gebruikers mini-apps als favoriet markeren. Favorieten worden als
-- blokjes rechtsboven in de gedeelde navbar getoond (zie
-- src/lib/components/navbar.js), zodat een favoriet vanop elke pagina in de
-- Operations Manager met één klik te openen is (deeplink /mini-apps?app=<id>).
--
-- Aparte join-tabel i.p.v. een kolom op mini_apps zelf: een favoriet is
-- per-gebruiker, niet per-app (dezelfde app kan voor de ene gebruiker een
-- favoriet zijn en voor de andere niet).
--
-- RLS: de Worker gebruikt altijd de service_role-key (bypasst RLS, zie
-- getSupabaseClient in src/lib/database.js) — de daadwerkelijke
-- rechtencontrole (mag deze user deze app wel favorieten?) gebeurt in
-- src/modules/mini-apps/routes.js. Deze policy is puur defense-in-depth
-- tegen direct database-verkeer buiten de Worker om (zelfde patroon als
-- mini_apps zelf, zie 20260710120000_mini_apps_module.sql).
-- ============================================================================

-- ─── Tabel ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mini_app_favorites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mini_app_id  UUID NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mini_app_id)
);

CREATE INDEX IF NOT EXISTS idx_mini_app_favorites_user ON mini_app_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_mini_app_favorites_app  ON mini_app_favorites(mini_app_id);

-- ─── RLS (defense-in-depth — zie opmerking bovenaan) ────────────────────────

ALTER TABLE mini_app_favorites ENABLE ROW LEVEL SECURITY;

-- Een favoriet is strikt persoonlijk: alleen de eigenaar van de favoriet-rij
-- (niet de eigenaar van de app!) mag hem zien/aanmaken/verwijderen.
CREATE POLICY "mini_app_favorites_owner_only"
  ON mini_app_favorites FOR ALL
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: IF NOT EXISTS
-- ✅ RLS enabled + policy (defense-in-depth, Worker gebruikt service_role)
-- ✅ ON DELETE CASCADE op zowel user_id als mini_app_id — favorieten ruimen
--    zichzelf automatisch op als de app of de gebruiker verwijderd wordt
-- ✅ UNIQUE (user_id, mini_app_id) — idempotent favoriet-markeren (upsert)
-- ============================================================================
