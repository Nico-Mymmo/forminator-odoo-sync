-- ============================================================================
-- Forminator Sync V2 Module Registration
-- ============================================================================
-- Adds forminator_sync_v2 to modules and grants all current admins access.
-- Idempotent by design.
-- ============================================================================

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'forminator_sync_v2',
  'Forminator Sync V2',
  'MVP module for marketer-first Forminator to Odoo sync',
  '/forminator-v2',
  'workflow',
  true,
  false,
  9
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  route = EXCLUDED.route,
  icon = EXCLUDED.icon,
  is_active = EXCLUDED.is_active,
  is_default = EXCLUDED.is_default;

INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'forminator_sync_v2'
  AND NOT EXISTS (
    SELECT 1
    FROM user_modules um
    WHERE um.user_id = u.id
      AND um.module_id = m.id
  );
