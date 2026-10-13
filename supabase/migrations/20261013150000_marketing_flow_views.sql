-- ============================================================================
-- Marketing: bewaarde weergaven van de padverkenner, met een mini-doel
-- ============================================================================
-- Migration: 2026-10-13
--
-- In het tabblad Marketing (Dashboards) kan je een weergave van "Hoe bezoekers
-- door de site gaan" bewaren: de filters links, de stand, het doel, de pagina of
-- actie in het midden en de vastgezette kaarten. Ze staan als blokjes boven
-- "Waar het stokt", met het aantal en de conversieratio (berekend in de
-- browser, over de gekozen periode).
--
-- Een weergave kan een MINI-DOEL dragen op die ratio ("van 7% naar 12%"):
-- target_pct = waar we naartoe willen, baseline_pct = de ratio op het moment
-- dat het doel gezet werd (het vertrekpunt).
--
-- Gedeeld met iedereen die Dashboards heeft: het is het werk van het team,
-- geen persoonlijke instelling. Zie src/modules/dashboards/lib/flow-views.js.
--
-- RLS aan zonder policies: de Worker gebruikt de service_role-key.
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_flow_views (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  state            JSONB NOT NULL,
  target_pct       NUMERIC,
  baseline_pct     NUMERIC,
  target_set_at    TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_email TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_flow_views_target CHECK (target_pct IS NULL OR (target_pct >= 0 AND target_pct <= 100)),
  CONSTRAINT marketing_flow_views_baseline CHECK (baseline_pct IS NULL OR (baseline_pct >= 0 AND baseline_pct <= 100))
);

ALTER TABLE marketing_flow_views ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
