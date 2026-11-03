-- Opvolging: een bericht in meerdere talen (2026-11-03).
--
-- Een bericht heeft EEN Nederlandse versie (onderwerp + tekst_html, zoals
-- voorheen) en per andere taal een vertaling in `vertalingen`:
--   {"fr": {"onderwerp": "...", "tekst_html": "..."}}
-- De taal van de contactpersoon in Odoo (res.partner.lang) kiest de versie.
-- Zelfde afspraak als bij de OM-formulieren: de standaardtaal staat NIET in de
-- vertalingen, die staat al in de gewone kolommen.
-- opv_berichten.taal (uit 0022) wordt niet meer gelezen.

ALTER TABLE opv_berichten ADD COLUMN vertalingen JSON_TEXT;
