-- ============================================================================
-- x_web_visitor: info set voor Timeline & KPI HTML
-- ============================================================================
-- x_web_visitor heeft twee pre-computed HTML velden in Odoo:
--   x_studio_visitor_timeline_html  — visuele tijdlijn van bezoekersactiviteit
--   x_studio_visitor_kpi_html       — KPI-weergave voor deze bezoeker
-- Analoog aan x_studio_merged_timeline_html / x_studio_merged_kpi_html op crm.lead.
-- ============================================================================

INSERT INTO information_sets (id, label, description, model, sort_order)
VALUES (
  'visitor_html',
  'Timeline & KPI',
  'Pre-computed HTML velden: bezoekerstijdlijn en KPI-blok (grote velden — standaard uit)',
  'x_web_visitor',
  80
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('visitor_html', 'x_studio_visitor_timeline_html', 'Timeline HTML',
   'Visuele tijdlijn van alle bezoekersactiviteit (groot HTML-veld, computed in Odoo)', 1),
  ('visitor_html', 'x_studio_visitor_kpi_html', 'KPI Blok HTML',
   'KPI-weergave voor deze bezoeker (groot HTML-veld, computed in Odoo)', 2)
ON CONFLICT (set_id, field_key) DO NOTHING;
