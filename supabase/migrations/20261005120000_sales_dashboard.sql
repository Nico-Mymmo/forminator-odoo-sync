-- =============================================================================
-- Dashboards — Verkoop en Targets (vervangt Looker "Top KPIs" + Odoo-dashboard 19)
-- =============================================================================
-- Wat mensen in de OM INVOEREN staat hier; wat uit Odoo komt staat in D1
-- (om-sales, docs/ontwerp-om-verkoopdashboard.md). Vier dingen:
--
-- 1. dashboard_targets.target_value wordt een kommagetal: Expert-uren hebben
--    targets als 2,5 en 14,25 uur. De bestaande rijen (aanvragen, gehele
--    getallen) blijven ongewijzigd.
-- 2. dashboard_settings: kleine instellingen per sleutel (boekjaar, de
--    handmatige doelratio's van de omgekeerde funnel).
-- 3. sales_exclusions: wie of wat buiten de verkoopcijfers valt, MET reden.
--    Vervangt de lijst in odoo-proxy/src/lib/exceptions.json. Solvio stond
--    daar als "tijdelijk uitgesloten" en enkel in één endpoint; hier geldt het
--    overal, en het dashboard zegt altijd hoeveel er buiten valt.
-- 4. sales_planned_professionals: professionals met een afgesproken startdatum
--    die nog NIET in Odoo gefactureerd worden. Was de handmatige sheet
--    "Datacheck 26-04-09"; dit faseert zich uit zodra ze in Odoo staan.
--
-- De targets van het boekjaar sep 2026 - aug 2027 en de handmatige ratio's
-- worden overgenomen uit Odoo-dashboard 19 (tabblad Targets), zodat er niets
-- opnieuw ingetypt moet worden. ON CONFLICT DO NOTHING: wie ze intussen al in
-- de OM aanpaste, verliest niets.
--
-- RLS aan, geen policies: de Worker gebruikt de service-role-key.
-- Idempotent.
-- =============================================================================

BEGIN;

-- 1. Targets met decimalen ----------------------------------------------------
ALTER TABLE dashboard_targets
  ALTER COLUMN target_value TYPE NUMERIC(12,2) USING target_value::numeric;

-- 2. Instellingen ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dashboard_settings (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  updated_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO dashboard_settings (key, value) VALUES
  ('sales.fiscal_year_start_month', '9'::jsonb),
  ('targets.manual_ratios', '{
     "openvme":    {"mql_sql": 0.45, "sql_demo": 0.68, "demo_follow": 0.75, "follow_conv": 0.30, "conv_won": 0.89},
     "syndicoach": {"mql_sql": 0.67, "sql_demo": 0.63, "demo_follow": 0.74, "follow_conv": 0.23, "conv_won": 0.67}
   }'::jsonb),
  ('sales.switch_window_days', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Uitsluitingen --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_exclusions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT        NOT NULL CHECK (kind IN ('partner', 'order')),
  record_id   INTEGER     NOT NULL,          -- res.partner.id (commercial partner) of sale.order.id
  scope       TEXT        NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'transactional', 'subscriptions')),
  label       TEXT,                          -- naam zoals ze er stond, voor als het record later verdwijnt
  reason      TEXT        NOT NULL,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, record_id, scope)
);
ALTER TABLE sales_exclusions ENABLE ROW LEVEL SECURITY;

INSERT INTO sales_exclusions (kind, record_id, scope, label, reason) VALUES
  ('partner', 325, 'all', 'Solvio', 'Uit alle verkoopcijfers (Nico, 2026-10-05). Stond in odoo-proxy als "tijdelijk uitgesloten", maar enkel bij de professionele producten.'),
  ('order', 619, 'transactional', 'S00619 Perwijsveld', 'Overgenomen uit odoo-proxy: "zit er twee keer in" bij de transactionele producten.')
ON CONFLICT (kind, record_id, scope) DO NOTHING;

