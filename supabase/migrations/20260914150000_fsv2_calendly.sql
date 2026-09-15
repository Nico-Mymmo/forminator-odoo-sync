-- Koppelingen — Calendly als vierde bron (naast forminator, generic_webhook,
-- om_form en tracker). Vervangt de Zapier-koppeling die sinds 2026-07-24 stil ligt.
--
-- Twee dingen die deze migratie mogelijk maakt:
--
--  1. EEN GEDEELDE WEBHOOK-SUBSCRIPTION, meerdere koppelingen. Calendly kan een
--     subscription NIET filteren op eventtype -- de scope is enkel organization,
--     user of group (geverifieerd in hun OpenAPI-spec). Eén subscription per
--     koppeling zou dus betekenen dat elke koppeling ELKE boeking van de hele
--     organisatie binnenkrijgt. Daarom: één subscription voor de module
--     (fs_v2_calendly_subscriptions) en routering op
--     fs_v2_integrations.calendly_event_type_uri.
--
--  2. EEN VASTE EERSTE STAP. Een Calendly-koppeling synchroniseert altijd naar
--     x_calendlymeeting; dat is niet instelbaar. Die stap bestaat als echte
--     fs_v2_targets-rij (met is_system = true) en niet als code, zodat de
--     bestaande pipeline er ongewijzigd op draait: hij verschijnt in het
--     stappenoverzicht, in het spoor van een indiening, en een volgende stap kan
--     via previous_step_output aan het meeting-id. Een tweede uitvoeringspad
--     naast handleGenericWebhook() is precies wat hier niet mag ontstaan.

-- ── 1. Per-koppeling Calendly-instellingen ────────────────────────────────────
ALTER TABLE fs_v2_integrations
  ADD COLUMN IF NOT EXISTS calendly_event_type_uri     text    NULL,
  ADD COLUMN IF NOT EXISTS calendly_event_type_name    text    NULL,
  ADD COLUMN IF NOT EXISTS calendly_pooling_type       text    NULL,
  ADD COLUMN IF NOT EXISTS calendly_locale             text    NULL,
  ADD COLUMN IF NOT EXISTS calendly_odoo_event_type_id integer NULL;

COMMENT ON COLUMN fs_v2_integrations.calendly_event_type_uri IS
  'Calendly event type URI die deze koppeling opvangt. NULL = vangnet: alles waarvoor geen specifieke koppeling bestaat.';
COMMENT ON COLUMN fs_v2_integrations.calendly_event_type_name IS
  'Leesbare naam van het Calendly-eventtype, als kopie bewaard zodat het scherm iets kan tonen zonder Calendly te bevragen.';
COMMENT ON COLUMN fs_v2_integrations.calendly_pooling_type IS
  'round_robin / collective / multi_pool / NULL -- voedt x_studio_cm_isroundrobin op de meeting.';
COMMENT ON COLUMN fs_v2_integrations.calendly_locale IS
  'Taal van de Calendly-boekingspagina (en/fr/nl/...) -- voedt x_studio_form_language.';
COMMENT ON COLUMN fs_v2_integrations.calendly_odoo_event_type_id IS
  'Id uit x_calendlyeventtypes in Odoo (1 Partnership, 2 Ondersteuning, 3 Demo, 4 Anders). Bepaalt x_studio_cm_event_type.';

-- Snel de juiste koppeling vinden bij een binnenkomende boeking. Partieel: enkel
-- Calendly-koppelingen staan erin, de andere bronnen dragen deze index niet mee.
CREATE INDEX IF NOT EXISTS idx_fs_v2_integrations_calendly_event_type
  ON fs_v2_integrations (calendly_event_type_uri)
  WHERE source_type = 'calendly';

-- ── 2. Systeemstappen: aangemaakt door de OM, niet door de gebruiker ──────────
-- De routes weigeren wijzigen en verwijderen zodra deze vlag aan staat. Zonder
-- die vlag is een vaste stap niet van een gewone te onderscheiden en haalt de
-- eerste de beste opruimactie hem weg -- waarna er niets meer in Odoo belandt
-- en het scherm nog steeds "koppeling actief" zegt.
ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

