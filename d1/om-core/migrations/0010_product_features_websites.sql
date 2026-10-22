-- Productfeatures op de websites (2026-10-22).
-- Nieuwe tabellen, dus in om-core (CLAUDE.md, "Supabase wordt uitgefaseerd").
--
-- product_feature_publicaties: de versie die op de sites staat. EEN rij per
-- feature (alle pagina's samen, beslissing Nico). `data` is de publieke vorm
-- (toPubliekeFeature() in lib/websites.js) zoals ze verstuurd werd; `hash`
-- vergelijkt die met de huidige feature om te zien of de sites achterlopen.
-- Geen foreign key: een weggehaalde feature blijft op de pagina staan tot
-- iemand het blok weghaalt.
--
-- product_feature_gebruik: op welke pagina's een feature staat. De plugin
-- meldt het zelf bij elke bewaring van een pagina en eens per dag volledig.

CREATE TABLE IF NOT EXISTS product_feature_publicaties (
  feature_id         TEXT PRIMARY KEY,
  data               JSON_TEXT NOT NULL DEFAULT '{}',
  hash               TEXT NOT NULL DEFAULT '',
  published_at       TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  published_by       TEXT,
  published_by_name  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS product_feature_gebruik (
  id          TEXT PRIMARY KEY,
  site        TEXT NOT NULL,
  post_id     INTEGER NOT NULL,
  feature_id  TEXT NOT NULL,
  url         TEXT NOT NULL DEFAULT '',
  titel       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'publish',
  seen_at     TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (site, post_id, feature_id)
);
CREATE INDEX IF NOT EXISTS idx_product_feature_gebruik_feature ON product_feature_gebruik (feature_id);
CREATE INDEX IF NOT EXISTS idx_product_feature_gebruik_site ON product_feature_gebruik (site, post_id);
