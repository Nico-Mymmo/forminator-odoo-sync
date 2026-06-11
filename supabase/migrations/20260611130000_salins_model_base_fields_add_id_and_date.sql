-- ============================================================================
-- models.base_fields — id en create_date toevoegen aan alle modellen
-- ============================================================================
-- id en create_date zijn niet langer hardcoded in de wizard maar beheerbaar
-- via base_fields. We voegen ze prepend toe aan de bestaande base_fields.
-- ============================================================================

UPDATE models SET base_fields = (
  '[{"field":"id","label":"ID"},{"field":"create_date","label":"Datum"}]'::jsonb || base_fields
)
WHERE id = 'x_sales_action_sheet';

UPDATE models SET base_fields = (
  '[{"field":"id","label":"ID"},{"field":"create_date","label":"Datum"}]'::jsonb || base_fields
)
WHERE id = 'crm_lead';

UPDATE models SET base_fields = (
  '[{"field":"id","label":"ID"},{"field":"create_date","label":"Datum"}]'::jsonb || base_fields
)
WHERE id = 'x_web_visitor';

UPDATE models SET base_fields = (
  '[{"field":"id","label":"ID"},{"field":"create_date","label":"Datum"}]'::jsonb || base_fields
)
WHERE id = 'x_ad_touchpoint';
