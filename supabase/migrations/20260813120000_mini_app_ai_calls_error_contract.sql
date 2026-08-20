-- ============================================================================
-- Mini-Apps AI — foutcode, stop_reason, cache-tokens en duur in het audit-log
-- ============================================================================
-- Migration: 2026-08-13
-- Hoort bij de herziening van de AI-aanroep-architectuur (streaming + canoniek
-- foutcontract) -- zie ONTWERP-ai-aanroep-architectuur.md.
--
-- Waarom deze kolommen:
--
--  * error_code      Tot nu toe bewaarde het log enkel `status` ('ok'/'failed')
--                    en een vrije `error_message`-tekst. Daardoor was in het
--                    admin-usagerapport niet te zien WAAROM aanroepen mislukten:
--                    een rate-limit van Anthropic, onze eigen daglimiet, een
--                    afgekapt antwoord en een echte bug zagen er identiek uit.
--                    Dit is de stabiele code uit lib/ai-errors.js (AI_*).
--  * stop_reason     'end_turn' / 'max_tokens' / 'refusal' (Anthropic) of
--                    Gemini's finishReason. 'max_tokens' is het interessante
--                    geval: het antwoord was AFGEKAPT, wat vroeger stil door de
--                    zelfgeschreven NDJSON-parser heen glipte als "geldig".
--  * cache_*_tokens  Prompt-caching wordt door de providers apart gerapporteerd
--                    en is 10x goedkoper op een hit / 1,25x duurder op een write.
--                    Zonder deze kolommen kon estimated_cost_usd dat niet
--                    verrekenen (zie ai-pricing.js).
--  * duration_ms     Hoelang de aanroep werkelijk duurde. Dit is precies het
--                    getal dat ontbrak toen de clientside timeout-cap drie keer
--                    op gevoel opgetrokken werd (45s -> 180s -> 300s): met deze
--                    kolom is de vraag "hoe lang duren onze AI-aanroepen echt?"
--                    een query i.p.v. een gok.
--
-- Alle kolommen zijn nullable: bestaande rijen blijven geldig en het
-- admin-rapport moet ermee kunnen omgaan dat ze leeg zijn.
-- ============================================================================

ALTER TABLE mini_app_ai_calls
  ADD COLUMN IF NOT EXISTS error_code         VARCHAR,
  ADD COLUMN IF NOT EXISTS stop_reason        VARCHAR,
  ADD COLUMN IF NOT EXISTS cache_read_tokens  INTEGER,
  ADD COLUMN IF NOT EXISTS cache_write_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS duration_ms        INTEGER;

-- "Welke foutcodes komen er voor in de laatste N dagen" is de enige nieuwe
-- query-vorm; partieel op de mislukte rijen, want dat is een kleine minderheid
-- van de tabel.
CREATE INDEX IF NOT EXISTS idx_mini_app_ai_calls_error_code
  ON mini_app_ai_calls (error_code, created_at)
  WHERE error_code IS NOT NULL;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- ✅ Alle nieuwe kolommen nullable -- geen backfill nodig, oude rijen blijven geldig
-- ✅ Geen wijziging aan RLS (Worker schrijft met service_role, zie basis-migratie)
-- ✅ Geen prompt/antwoord-inhoud toegevoegd -- blijft een metadata-/kostenlog
-- ============================================================================
