-- Forminator Sync V2 — proper table for Odoo model registry
--
-- Replaces the sentinel-key hack where model metadata was stored as JSON
-- under '__odoo_models__' in fs_v2_model_defaults.
--
-- Each row = one Odoo model the admin wants available as a pipeline target.
-- sort_order controls the display sequence in the UI.

CREATE TABLE IF NOT EXISTS fs_v2_odoo_models (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,   -- technical name, e.g. 'res.partner'
  label       text        NOT NULL,          -- display name, e.g. 'Contact'
  icon        text        NOT NULL DEFAULT 'box',  -- lucide icon name
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  fs_v2_odoo_models             IS 'Odoo models available as sync targets in Forminator Sync V2 pipelines.';
COMMENT ON COLUMN fs_v2_odoo_models.name        IS 'Odoo technical model name (unique), e.g. res.partner';
COMMENT ON COLUMN fs_v2_odoo_models.label       IS 'Human-readable display label shown in the UI';
COMMENT ON COLUMN fs_v2_odoo_models.icon        IS 'Lucide icon name used in the UI';
COMMENT ON COLUMN fs_v2_odoo_models.sort_order  IS 'Display order in model pickers and tables';
