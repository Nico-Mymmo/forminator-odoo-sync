-- Forminator Sync V2 — proper table for model link registry
--
-- Replaces the sentinel-key hack where link data was stored as JSON
-- under '__model_links__' in fs_v2_model_defaults.
--
-- Each row = one directional many2one link between two Odoo models.
-- The chain-suggestion engine uses this to auto-discover the linking field
-- when building multi-step pipelines (e.g. crm.lead.partner_id → res.partner).

CREATE TABLE IF NOT EXISTS fs_v2_model_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_a     text        NOT NULL,   -- source model, e.g. 'crm.lead'
  model_b     text        NOT NULL,   -- target model, e.g. 'res.partner'
  link_field  text        NOT NULL,   -- many2one field on model_b pointing to model_a, e.g. 'partner_id'
  link_label  text        NOT NULL DEFAULT '',  -- human-readable field label
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fs_v2_model_links UNIQUE (model_a, model_b, link_field)
);

COMMENT ON TABLE  fs_v2_model_links            IS 'Registry of many2one relations between Odoo models, used for chain-suggestion in multi-step pipelines.';
COMMENT ON COLUMN fs_v2_model_links.model_a    IS 'Source Odoo model (the model whose field points to model_b)';
COMMENT ON COLUMN fs_v2_model_links.model_b    IS 'Target Odoo model (the model being pointed to)';
COMMENT ON COLUMN fs_v2_model_links.link_field IS 'Name of the many2one field on model_a that references model_b';
COMMENT ON COLUMN fs_v2_model_links.link_label IS 'Human-readable label for the linking field';
