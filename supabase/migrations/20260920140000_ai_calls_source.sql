-- ============================================================================
-- AI-aanroepen: ook van buiten mini-apps
-- ============================================================================
-- Migration: 2026-09-20
--
-- `mini_app_ai_calls` was de audittabel van ÉÉN module, en `mini_app_id` stond
-- daarom op NOT NULL met een FK naar `mini_apps`. Sinds de artikel-analyse in
-- Content Feed (`src/modules/content-feed/lib/article-ai.js`) doet ook een
-- andere module AI-aanroepen, en die hebben geen mini-app om naar te wijzen.
--
-- Het alternatief was die aanroepen NIET loggen. Dat is precies hoe je AI-kosten
-- krijgt die niemand ziet tot ze groot zijn -- dezelfde stille faalmodus als een
-- Zap die maandenlang niets meer doet. Dus: één tabel, één rapport, met een
-- kolom die zegt waar de aanroep vandaan kwam.
--
-- De tabelnaam blijft `mini_app_ai_calls`. Hernoemen zou elke query in
-- mini-apps raken voor een naam die toch maar een naam is; de `source`-kolom
-- zegt wat er echt toe doet.
-- ============================================================================

-- ─── mini_app_id mag leeg zijn ───────────────────────────────────────────────
-- Een aanroep die niet van een mini-app komt, heeft hier niets te zetten.
-- De FK blijft staan: staat er wél een id, dan moet die app bestaan.
ALTER TABLE mini_app_ai_calls
  ALTER COLUMN mini_app_id DROP NOT NULL;

-- ─── Waar kwam de aanroep vandaan? ───────────────────────────────────────────
-- DEFAULT 'mini_app' zodat elke bestaande rij meteen de juiste waarde heeft
-- en het rapport niets hoeft te raden over het verleden.
ALTER TABLE mini_app_ai_calls
  ADD COLUMN IF NOT EXISTS source VARCHAR NOT NULL DEFAULT 'mini_app';

-- Bewust GEEN CHECK-constraint op de toegestane waarden: elke nieuwe module
-- die AI gaat gebruiken zou dan een migratie nodig hebben om zichzelf te mogen
-- loggen, en de kans is dan reëel dat iemand het loggen overslaat in plaats van
-- de migratie te schrijven. Het label komt uit SOURCE_LABELS in
-- src/modules/mini-apps/routes.js; een onbekende source toont daar zijn eigen
-- naam in plaats van te verdwijnen.

-- Voor het rapport: "alle aanroepen van deze bron in deze periode".
CREATE INDEX IF NOT EXISTS idx_mini_app_ai_calls_source
  ON mini_app_ai_calls(source, created_at);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
--    DROP NOT NULL is vanzelf idempotent (geen fout als het al mag).
-- ✅ Bestaande rijen krijgen source = 'mini_app' via de DEFAULT — geen backfill
--    nodig en het rapport klopt meteen voor de historiek.
-- ✅ Geen datamigratie, geen verwijderde kolommen.
-- ============================================================================
