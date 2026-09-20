-- FSV2: handtekening bij de send_mail-stap. Verwijst enkel naar een hr.employee
-- (vast of via een vorige stap, bv. een round-robin-mapping) -- de HTML zelf komt
-- er NIET in te staan. mail-step.js leest bij het versturen res.users.signature
-- van de gekoppelde Odoo-gebruiker: dat is exact de HTML die de mail-signature-
-- designer al compileert en naar Gmail EN Odoo pusht (zie
-- src/modules/mail-signature-designer/lib/odoo-signature.js), dus geen tweede
-- compiler en geen live Google-aanroep per verstuurde mail.

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS mail_signature_source        TEXT,
  ADD COLUMN IF NOT EXISTS mail_signature_employee_id   INTEGER,
  ADD COLUMN IF NOT EXISTS mail_signature_source_value  TEXT;
