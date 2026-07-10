-- ============================================================================
-- Mini-Apps — Icoon per app
-- ============================================================================
-- Migration: 2026-07-10
-- Laat de eigenaar van een mini-app een Lucide-icoon kiezen (via de
-- Instellingen-tab, dropdown) i.p.v. altijd hetzelfde generieke icoon.
-- Wordt getoond op de app-kaart en in de favorieten-blokjes in de gedeelde
-- navbar (zie src/lib/components/navbar.js).
--
-- Validatie van de toegelaten iconnamen (VALID_ICONS) gebeurt uitsluitend in
-- src/modules/mini-apps/routes.js -- deze kolom is bewust vrije tekst zodat
-- de toegelaten set later kan uitgebreid worden zonder migratie. navbar.js
-- valideert defensief nogmaals (safeIconName) voor het in een HTML-attribuut
-- belandt.
-- ============================================================================

ALTER TABLE mini_apps
  ADD COLUMN IF NOT EXISTS icon VARCHAR NOT NULL DEFAULT 'puzzle';

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ADD COLUMN IF NOT EXISTS
-- ✅ NOT NULL + DEFAULT -- bestaande rijen krijgen automatisch 'puzzle'
-- ============================================================================
