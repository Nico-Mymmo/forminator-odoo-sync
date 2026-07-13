-- ============================================================================
-- Mini-Apps — Notificaties (audit-log + rate-limit-basis)
-- ============================================================================
-- Migration: 2026-07-10
-- Mini-apps kunnen via window.platform.notify(to, subject, message) een mail
-- sturen naar zichzelf of een specifieke collega (zie
-- src/modules/mini-apps/lib/notify.js). Deze tabel is zowel het audit-log
-- (wie/wat/wanneer, ook bij een gefaalde send) als de basis voor de
-- rate-limit-tellingen (per app per dag, per app+ontvanger per dag).
--
-- In tegenstelling tot de shared storage (die naar R2 verhuisde, zie
-- 20260710160000_drop_mini_app_storage.sql) hoort DIT wel in Postgres: klein
-- volume, moet op tijdvenster + aggregatie gequeried worden (COUNT met
-- created_at >= x), en is metadata/log, geen bestandsinhoud.
--
-- RLS: de Worker gebruikt altijd de service_role-key (bypasst RLS) -- de
-- guardrails (ontvanger altijd via users-tabel resolven, nooit een vrij
-- e-mailadres van de client, lengte-caps, rate-limits) zitten in
-- src/modules/mini-apps/lib/notify.js. Deze policy is defense-in-depth EN
-- bewust read-only voor 'public': er is geen INSERT-policy, dus direct
-- databaseverkeer buiten de Worker om kan nooit een audit-rij vervalsen.
-- ============================================================================

-- ─── Tabel ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mini_app_notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mini_app_id       UUID NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
  sender_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_email   VARCHAR NOT NULL,
  subject           VARCHAR NOT NULL,
  status            VARCHAR NOT NULL,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_notifications
  ADD CONSTRAINT mini_app_notifications_status_check
  CHECK (status IN ('sent', 'failed'));

-- Voor de rate-limit-tellingen: "hoeveel in de laatste 24u voor deze app"
-- en "... voor deze app+ontvanger" -- allebei gefilterd op created_at.
CREATE INDEX IF NOT EXISTS idx_mini_app_notif_app
  ON mini_app_notifications(mini_app_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mini_app_notif_recipient
  ON mini_app_notifications(mini_app_id, recipient_user_id, created_at);

-- ─── RLS (defense-in-depth — zie opmerking bovenaan) ────────────────────────

ALTER TABLE mini_app_notifications ENABLE ROW LEVEL SECURITY;

-- Enkel zelf-inzage (verzonden door mij, of aan mij gericht). Bewust GEEN
-- INSERT/UPDATE/DELETE-policy: alleen de service_role (Worker) mag schrijven.
CREATE POLICY "mini_app_notifications_own_select"
  ON mini_app_notifications FOR SELECT
  TO public
  USING (auth.uid() = sender_user_id OR auth.uid() = recipient_user_id);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: IF NOT EXISTS
-- ✅ RLS enabled; enkel SELECT-policy (geen write-policy voor 'public' -- dat
--    is hier een bewuste extra afscherming van het audit-log, niet enkel het
--    gebruikelijke owner/shared-patroon)
-- ✅ ON DELETE CASCADE op app/sender/recipient -- logs ruimen zichzelf op
-- ✅ Indexen afgestemd op de exacte rate-limit-queries in lib/notify.js
-- ============================================================================
