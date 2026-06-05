-- ============================================================================
-- Information Sets — add model context + crm.lead field groups
-- ============================================================================
-- Extends the information_sets/information_set_fields tables:
--   1. Add 'model' column to information_sets — links a set to an Odoo model
--   2. Add 'is_submodel_only' flag — set only appears as sub-level, not as
--      a top-level startpunt
--   3. Backfill existing sets with model = 'x_sales_action_sheet'
--   4. Seed crm.lead field groups (Time Flow, Origin & Marketing,
--      Business Signals, Web activiteit)
--
-- Hardcoded model relationships (in application code, not in DB):
--   x_sales_action_sheet  →  crm.lead  (two-phase enrichment via __leads)
--   crm.lead              →  (no submodel yet)
-- ============================================================================

-- ============================================================================
-- 1. Schema changes
-- ============================================================================

ALTER TABLE information_sets
  ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT 'x_sales_action_sheet',
  ADD COLUMN IF NOT EXISTS is_submodel_only BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast lookup by model
CREATE INDEX IF NOT EXISTS information_sets_model_idx
  ON information_sets (model)
  WHERE is_active = TRUE;

-- ============================================================================
-- 2. Backfill existing sets — all are for x_sales_action_sheet
-- ============================================================================

UPDATE information_sets
SET model = 'x_sales_action_sheet'
WHERE model = 'x_sales_action_sheet'; -- no-op, confirms default is correct

-- ============================================================================
-- 3. Seed crm.lead field groups
-- ============================================================================

INSERT INTO information_sets (id, label, description, model, is_submodel_only, sort_order) VALUES
  (
    'lead_time_flow',
    'Time Flow',
    'Tijdsgebonden velden op de lead: aanmaakdatum, laatste wijziging, openingsdatum en afsluitdatum. Geeft inzicht in de snelheid en doorlooptijd van het salesproces.',
    'crm.lead',
    FALSE,
    1
  ),
  (
    'lead_origin_marketing',
    'Origin & Marketing',
    'Herkomst en marketingattributie van de lead: bron, medium, campagne en verwijzing. Geeft inzicht in welk kanaal de lead heeft gegenereerd.',
    'crm.lead',
    FALSE,
    2
  ),
  (
    'lead_business_signals',
    'Business Signals',
    'Commerciële indicatoren op de lead: prioriteit, type, verwachte omzet en kans op afsluiting. Geeft inzicht in de kwaliteit en waarde van de lead.',
    'crm.lead',
    FALSE,
    3
  ),
  (
    'lead_web_activity',
    'Web activiteit',
    'Webbezoeker-informatie gekoppeld aan de lead: merkherkomst, KPI samenvatting en volledige bezoekers-timeline. Opgehaald via een tweede API call na de hoofdquery.',
    'crm.lead',
    FALSE,
    4
  );

-- lead_time_flow velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order) VALUES
  ('lead_time_flow', 'create_date',              'Aangemaakt op',       'Datum waarop de lead is aangemaakt in het CRM.',                                          1),
  ('lead_time_flow', 'write_date',               'Laatste wijziging',   'Datum van de laatste wijziging op de lead.',                                              2),
  ('lead_time_flow', 'date_open',                'Geopend op',          'Datum waarop de lead van prospect naar opportunity is gegaan.',                            3),
  ('lead_time_flow', 'date_closed',              'Afgesloten op',       'Datum waarop de lead gewonnen of verloren is.',                                            4),
  ('lead_time_flow', 'date_last_stage_update',   'Laatste stage update','Datum van de laatste statuswijziging.',                                                   5),
  ('lead_time_flow', 'day_open',                 'Dagen open',          'Aantal dagen dat de lead open stond voor omzetting naar opportunity.',                     6),
  ('lead_time_flow', 'day_close',                'Dagen tot afsluiting','Aantal dagen van aanmaak tot afsluiting (gewonnen of verloren).',                         7);

-- lead_origin_marketing velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order) VALUES
  ('lead_origin_marketing', 'source_id',   'Bron',      'Herkomstbron van de lead (bv. website, Google Ads, Meta).',                              1),
  ('lead_origin_marketing', 'medium_id',   'Medium',    'Marketingmedium van de lead (bv. email, cpc, organic).',                                 2),
  ('lead_origin_marketing', 'campaign_id', 'Campagne',  'Marketingcampagne waaraan de lead is toegeschreven.',                                    3),
  ('lead_origin_marketing', 'referred',    'Verwezen',  'Of de lead via een verwijzing van een bestaande klant of partner is binnengekomen.',      4);

-- lead_business_signals velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order) VALUES
  ('lead_business_signals', 'priority',          'Prioriteit',        'Prioriteitsniveau van de lead (0 = normaal, 1 = hoog).',                              1),
  ('lead_business_signals', 'type',              'Type',              'Lead of opportunity.',                                                                2),
  ('lead_business_signals', 'expected_revenue',  'Verwachte omzet',   'Geschatte omzet als de lead gewonnen wordt.',                                         3),
  ('lead_business_signals', 'probability',       'Kans op winning',   'Procentuele kans op afsluiting als gewonnen deal.',                                   4);

-- lead_web_activity velden
-- Note: these are fetched via a separate API call (not via Odoo search_read)
-- The field_key values correspond to the web-activity endpoint response fields.
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order) VALUES
  ('lead_web_activity', 'x_studio_brand_origin',          'Merkherkomst',  'Via welk kanaal of merk de lead voor het eerst op de website belandde (bv. directregistration, google-cpc, instagram).',  1),
  ('lead_web_activity', 'x_studio_merged_kpi_html',        'KPI blok',      'HTML blok met geaggregeerde bezoeksstatistieken: sessies, kanalen, top paginas en conversies.',                           2),
  ('lead_web_activity', 'x_studio_merged_timeline_html',   'Timeline',      'Volledige HTML timeline van alle websitebezoekers gekoppeld aan deze lead, gesorteerd op datum.',                        3);