-- ============================================================================
-- Mini-Apps — Criteria-taken (5de generieke bouwblok)
-- ============================================================================
-- Migration: 2026-07-13
--
-- Doel: een mini-app moet een mail/chat-bericht kunnen versturen ZODRA een
-- voorwaarde in de eigen gedeelde opslag waar wordt (bv. "een
-- collection-item met status=nieuw", "een kv-waarde die vandaag betekent"),
-- OOK als niemand die dag de app opent. Dit is BEWUST een aparte tabel/cron/
-- API t.o.v. mini_app_scheduled_tasks (20260710200000): dat bouwblok stuurt
-- op een VAST TIJDSTIP/INTERVAL (pure datum-wiskunde, lib/scheduler.js);
-- dit bouwblok stuurt wanneer een DATA-VOORWAARDE overgaat van niet-waar naar
-- waar (edge-triggered), ongeacht het tijdstip. De twee mechanismes delen
-- geen code, geen tabel en geen cron-tak -- zie lib/condition-scheduler.js
-- en de aparte "*/5 * * * *"-trigger in wrangler.jsonc/src/index.js.
--
-- Veiligheidsprincipe (zelfde lijn als notify/chat/scheduled-tasks): we
-- voeren NOOIT de HTML/JS van de mini-app zelf onbemand uit (geen headless
-- browser, geen eval van app-code op de server). Een criteria-taak slaat een
-- DECLARATIEVE voorwaarde op (pure data-vergelijking, zie lib/condition-
-- scheduler.js: kv-waarde gelijk aan iets, of minstens één collection-item
-- met een veld gelijk aan iets) + een tekst-template die enkel met data uit
-- de eigen gedeelde opslag ingevuld wordt via een logic-less renderer (geen
-- eval/Function-constructor).
--
-- Edge-triggered dedup: last_condition_met onthoudt of de voorwaarde de
-- VORIGE cron-tick al waar was. Enkel een overgang false -> true triggert
-- een send -- zo blijft de app niet elke 5 min hetzelfde bericht spammen
-- zolang de voorwaarde waar blijft.
--
-- target_type/delivery_method-combinatie wordt dubbel afgedwongen: hier via
-- een CHECK-constraint (DB-niveau), en in routes.js/condition-scheduler.js
-- (app-niveau) -- zelfde "defense in depth" als bij mini_app_scheduled_tasks.
-- ============================================================================

-- ─── Tabel: taakdefinities ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mini_app_condition_tasks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mini_app_id        UUID NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               VARCHAR NOT NULL,
  is_active          BOOLEAN NOT NULL DEFAULT true,

  -- Pure data-vergelijking, geëvalueerd door lib/condition-scheduler.js --
  -- geen expressie-taal, geen eval. Vorm:
  --   { source: 'kv', key: string, equals?: string, notEquals?: string }
  --   { source: 'collection', collection: string, field: string,
  --     equals?: string, notEquals?: string }
  -- equals/notEquals mogen {{today}}/{{weekday}}/{{weekdayName}}/{{isoWeek}}/
  -- {{isoYear}} bevatten (server-berekende dag-context, Europe/Brussels,
  -- ingevuld vlak vóór de vergelijking -- zie resolveBuiltinRefs()).
  criteria           JSONB NOT NULL,

  -- Edge-triggering: enkel een overgang false -> true stuurt een bericht.
  last_condition_met BOOLEAN NOT NULL DEFAULT false,
  last_checked_at    TIMESTAMPTZ,
  last_triggered_at  TIMESTAMPTZ,

  delivery_method    VARCHAR NOT NULL,
  target_type        VARCHAR NOT NULL,
  target_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  target_channel_id  UUID REFERENCES mini_app_chat_channels(id) ON DELETE SET NULL,

  -- subject_template mag NULL zijn bij delivery_method='chat' (chat heeft geen onderwerp).
  subject_template   TEXT,
  message_template   TEXT NOT NULL,

  last_run_at        TIMESTAMPTZ,
  last_run_status    VARCHAR,
  last_run_error     TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_condition_tasks
  ADD CONSTRAINT mini_app_condition_tasks_delivery_method_check
  CHECK (delivery_method IN ('mail', 'chat'));

ALTER TABLE mini_app_condition_tasks
  ADD CONSTRAINT mini_app_condition_tasks_target_type_check
  CHECK (target_type IN ('self', 'colleague', 'channel'));

-- Combinatie target_type <-> delivery_method <-> welke target-kolom gevuld is.
-- Zelfde "defense in depth"-rol als bij mini_app_scheduled_tasks: zelfs als
-- routes.js/condition-scheduler.js ooit een bug heeft, kan de DB geen
-- inconsistente rij bevatten (bv. een 'chat'-taak die naar een user_id
-- target wijst).
ALTER TABLE mini_app_condition_tasks
  ADD CONSTRAINT mini_app_condition_tasks_target_consistency_check
  CHECK (
    (target_type = 'self'      AND delivery_method = 'mail' AND target_user_id IS NULL     AND target_channel_id IS NULL)
    OR (target_type = 'colleague' AND delivery_method = 'mail' AND target_user_id IS NOT NULL AND target_channel_id IS NULL)
    OR (target_type = 'channel'   AND delivery_method = 'chat' AND target_channel_id IS NOT NULL AND target_user_id IS NULL)
  );

ALTER TABLE mini_app_condition_tasks
  ADD CONSTRAINT mini_app_condition_tasks_last_run_status_check
  CHECK (last_run_status IS NULL OR last_run_status IN ('sent', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_mini_app_condition_tasks_app
  ON mini_app_condition_tasks(mini_app_id);

-- Kernindex voor de 5-min cron: "welke actieve criteria-taken bestaan er?"
-- (geen next_run_at zoals bij scheduled_tasks -- ELKE actieve taak wordt
-- ELKE tick geëvalueerd, want de trigger is een databeslissing, geen tijd).
CREATE INDEX IF NOT EXISTS idx_mini_app_condition_tasks_active
  ON mini_app_condition_tasks(is_active)
  WHERE is_active = true;

-- ─── Trigger: updated_at (zelfde patroon als mini_apps/mini_app_scheduled_tasks) ──

CREATE OR REPLACE FUNCTION mini_app_condition_tasks_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mini_app_condition_tasks_updated_at ON mini_app_condition_tasks;
CREATE TRIGGER trg_mini_app_condition_tasks_updated_at
  BEFORE UPDATE ON mini_app_condition_tasks
  FOR EACH ROW
  EXECUTE FUNCTION mini_app_condition_tasks_set_updated_at();

-- ─── Tabel: audit-log per cron-run (zelfde rol als mini_app_scheduled_task_log) ──

CREATE TABLE IF NOT EXISTS mini_app_condition_task_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_task_id   UUID NOT NULL REFERENCES mini_app_condition_tasks(id) ON DELETE CASCADE,
  mini_app_id         UUID NOT NULL REFERENCES mini_apps(id) ON DELETE CASCADE,
  created_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status              VARCHAR NOT NULL,
  error_message       TEXT,
  rendered_preview    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_condition_task_log
  ADD CONSTRAINT mini_app_condition_task_log_status_check
  CHECK (status IN ('sent', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_mini_app_condition_task_log_task
  ON mini_app_condition_task_log(condition_task_id, created_at);

-- ─── RLS (defense-in-depth -- de Worker gebruikt altijd de service_role-key
-- en bypassed RLS; echte autorisatie zit in routes.js/condition-scheduler.js) ──

ALTER TABLE mini_app_condition_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mini_app_condition_task_log ENABLE ROW LEVEL SECURITY;

-- Leesbaar voor iedereen (zelfde niveau als mini_app_scheduled_tasks) -- zo
-- kan een collega zien dat er al een criteria-taak bestaat vóór hij er zelf
-- een dubbele aanmaakt. Wie in de PRAKTIJK mag lezen (view-toegang tot de
-- app) wordt in routes.js afgedwongen, niet hier.
CREATE POLICY "mini_app_condition_tasks_read_all"
  ON mini_app_condition_tasks FOR SELECT
  TO public
  USING (true);

-- Geen INSERT/UPDATE/DELETE-policy voor 'public' -- enkel de service_role
-- (Worker) mag schrijven; routes.js beslist zelf wie (creator/owner) mag
-- aanmaken/bewerken/verwijderen.

-- Enkel zelf-inzage van het log (eigen taken).
CREATE POLICY "mini_app_condition_task_log_own_select"
  ON mini_app_condition_task_log FOR SELECT
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
-- ✅ CHECK op criteria-vorm gebeurt in code (JSONB is vrij van vorm in SQL),
--    maar target_type/delivery_method-consistentie is een DB-CHECK
-- ✅ ON DELETE CASCADE voor app/taak, ON DELETE SET NULL voor target_user_id/
--    target_channel_id (taak blijft bestaan maar wordt bij de volgende
--    cron-run als ongeldig gedetecteerd en overgeslagen, zie condition-scheduler.js)
-- ✅ Index op is_active (WHERE is_active) -- de cron-query blijft goedkoop
--    ook als het aantal taken groeit
-- ✅ Volledig gescheiden van mini_app_scheduled_tasks: eigen tabel, eigen
--    cron-tak (*/5 * * * *, event.cron-gate in src/index.js#scheduled()),
--    eigen lib-bestand (condition-scheduler.js) -- geen gedeelde code met
--    lib/scheduler.js, op expliciet verzoek (fixed-time en criteria-based
--    zijn twee aparte bouwblokken, geen uitbreiding van elkaar).
-- ============================================================================
