-- ============================================================================
-- Content Feed (nieuws & updates) — Moduleregistratie
-- ============================================================================
-- Migration: 2026-09-20
--
-- Beheer van x_content_snippet ("nieuws en updates") in de OM. Vervangt de
-- duw-keten Odoo → Zapier/odoo-proxy → news_article-CPT op embed.openvme.be,
-- waar 4 posts zonder Odoo-record stonden en 2 Odoo-records om dezelfde
-- WordPress-post vochten. Zie docs/ontwerp-om-nieuws.md.
--
-- ER KOMT GEEN ENKELE TABEL BIJ. Odoo is de enige database voor deze module,
-- exact zoals bij event-operations-v2: de cache (KV) is wegwerpbaar en altijd
-- herbouwbaar uit Odoo. Deze migratie doet dus ALLEEN de moduleregistratie --
-- de stap die los staat van registry.js en zonder welke de module onzichtbaar
-- blijft in de navbar en het homedashboard (user.modules komt uit deze
-- tabellen, niet uit de registry).
-- ============================================================================

-- ─── MODULE REGISTRATION ─────────────────────────────────────────────────────

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'content_feed',
  'Nieuws & updates',
  'Beheer van nieuwsberichten, release notes en publicaties — Odoo als enige database',
  '/content-feed',
  'newspaper',
  true,
  false,
  120
)
ON CONFLICT (code) DO NOTHING;

-- AUTO-GRANT AAN ALLE ACTIEVE GEBRUIKERS
-- Bewust geen admin-only module: het hele punt van deze verhuizing is dat
-- meer collega's zelf actualiteit kunnen ingeven, in plaats van dat het bij
-- een handvol mensen met Odoo-toegang blijft hangen.
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE m.code = 'content_feed'
  AND u.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ON CONFLICT (code) DO NOTHING + NOT EXISTS op de grant
-- ✅ Geen nieuwe tabellen — Odoo blijft de enige database voor deze module
-- ✅ Auto-grant aan alle actieve users (geen admin-only tool)
-- ✅ display_order = 120 (na mini_apps = 110)
-- ============================================================================
