-- ============================================================================
-- models: base_fields kolom
-- ============================================================================
-- base_fields bevat de velden die altijd opgehaald worden voor een model,
-- ongeacht welke informatiecategorieën de gebruiker aanduidt.
-- Formaat: [{ "field": "won_status", "label": "Won status" }, ...]
-- ============================================================================

ALTER TABLE models
  ADD COLUMN IF NOT EXISTS base_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Seed bestaande modellen met hun huidige standaardvelden
UPDATE models SET base_fields = '[{"field":"x_name","label":"Naam"}]'::jsonb
  WHERE id = 'x_sales_action_sheet';

UPDATE models SET base_fields = '[{"field":"name","label":"Naam"},{"field":"won_status","label":"Won status"}]'::jsonb
  WHERE id = 'crm_lead';

UPDATE models SET base_fields = '[{"field":"x_name","label":"Naam"}]'::jsonb
  WHERE id = 'x_web_visitor';

UPDATE models SET base_fields = '[{"field":"x_name","label":"Naam"}]'::jsonb
  WHERE id = 'x_ad_touchpoint';
