-- ─────────────────────────────────────────────────────────────────────────────
-- FSV2: send_mail-stap — een gewone (niet-marketing) mail klaarzetten in Odoo
--
-- Nieuw stap-type `operation_type = 'send_mail'` op fs_v2_targets. De stap
-- rendert de blokken in de Worker en maakt een `mail.mail`-record aan met een
-- `scheduled_date`; Odoo's mailqueue (cron 3, elke minuut) verstuurt.
-- Idempotentie draait op een afgeleide message_id, niet op een vlag:
--   <kop{integrationId}-t{targetId}-sub{submissionId}@om.mymmo.com>
--
-- De vertraging is een INSTELLING per stap (mail_delay_minutes), geen constante
-- in de code. Verschillende copy/vertraging per antwoord vraagt geen nieuw
-- mechanisme: dat zijn twee send_mail-stappen met de bestaande
-- condition_field/condition_values erop.
--
-- Zie PROMPT-koppelingen-send-mail-stap.md voor de volledige onderbouwing.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS mail_subject_template   TEXT,
  ADD COLUMN IF NOT EXISTS mail_blocks             JSONB,
  ADD COLUMN IF NOT EXISTS mail_delay_minutes      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mail_recipient_source   TEXT,
  ADD COLUMN IF NOT EXISTS mail_res_id_source      TEXT,
  ADD COLUMN IF NOT EXISTS mail_from_source        TEXT NOT NULL DEFAULT 'record_user',
  ADD COLUMN IF NOT EXISTS mail_from_name          TEXT,
  ADD COLUMN IF NOT EXISTS mail_from_email         TEXT,
  ADD COLUMN IF NOT EXISTS mail_reply_to           TEXT,
  ADD COLUMN IF NOT EXISTS mail_server_id          INTEGER,
  ADD COLUMN IF NOT EXISTS mail_track_opens        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS mail_respect_blacklist  BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN fs_v2_targets.mail_subject_template
  IS 'Onderwerp met {{placeholder}}-tokens.';
COMMENT ON COLUMN fs_v2_targets.mail_blocks
  IS 'Blokkenarray (zelfde schema als de events-mailstudio), gerenderd door src/lib/mail/render-blocks.js.';
COMMENT ON COLUMN fs_v2_targets.mail_delay_minutes
  IS 'Vertraging in minuten tot scheduled_date. 0 = meteen. Instelbaar per stap in de UI.';
COMMENT ON COLUMN fs_v2_targets.mail_recipient_source
  IS 'Waar het e-mailadres uit komt: contextsleutel (bv. step.1.record_id) of formulierveld (bv. field.email-1).';
COMMENT ON COLUMN fs_v2_targets.mail_res_id_source
  IS 'Contextsleutel van het record waaraan de mail hangt (model + res_id), zodat hij in de chatter staat. Zelfde idee als activity_res_id_source.';
COMMENT ON COLUMN fs_v2_targets.mail_from_source
  IS 'record_user = eigenaar (user_id) van het doelrecord; fixed = mail_from_name/mail_from_email. Terugval bij record_user: eigenaar koppeling, dan het vaste adres.';
COMMENT ON COLUMN fs_v2_targets.mail_from_email
  IS 'Vast afzenderadres, en tegelijk de laatste terugval als record_user niets oplevert. Nooit leeg laten.';
COMMENT ON COLUMN fs_v2_targets.mail_server_id
  IS 'Odoo ir.mail_server. EXPLICIET zetten: de default (id 4) is de Postmark broadcast-stream, bedoeld voor nieuwsbrieven. Voor een persoonlijke mail hoort hier de transactional stream.';
COMMENT ON COLUMN fs_v2_targets.mail_track_opens
  IS 'Zet X-PM-TrackOpens in mail.mail.headers, naast X-PM-Metadata-om-mail voor de correlatie met de Postmark-webhook.';
COMMENT ON COLUMN fs_v2_targets.mail_respect_blacklist
  IS 'VERPLICHT aan houden: een rauw mail.mail-record respecteert mail.blacklist niet zelf, in tegenstelling tot marketing automation.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Postmark-events per verzonden mail (open/klik/bounce), via webhook.
-- Alle open-events worden bewaard, ook heropeningen; de open rate is het aantal
-- DISTINCT submissies met een open-event, gedeeld door de verzonden mails.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fs_v2_mail_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES fs_v2_integrations(id) ON DELETE CASCADE,
  target_id      uuid NULL REFERENCES fs_v2_targets(id) ON DELETE SET NULL,
  submission_id  uuid NULL,
  odoo_mail_id   integer NULL,
  event_type     text NOT NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  recipient      text,
  first_open     boolean,
  payload        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE fs_v2_mail_events
  IS 'Postmark-webhookevents voor send_mail-stappen. payload bewaart de ruwe body: velden die we vandaag niet gebruiken zijn morgen de reden dat we niet opnieuw moeten instrumenteren.';
COMMENT ON COLUMN fs_v2_mail_events.event_type
  IS 'delivery | open | click | bounce | spamcomplaint (kleine letters, zoals weggeschreven door de webhookroute).';
COMMENT ON COLUMN fs_v2_mail_events.first_open
  IS 'Postmark markeert de eerste open apart; latere opens van dezelfde mail komen hier als false binnen.';

CREATE INDEX IF NOT EXISTS idx_fs_v2_mail_events_integration
  ON fs_v2_mail_events (integration_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fs_v2_mail_events_submission
  ON fs_v2_mail_events (submission_id);
CREATE INDEX IF NOT EXISTS idx_fs_v2_mail_events_type
  ON fs_v2_mail_events (integration_id, event_type, occurred_at DESC);

-- Rollback:
-- DROP TABLE IF EXISTS fs_v2_mail_events;
-- ALTER TABLE fs_v2_targets
--   DROP COLUMN IF EXISTS mail_subject_template,
--   DROP COLUMN IF EXISTS mail_blocks,
--   DROP COLUMN IF EXISTS mail_delay_minutes,
--   DROP COLUMN IF EXISTS mail_recipient_source,
--   DROP COLUMN IF EXISTS mail_res_id_source,
--   DROP COLUMN IF EXISTS mail_from_source,
--   DROP COLUMN IF EXISTS mail_from_name,
--   DROP COLUMN IF EXISTS mail_from_email,
--   DROP COLUMN IF EXISTS mail_reply_to,
--   DROP COLUMN IF EXISTS mail_server_id,
--   DROP COLUMN IF EXISTS mail_track_opens,
--   DROP COLUMN IF EXISTS mail_respect_blacklist;
