-- ============================================================================
-- Event Operations v2 — moduleregistratie
-- ============================================================================
-- DIT IS DE ENIGE MIGRATIE VOOR DEZE MODULE.
--
-- Odoo is de enige database voor events, inschrijvingen, contacten en
-- mails. Er komt bewust GEEN evt_*-schema, geen projectie, geen cache- of
-- logtabel. Cache leeft in Cloudflare KV (wegwerpbaar), assets in R2, en
-- het auditspoor in de Odoo-chatter.
--
-- Als een latere migratie tabellen voor deze module toevoegt, is dat een
-- architectuurfout.
-- ============================================================================

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'event_operations_v2',
  'Events',
  'Beheer van events, inschrijvingen en communicatie — Odoo als enige database',
  '/events-v2',
  'calendar-days',
  true,
  false,
  6
)
ON CONFLICT (code) DO NOTHING;

-- Auto-grant aan admins, zoals bij de andere modules.
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'event_operations_v2'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
