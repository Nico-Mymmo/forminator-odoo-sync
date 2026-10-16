-- om-core: de opvolger van Supabase (docs/plan-supabase-uitfaseren.md).
--
-- Afspraken voor elke tabel die hierheen verhuist (src/lib/core-db.js rekent erop):
--   uuid         -> TEXT PRIMARY KEY   (core-db maakt een id als het ontbreekt)
--   timestamptz  -> TIMESTAMPTZ        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
--   jsonb, text[]-> JSON_TEXT          (core-db zet om naar/van object of lijst)
--   boolean      -> BOOLEAN            (0/1, core-db geeft true/false terug)
--   updated_at-trigger -> niet nodig: core-db zet updated_at bij update/upsert.
--   RLS          -> niet nodig: D1 is enkel bereikbaar via de Worker-binding.
--
-- Deze eerste migratie maakt enkel het logboek van de verhuis zelf: welke tabel
-- wanneer gekopieerd werd, met de telling ervoor en erna.

CREATE TABLE IF NOT EXISTS core_migratie_log (
  tabel          TEXT PRIMARY KEY,
  status         TEXT NOT NULL,                -- 'bezig' | 'gekopieerd' | 'live'
  rijen_bron     INTEGER,
  rijen_doel     INTEGER,
  laatste_cursor TEXT,                          -- om een onderbroken kopie te hervatten
  fout           TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
