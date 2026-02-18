-- Add Forminator Forms Admin module to navbar
INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'forminator_forms_admin',
  'Forminator Forms',
  'Beheer formulieren voor event form picker',
  '/events/forminator-forms-admin.html',
  'layout-list',
  true,
  false,
  20
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  route = EXCLUDED.route,
  icon = EXCLUDED.icon,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order;
