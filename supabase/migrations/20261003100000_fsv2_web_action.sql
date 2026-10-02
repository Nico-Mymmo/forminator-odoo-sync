-- ============================================================================
-- Koppelingen: wat is een inzending van deze koppeling voor ACTIE op de website?
-- ============================================================================
-- Voedt Webgedrag en het dashboard: enkel een AANVRAAG is een conversie; de
-- andere soorten zijn eigen acties. Zie conversieSoort() in src/lib/web-conversions.js.
--
--   NULL         = automatisch, op de naam van de koppeling ("nieuwsbrief" ->
--                  nieuwsbrief, "academy"/"cursus" -> academy, Calendly en al de
--                  rest -> aanvraag). Zo verandert er niets voor bestaande koppelingen.
--   aanvraag     = contact, offerte, kennismaking, demo
--   nieuwsbrief  = inschrijving op een nieuwsbrief
--   academy      = inschrijving in de academy
--   event        = inschrijving voor een event
--   geen         = telt nergens als actie (de bezoeker wordt wel herkend)

ALTER TABLE fs_v2_integrations
  ADD COLUMN IF NOT EXISTS web_action text NULL;

ALTER TABLE fs_v2_integrations
  DROP CONSTRAINT IF EXISTS fs_v2_integrations_web_action_check;
ALTER TABLE fs_v2_integrations
  ADD CONSTRAINT fs_v2_integrations_web_action_check
  CHECK (web_action IS NULL OR web_action IN ('aanvraag', 'nieuwsbrief', 'academy', 'event', 'geen'));
