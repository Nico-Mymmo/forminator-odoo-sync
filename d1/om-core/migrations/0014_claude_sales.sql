-- Claude voor sales (src/modules/claude-sales), 2026-10-23.
--
-- Een salesmedewerker voegt in claude.ai een eigen connector toe
-- (https://operations.openvme.be/mcp/sales) en meldt zich aan met zijn gewone
-- OM-login. Claude doet het lezen en samenvatten op het account van de
-- medewerker; de OM geeft enkel gegevens uit Odoo en schrijft weg wat de
-- medewerker bevestigde.
--
-- mcp_oauth_clients: wie zich bij ons registreerde (claude.ai doet dat zelf,
--   "dynamic client registration"). Enkel terugkeeradressen van claude.ai /
--   claude.com of de eigen computer zijn toegelaten.
-- mcp_oauth_codes: de code van een aanmelding die nog niet ingewisseld is
--   (5 minuten, een keer bruikbaar, enkel als hash bewaard).
-- mcp_oauth_tokens: een verbinding = een rij. Toegangs- en vernieuwingstoken
--   staan er enkel als SHA-256; bij elke vernieuwing komen er nieuwe in de
--   plaats. Intrekken = revoked_at zetten.
-- claude_sales_log: wat er via de connector gebeurde (opgezocht, bijgewerkt).

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  id                 TEXT PRIMARY KEY,
  name               TEXT,
  redirect_uris      JSON_TEXT NOT NULL,
  secret_hash        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
  code_hash          TEXT PRIMARY KEY,
  client_id          TEXT NOT NULL,
  user_id            TEXT NOT NULL,
  redirect_uri       TEXT NOT NULL,
  code_challenge     TEXT NOT NULL,
  resource           TEXT,
  used               BOOLEAN NOT NULL DEFAULT 0,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
  id                 TEXT PRIMARY KEY,
  client_id          TEXT NOT NULL,
  client_name        TEXT,
  user_id            TEXT NOT NULL,
  access_hash        TEXT NOT NULL UNIQUE,
  refresh_hash       TEXT NOT NULL UNIQUE,
  access_expires_at  TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  last_used_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_user ON mcp_oauth_tokens (user_id);

CREATE TABLE IF NOT EXISTS claude_sales_log (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  user_name          TEXT,
  tool               TEXT NOT NULL,
  gebouw_id          INTEGER,
  lead_id            INTEGER,
  samenvatting       TEXT,
  details            JSON_TEXT,
  ok                 BOOLEAN NOT NULL DEFAULT 1,
  ms                 INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS claude_sales_log_user ON claude_sales_log (user_id, created_at);
