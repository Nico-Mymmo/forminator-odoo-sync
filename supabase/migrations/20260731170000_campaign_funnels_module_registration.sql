-- ============================================================================
-- Ad & Sales Campaigns — module-registratie
-- ============================================================================
-- De vorige migratie (20260731160000_campaign_funnels_init.sql) maakte enkel
-- de feature-tabellen aan (campaign_funnels/swimlanes/cards). Een module wordt
-- pas zichtbaar in de navbar/homedashboard als er ook een rij in `modules`
-- bestaat én elke gebruiker een rij in `user_modules` heeft — dat is een
-- aparte, ongedocumenteerde stap los van src/modules/registry.js (die enkel
-- de route/handler registreert, niet de zichtbaarheid per gebruiker).
--
-- Patroon overgenomen van 20260710120000_mini_apps_module.sql: auto-grant aan
-- alle actieve gebruikers, want dit is een tool voor iedereen (marketing/sales
-- team), geen admin-only tool — zie sparsessie 2026-07-31 ("iedereen met
-- account").
-- ============================================================================

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'campaign_funnels',
  'Ad & Sales Campaigns',
  'Marketing- en salesfunnels: van marktonderzoek tot go-to-market',
  '/campaigns',
  'megaphone',
  true,
  false,
  120
)
ON CONFLICT (code) DO NOTHING;

-- AUTO-GRANT AAN ALLE ACTIEVE GEBRUIKERS (zelfde reden als mini_apps)
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'campaign_funnels'
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ON CONFLICT (code) DO NOTHING, NOT EXISTS-guard op user_modules
-- ✅ Auto-grant aan alle actieve users (geen admin-only tool)
-- ✅ display_order = 120 (na mini_apps = 110)
-- ============================================================================
