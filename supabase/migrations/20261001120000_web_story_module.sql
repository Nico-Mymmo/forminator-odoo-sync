-- ============================================================================
-- Webgedrag (web_story) -- moduleregistratie
-- ============================================================================
-- Het verhaal van een lead / actieblad / bezoeker, live uit D1 (website-tracker).
-- Geen eigen tabel: de koppelingen staan in D1 (visitor_links), Odoo krijgt
-- enkel HTML. Zie website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md.
-- Zonder deze rij blijft de module onzichtbaar in navbar en homedashboard
-- (user.modules komt uit de tabellen modules + user_modules, niet uit registry.js).

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'web_story',
  'Webgedrag',
  'Hoe leads en VME''s bij ons kwamen: bezoeken, kanalen en de volledige tijdlijn',
  '/webgedrag',
  'footprints',
  true,
  false,
  140
)
ON CONFLICT (code) DO NOTHING;

-- Iedereen: elke verkoper moet het verhaal van zijn eigen leads kunnen openen
-- vanuit de link in Odoo.
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'web_story'
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );
