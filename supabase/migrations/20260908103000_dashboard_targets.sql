-- =============================================================================
-- Dashboards — flexibele, per-maand instelbare targets
-- =============================================================================
-- De instroom-widget toont een "marketingbenchmark"-balk (huidig aantal
-- aanvragen t.o.v. een target). Die targets zijn geen Odoo-CRM-data maar
-- applicatie-configuratie die Nico zelf per maand wil kunnen aanpassen,
-- dus die horen in Supabase (zoals asset_manager_categories), niet in Odoo.
--
-- Eén rij per (metric, period_month) -- metric laat toe om later meer dan
-- enkel "leads_instroom" te targeten zonder een nieuwe tabel nodig te
-- hebben. period_month is altijd de 1e van de maand (bv. 2026-09-01) zodat
-- "de komende maanden instellen" een simpele lijst van rijen is.
--
-- Alle databasetoegang loopt via getSupabaseClient(env) (service_role,
-- bypasst RLS) -- zie src/lib/database.js. RLS + deny-all policy volgens
-- het vaste patroon uit 20260821120000_fix_rls_disabled_in_public.sql.
--
-- Idempotent by design.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS dashboard_targets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  metric        TEXT        NOT NULL DEFAULT 'leads_instroom',
  period_month  DATE        NOT NULL, -- altijd 1e van de maand
  target_value  INTEGER     NOT NULL CHECK (target_value >= 0),
  updated_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (metric, period_month)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_targets_metric_month
  ON dashboard_targets(metric, period_month);

ALTER TABLE dashboard_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dashboard_targets_deny_all" ON dashboard_targets;
CREATE POLICY "dashboard_targets_deny_all" ON dashboard_targets
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

COMMIT;

-- =============================================================================
-- END MIGRATION
-- =============================================================================
