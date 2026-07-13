-- ============================================================================
-- Mini-Apps — Opruiming: mini_app_storage (Postgres) verwijderen
-- ============================================================================
-- Migration: 2026-07-10
-- Ruimt de tabel uit 20260710150000_mini_app_storage.sql op. Die migratie
-- WERD uitgevoerd, maar de feature (gedeelde opslag per mini-app) is
-- daarna verhuisd naar R2 (zie src/modules/mini-apps/lib/storage.js) omdat
-- het quotum werd opgetrokken naar 10 MB per app -- dat past niet goed bij
-- de 500 MB gratis Supabase-databaseopslag (gedeeld met alle echte
-- bedrijfsdata), terwijl Cloudflare R2 10 GB gratis opslag heeft zonder
-- egress-kosten.
--
-- Alle data die eventueel al in mini_app_storage stond gaat hierbij
-- definitief verloren (geen migratie-pad naar R2 -- de feature is intern,
-- nog niet extern gecommuniceerd/gebruikt op het moment van deze opruiming).
--
-- CASCADE op de DROP TABLE ruimt automatisch de index, CHECK-constraint,
-- RLS-policy en trigger op die er in de vorige migratie bij horen. De
-- trigger-FUNCTION is een los object (niet tabel-eigendom in Postgres) en
-- wordt daarom apart gedropt.
-- ============================================================================

DROP TABLE IF EXISTS mini_app_storage CASCADE;
DROP FUNCTION IF EXISTS mini_app_storage_set_updated_at();

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: IF EXISTS op zowel TABLE als FUNCTION
-- ✅ CASCADE ruimt afhankelijke objecten (index/constraint/policy/trigger) op
-- ✅ Bewust destructief (data loss) -- toegelicht in het commentaar hierboven,
--    feature was nog niet in gebruik buiten deze ontwikkelsessie
-- ============================================================================
