-- Sales Insight Explorer: mini-apps sharing for saved queries
--
-- Adds the ability for an admin to mark a saved query as "gedeeld voor
-- mini-apps" so mini-apps (src/modules/mini-apps/) can read its results
-- read-only via src/modules/sales-insight-explorer/lib/mini-app-bridge.js.
--
-- - is_shared_mini_apps: admin-only toggle (default false). Only queries
--   with this flag set to true are exposed to mini-apps.
-- - mini_app_parameters: whitelist of runtime parameters a mini-app may
--   supply when running this query. Each entry describes a placeholder
--   (e.g. {{param.datum}}) that may appear inside a filter's `value` in
--   query_definition. Shape: [{ name, label, type, default }].

ALTER TABLE sales_insight_queries
  ADD COLUMN IF NOT EXISTS is_shared_mini_apps BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sales_insight_queries
  ADD COLUMN IF NOT EXISTS mini_app_parameters JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN sales_insight_queries.is_shared_mini_apps IS
  'Admin-only toggle. When true, this saved query is exposed read-only to mini-apps via lib/mini-app-bridge.js.';

COMMENT ON COLUMN sales_insight_queries.mini_app_parameters IS
  'Whitelist of runtime parameters a mini-app may supply, e.g. [{"name":"datum","label":"Datum","type":"string","default":null}]. Referenced in filters as {{param.NAAM}}.';
