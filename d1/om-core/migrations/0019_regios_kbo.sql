-- Regio's: per syndicoach ook het ondernemingsnummer (KBO). Leeg = niet
-- ingevuld. Gaat mee naar de offerte als gegevens.syndicoach.kbo.
ALTER TABLE regio_syndicoaches ADD COLUMN kbo TEXT NOT NULL DEFAULT '';
