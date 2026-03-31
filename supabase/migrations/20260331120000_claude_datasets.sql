-- Claude Dataset Templates
-- Defines which Odoo data is fetched for Claude integrations.
-- Admins manage templates; users select one at integration creation time.

-- ─── 1. Dataset templates ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS claude_dataset_templates (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  description   TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  is_default    BOOLEAN     NOT NULL DEFAULT false,
  created_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- JSON array of model configurations, e.g.:
  -- [
  --   {
  --     "key": "primary",
  --     "odoo_model": "x_sales_action_sheet",
  --     "label": "Actiebladen",
  --     "relation_field": null,
  --     "via_primary_field": null,
  --     "fields": [
  --       { "odoo_name": "x_name", "alias": "Naam", "instruction": "", "enabled": true }
  --     ]
  --   }
  -- ]
  model_config  JSONB       NOT NULL DEFAULT '[]'::jsonb
);

-- Only one template may be the default at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_template
  ON claude_dataset_templates (is_default)
  WHERE is_default = true;

-- ─── 2. Link integrations to a template ───────────────────────────────────

ALTER TABLE claude_integrations
  ADD COLUMN IF NOT EXISTS dataset_template_id UUID
    REFERENCES claude_dataset_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_claude_integrations_template
  ON claude_integrations (dataset_template_id);

-- ─── 3. Drop scopes column (replaced by dataset_template_id) ─────────────
-- NOTE: keep the column for now so existing rows don't break;
-- application code no longer writes to it.  Remove manually after cutover.

-- ─── 4. Auto-update updated_at ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$;

CREATE TRIGGER trg_dataset_templates_updated_at
  BEFORE UPDATE ON claude_dataset_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
