-- Productfeatures: het logboek van wie wat aanpaste (2026-10-20).
-- Nieuwe tabel, dus in om-core (CLAUDE.md, "Supabase wordt uitgefaseerd").
--
-- Geen foreign key naar product_features: een weggehaalde feature houdt haar
-- logboek. Naam van de feature en van wie het deed staan er LEESBAAR in,
-- zodat een regel blijft kloppen als iemand vertrekt of een feature hernoemd
-- wordt. `changes` = [{ veld, label, van, naar }], al leesbaar gemaakt.

CREATE TABLE IF NOT EXISTS product_feature_changes (
  id            TEXT PRIMARY KEY,
  feature_id    TEXT NOT NULL,
  feature_name  TEXT NOT NULL DEFAULT '',
  action        TEXT NOT NULL CHECK (action IN ('aangemaakt', 'gewijzigd', 'volgorde', 'weggehaald')),
  changes       JSON_TEXT NOT NULL DEFAULT '[]',
  user_id       TEXT,
  user_name     TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_product_feature_changes_feature ON product_feature_changes (feature_id, created_at);
