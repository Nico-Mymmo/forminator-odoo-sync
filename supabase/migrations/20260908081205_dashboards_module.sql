-- ============================================================================
-- Dashboards — moduleregistratie
-- ============================================================================
-- Nieuwe module die de dashboards die tot nu toe via de Google Sheet +
-- Looker Studio-pijplijn liepen (Odoo -> odoo-proxy -> google-odoo-dataset-
-- sync -> Sheet -> Looker Studio) stap voor stap overzet naar de OM,
-- rechtstreeks op Odoo-data.
--
-- Geen eigen Supabase-tabellen in deze migratie: v1 (instroom-widget) is
-- volledig read-only tegen Odoo, geen eigen opgeslagen state. Zodra dit
-- patroon generiek wordt (door gebruikers samen te stellen widgets), komt
-- daar een aparte migratie voor met dashboard/widget-tabellen.
--
-- Auto-grant: enkel admins voorlopig (zelfde patroon als event_operations_v2)
-- -- de cijfers zijn nog niet geverifieerd tegen wat de gebruikers gewend
-- zijn van Looker Studio. Breder opengezet via Beheer zodra dat wel zo is.
-- ============================================================================

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'dashboards',
  'Dashboards',
  'Interne dashboards op live Odoo-data (vervangt stap voor stap de Looker Studio-rapporten)',
  '/dashboards',
  'layout-dashboard',
  true,
  false,
  130
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'dashboards'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ON CONFLICT (code) DO NOTHING
-- ✅ Auto-grant enkel aan admins (nieuwe, nog niet geverifieerde cijfers)
-- ✅ display_order = 130 (na campaign_funnels = 120)
-- ✅ Geen nieuwe tabellen -- Odoo blijft de enige database voor deze widget
-- ============================================================================
