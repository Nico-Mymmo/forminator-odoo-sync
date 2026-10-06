-- ============================================================================
-- Koppelingen: wat de botcontrole (Turnstile) tegenhield
-- ============================================================================
-- Migration: 2026-10-06
--
-- Met FORMS_TURNSTILE_MODE = "on" krijgt een inzending zonder (geldig) token
-- een 403, nog voor er een koppeling opgezocht wordt. Zonder deze tabel is ze
-- dan WEG: een echte bezoeker die ten onrechte geweigerd werd, kan je niet
-- terugvinden, en je kan niet nagaan of de controle te streng staat.
--
-- Hier komt elke geweigerde inzending terecht, met wat de bezoeker invulde.
-- In Koppelingen -> Instellingen -> Botcontrole kan je ze bekijken, negeren of
-- ALSNOG DOORLATEN: dan loopt ze door submitFormEntry(), exact zoals een
-- aanvaarde inzending, met meta_bot_check = 'vrijgegeven'.
--
--   status  open       nog niet bekeken
--           released   doorgelaten; submission_id wijst naar de inzending
--           dismissed  bekeken en genegeerd (spam)
--
-- body is GEFILTERD (forms/bot-rejections.js, compacteInzending()): enkel de
-- veldsleutels van het formulier en de gekende meta-sleutels, met een maximale
-- lengte. Een bot kan hier dus geen willekeurige JSON in kwijt.
--
-- Rijen ouder dan 30 dagen gaan weg in de 15-minutencron (index.js). Een
-- doorgelaten inzending staat dan al lang in fs_v2_submissions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS fs_v2_bot_rejections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id         uuid        REFERENCES fs_v2_forms(id) ON DELETE CASCADE,
  integration_id  uuid        REFERENCES fs_v2_integrations(id) ON DELETE CASCADE,
  form_slug       text        NOT NULL DEFAULT '',
  form_name       text        NOT NULL DEFAULT '',
  site            text,
  outcome         text        NOT NULL,
  codes           text[]      NOT NULL DEFAULT '{}',
  hostname        text,
  body            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status          text        NOT NULL DEFAULT 'open',
  handled_at      timestamptz,
  handled_by      text,
  submission_id   uuid        REFERENCES fs_v2_submissions(id) ON DELETE SET NULL,
  release_error   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fs_v2_bot_rejections_status_check
    CHECK (status IN ('open', 'released', 'dismissed'))
);

ALTER TABLE fs_v2_bot_rejections ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS fs_v2_bot_rejections_status_created_idx
  ON fs_v2_bot_rejections (status, created_at DESC);

CREATE INDEX IF NOT EXISTS fs_v2_bot_rejections_created_idx
  ON fs_v2_bot_rejections (created_at);
