-- Waarde->label-mapping voor Odoo selection-velden, eenmalig opgehaald via
-- fields_get() in de admin-tab "Categorieën" (zie routes.js#fetchFieldSelectionMap)
-- i.p.v. bij elke query opnieuw. cascade-executor.js#applySelectionMap() past
-- deze toe op elke query die het veld ophaalt. NULL = geen mapping ingesteld
-- (of het is geen selectieveld).
ALTER TABLE information_set_fields ADD COLUMN IF NOT EXISTS selection_map JSONB;

COMMENT ON COLUMN information_set_fields.selection_map IS
  'Waarde->label-mapping voor Odoo selection-velden (bv. {"1": "Ja", "0": "Nee", "9": "Onbekend"}), eenmalig opgehaald via fields_get(). NULL = geen mapping ingesteld.';
