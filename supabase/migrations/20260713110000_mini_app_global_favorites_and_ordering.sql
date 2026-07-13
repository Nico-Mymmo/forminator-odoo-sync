-- ============================================================================
-- Mini-Apps — Globale favorieten + herordenbare favorietenbalk
-- ============================================================================
-- Migration: 2026-07-13
-- Twee losse, kleine uitbreidingen op het bestaande favorieten-mechanisme
-- (20260710130000_mini_app_favorites.sql):
--
-- 1. is_global_favorite (kolom op mini_apps): een admin kan een app als
--    favoriet markeren VOOR IEDEREEN -- verschijnt dan bij elke gebruiker in
--    de navbar-favorietenbalk, ongeacht of die persoon de app zelf al
--    favoriet gemaakt had. In tegenstelling tot mini_app_favorites (per-
--    gebruiker join-tabel) is dit een kolom op de app zelf: er is maar één
--    globale favoriet-status per app, niet per (user, app)-combinatie.
--
--    BELANGRIJK gedragseffect: canView() (src/modules/mini-apps/permissions.js)
--    behandelt is_global_favorite als een override op visibility -- een
--    globaal favoriete app is bruikbaar voor IEDEREEN, ook als de eigenaar
--    hem private/specific had gezet. Dat is bewust: "favoriet maken voor
--    iedereen" zou nutteloos zijn als een deel van "iedereen" de app niet
--    mag draaien. Een admin die dit zet, overrulet dus impliciet de eigen
--    zichtbaarheidskeuze van de eigenaar.
--
-- 2. position (kolom op mini_app_favorites): laat een gebruiker zijn eigen
--    favorietenbalk vrij herordenen (i.p.v. de vaste created_at-volgorde van
--    voorheen). NULL = nog niet expliciet geordend door deze gebruiker, valt
--    dan terug op created_at (zie src/modules/mini-apps/lib/favorites.js).
--    Een globaal favoriete app zonder eigen mini_app_favorites-rij hangt
--    "los" achteraan de balk tot de gebruiker hem zelf verplaatst -- op dat
--    moment wordt er alsnog een gewone rij voor aangemaakt (materialisatie),
--    zie favorites.js. Zet een admin een app terug niet meer globaal
--    favoriet, dan blijft een reeds gematerialiseerde rij gewoon een
--    normale persoonlijke favoriet -- geen aparte opruiming nodig.
--
-- RLS: ongewijzigd, bestaande policies op beide tabellen blijven van
-- toepassing (defense-in-depth, Worker gebruikt service_role-key).
-- ============================================================================

-- ─── mini_apps.is_global_favorite ────────────────────────────────────────────

ALTER TABLE mini_apps
  ADD COLUMN IF NOT EXISTS is_global_favorite BOOLEAN NOT NULL DEFAULT false;

-- Partial index: enkel de (naar verwachting heel kleine) set globale
-- favorieten wordt ooit met is_global_favorite=true opgezocht.
CREATE INDEX IF NOT EXISTS idx_mini_apps_global_favorite
  ON mini_apps(is_global_favorite)
  WHERE is_global_favorite = true;

-- ─── mini_app_favorites.position ─────────────────────────────────────────────

ALTER TABLE mini_app_favorites
  ADD COLUMN IF NOT EXISTS position INTEGER;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS
-- ✅ Geen nieuwe RLS nodig: bestaande policies op mini_apps/mini_app_favorites
--    dekken deze kolommen al (RLS werkt op rij-niveau, niet per kolom); de
--    Worker doet de echte rechtencontrole sowieso via service_role + routes.js
-- ✅ NOT NULL DEFAULT false op is_global_favorite -- geen bestaande rij wordt
--    onbedoeld globaal favoriet bij het toevoegen van de kolom
-- ✅ position blijft NULL-baar (bewuste "nog niet geordend"-fallback, geen
--    backfill nodig -- zie favorites.js voor de sorteerlogica)
-- ============================================================================
