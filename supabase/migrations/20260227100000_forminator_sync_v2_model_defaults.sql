-- Forminator Sync V2 — per-model default field mapping definitions
-- Stores which Odoo fields appear as default rows in the wizard mapping step.
-- Empty array = fall back to the hardcoded ACTIONS.odooFields in the client.

CREATE TABLE IF NOT EXISTS fs_v2_model_defaults (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  odoo_model   text        NOT NULL UNIQUE,
  fields       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
