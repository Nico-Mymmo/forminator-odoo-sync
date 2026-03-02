-- Forminator Sync V2 — Pipeline Phase 1 (Addendum B, Fase 1)
-- Adds pipeline metadata to fs_v2_targets and fs_v2_submission_targets.
-- All new columns have defaults that map to current implicit behaviour.
-- Existing integrations are unaffected: upsert + allow_partial remain the default.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fs_v2_targets — pipeline metadata
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS label              text,
  ADD COLUMN IF NOT EXISTS operation_type    text NOT NULL DEFAULT 'upsert',
  ADD COLUMN IF NOT EXISTS error_strategy    text NOT NULL DEFAULT 'allow_partial',
  ADD COLUMN IF NOT EXISTS execution_order   integer;

-- Backfill execution_order from order_index for all existing rows.
-- After this, every existing target has execution_order = order_index.
UPDATE fs_v2_targets
SET execution_order = order_index
WHERE execution_order IS NULL;

-- Unique constraint: within one integration, execution_order must be unique.
-- This makes the pipeline order deterministic and prevents configuration errors.
-- Uses a partial unique index so that NULL values (transitional only) are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS ux_fs_v2_targets_integration_execution_order
  ON fs_v2_targets (integration_id, execution_order)
  WHERE execution_order IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fs_v2_submission_targets — step traceability
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fs_v2_submission_targets
  ADD COLUMN IF NOT EXISTS execution_order  integer,
  ADD COLUMN IF NOT EXISTS skipped_reason   text;

-- Index for efficient retry-context restoration queries
-- (fetch all results for a submission ordered by execution_order)
CREATE INDEX IF NOT EXISTS idx_fs_v2_submission_targets_execution_order
  ON fs_v2_submission_targets (submission_id, execution_order ASC NULLS LAST);
