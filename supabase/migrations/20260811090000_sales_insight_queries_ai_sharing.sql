-- Sales Insight Explorer: separate "beschikbaar voor AI" flag for shared queries
--
-- Tot nu toe bepaalde is_shared_mini_apps (20260731200000) in z'n eentje of
-- een query zowel (a) uitvoerbaar was voor een LEVENDE mini-app
-- (lib/mini-app-bridge.js runSharedQuery) als (b) zichtbaar in de AI-discovery
-- die een los Claude-gesprek gebruikt om een NIEUWE mini-app te bouwen
-- (lib/mini-app-discovery.js). Dat is te grof: een query delen met mini-apps
-- betekent niet automatisch dat ze ook aan een extern AI-gesprek getoond mag
-- worden.
--
-- is_shared_ai splitst dat tweede stuk in een eigen vlag:
-- - is_shared_mini_apps: query is uitvoerbaar door een (al gebouwde) mini-app.
-- - is_shared_ai: query mag ook getoond worden in de AI-discovery (enkel
--   relevant als is_shared_mini_apps ook true is; zie mini-app-discovery.js).
--
-- Default false, ook voor rijen die nu al is_shared_mini_apps = true hebben --
-- bewuste keuze (geen automatische opt-in): bestaande gedeelde queries moeten
-- expliciet opnieuw aangevinkt worden voor AI-discovery.

ALTER TABLE sales_insight_queries
  ADD COLUMN IF NOT EXISTS is_shared_ai BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN sales_insight_queries.is_shared_ai IS
  'Admin-only toggle. Enkel relevant als is_shared_mini_apps = true: bepaalt of deze query ook zichtbaar is in de AI-discovery (lib/mini-app-discovery.js) voor het bouwen van nieuwe mini-apps. Default false -- geen automatische opt-in voor bestaand gedeelde queries.';
