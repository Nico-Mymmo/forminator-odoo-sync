-- ─────────────────────────────────────────────────────────────────────────────
-- FSV2: send_mail — platte tekstmail als STANDAARD
--
-- Aanvulling op 20260908160000_fsv2_send_mail_step.sql. Apart bestand omdat de
-- vorige migratie mogelijk al uitgevoerd is; een migratie aanpassen die al
-- gelopen kan hebben, doen we niet.
--
-- WAAROM DIT ER IS. De eerste opzet ging uit van de blokkeneditor van de
-- events-mailstudio. Maar een blokkenmail heeft een achtergrondkleur, witte
-- kaarten, een hero en knoppen -- dat IS een marketingmail, ongeacht hoe je
-- hem noemt, en precies wat deze mail niet mag zijn. Een mail die persoonlijk
-- hoort te lezen, moet als platte tekst aankomen.
--
-- Vandaar twee standen, met `plain` als standaard:
--
--   plain   alinea's in het standaard lettertype, gewone blauwe links. Geen
--           tabellen, geen achtergrond, geen kaart, geen breedtebeperking,
--           geen logo, geen knoppen, geen voettekst. Gerenderd door
--           src/lib/mail/render-plain.js.
--   blocks  de bestaande opmaak uit src/lib/mail/render-blocks.js, voor als
--           er ooit tóch een opgemaakte mail uit een koppeling moet.
--
-- `mail_blocks` uit de vorige migratie blijft staan: die is de inhoud voor de
-- stand `blocks`. In de stand `plain` is `mail_body_html` de inhoud.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS mail_layout    TEXT NOT NULL DEFAULT 'plain',
  ADD COLUMN IF NOT EXISTS mail_body_html TEXT;

COMMENT ON COLUMN fs_v2_targets.mail_layout
  IS 'plain (standaard) = platte tekstmail uit mail_body_html; blocks = opgemaakte mail uit mail_blocks.';
COMMENT ON COLUMN fs_v2_targets.mail_body_html
  IS 'De tekst van een plain-mail: alinea''s met {{placeholder}}-tokens. Geen layout-HTML -- de renderer zet er alleen een lettertype-omhulsel om.';

-- Rollback:
-- ALTER TABLE fs_v2_targets
--   DROP COLUMN IF EXISTS mail_layout,
--   DROP COLUMN IF EXISTS mail_body_html;
