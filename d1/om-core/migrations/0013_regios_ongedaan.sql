-- Regio's: een wijziging in het logboek ongedaan kunnen maken (2026-10-22).
--
-- details: wat er precies veranderde, met de toestand ERVOOR, zodat het
--   teruggezet kan worden. Vorm (lib/store.js):
--   { postcodes: [{pc, van, naar}],      -- syndicoach-id's, null = vrij
--     namen: {id: naam},                 -- om het leesbaar te tonen
--     syndicoach_voor: {...} | null,     -- de rij voor de wijziging
--     syndicoach_na: {...} | null,       -- de rij erna
--     nieuwe_syndicoaches: [id],         -- bij een import aangemaakt
--     extra_postcode: {postcode, nis} }  -- met de hand toegevoegd
--   Regels van voor deze migratie hebben geen details: niet ongedaan te maken.
-- ongedaan_at/_door: wanneer en door wie deze regel ongedaan gemaakt werd.
-- ongedaan_van: bij een regel 'ongedaan', de regel die teruggezet werd.

ALTER TABLE regio_wijzigingen ADD COLUMN details JSON_TEXT;
ALTER TABLE regio_wijzigingen ADD COLUMN ongedaan_at TIMESTAMPTZ;
ALTER TABLE regio_wijzigingen ADD COLUMN ongedaan_door TEXT;
ALTER TABLE regio_wijzigingen ADD COLUMN ongedaan_van TEXT;
