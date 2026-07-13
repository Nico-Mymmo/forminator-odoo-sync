-- ============================================================================
-- Mini-Apps — Geplande taken (4de generieke bouwblok)
-- ============================================================================
-- Migration: 2026-07-10
--
-- Doel: een mini-app moet op een vast tijdstip/interval een mail of
-- chat-bericht kunnen versturen, OOK als niemand die dag de app opent (bv.
-- een dagelijkse 11u-post, of een wekelijkse herinnering). De bestaande
-- notify/chat-bouwblokken (mini_app_notifications, mini_app_chat_log) worden
-- enkel getriggerd terwijl een gebruiker de app open heeft -- dat volstaat
-- niet voor "onbemand versturen".
--
-- Veiligheidsprincipe (zelfde lijn als notify/chat): we voeren NOOIT de
-- HTML/JS van de mini-app zelf onbemand uit (geen headless browser, geen
-- eval van app-code op de server). In plaats daarvan slaat een taak een
-- DECLARATIEVE definitie op -- een recurrence-regel (pure datum-wiskunde,
-- zie lib/scheduler.js) + een tekst-template die enkel met data uit de
-- eigen gedeelde opslag (mini-apps-storage/, zie lib/storage.js) ingevuld
-- wordt via een logic-less renderer (geen eval/Function-constructor, enkel
-- {{kv.x}}/{{#each}}/{{#isEmpty}}/{{#notEmpty}}). De Worker-cron
-- (runDueScheduledTasks, elke 15 min) evalueert due taken en verstuurt via
-- de BESTAANDE notifyUser()/sendChannelMessage() -- dus dezelfde
-- ontvanger-herleiding, rate-limits en audit-log als bij een interactieve
-- send, enkel de trigger is nu tijd-gebaseerd i.p.v. een klik in de app.
--
-- target_type/delivery_method-combinatie wordt dubbel afgedwongen: hier via
-- een CHECK-constraint (DB-niveau), en in routes.js/scheduler.js (app-niveau)
-- -- zelfde "defense in depth" als de webhook_url-CHECK op chat-kanalen.
-- ============================================================================

-- ─── Tabel: taakdefinities ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mini_app_scheduled_tasks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mini_app_id        UUID NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               VARCHAR NOT NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,

  -- Pure datum-wiskunde, geëvalueerd door lib/scheduler.js -- geen cron-string,
  -- geen willekeurige expressie. Vorm: { frequency: 'daily'|'weekly'|'every_n_days',
  -- time: 'HH:mm', daysOfWeek?: number[] (0=zo..6=za, enkel bij 'weekly'),
  -- intervalDays?: number, anchorDate?: 'YYYY-MM-DD' (enkel bij 'every_n_days') }.
  -- Tijdzone is vast Europe/Brussels (zie scheduler.js) -- geen per-taak kolom,
  -- dit is een intern bedrijfsplatform met één relevante tijdzone.
  recurrence         JSONB NOT NULL,

  delivery_method    VARCHAR NOT NULL,
  target_type        VARCHAR NOT NULL,
  target_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  target_channel_id  UUID REFERENCES mini_app_chat_channels(id) ON DELETE SET NULL,

  -- subject_template mag NULL zijn bij delivery_method='chat' (chat heeft geen onderwerp).
  subject_template   TEXT,
  message_template   TEXT NOT NULL,

  next_run_at        TIMESTAMPTZ,
  last_run_at        TIMESTAMPTZ,
  last_run_status    VARCHAR,
  last_run_error     TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_scheduled_tasks
  ADD CONSTRAINT mini_app_scheduled_tasks_delivery_method_check
  CHECK (delivery_method IN ('mail', 'chat'));

ALTER TABLE mini_app_scheduled_tasks
  ADD CONSTRAINT mini_app_scheduled_tasks_target_type_check
  CHECK (target_type IN ('self', 'colleague', 'channel'));

-- Combinatie target_type <-> delivery_method <-> welke target-kolom gevuld is.
-- Zelfde "defense in depth"-rol als de webhook_url-CHECK op chat-kanalen: zelfs
-- als routes.js/scheduler.js ooit een bug heeft, kan de DB geen inconsistente
-- rij bevatten (bv. een 'chat'-taak die naar een user_id target wijst).
ALTER TABLE mini_app_scheduled_tasks
  ADD CONSTRAINT mini_app_scheduled_tasks_target_consistency_check
  CHECK (
    (target_type = 'self'      AND delivery_method = 'mail' AND target_user_id IS NULL     AND target_channel_id IS NULL)
    OR (target_type = 'colleague' AND delivery_method = 'mail' AND target_user_id IS NOT NULL AND target_channel_id IS NULL)
    OR (target_type = 'channel'   AND delivery_method = 'chat' AND target_channel_id IS NOT NULL AND target_user_id IS NULL)
  );

ALTER TABLE mini_app_scheduled_tasks
  ADD CONSTRAINT mini_app_scheduled_tasks_last_run_status_check
  CHECK (last_run_status IS NULL OR last_run_status IN ('sent', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_mini_app_scheduled_tasks_app
  ON mini_app_scheduled_tasks(mini_app_id);

-- Kernindex voor de cron: "welke actieve taken zijn due?"
CREATE INDEX IF NOT EXISTS idx_mini_app_scheduled_tasks_due
  ON mini_app_scheduled_tasks(next_run_at)
  WHERE is_active = true;

-- ─── Trigger: updated_at (zelfde patroon als mini_apps) ─────────────────────

CREATE OR REPLACE FUNCTION mini_app_scheduled_tasks_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mini_app_scheduled_tasks_updated_at ON mini_app_scheduled_tasks;
CREATE TRIGGER trg_mini_app_scheduled_tasks_updated_at
  BEFORE UPDATE ON mini_app_scheduled_tasks
  FOR EACH ROW
  EXECUTE FUNCTION mini_app_scheduled_tasks_set_updated_at();

-- ─── Tabel: audit-log per cron-run (zelfde rol als mini_app_notifications) ──

CREATE TABLE IF NOT EXISTS mini_app_scheduled_task_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_task_id   UUID NOT NULL REFERENCES mini_app_scheduled_tasks(id) ON DELETE CASCADE,
  mini_app_id         UUID NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
  created_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status              VARCHAR NOT NULL,
  error_message       TEXT,
  rendered_preview    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_scheduled_task_log
  ADD CONSTRAINT mini_app_scheduled_task_log_status_check
  CHECK (status IN ('sent', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_mini_app_scheduled_task_log_task
  ON mini_app_scheduled_task_log(scheduled_task_id, created_at);

-- ─── RLS (defense-in-depth -- de Worker gebruikt altijd de service_role-key
-- en bypassed RLS; echte autorisatie zit in routes.js/scheduler.js) ─────────

ALTER TABLE mini_app_scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mini_app_scheduled_task_log ENABLE ROW LEVEL SECURITY;

-- Leesbaar voor iedereen (zelfde niveau als de chat-kanalenlijst) -- zo kan
-- een collega zien dat er al een dagelijkse 11u-post bestaat vóór hij er
-- zelf een dubbele aanmaakt. Wie in de PRAKTIJK mag lezen (view-toegang tot
-- de app) wordt in routes.js afgedwongen, niet hier.
CREATE POLICY "mini_app_scheduled_tasks_read_all"
  ON mini_app_scheduled_tasks FOR SELECT
  TO public
  USING (true);

-- Geen INSERT/UPDATE/DELETE-policy voor 'public' -- enkel de service_role
-- (Worker) mag schrijven; routes.js beslist zelf wie (creator/owner) mag
-- aanmaken/bewerken/verwijderen.

-- Enkel zelf-inzage van het log (eigen taken).
CREATE POLICY "mini_app_scheduled_task_log_own_select"
  ON mini_app_scheduled_task_log FOR SELECT
  TO public
  USING (auth.uid() = created_by_user_id);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: IF NOT EXISTS + DROP TRIGGER IF EXISTS
-- ✅ RLS enabled; taken leesbaar voor iedereen (metadata, geen secrets --
--    webhook_url van een kanaal blijft in mini_app_chat_channels en wordt
--    hier enkel via id gerefereerd), log enkel zelf-inzage, geen write-policy
-- ✅ CHECK op recurrence-vorm gebeurt in code (JSONB is vrij van vorm in SQL),
--    maar target_type/delivery_method-consistentie is een DB-CHECK
-- ✅ ON DELETE CASCADE voor app/taak, ON DELETE SET NULL voor target_user_id/
--    target_channel_id (taak blijft bestaan maar wordt bij de volgende
--    cron-run als ongeldig gedetecteerd en overgeslagen, zie scheduler.js)
-- ✅ Index op next_run_at (WHERE is_active) -- de cron-query blijft goedkoop
--    ook als het aantal taken groeit
-- ============================================================================
