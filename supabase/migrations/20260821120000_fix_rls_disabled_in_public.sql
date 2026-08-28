-- ============================================================================
-- Fix Supabase linter: rls_disabled_in_public + sensitive_columns_exposed
-- ============================================================================
-- Datum: 2026-08-21
--
-- De Supabase database linter meldde 14 tabellen in het public-schema zonder
-- RLS (ERROR, 0013_rls_disabled_in_public) en daarnaast 1 tabel met een
-- gevoelige kolom die onbeschermd via de API bereikbaar was
-- (0023_sensitive_columns_exposed: mini_app_discovery_tokens.token).
--
-- Context / gekozen aanpak
-- ------------------------
-- Alle databasetoegang in dit platform loopt via getSupabaseClient(env)
-- (src/lib/database.js), die ALTIJD de service_role-key gebruikt — die bypasst
-- RLS. Er is nergens in de codebase een client met de anon- of een user-JWT:
-- de echte rechten-/zichtbaarheidscontrole gebeurt in de Worker-routes.
--
-- Daarom krijgen deze tabellen RLS + een expliciete deny-all policy voor
-- `public` (dus zowel anon als authenticated). Dat is precies het patroon dat
-- eerder al gebruikt is voor claude_challenges / claude_tokens /
-- claude_audit_log (20260420100000_fix_rls_security_issues.sql) en
-- form_submissions_log (20260420120000_fix_rls_enabled_no_policy.sql).
--
-- Gevolg: geen functionele wijziging voor de Worker (service_role bypasst RLS),
-- maar directe PostgREST-toegang met de anon-key is dichtgezet. De policies
-- voorkomen tegelijk de INFO-melding "RLS enabled, no policy".
--
-- Wil je later een tabel wél direct leesbaar maken voor ingelogde gebruikers,
-- dan vervang je de deny-policy door bv.:
--   CREATE POLICY "<tabel>_select" ON <tabel> FOR SELECT TO authenticated USING (true);
--
-- Idempotent by design: ENABLE ROW LEVEL SECURITY is herhaalbaar,
-- DROP POLICY IF EXISTS vóór elke CREATE POLICY, to_regclass-guard per tabel.
-- ============================================================================

BEGIN;

-- ── 1. RLS aan + deny-all policy op alle gemelde tabellen ───────────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- CX Automations
    'flag_thresholds',            -- vlag-drempelwaarden per Odoo CS-fase (config)
    'flag_run_log',               -- audit log van de dagelijkse vlag-cron
    'cx_settings',                -- algemene CX-instellingen (key/value)
    -- Platform
    'endpoint_log',               -- endpoint-telemetrie (upsert_endpoint_log)
    'saved_searches',             -- per-user opgeslagen wizard-zoekopdrachten
    -- Koppelingen (Forminator Sync V2)
    'fs_v2_folders',
    'fs_v2_integration_tags',
    'fs_v2_tags',
    'fs_v2_tracker_hits',         -- hits op trackable short links / QR-codes
    -- Mini-apps
    'mini_app_user_settings',     -- per-user google_email_override
    'mini_app_discovery_tokens',  -- kortlevende read-only AI-discovery tokens
    -- Ad & sales campaigns
    'campaign_funnels',
    'campaign_swimlanes',
    'campaign_cards'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'Tabel public.% bestaat niet — overgeslagen', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Deny-all: geen enkele directe client-toegang (anon of authenticated).
    -- FOR ALL zonder WITH CHECK => USING-expressie geldt ook voor INSERT.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_deny', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO public USING (false)',
      t || '_deny', t
    );
  END LOOP;
END
$$;

-- ── 2. Grant-level hardening op de tokentabel ───────────────────────────────
-- Extra laag bovenop RLS voor mini_app_discovery_tokens (linter 0023:
-- gevoelige kolom `token`). Bewust GEEN column-level
-- `REVOKE SELECT (token) ...`: Supabase geeft anon/authenticated een
-- TABLE-level grant, en Postgres kan een losse kolom niet uit een table-level
-- grant wegnemen (dat is een stille no-op — de reden dat de eerdere
-- invites.token/sessions.token-revokes in 20260225120000 niets deden).
-- Deze tabel wordt uitsluitend server-side gebruikt
-- (src/modules/sales-insight-explorer/lib/mini-app-discovery.js via
-- service_role), dus we trekken de volledige grant in. service_role en
-- postgres worden niet geraakt.
DO $$
BEGIN
  IF to_regclass('public.mini_app_discovery_tokens') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE public.mini_app_discovery_tokens FROM anon;
    REVOKE ALL PRIVILEGES ON TABLE public.mini_app_discovery_tokens FROM authenticated;
  END IF;
END
$$;

COMMIT;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: to_regclass-guard, ENABLE RLS herhaalbaar, DROP POLICY IF EXISTS
-- ✅ Lost 14× rls_disabled_in_public (ERROR) op
-- ✅ Lost sensitive_columns_exposed op mini_app_discovery_tokens.token op
-- ✅ Geen "RLS enabled, no policy"-INFO: elke tabel krijgt een policy
-- ✅ Geen functionele impact: Worker gebruikt service_role (bypasst RLS)
-- ✅ Geen user_metadata in policies (dat is client-editable)
-- ============================================================================
