-- =============================================================================
-- Dashboards — scope toevoegen aan dashboard_targets
-- =============================================================================
-- Vervolg op 20260908103000_dashboard_targets.sql, die al was uitgevoerd
-- vóór bleek dat een scope-kolom nodig is (anticipeert op de merk-brede
-- Alles/Syndicoach/OpenVME-toggle uit de referentie-mockup). Aparte
-- migratie i.p.v. de vorige te herschrijven, want die stond al toegepast.
--
-- Bestaande rijen krijgen scope = 'all' via de kolom-default -- dat is ook
-- exact wat ze impliciet al waren (er bestond nog geen onderscheid).
--
-- Idempotent by design (herhaald draaien mag geen fout geven).
-- =============================================================================

BEGIN;

ALTER TABLE dashboard_targets
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'all'; -- 'all' | 'syndicoach' | 'openvme'

ALTER TABLE dashboard_targets
  DROP CONSTRAINT IF EXISTS dashboard_targets_metric_period_month_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_targets_metric_scope_period_month_key'
  ) THEN
    ALTER TABLE dashboard_targets
      ADD CONSTRAINT dashboard_targets_metric_scope_period_month_key UNIQUE (metric, scope, period_month);
  END IF;
END $$;

DROP INDEX IF EXISTS idx_dashboard_targets_metric_month;

CREATE INDEX IF NOT EXISTS idx_dashboard_targets_metric_scope_month
  ON dashboard_targets(metric, scope, period_month);

COMMIT;

-- =============================================================================
-- END MIGRATION
-- =============================================================================
