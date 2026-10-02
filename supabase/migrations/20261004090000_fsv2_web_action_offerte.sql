-- ============================================================================
-- Koppelingen: 'offerte' als soort actie voor Webgedrag
-- ============================================================================
-- Migration: 2026-10-02 (tijdstempel na 20261003120000, zodat `supabase db push`
-- ze zonder --include-all oppikt)
--
-- 'offerte' = een AANVRAAG die in Webgedrag apart zichtbaar is ("Offerte
-- aangevraagd"): ze telt mee in het kerncijfer Aanvraag, en heeft daarnaast een
-- eigen actie, filter en doel. Welke inzendingen een offerte zijn, wordt bij het
-- LEZEN bepaald (op de naam en de formulier-slug van de koppelingen met deze
-- waarde), dus het geldt ook voor wat al in D1 stond.
-- Zie conversieSoort() en offerteFormulieren() in src/lib/web-conversions.js.

ALTER TABLE fs_v2_integrations
  DROP CONSTRAINT IF EXISTS fs_v2_integrations_web_action_check;
ALTER TABLE fs_v2_integrations
  ADD CONSTRAINT fs_v2_integrations_web_action_check
  CHECK (web_action IS NULL OR web_action IN ('aanvraag', 'offerte', 'nieuwsbrief', 'academy', 'event', 'geen'));
