-- ============================================================================
-- Module permissions — per-module sub-role support
-- ============================================================================
-- Adds a 'permissions' JSONB column to user_modules.
-- This allows modules to define their own admin roles without polluting
-- the global users.role column.
--
-- Structure: { "permissions": ["admin", "viewer", ...] }
-- Example:   { "permissions": ["admin"] }
--
-- The Sales Insight Explorer uses this to gate category/field management:
--   user_modules.permissions @> '["admin"]'
--   for module code = 'sales_insight_explorer'
--
-- Managed via: /insights/admin (module-level admin page, role=admin only)
-- ============================================================================

ALTER TABLE user_modules
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN user_modules.permissions IS
  'Array of module-specific permission strings. '
  'Example: ["admin"] grants module-level admin rights. '
  'Interpretation is module-specific; the global users.role is unchanged.';