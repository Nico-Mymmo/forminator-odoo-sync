-- ============================================================================
-- Mini-Apps — Externe-URL app-type (naast bestaande single-file HTML-apps)
-- ============================================================================
-- Migration: 2026-07-23
--
-- Voegt een tweede app-type toe aan mini_apps: naast de bestaande "html"-apps
-- (single-file HTML/JS geupload en opgeslagen in R2, zie r2_key) kan een
-- gebruiker nu ook een "url"-app registreren -- gewoon een externe URL (bv.
-- een Lovable-hosted app) die in een iframe geladen wordt via `src` i.p.v.
-- `srcdoc`. Zo'n app heeft geen R2-inhoud, geen code-editor en geen
-- instrumentatie/shim (cross-origin, dus window.platform/sharedStorage zijn
-- daar sowieso niet bruikbaar) -- enkel dezelfde metadata/rechten/sharing/
-- favorieten/chat als een gewone mini-app (die logica werkt al generiek op
-- mini_apps-rijen, ongeacht content-type, en blijft ongewijzigd).
--
-- app_type: discriminator-kolom, 'html' (bestaand gedrag, default) of 'url'.
-- external_url: enkel gevuld voor app_type='url'.
-- r2_key wordt NULL-baar omdat een 'url'-app geen R2-object heeft.
--
-- CHECK-constraint bewaakt de invariant: een 'html'-app heeft altijd een
-- r2_key, een 'url'-app heeft altijd een external_url -- nooit allebei leeg,
-- nooit allebei gevuld voor hetzelfde type.
-- ============================================================================

-- ─── mini_apps.app_type ──────────────────────────────────────────────────────

ALTER TABLE mini_apps
  ADD COLUMN IF NOT EXISTS app_type VARCHAR NOT NULL DEFAULT 'html'
    CHECK (app_type IN ('html', 'url'));

-- ─── mini_apps.external_url ──────────────────────────────────────────────────

ALTER TABLE mini_apps
  ADD COLUMN IF NOT EXISTS external_url TEXT;

-- ─── r2_key nullable (url-apps hebben geen R2-inhoud) ────────────────────────

ALTER TABLE mini_apps
  ALTER COLUMN r2_key DROP NOT NULL;

-- ─── Invariant: r2_key XOR external_url, afhankelijk van app_type ────────────

ALTER TABLE mini_apps
  DROP CONSTRAINT IF EXISTS mini_apps_content_source_check;

ALTER TABLE mini_apps
  ADD CONSTRAINT mini_apps_content_source_check
  CHECK (
    (app_type = 'html' AND r2_key IS NOT NULL)
    OR (app_type = 'url' AND external_url IS NOT NULL)
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS + ADD
-- ✅ Bestaande rijen: app_type DEFAULT 'html' + r2_key blijft gevuld ->
--    voldoet meteen aan de nieuwe CHECK-constraint, geen backfill nodig
-- ✅ Geen nieuwe RLS nodig: bestaande policies op mini_apps dekken deze
--    kolommen al (RLS werkt op rij-niveau, niet per kolom); de Worker doet
--    de echte rechtencontrole sowieso via service_role + routes.js
-- ============================================================================
