-- ============================================================================
-- Mini-Apps — AI-aanroepen (audit-log + rate-limit-basis)
-- ============================================================================
-- Migration: 2026-07-14
-- Mini-apps kunnen via window.platform.ai.ask(prompt, {system}) server-side
-- een AI-model aanroepen (zie src/modules/mini-apps/lib/ai.js). Zelfde
-- ontwerp als mini_app_notifications/mini_app_chat_log: deze tabel is zowel
-- het audit-log (wie/wat/wanneer, ook bij een gefaalde aanroep) als de basis
-- voor de rate-limit-telling (per app per dag).
--
-- Bewust GEEN prompt/antwoord-tekst opgeslagen (enkel lengtes/tokencounts) --
-- dit is een audit/kosten-log, geen conversatie-archief, en voorkomt dat
-- mogelijk gevoelige mymmo-data dubbel bewaard wordt (naast de externe
-- AI-provider die de aanroep al verwerkte).
--
-- `provider`/`model` staan expliciet in de rij (i.p.v. altijd "gemini" aan te
-- nemen) omdat de provider bewust vervangbaar is (zie lib/ai.js — vandaag
-- Gemini via de gratis laag, later evt. Claude of een ander model) zonder dat
-- het audit-log/de rate-limit-logica hoeft te veranderen.
--
-- RLS: de Worker gebruikt altijd de service_role-key (bypasst RLS) -- er is
-- bewust GEEN INSERT-policy voor 'public', enkel SELECT van je eigen rijen.
-- ============================================================================

-- ─── Tabel ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mini_app_ai_calls (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mini_app_id    UUID NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider       VARCHAR NOT NULL,
  model          VARCHAR NOT NULL,
  prompt_chars   INTEGER NOT NULL DEFAULT 0,
  response_chars INTEGER NOT NULL DEFAULT 0,
  tokens_in      INTEGER,
  tokens_out     INTEGER,
  status         VARCHAR NOT NULL,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_ai_calls
  ADD CONSTRAINT mini_app_ai_calls_status_check
  CHECK (status IN ('ok', 'failed'));

-- Voor de rate-limit-telling: "hoeveel aanroepen in de laatste 24u voor deze app".
CREATE INDEX IF NOT EXISTS idx_mini_app_ai_calls_app
  ON mini_app_ai_calls(mini_app_id, created_at);

-- ─── RLS (defense-in-depth — zie opmerking bovenaan) ────────────────────────

ALTER TABLE mini_app_ai_calls ENABLE ROW LEVEL SECURITY;

-- Enkel zelf-inzage (eigen aanroepen). Bewust GEEN INSERT/UPDATE/DELETE-
-- policy: alleen de service_role (Worker) mag schrijven.
CREATE POLICY "mini_app_ai_calls_own_select"
  ON mini_app_ai_calls FOR SELECT
  TO public
  USING (auth.uid() = user_id);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: IF NOT EXISTS
-- ✅ RLS enabled; enkel SELECT-policy (geen write-policy voor 'public')
-- ✅ ON DELETE CASCADE op app/user -- logs ruimen zichzelf op
-- ✅ Index afgestemd op de exacte rate-limit-query in lib/ai.js
-- ✅ Geen prompt/antwoord-inhoud bewaard, enkel metadata (privacy/kosten-log)
-- ============================================================================
