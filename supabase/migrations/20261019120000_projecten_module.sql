-- Projecten (src/modules/projecten): moduleregistratie.
-- De gegevens zelf staan in D1 om-core (d1/om-core/migrations/0003_projecten.sql);
-- hier enkel de rij in `modules` en de toegang, want user.modules komt uit Supabase.
-- Toegang: iedereen die actief is. Het is een werkinstrument voor het hele team.

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'projecten',
  'Projecten',
  'Interne projecten en to-do''s opvolgen',
  '/projecten',
  'folder-kanban',
  true,
  false,
  20
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'projecten'
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );
