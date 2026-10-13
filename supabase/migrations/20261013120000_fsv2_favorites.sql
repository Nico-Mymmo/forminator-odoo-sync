-- ============================================================================
-- Koppelingen — Favorieten
-- ============================================================================
-- Migration: 2026-10-13
-- Elke medewerker kan koppelingen als favoriet markeren om ze te volgen; de
-- lijst in Koppelingen heeft daarvoor een eigen tab "Favorieten".
--
-- Aparte join-tabel, zelfde patroon als mini_app_favorites: een favoriet is
-- per gebruiker, niet per koppeling.
--
-- RLS: de Worker gebruikt de service_role-key (bypasst RLS, zie
-- getSupabaseClient in src/lib/database.js); de rechtencontrole gebeurt in
-- src/modules/forminator-sync-v2/routes.js. De policy is defense-in-depth.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fs_v2_favorites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id  UUID NOT NULL REFERENCES fs_v2_integrations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, integration_id)
);

CREATE INDEX IF NOT EXISTS idx_fs_v2_favorites_user ON fs_v2_favorites(user_id);

ALTER TABLE fs_v2_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fs_v2_favorites_owner_only" ON fs_v2_favorites;
CREATE POLICY "fs_v2_favorites_owner_only"
  ON fs_v2_favorites FOR ALL
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: IF NOT EXISTS, DROP POLICY IF EXISTS
-- ✅ RLS enabled + policy (defense-in-depth, Worker gebruikt service_role)
-- ✅ ON DELETE CASCADE: favorieten ruimen zichzelf op met de koppeling of de gebruiker
-- ✅ UNIQUE (user_id, integration_id): idempotent markeren (upsert)
-- ============================================================================
