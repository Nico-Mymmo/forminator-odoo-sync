-- Sales Insight Explorer x mini-apps: delen gebeurt vanaf nu IN de bestaande
-- opslaan-flow van een zoekopdracht, niet meer via een apart beheerscherm en
-- niet meer als een aparte "mini-app-query".
--
-- Model na deze migratie:
--
--   saved_searches            = het ENIGE gebruikersgerichte object ("Mijn
--                               zoekopdrachten" in de wizard). Bewaren,
--                               bijwerken, verwijderen en delen gebeuren allemaal
--                               op deze rij.
--   sales_insight_queries     = afgeleid, technisch uitvoerartefact. Enkel de
--                               rij waarnaar saved_searches.mini_app_query_id
--                               verwijst is bereikbaar voor mini-apps. Ze wordt
--                               UITSLUITEND aangemaakt/bijgewerkt/verwijderd door
--                               lib/saved-search-sharing.js, in dezelfde actie
--                               als het opslaan van de zoekopdracht zelf.
--
-- Gevolg: wijzigt de gebruiker zijn zoekopdracht, dan wordt de afgeleide
-- query_definition in dezelfde request herschreven (mini-apps zien de wijziging
-- bij hun volgende runQuery-aanroep, zonder configuratie). Verwijdert hij de
-- zoekopdracht of vinkt hij "delen" uit, dan wordt de afgeleide rij verwijderd
-- en verdwijnt de mini-app-toegang automatisch mee.
--
-- ON DELETE SET NULL is bewust gekozen als vangnet: verdwijnt de afgeleide rij
-- ooit langs een andere weg (bv. de admin-only DELETE /api/sales-insights/query/:id
-- voor oude, losse rijen), dan blijft de zoekopdracht van de gebruiker bestaan en
-- staat ze simpelweg niet meer gedeeld.

ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS mini_app_query_id UUID
    REFERENCES sales_insight_queries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saved_searches_mini_app_query_id
  ON saved_searches(mini_app_query_id);

COMMENT ON COLUMN saved_searches.mini_app_query_id IS
  'Verwijzing naar de afgeleide sales_insight_queries-rij die mini-apps mogen uitvoeren. NULL = deze zoekopdracht is niet gedeeld met mini-apps. Enkel beheerd door lib/saved-search-sharing.js.';

-- Discovery-tokens: laten een AI-gesprek (buiten de browser om, dus zonder
-- sessie-cookie) de STRUCTUUR van gedeelde queries opvragen terwijl het een
-- mini-app bouwt of bijwerkt. Bewust dezelfde aanpak als de sessies in deze
-- repo (random token in de database, geen HMAC/JWT-secret): revoceerbaar,
-- auditeerbaar en zonder afhankelijkheid van een extra Worker-secret.
--
-- Deze tokens geven UITSLUITEND leestoegang tot de discovery-endpoints
-- (naam/omschrijving/base_model/veldnamen/parameters + een klein voorbeeld van
-- queries die op dat moment gedeeld zijn). Ze geven geen schrijftoegang, geen
-- toegang tot niet-gedeelde queries en zijn geen vervanging van de sessie die
-- een live mini-app gebruikt voor window.platform.odoo.runQuery().

CREATE TABLE IF NOT EXISTS mini_app_discovery_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mini_app_discovery_tokens_token
  ON mini_app_discovery_tokens(token);

CREATE INDEX IF NOT EXISTS idx_mini_app_discovery_tokens_expires_at
  ON mini_app_discovery_tokens(expires_at);

COMMENT ON TABLE mini_app_discovery_tokens IS
  'Kortlevende, read-only tokens waarmee een AI-gesprek de structuur van met mini-apps gedeelde Sales Insight Explorer-queries kan opvragen zonder sessie-cookie. Zie src/modules/sales-insight-explorer/lib/mini-app-discovery.js.';
