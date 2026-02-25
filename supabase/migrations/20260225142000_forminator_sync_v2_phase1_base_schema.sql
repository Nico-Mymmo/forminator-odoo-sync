-- Forminator Sync V2 - Phase 1 Base Schema
-- Creates the 6 MVP tables in deterministic order.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fs_v2_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  forminator_form_id text NOT NULL,
  odoo_connection_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fs_v2_resolvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  resolver_type text NOT NULL,
  input_source_field text NOT NULL,
  create_if_missing boolean NOT NULL DEFAULT false,
  output_context_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  CONSTRAINT fk_fs_v2_resolvers_integration
    FOREIGN KEY (integration_id)
    REFERENCES fs_v2_integrations(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fs_v2_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  odoo_model text NOT NULL,
  identifier_type text NOT NULL,
  update_policy text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  CONSTRAINT fk_fs_v2_targets_integration
    FOREIGN KEY (integration_id)
    REFERENCES fs_v2_integrations(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fs_v2_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  odoo_field text NOT NULL,
  source_type text NOT NULL,
  source_value text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  CONSTRAINT fk_fs_v2_mappings_target
    FOREIGN KEY (target_id)
    REFERENCES fs_v2_targets(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fs_v2_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_fs_v2_submissions_integration
    FOREIGN KEY (integration_id)
    REFERENCES fs_v2_integrations(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fs_v2_submission_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL,
  target_id uuid NOT NULL,
  action_result text NOT NULL,
  odoo_record_id text,
  error_detail text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_fs_v2_submission_targets_submission
    FOREIGN KEY (submission_id)
    REFERENCES fs_v2_submissions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_fs_v2_submission_targets_target
    FOREIGN KEY (target_id)
    REFERENCES fs_v2_targets(id)
    ON DELETE CASCADE
);

-- Minimal indices needed by MVP access paths
CREATE INDEX IF NOT EXISTS idx_fs_v2_integrations_form_active
  ON fs_v2_integrations (forminator_form_id, is_active);

CREATE INDEX IF NOT EXISTS idx_fs_v2_resolvers_integration_order
  ON fs_v2_resolvers (integration_id, order_index);

CREATE INDEX IF NOT EXISTS idx_fs_v2_targets_integration_order
  ON fs_v2_targets (integration_id, order_index);

CREATE INDEX IF NOT EXISTS idx_fs_v2_mappings_target_order
  ON fs_v2_mappings (target_id, order_index);

CREATE INDEX IF NOT EXISTS idx_fs_v2_submissions_integration_created
  ON fs_v2_submissions (integration_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fs_v2_submissions_idempotency
  ON fs_v2_submissions (integration_id, idempotency_key, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fs_v2_submissions_integration_idempotency
  ON fs_v2_submissions (integration_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_fs_v2_submission_targets_submission
  ON fs_v2_submission_targets (submission_id, processed_at);
