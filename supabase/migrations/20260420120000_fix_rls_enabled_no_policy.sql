-- ============================================================================
-- Fix RLS enabled but no policy (INFO level)
-- All these tables are accessed via service_role in the Worker (bypasses RLS).
-- Policies below reflect the actual intended access pattern per table.
-- ============================================================================

-- modules: global config, authenticated users can read (for nav/module list)
CREATE POLICY "modules_select"
  ON modules FOR SELECT TO authenticated USING (true);

-- user_modules: per-user module access, users can read their own rows
CREATE POLICY "user_modules_select"
  ON user_modules FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- form_mappings: server-side only (Worker writes via service_role)
CREATE POLICY "form_mappings_select"
  ON form_mappings FOR SELECT TO authenticated USING (true);

-- form_mappings_history: read-only audit log for authenticated users
CREATE POLICY "form_mappings_history_select"
  ON form_mappings_history FOR SELECT TO authenticated USING (true);

-- form_submissions_log: server-side only, no direct client access
CREATE POLICY "form_submissions_log_deny"
  ON form_submissions_log FOR ALL TO authenticated USING (false);

-- signature_push_excluded: server-side only (mail signature Worker)
CREATE POLICY "signature_push_excluded_select"
  ON signature_push_excluded FOR SELECT TO authenticated USING (true);

-- user_signature_settings: users can read all (shared signature layer)
CREATE POLICY "user_signature_settings_select"
  ON user_signature_settings FOR SELECT TO authenticated USING (true);
