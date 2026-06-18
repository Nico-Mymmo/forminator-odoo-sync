-- ============================================================================
-- Verwijder ongeldige veldnamen (s_studio_ prefix) uit models.base_fields
-- ============================================================================
-- s_studio_support_user_id (en eventuele andere s_studio_ velden) zijn
-- verkeerd benoemd — Odoo Studio gebruikt altijd x_ als prefix.
-- Dit verwijdert ze uit de JSONB base_fields array.
-- ============================================================================

UPDATE models
SET base_fields = (
  SELECT COALESCE(jsonb_agg(elem ORDER BY elem->>'field'), '[]'::jsonb)
  FROM jsonb_array_elements(base_fields) AS elem
  WHERE elem->>'field' NOT LIKE 's_studio_%'
)
WHERE id = 'x_sales_action_sheet'
  AND base_fields @> '[{"field":"s_studio_support_user_id"}]'::jsonb;
