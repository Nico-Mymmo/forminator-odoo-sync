-- Claude voor sales (src/modules/claude-sales): de connector waarmee sales in
-- claude.ai een gebouwdossier opvraagt en aanvult. De verbindingen zelf staan
-- in D1 om-core (d1/om-core/migrations/0014_claude_sales.sql).
--
-- Toegang: enkel beheerders krijgen de module hier. De connector SCHRIJFT in
-- Odoo (velden, chatter, interne notities), dus wie hem krijgt, beslist een
-- beheerder in Beheer -> Gebruikers.

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES ('claude_sales', 'Claude voor sales', 'Een gebouwdossier opvragen en aanvullen vanuit Claude.', '/claude-sales', 'sparkles', true, false, 26)
ON CONFLICT (code) DO NOTHING;

UPDATE modules m
SET department_id = d.id
FROM module_departments d
WHERE m.code = 'claude_sales' AND m.department_id IS NULL AND d.name = 'Sales';

INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'claude_sales'
  AND u.is_active = true
  AND u.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );
