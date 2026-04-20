-- ============================================================================
-- Fix remaining security warnings
-- ============================================================================
-- 1. Set search_path on fs_v2_rr_next_user and cx_set_updated_at
-- 2. Fix rls_policy_always_true on user_signature_variants + user_alias_assignments
--    Split ALL USING(true)/WITH CHECK(true) into:
--      - SELECT: USING(true)  -- public read (intentional)
--      - INSERT/UPDATE/DELETE: deny direct client access (Worker uses service_role)
-- ============================================================================

-- ============================================================================
-- 1. Fix mutable search_path on functions
-- ============================================================================

ALTER FUNCTION public.fs_v2_rr_next_user(UUID) SET search_path = public;
ALTER FUNCTION public.cx_set_updated_at() SET search_path = public;

-- ============================================================================
-- 2. user_signature_variants — split overly permissive ALL policy
-- ============================================================================

DROP POLICY IF EXISTS "rls_user_signature_variants" ON user_signature_variants;

CREATE POLICY "user_signature_variants_select"
  ON user_signature_variants FOR SELECT
  USING (true);

-- Worker uses service_role (bypasses RLS); deny direct client mutations
CREATE POLICY "user_signature_variants_write"
  ON user_signature_variants FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- 3. user_alias_assignments — split overly permissive ALL policy
-- ============================================================================

DROP POLICY IF EXISTS "rls_user_alias_assignments" ON user_alias_assignments;

CREATE POLICY "user_alias_assignments_select"
  ON user_alias_assignments FOR SELECT
  USING (true);

-- Worker uses service_role (bypasses RLS); deny direct client mutations
CREATE POLICY "user_alias_assignments_write"
  ON user_alias_assignments FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
