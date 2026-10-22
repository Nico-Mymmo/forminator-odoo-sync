-- Regio's (src/modules/regios): de mini-app "Regio's" wordt een gewone module.
-- De gegevens zelf staan in D1 om-core (d1/om-core/migrations/0012_regios.sql)
-- en worden bij de eerste keer openen uit de mini-app overgenomen.
-- Hier: de rij in `modules`, de toegang, het departement, en de favorieten.
--
-- Toegang: iedereen die actief is (de mini-app stond gedeeld met iedereen).
--
-- Favorieten: wie de mini-app als favoriet in de balk had, krijgt de MODULE
-- als favoriet (die staat sinds vandaag ook bovenaan in de balk, zie
-- navbar.js). De favoriet van de mini-app gaat weg, anders staat dezelfde
-- knop er twee keer; de mini-app zelf verwijst door naar de module
-- (src/modules/mini-apps/lib/verhuisd.js).

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES ('regios', 'Regio''s', 'Welke syndicoach werkt waar?', '/regios', 'map', true, false, 25)
ON CONFLICT (code) DO NOTHING;

UPDATE modules m
SET department_id = d.id
FROM module_departments d
WHERE m.code = 'regios' AND m.department_id IS NULL AND d.name = 'Sales';

INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'regios'
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

INSERT INTO user_module_favorites (user_id, module_id, position)
SELECT f.user_id, m.id,
       COALESCE((SELECT MAX(x.position) FROM user_module_favorites x WHERE x.user_id = f.user_id), -1) + 1
FROM mini_app_favorites f
CROSS JOIN modules m
WHERE m.code = 'regios'
  AND f.mini_app_id = '0913f371-1d50-47a6-9706-d39ef50beb43'
ON CONFLICT (user_id, module_id) DO NOTHING;

DELETE FROM mini_app_favorites
WHERE mini_app_id = '0913f371-1d50-47a6-9706-d39ef50beb43';
