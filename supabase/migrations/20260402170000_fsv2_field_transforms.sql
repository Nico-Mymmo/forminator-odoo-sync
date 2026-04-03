-- Field transforms: per-integration, per source field type override + value remapping
-- Used to coerce incoming webhook/form string values to the correct Odoo type.
CREATE TABLE IF NOT EXISTS fs_v2_field_transforms (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID        NOT NULL REFERENCES fs_v2_integrations(id) ON DELETE CASCADE,
  field_name     TEXT        NOT NULL,
  field_type     TEXT        NOT NULL DEFAULT 'text',  -- text | boolean | integer | float | selection | many2one
  value_map      JSONB       DEFAULT NULL,             -- for selection: {"bronewaarde": "doelwaarde"}
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(integration_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_fsv2_field_transforms_integration
  ON fs_v2_field_transforms(integration_id);
