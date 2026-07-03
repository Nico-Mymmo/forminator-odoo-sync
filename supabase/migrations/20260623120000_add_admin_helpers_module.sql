-- Admin Helpers module registreren in de Operations Manager

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'admin_helpers',
  'Admin Helpers',
  'Interne hulptools voor admins, o.a. de Odoo XPath Converter',
  '/xpath-converter',
  'wrench',
  true,
  false,
  100
)
ON CONFLICT (code) DO NOTHING;

-- Toegang voor alle admins
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'admin_helpers'
ON CONFLICT DO NOTHING;
