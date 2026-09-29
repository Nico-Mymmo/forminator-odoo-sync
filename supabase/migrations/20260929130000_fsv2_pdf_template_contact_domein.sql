-- ============================================================================
-- Koppelingen — voorbeeldcontact in de pdf-sjablonen: @syndicoach.com → .be
-- ============================================================================
-- Datum: 2026-09-29
--
-- De seed (20260918120000_fsv2_pdf_templates.sql, uit public/offerte-data.js)
-- zette het voorbeeldcontact op jiri@syndicoach.com. Dat domein is niet van
-- ons; het juiste is syndicoach.be. Het stond zichtbaar op de offerte, en een
-- koppeling zonder eigen contactbron (pdf_contact_source leeg) nam het
-- sjablooncontact letterlijk over -- dus ook in verstuurde pdf's.
-- offerte-data.js is in dezelfde wijziging rechtgezet.
-- ============================================================================

UPDATE fs_v2_pdf_templates
SET data = jsonb_set(
      data,
      '{gegevens,contact,email}',
      to_jsonb(regexp_replace(data #>> '{gegevens,contact,email}', '@syndicoach\.com$', '@syndicoach.be', 'i'))
    ),
    updated_at = now()
WHERE data #>> '{gegevens,contact,email}' ~* '@syndicoach\.com$';