-- 4. Geplande professionals -----------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_planned_professionals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  start_month     DATE        NOT NULL,      -- 1e van de maand
  plots           INTEGER     NOT NULL DEFAULT 0 CHECK (plots >= 0),
  mrr             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (mrr >= 0),
  odoo_partner_id INTEGER,                   -- zodra gekend: dan verdwijnt de rij vanzelf als er een lopend abonnement is
  note            TEXT,
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sales_planned_professionals ENABLE ROW LEVEL SECURITY;

INSERT INTO sales_planned_professionals (name, start_month, plots, mrr, note)
SELECT * FROM (VALUES
  ('MCA Vlaanderen', DATE '2026-11-01', 37, 37.00, 'Uit sheet "Datacheck 26-04-09" (Looker, Top KPIs)'),
  ('Flash Invest bv', DATE '2026-11-01', 177, 177.00, 'Uit sheet "Datacheck 26-04-09" (Looker, Top KPIs)'),
  ('Chris D''Haese', DATE '2027-01-01', 225, 119.25, 'Uit sheet "Datacheck 26-04-09" (Looker, Top KPIs)')
) AS v(name, start_month, plots, mrr, note)
WHERE NOT EXISTS (SELECT 1 FROM sales_planned_professionals);

-- 5. Targets boekjaar 2026-2027 uit Odoo-dashboard 19 ---------------------------
INSERT INTO dashboard_targets (metric, scope, period_month, target_value)
SELECT m.metric, 'all', (DATE '2026-09-01' + (m.i || ' month')::interval)::date, m.v
FROM (VALUES
  ('assistant', 0, 10), ('assistant', 1, 10), ('assistant', 2, 10), ('assistant', 3, 12), ('assistant', 4, 15), ('assistant', 5, 18),
  ('assistant', 6, 21), ('assistant', 7, 24), ('assistant', 8, 27), ('assistant', 9, 30), ('assistant', 10, 33), ('assistant', 11, 36),
  ('opstarthulp', 0, 6), ('opstarthulp', 1, 6), ('opstarthulp', 2, 6), ('opstarthulp', 3, 8), ('opstarthulp', 4, 9), ('opstarthulp', 5, 11),
  ('opstarthulp', 6, 13), ('opstarthulp', 7, 15), ('opstarthulp', 8, 17), ('opstarthulp', 9, 18), ('opstarthulp', 10, 20), ('opstarthulp', 11, 22),
  ('expert_uren', 0, 2.5), ('expert_uren', 1, 5), ('expert_uren', 2, 7.5), ('expert_uren', 3, 10.5), ('expert_uren', 4, 14.25), ('expert_uren', 5, 18.75),
  ('expert_uren', 6, 24), ('expert_uren', 7, 30), ('expert_uren', 8, 36.75), ('expert_uren', 9, 44.25), ('expert_uren', 10, 52.5), ('expert_uren', 11, 61.5),
  ('captain', 0, 1), ('captain', 1, 2), ('captain', 2, 3), ('captain', 3, 3), ('captain', 4, 4), ('captain', 5, 5),
  ('captain', 6, 6), ('captain', 7, 6), ('captain', 8, 7), ('captain', 9, 8), ('captain', 10, 9), ('captain', 11, 9),
  ('prof_syndici', 0, 0), ('prof_syndici', 1, 0), ('prof_syndici', 2, 1), ('prof_syndici', 3, 1), ('prof_syndici', 4, 2), ('prof_syndici', 5, 2),
  ('prof_syndici', 6, 2), ('prof_syndici', 7, 3), ('prof_syndici', 8, 3), ('prof_syndici', 9, 3), ('prof_syndici', 10, 4), ('prof_syndici', 11, 4)
) AS m(metric, i, v)
ON CONFLICT (metric, scope, period_month) DO NOTHING;

COMMIT;

-- =============================================================================
-- END MIGRATION
-- =============================================================================
