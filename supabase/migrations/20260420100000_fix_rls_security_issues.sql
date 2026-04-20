-- ============================================================================
-- Fix RLS Security Issues
-- ============================================================================
-- 1. Enable RLS on fs_v2_* tables (global config tables, authenticated access)
-- 2. Enable RLS on claude_* tables (server-side only, block direct client access)
-- 3. Fix cx_activity_mapping_modify policy: remove user_metadata reference
-- ============================================================================

-- ============================================================================
-- 1. fs_v2_* tables — global config, accessed via service_role in Worker
--    Direct client access: read-only for authenticated users
-- ============================================================================

ALTER TABLE fs_v2_integrations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fs_v2_resolvers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fs_v2_targets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fs_v2_mappings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fs_v2_submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fs_v2_submission_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fs_v2_odoo_models       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fs_v2_model_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fs_v2_field_transforms  ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read (Worker uses service_role for writes)
CREATE POLICY "fs_v2_integrations_select"       ON fs_v2_integrations       FOR SELECT TO authenticated USING (true);
CREATE POLICY "fs_v2_resolvers_select"          ON fs_v2_resolvers          FOR SELECT TO authenticated USING (true);
CREATE POLICY "fs_v2_targets_select"            ON fs_v2_targets            FOR SELECT TO authenticated USING (true);
CREATE POLICY "fs_v2_mappings_select"           ON fs_v2_mappings           FOR SELECT TO authenticated USING (true);
CREATE POLICY "fs_v2_submissions_select"        ON fs_v2_submissions        FOR SELECT TO authenticated USING (true);
CREATE POLICY "fs_v2_submission_targets_select" ON fs_v2_submission_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "fs_v2_odoo_models_select"        ON fs_v2_odoo_models        FOR SELECT TO authenticated USING (true);
CREATE POLICY "fs_v2_model_links_select"        ON fs_v2_model_links        FOR SELECT TO authenticated USING (true);
CREATE POLICY "fs_v2_field_transforms_select"   ON fs_v2_field_transforms   FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 2. claude_* tables — server-side only (API key auth via Worker)
--    No direct client access needed; service_role bypasses RLS
-- ============================================================================

ALTER TABLE claude_integrations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE claude_challenges         ENABLE ROW LEVEL SECURITY;
ALTER TABLE claude_tokens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE claude_audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE claude_dataset_templates  ENABLE ROW LEVEL SECURITY;

-- Users can only see their own integrations
CREATE POLICY "claude_integrations_select"      ON claude_integrations      FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "claude_dataset_templates_select" ON claude_dataset_templates FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- challenges, tokens, audit_log: server-side only — block all direct client access
-- (Worker uses service_role which bypasses RLS)
CREATE POLICY "claude_challenges_deny"  ON claude_challenges  FOR ALL TO authenticated USING (false);
CREATE POLICY "claude_tokens_deny"      ON claude_tokens      FOR ALL TO authenticated USING (false);
CREATE POLICY "claude_audit_log_deny"   ON claude_audit_log   FOR ALL TO authenticated USING (false);

-- ============================================================================
-- 3. Fix cx_activity_mapping_modify: remove user_metadata (editable by users)
--    Use only app_metadata (server-controlled) and top-level role claim
-- ============================================================================

DROP POLICY IF EXISTS "cx_activity_mapping_modify" ON cx_activity_mapping;

CREATE POLICY "cx_activity_mapping_modify"
  ON cx_activity_mapping FOR ALL
  TO public
  USING (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() ->> 'role',
      ''
    ) IN ('admin', 'cx_powerboard_manager')
  )
  WITH CHECK (
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() ->> 'role',
      ''
    ) IN ('admin', 'cx_powerboard_manager')
  );
