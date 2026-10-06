-- ============================================================================
-- Mini-Apps — geplande taken: een sleutel (ensure) en een verzendvoorwaarde (onlyIf)
-- ============================================================================
-- Migration: 2026-10-06
--
-- task_key: een sleutel die de app zelf kiest (bv. "dagelijkse-post:<kanaal-id>"),
-- uniek per app. Daarmee kan een app met window.platform.schedule.ensure(key,
-- config) zeggen "zo moet deze taak eruitzien": de server vergelijkt de HELE
-- instelling en werkt de taak ter plekke bij (zelfde id, zelfde historiek in
-- mini_app_scheduled_task_log). Aanleiding: Winkellijst vergeleek zelf enkel de
-- berichttekst, waardoor een oude recurrence ("elke dag") maanden bleef staan
-- en er elk weekend een post vertrok terwijl de app "ma-vr" toonde.
--
-- only_if: een verzendvoorwaarde, op het moment van versturen nagekeken tegen
-- de eigen opslag van de app (lib/scheduler.js#evaluateOnlyIf). Altijd een
-- lijst: [{ "collection": "...", "where": { ... } }] -- hetzelfde filter als
-- sharedStorage.listItems() (lib/storage-query.js). Niet voldaan = status
-- 'skipped' met de reden in last_run_error; die status bestond al.
--
-- Beide NULL voor bestaande taken: een migratie op zich verandert niets aan
-- wat er vertrekt.
-- ============================================================================

ALTER TABLE mini_app_scheduled_tasks
  ADD COLUMN IF NOT EXISTS task_key VARCHAR;

ALTER TABLE mini_app_scheduled_tasks
  ADD COLUMN IF NOT EXISTS only_if JSONB;

-- Uniek PER APP, en enkel voor taken met een sleutel (oude taken hebben er geen).
CREATE UNIQUE INDEX IF NOT EXISTS uq_mini_app_scheduled_tasks_app_key
  ON mini_app_scheduled_tasks (mini_app_id, task_key)
  WHERE task_key IS NOT NULL;

-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS
-- ✅ Geen nieuwe tabel; RLS op mini_app_scheduled_tasks staat al aan
-- ✅ Geen data gewijzigd
-- ============================================================================
