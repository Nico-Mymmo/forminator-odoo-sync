-- Module cx_automations registreren in de Operations Manager

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'cx_automations',
  'CX Automations',
  'Instelbare vlag-drempelwaarden per CS-fase en dagelijkse cron-monitoring',
  '/cx-automations',
  'zap',
  true,
  false,
  99
)
ON CONFLICT (code) DO NOTHING;

-- Toegang voor alle admins
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'cx_automations'
ON CONFLICT DO NOTHING;
