-- Koppelingen, send_mail-stap: de naam die de ontvanger voor het adres ziet.
--
-- Een sjabloon met dezelfde placeholders als de mail, bv.
-- "{{sender.first_name}} van Syndicoach". {{sender.first_name}} komt uit
-- res.partner.x_studio_first_name van de afzender (terugval: eerste woord van
-- zijn naam). Leeg = de naam van de afzender zelf, dus bestaande stappen
-- veranderen niet.
ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS mail_from_display_name TEXT;

COMMENT ON COLUMN fs_v2_targets.mail_from_display_name
  IS 'Weergavenaam van de afzender, met placeholders ({{sender.first_name}}, {{sender.name}}). Leeg = de naam van de afzender.';
