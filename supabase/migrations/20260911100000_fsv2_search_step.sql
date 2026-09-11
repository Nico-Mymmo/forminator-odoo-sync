-- ─────────────────────────────────────────────────────────────────────────────
-- FSV2: search-stap — een record opzoeken op een ander model, niets schrijven
--
-- Nieuw stapgedrag `operation_type = 'search'` op fs_v2_targets. Configureerbare
-- vervanger van de oude hardcoded resolvers (partner_by_email,
-- webinar_by_external_id): dezelfde identifier-machinerie als upsert/update_only
-- (identifier_type = 'mapped_fields'), maar zonder create/write. Het gevonden
-- record komt beschikbaar als step.<order>.record_id voor een volgende stap
-- (previous_step_output) — zowel voorwaarts (many2one op een nieuwe stap) als
-- achterwaarts (identifier_type mapped_fields op 'id' van een vorige stap).
--
-- Zie prompt-zoek-stap.md voor de volledige onderbouwing.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS search_on_not_found text NOT NULL DEFAULT 'abort';

COMMENT ON COLUMN fs_v2_targets.search_on_not_found
  IS 'Gedrag van een search-stap als er geen record gevonden wordt: abort (stap faalt), skip_step (stap wordt overgeslagen, volgende stappen die ervan afhangen krijgen dependency_missing) of continue_empty (leeg resultaat, pipeline gaat door).';

-- Rollback:
-- ALTER TABLE fs_v2_targets
--   DROP COLUMN IF EXISTS search_on_not_found;
