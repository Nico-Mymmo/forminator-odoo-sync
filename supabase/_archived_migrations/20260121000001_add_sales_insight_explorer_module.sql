-- Add Sales Insight Explorer Module
-- Migration: Add sales_insight_explorer to modules table
-- Date: 2026-01-21

-- Insert the sales_insight_explorer module
INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'sales_insight_explorer',
  'Sales Insight Explorer',
  'Schema-driven query builder for Odoo data exploration and export',
  '/insights',
  'database',
  true,
  false,
  3
)
ON CONFLICT (code) DO NOTHING;

-- Grant access to all existing admin users
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT 
  u.id,
  m.id,
  true,
  u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'sales_insight_explorer'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- Comments
COMMENT ON CONSTRAINT user_module_unique ON user_modules IS 'Prevents duplicate user-module assignments';
