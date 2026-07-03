-- Add fixed_fields column to fs_v2_odoo_models
-- fixed_fields: [{ name, label, value }] — fields always written with a hardcoded value for this model

ALTER TABLE fs_v2_odoo_models
  ADD COLUMN IF NOT EXISTS fixed_fields JSONB NOT NULL DEFAULT '[]'::jsonb;
