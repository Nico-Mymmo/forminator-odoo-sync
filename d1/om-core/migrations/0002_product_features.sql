-- Productfeatures (src/modules/product-features), verhuisd uit Supabase.
-- Zelfde kolommen als supabase/migrations/20261016120200_product_features.sql,
-- met de type-afspraken uit 0001_init.sql. De rijen zelf komen via
-- Beheer -> Verhuis (src/lib/verhuis.js), niet uit een voorvulling hier: in
-- Supabase kan intussen al iets aangepast zijn.

CREATE TABLE IF NOT EXISTS product_features (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES product_features(id) ON DELETE SET NULL,
  code        TEXT NOT NULL UNIQUE,
  brand       TEXT NOT NULL DEFAULT 'openvme' CHECK (brand IN ('openvme', 'syndicoach')),
  position    INTEGER NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  eyebrow     TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  why         TEXT NOT NULL DEFAULT '',
  image_url   TEXT NOT NULL DEFAULT '',
  usps        JSON_TEXT NOT NULL DEFAULT '[]',
  url         TEXT NOT NULL DEFAULT '',
  category    TEXT CHECK (category IN ('technisch', 'communicatie', 'financieel', 'wettelijk')),
  benefits    JSON_TEXT NOT NULL DEFAULT '[]',
  audiences   JSON_TEXT NOT NULL DEFAULT '[]',
  plan        TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT 1,
  updated_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_product_features_parent ON product_features (parent_id, position);
