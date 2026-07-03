-- Decouple the internal identifier (name) from the actual Odoo model name.
-- 'name' remains the unique slug (e.g. "contact", "company", "crm.lead").
-- 'odoo_model' is the actual Odoo technical model (e.g. "res.partner").
-- When odoo_model IS NULL, fall back to name (full backward compatibility).

ALTER TABLE fs_v2_odoo_models
  ADD COLUMN IF NOT EXISTS odoo_model VARCHAR(255) DEFAULT NULL;
