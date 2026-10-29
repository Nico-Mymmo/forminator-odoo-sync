-- Straatnamen per postcode, voor het veld "Straat en huisnummer" van de
-- OM-formulieren (forms/straten.js). GEGENEREERD door
-- scripts/postcodes/build-straten.py uit FOD BOSA BeST Address (CC BY 4.0):
-- niets met de hand wijzigen, het script vervangt elke postcode volledig.
--
-- namen: lijst, de drukste straat eerst. Een straat met een naam is een tekst,
-- een meertalige straat {nl, fr} of {de, fr}.
CREATE TABLE IF NOT EXISTS straten (
  land       TEXT NOT NULL,
  postcode   TEXT NOT NULL,
  namen      JSON_TEXT NOT NULL,
  aantal     INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (land, postcode)
);
