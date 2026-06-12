-- =============================================================================
-- x_ad_touchpoint toevoegen als startmodel + can_be_submodel
-- x_web_visitor: can_be_submodel = true
-- =============================================================================

-- Ad Touchpoints: zet can_be_startpoint = true, can_be_submodel = true, base_fields en is_active
-- x_ad_touchpoint bestond al in de tabel — UPDATE in plaats van INSERT
UPDATE models
SET
  can_be_startpoint = true,
  can_be_submodel   = true,
  is_active         = true,
  base_fields       = '[{"field": "x_name", "label": "Naam"}, {"field": "x_studio_timestamp", "label": "Tijdstip"}, {"field": "x_studio_source", "label": "Bron"}, {"field": "x_studio_medium", "label": "Medium"}, {"field": "x_studio_campaign_name", "label": "Campagne"}]'
WHERE odoo_model = 'x_ad_touchpoint';

-- x_web_visitor: zet can_be_submodel = true zodat touchpoints hem als submodel kunnen hebben
UPDATE models
SET can_be_submodel = true
WHERE odoo_model = 'x_web_visitor';
