-- Nieuwsbrieven: automatische lijsten krijgen een ondertitel en een filter op
-- bedrijfstype (2026-11-02).
--
--   omschrijving   de OM zet hem in Odoo in mailing.list.x_studio_description
--   bedrijfstypes  id's uit x_company_type (res.partner.x_studio_company_type
--                  van het BEDRIJF); 0 = bedrijven zonder type. NULL = alle.

ALTER TABLE nb_auto_lijsten ADD COLUMN omschrijving TEXT;
ALTER TABLE nb_auto_lijsten ADD COLUMN bedrijfstypes JSON_TEXT;

UPDATE nb_auto_lijsten
SET omschrijving = 'Contactpersonen onder bedrijven met status Free Trial of Inactive. Dagelijks bijgewerkt door de OM.'
WHERE id = 'freemium-gebruikers' AND omschrijving IS NULL;
