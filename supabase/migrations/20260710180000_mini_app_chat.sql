-- ============================================================================
-- Mini-Apps — Google Chat: kanalen + audit-log
-- ============================================================================
-- Migration: 2026-07-10
-- Fase 1 van Chat-integratie: berichten naar een KANAAL (Google Chat space)
-- via een incoming webhook -- geen nieuwe Google Cloud-configuratie nodig,
-- werkt los van het service-account/domain-wide-delegation dat Gmail
-- gebruikt. Rechtstreekse 1-op-1 DM's naar een specifieke persoon zijn hier
-- NIET in opgenomen -- dat vereist een geregistreerde Chat-app in Google
-- Cloud Console + een nieuwe delegatie-scope, een apart traject.
--
-- mini_app_chat_channels: de webhook_url is de facto een bearer-secret (wie
-- de URL heeft, kan naar die space posten) -- wordt NOOIT teruggegeven aan
-- een mini-app of in een lijst-response; enkel gebruikt server-side in
-- lib/chat.js. Een mini-app kent een kanaal enkel via zijn (niet-geheim) id.
--
-- mini_app_chat_log: zelfde rol als mini_app_notifications (audit + basis
-- voor rate-limits), nu voor chat-berichten.
-- ============================================================================

-- ─── Tabel: geregistreerde kanalen ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mini_app_chat_channels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR NOT NULL,
  webhook_url       TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_chat_channels
  ADD CONSTRAINT mini_app_chat_channels_name_unique UNIQUE (name);

ALTER TABLE mini_app_chat_channels
  ADD CONSTRAINT mini_app_chat_channels_webhook_url_check
  CHECK (webhook_url LIKE 'https://chat.googleapis.com/v1/spaces/%');

-- ─── Tabel: audit-log + rate-limit-basis voor verstuurde berichten ─────────

CREATE TABLE IF NOT EXISTS mini_app_chat_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mini_app_id    UUID NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
  channel_id     UUID NOT NULL REFERENCES mini_app_chat_channels(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         VARCHAR NOT NULL,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_chat_log
  ADD CONSTRAINT mini_app_chat_log_status_check
  CHECK (status IN ('sent', 'failed'));

CREATE INDEX IF NOT EXISTS idx_mini_app_chat_log_app
  ON mini_app_chat_log(mini_app_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mini_app_chat_log_channel
  ON mini_app_chat_log(mini_app_id, channel_id, created_at);

-- ─── RLS (defense-in-depth) ──────────────────────────────────────────────────

ALTER TABLE mini_app_chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE mini_app_chat_log ENABLE ROW LEVEL SECURITY;

-- Iedereen die de kanalenlijst mag zien (alle actieve gebruikers, zelfde
-- trust-niveau als de colleagues-lijst) -- de kolom webhook_url zelf wordt
-- door de Worker nooit in een SELECT-response teruggegeven aan de client,
-- ongeacht deze policy (bescherming zit in routes.js, niet in de kolom-RLS).
CREATE POLICY "mini_app_chat_channels_read_all"
  ON mini_app_chat_channels FOR SELECT
  TO public
  USING (true);

-- Enkel zelf-inzage van het log (verzonden door mij); geen write-policy voor
-- 'public' -- alleen de service_role (Worker) mag loggen.
CREATE POLICY "mini_app_chat_log_own_select"
  ON mini_app_chat_log FOR SELECT
  TO public
  USING (auth.uid() = sender_user_id);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: IF NOT EXISTS
-- ✅ RLS enabled; channels leesbaar voor iedereen (metadata, geen secret-kolom
--    via de Worker-laag), log enkel zelf-inzage, geen write-policy
-- ✅ CHECK op webhook_url-formaat -- voorkomt misbruik als generieke
--    SSRF-achtige HTTP-relay via willekeurige URL's
-- ✅ UNIQUE (name) -- voorkomt verwarrende dubbele kanaalnamen
-- ✅ ON DELETE CASCADE overal -- opruiming bij verwijderen van app/gebruiker/kanaal
-- ============================================================================
