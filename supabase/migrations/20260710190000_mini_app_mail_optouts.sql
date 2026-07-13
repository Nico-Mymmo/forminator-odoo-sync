-- ============================================================================
-- Mini-Apps — Uitschrijven van persoonlijke mails, per app
-- ============================================================================
-- Migration: 2026-07-10
-- Elke gebruiker kan per mini-app aangeven dat hij geen automatische mails
-- (via window.platform.notify()) van die specifieke app meer wil ontvangen.
-- Zelfde patroon als mini_app_favorites: bestaan van een rij = de "aan"-staat
-- (hier: uitgeschreven), geen boolean-kolom nodig.
--
-- Geldt uniform, ook voor 'self' (notify("self", ...)) -- geen uitzondering
-- voor zelf-getriggerde sends, om de regel eenvoudig en voorspelbaar te
-- houden ("geen mails van deze app, punt" i.p.v. twee gedragingen door elkaar).
--
-- RLS: de Worker gebruikt altijd de service_role-key (bypasst RLS) -- de
-- guard zit in src/modules/mini-apps/lib/notify.js.
-- ============================================================================

CREATE TABLE IF NOT EXISTS mini_app_mail_optouts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mini_app_id  UUID NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mini_app_id)
);

CREATE INDEX IF NOT EXISTS idx_mini_app_mail_optouts_user ON mini_app_mail_optouts(user_id);
CREATE INDEX IF NOT EXISTS idx_mini_app_mail_optouts_app  ON mini_app_mail_optouts(mini_app_id);

-- Nieuwe 'skipped'-status voor het bestaande audit-log, naast 'sent'/'failed'
-- -- een overslagen mail door een opt-out is geen fout, geen retry-signaal.
ALTER TABLE mini_app_notifications DROP CONSTRAINT IF EXISTS mini_app_notifications_status_check;
ALTER TABLE mini_app_notifications
  ADD CONSTRAINT mini_app_notifications_status_check
  CHECK (status IN ('sent', 'failed', 'skipped'));

-- ─── RLS (defense-in-depth) ──────────────────────────────────────────────────

ALTER TABLE mini_app_mail_optouts ENABLE ROW LEVEL SECURITY;

-- Strikt persoonlijk: alleen de eigenaar van de opt-out-rij zelf mag hem
-- zien/aanmaken/verwijderen (net als mini_app_favorites).
CREATE POLICY "mini_app_mail_optouts_owner_only"
  ON mini_app_mail_optouts FOR ALL
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: IF NOT EXISTS, DROP CONSTRAINT IF EXISTS
-- ✅ RLS enabled + policy (defense-in-depth, Worker gebruikt service_role)
-- ✅ ON DELETE CASCADE op user_id/mini_app_id -- opt-outs ruimen zichzelf op
-- ✅ UNIQUE (user_id, mini_app_id) -- idempotent aan/uit-zetten (upsert)
-- ============================================================================