ALTER TABLE fs_v2_resolvers
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN fs_v2_targets.is_system IS
  'true = door de OM aangemaakte vaste stap (Calendly). Niet bewerkbaar of verwijderbaar via de API.';
COMMENT ON COLUMN fs_v2_resolvers.is_system IS
  'true = door de OM aangemaakte vaste resolver (Calendly). Niet bewerkbaar of verwijderbaar via de API.';

-- ── 3. De gedeelde webhook-subscription ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS fs_v2_calendly_subscriptions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_uri  text        NOT NULL,
  subscription_uri  text        NOT NULL,
  signing_key       text        NOT NULL,
  events            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  scope             text        NOT NULL DEFAULT 'organization',
  callback_url      text        NOT NULL,
  state             text        NOT NULL DEFAULT 'active',
  created_by        text        NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  retired_at        timestamptz NULL
);

COMMENT ON TABLE fs_v2_calendly_subscriptions IS
  'De webhook-subscriptions die de OM bij Calendly heeft aangemeld. Meerdere rijen mogelijk: een oude blijft staan met state = retired zodat een laat binnenkomende bezorging nog geverifieerd kan worden.';
COMMENT ON COLUMN fs_v2_calendly_subscriptions.signing_key IS
  'Door de OM gegenereerd en bij het aanmelden aan Calendly meegegeven. Calendly ondertekent elke bezorging ermee (Calendly-Webhook-Signature: t=...,v1=HMAC-SHA256 over "t.rawbody").';

CREATE INDEX IF NOT EXISTS idx_fs_v2_calendly_subscriptions_state
  ON fs_v2_calendly_subscriptions (state, created_at DESC);

ALTER TABLE fs_v2_calendly_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fs_v2_calendly_subscriptions_select" ON fs_v2_calendly_subscriptions
  FOR SELECT TO authenticated USING (true);

-- ── 4. x_calendlymeeting als doelmodel ───────────────────────────────────────
-- Zonder deze rij weigert validateTargetPayload() het model ("Target model is
-- not allowed") en kan de vaste stap niet aangemaakt worden.
INSERT INTO fs_v2_odoo_models (name, label, icon, sort_order, identifier_type, update_policy, resolver_type, default_fields)
VALUES (
  'x_calendlymeeting',
  'Calendly-meeting',
  'calendar-clock',
  5,
  'mapped_fields',
  'upsert',
  NULL,
  '[
    {"name":"x_name",                      "label":"Naam meeting",   "required":true},
    {"name":"x_studio_cm_event_id",        "label":"Calendly-event-id", "required":true},
    {"name":"x_studio_cm_invitee",         "label":"Aanvrager",      "required":false},
    {"name":"x_studio_cm_host_name",       "label":"Host",           "required":false},
    {"name":"x_studio_cm_event_type",      "label":"Type",           "required":false},
    {"name":"x_studio_cm_start_time",      "label":"Start",          "required":false},
    {"name":"x_studio_cm_end_time",        "label":"Einde",          "required":false},
    {"name":"x_studio_cm_duration",        "label":"Duur (minuten)", "required":false},
    {"name":"x_studio_cm_join_link",       "label":"Join-link",      "required":false},
    {"name":"x_studio_cm_cancel_link",     "label":"Annuleer-link",  "required":false},
    {"name":"x_studio_cm_reschedule_link", "label":"Verplaats-link", "required":false},
    {"name":"x_studio_cm_extra_info",      "label":"Extra info",     "required":false},
    {"name":"x_studio_cm_iscancelled",     "label":"Geannuleerd",    "required":false},
    {"name":"x_studio_cm_cancel_reason",   "label":"Reden annulatie","required":false},
    {"name":"x_studio_cm_isroundrobin",    "label":"Round robin",    "required":false},
    {"name":"x_studio_form_language",      "label":"Taal",           "required":false}
  ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;
