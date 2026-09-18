-- ─────────────────────────────────────────────────────────────────────────────
-- FSV2: generate_pdf-stap — een pdf-document genereren en als ir.attachment
-- uploaden (bv. een offerte).
--
-- Nieuw stap-type `operation_type = 'generate_pdf'` op fs_v2_targets. De stap
-- vult het gekozen fs_v2_pdf_templates-sjabloon met gewone fs_v2_mappings-
-- rijen, haalt de contactpersoon uit hr.employee (vast of dynamisch uit een
-- vorige stap), rendert offerte.html via Cloudflare Browser Rendering en
-- uploadt het resultaat als ir.attachment.
--
-- pdf_contact_source is BEWUST nullable zonder default: een default 'fixed'
-- zonder pdf_contact_employee_id zou voor elke bestaande rij een ongeldige
-- combinatie zijn. NULL betekent "gebruik het contact uit het sjabloon zelf".
--
-- Idempotentie draait NIET op een vlag maar op een vaste marker in de
-- omschrijving van het aangemaakte ir.attachment
-- ("OM pdf-stap target:<id> submission:<id>"): een retry hergebruikt het
-- bestaande attachment i.p.v. een tweede pdf te maken.
--
-- Zie docs/plan-offerte-pdf-stap.md voor de volledige onderbouwing.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS pdf_template_id          UUID REFERENCES fs_v2_pdf_templates(id),
  ADD COLUMN IF NOT EXISTS pdf_res_id_source        TEXT,
  ADD COLUMN IF NOT EXISTS pdf_contact_source       TEXT,
  ADD COLUMN IF NOT EXISTS pdf_contact_employee_id  INTEGER,
  ADD COLUMN IF NOT EXISTS pdf_contact_source_value TEXT,
  ADD COLUMN IF NOT EXISTS pdf_filename_template    TEXT;

COMMENT ON COLUMN fs_v2_targets.pdf_template_id
  IS 'Welk fs_v2_pdf_templates-sjabloon deze stap rendert. Verplicht voor operation_type = generate_pdf.';
COMMENT ON COLUMN fs_v2_targets.pdf_res_id_source
  IS 'Contextsleutel van het record waaraan de pdf hangt (bv. step.2.record_id), zodat hij in de chatter van dat record staat. Leeg = geen res_model/res_id, zelfde als de gedeelde mailbijlagen. Zelfde idee als mail_res_id_source/activity_res_id_source.';
COMMENT ON COLUMN fs_v2_targets.pdf_contact_source
  IS 'fixed | dynamic | NULL. NULL = gebruik de contactpersoon uit het sjabloon zelf, zonder Odoo-opzoeking.';
COMMENT ON COLUMN fs_v2_targets.pdf_contact_employee_id
  IS 'hr.employee-id bij pdf_contact_source = fixed.';
COMMENT ON COLUMN fs_v2_targets.pdf_contact_source_value
  IS 'Contextsleutel die een hr.employee-id oplevert (bv. step.3.record_id) bij pdf_contact_source = dynamic.';
COMMENT ON COLUMN fs_v2_targets.pdf_filename_template
  IS 'Bestandsnaam met {{pad.naar.waarde}}-tokens uit de gevulde gegevens, bv. Offerte-{{offerte.nummer}}.pdf.';

-- mail_attachments (bestaat al sinds 20260914120000_fsv2_mail_attachments.sql)
-- krijgt met deze wijziging een tweede itemvorm naast de Asset Manager-
-- verwijzing: { type: 'pdf_step', targetId, name } verwijst naar het target-id
-- van een generate_pdf-stap in dezelfde koppeling, in plaats van naar een
-- R2-sleutel. Geen kolomwijziging nodig (blijft JSONB); enkel het commentaar
-- bijwerken.
COMMENT ON COLUMN fs_v2_targets.mail_attachments
  IS 'Lijst van bijlagen, twee vormen: { key, name } = statisch R2-bestand uit de Asset Manager; { type: "pdf_step", targetId, name } = de pdf die een generate_pdf-stap met dat target-id in dezelfde inzending genereert. Max 5 samen. Bewust GEEN bytes, geen etag en geen Odoo-attachment-id in de eerste vorm.';
