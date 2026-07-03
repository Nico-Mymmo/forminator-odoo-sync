ALTER TABLE fs_v2_odoo_models
  ADD COLUMN IF NOT EXISTS hidden_odoo_fields JSONB NOT NULL DEFAULT '[]'::jsonb;
