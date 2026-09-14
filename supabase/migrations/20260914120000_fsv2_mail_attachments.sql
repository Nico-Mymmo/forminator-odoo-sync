-- ─────────────────────────────────────────────────────────────────────────────
-- FSV2: bijlagen bij de send_mail-stap
--
-- Een stap verwijst naar BESTANDEN IN DE ASSET MANAGER (R2), niet naar bytes.
-- Dat is de hele reden dat dit zo gebouwd is: vervang je later de brochure in
-- de Asset Manager, dan dragen de volgende mails vanzelf de nieuwe versie --
-- er is niets in de koppeling dat bijgewerkt moet worden. Zou de stap de bytes
-- (of een Odoo-attachment-id) bewaren, dan was elke wijziging een ronde langs
-- elke koppeling die dat bestand gebruikt, en dat wordt vergeten.
--
-- WAAROM ER TOCH EEN CACHETABEL IS. Odoo wil de inhoud zelf hebben (base64 in
-- een ir.attachment); een mail kan niet naar R2 wijzen. Zonder cache maakt elke
-- indiening een nieuwe kopie van dezelfde PDF in Odoo -- bij een paar honderd
-- leads is dat honderden megabytes voor één bestand. De cache legt vast:
-- "deze R2-sleutel, met deze inhoud, is in Odoo attachment N", en alle mails
-- delen dat ene record.
--
-- DE SLEUTEL IS (r2_key, etag), NIET r2_key ALLEEN. De etag van R2 verandert
-- zodra de bytes veranderen. Een vervangen bestand krijgt dus vanzelf een
-- nieuwe cache-rij en een nieuw ir.attachment; de oude rij blijft staan omdat
-- reeds verzonden mails naar dat oude attachment wijzen en die geschiedenis
-- moet kloppen. Ware de sleutel alleen r2_key, dan zou een vervanging stil de
-- OUDE inhoud blijven meesturen -- precies de fout die dit ontwerp vermijdt.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS mail_attachments JSONB;

COMMENT ON COLUMN fs_v2_targets.mail_attachments
  IS 'Lijst van [{key, name}] -- key = R2-sleutel in de Asset Manager, name = de bestandsnaam die de ontvanger ziet. Bewust GEEN bytes, geen etag en geen Odoo-attachment-id: die worden bij het versturen vers opgehaald, zodat een vervangen bestand vanzelf meegaat.';

-- ─────────────────────────────────────────────────────────────────────────────
-- De cache: R2-inhoud → Odoo ir.attachment.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fs_v2_mail_attachment_cache (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  r2_key              text        NOT NULL,
  etag                text        NOT NULL,
  odoo_attachment_id  integer     NOT NULL,
  filename            text        NOT NULL,
  mimetype            text,
  bytes               integer,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE fs_v2_mail_attachment_cache
  IS 'Welke Odoo ir.attachment hoort bij welke versie van welk Asset-Manager-bestand. Puur een cache: een verdwenen rij kost een extra upload naar Odoo, geen datafout.';
COMMENT ON COLUMN fs_v2_mail_attachment_cache.etag
  IS 'R2-etag van de bytes op het moment van uploaden naar Odoo. Verandert de inhoud, dan komt er een nieuwe rij -- de oude blijft, want verzonden mails wijzen ernaar.';

CREATE UNIQUE INDEX IF NOT EXISTS fs_v2_mail_attachment_cache_key_etag_idx
  ON fs_v2_mail_attachment_cache (r2_key, etag);

-- ─────────────────────────────────────────────────────────────────────────────
-- Terugdraaien (handmatig, bewust niet automatisch):
--
--   DROP TABLE IF EXISTS fs_v2_mail_attachment_cache;
--   ALTER TABLE fs_v2_targets DROP COLUMN IF EXISTS mail_attachments;
--
-- Let op: de ir.attachment-records in Odoo blijven dan staan. Dat is de
-- bedoeling -- ze hangen aan verzonden mails.
-- ─────────────────────────────────────────────────────────────────────────────
