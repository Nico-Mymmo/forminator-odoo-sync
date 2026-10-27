-- Regio's: per syndicoach het BIV-nummer en het adres. De offerte voor een
-- postcode van een externe syndicoach haalt ze hier op (pdf-step.js,
-- kiesVersie). Leeg = niet ingevuld; de offerte toont dan een leeg BIV-nummer.
ALTER TABLE regio_syndicoaches ADD COLUMN biv TEXT NOT NULL DEFAULT '';
ALTER TABLE regio_syndicoaches ADD COLUMN adres TEXT NOT NULL DEFAULT '';
