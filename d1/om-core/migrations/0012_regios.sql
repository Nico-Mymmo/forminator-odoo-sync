-- Regio's (src/modules/regios): welke syndicoach werkt waar (2026-10-22).
-- Opvolger van de mini-app "Regio's" (0913f371-...), die alles als EEN
-- JSON-blob {postcode: syndicoachId} in haar gedeelde opslag bewaarde: wie
-- het laatst bewaarde, overschreef wat een ander intussen deed. Hier is elke
-- postcode een eigen rij, dus twee mensen die tegelijk werken raken elkaar niet.
--
-- regio_syndicoaches: de syndicoaches (partners die onze werkwijze toepassen),
--   met hun kleur op de kaart. Louter informatief: geen koppeling met Odoo.
--   De id's uit de mini-app blijven behouden bij de overname.
-- regio_postcodes: postcode -> syndicoach. De PRIMARY KEY op postcode IS de
--   regel "elke postcode hoort bij precies een syndicoach".
-- regio_extra_postcodes: postcodes die iemand met de hand aan een gemeente
--   (NIS-code) toevoegde, omdat de kaartdata ze niet kende.
-- regio_wijzigingen: wie wat veranderde (leesbaar, met de naam erin).
-- regio_meta: sleutel/waarde, o.a. wanneer de mini-app overgenomen werd.

CREATE TABLE IF NOT EXISTS regio_syndicoaches (
  id             TEXT PRIMARY KEY,
  naam           TEXT NOT NULL,
  kleur          TEXT NOT NULL DEFAULT '#3b82f6',
  position       INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS regio_postcodes (
  postcode       TEXT PRIMARY KEY,
  syndicoach_id  TEXT NOT NULL REFERENCES regio_syndicoaches(id) ON DELETE CASCADE,
  updated_by     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_regio_postcodes_syndicoach ON regio_postcodes (syndicoach_id);

CREATE TABLE IF NOT EXISTS regio_extra_postcodes (
  postcode       TEXT PRIMARY KEY,
  nis            TEXT NOT NULL,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS regio_wijzigingen (
  id             TEXT PRIMARY KEY,
  soort          TEXT NOT NULL,          -- 'toegewezen' | 'vrijgegeven' | 'syndicoach' | 'import' | 'overname'
  tekst          TEXT NOT NULL,
  aantal         INTEGER NOT NULL DEFAULT 0,
  user_id        TEXT,
  user_naam      TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_regio_wijzigingen_tijd ON regio_wijzigingen (created_at);

CREATE TABLE IF NOT EXISTS regio_meta (
  sleutel        TEXT PRIMARY KEY,
  waarde         JSON_TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
