-- ============================================================================
-- Sales Insight Admin role
-- ============================================================================
-- Adds the 'sales_insight_admin' sub-role for the Sales Insight Explorer.
-- Users with this role (or role='admin') can:
--   - Add new information set categories via the wizard UI
--   - Add new fields to existing categories
--   - (future) Edit/deactivate categories and fields
--
-- The users.role column is an unconstrained VARCHAR.
-- To grant this role: UPDATE users SET role = 'sales_insight_admin' WHERE email = '...';
-- ============================================================================

COMMENT ON COLUMN users.role IS
  'Valid roles: user | admin | marketing_signature | sales_insight_admin. '
  'admin: full access to all modules and admin UI. '
  'marketing_signature: can manage mail signatures and push to users. '
  'sales_insight_admin: can manage information set categories and fields in Sales Insight Explorer. '
  'user: standard access, module-level permissions via user_modules.';