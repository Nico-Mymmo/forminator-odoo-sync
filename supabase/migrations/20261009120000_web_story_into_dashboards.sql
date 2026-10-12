-- ============================================================================
-- Webgedrag (web_story) wordt het tabblad Marketing in Dashboards
-- ============================================================================
-- De aparte module Webgedrag (/webgedrag) bestaat niet meer: het is het
-- marketingdashboard en staat als tabblad "Marketing" in Dashboards
-- (public/dashboards.html, src/modules/dashboards/lib/marketing-routes.js).
-- Oude links uit Odoo (/webgedrag?lead=<id>) sturen door naar
-- /dashboards?tab=marketing&lead=<id> (src/router/public-routes.js).
--
-- 1. Wie Webgedrag had, krijgt Dashboards: anders verliest die het
--    marketingdashboard, en de link vanuit een lead in Odoo werkt dan niet meer.
--    Op 2026-10-09 ging dat om één persoon; iedereen anders met Webgedrag had
--    Dashboards al. Let op: Dashboards toont ook Verkoop en Targets. Wie dat niet
--    hoort te zien, zet de module in Beheer weer uit.
-- 2. De module zelf weg: eerst de toekenningen, dan de rij. Zonder de rij
--    verdwijnt Webgedrag uit de navbar en het homedashboard (user.modules komt
--    uit deze tabellen, niet uit registry.js).
--
-- De tabel web_story_exclusions blijft: dat is de instelling "Uitgesloten uit de
-- cijfers" van het tabblad Marketing, en ze hoort niet bij de moduleregistratie.
-- Idempotent: opnieuw draaien vindt geen web_story meer en doet niets.
-- ============================================================================

INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT um.user_id, d.id, true, um.user_id
FROM user_modules um
JOIN modules w ON w.id = um.module_id AND w.code = 'web_story'
CROSS JOIN modules d
WHERE d.code = 'dashboards'
  AND um.is_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM user_modules x
    WHERE x.user_id = um.user_id AND x.module_id = d.id
  );

DELETE FROM user_modules
WHERE module_id IN (SELECT id FROM modules WHERE code = 'web_story');

DELETE FROM modules WHERE code = 'web_story';
