-- ============================================================================
-- Fix Supabase linter WARN's + resterende gevoelige kolommen
-- ============================================================================
-- Datum: 2026-08-21
--
-- Onderdelen:
--   1. function_search_path_mutable (0011) — 4 functies
--   2. rls_policy_always_true (0024)        — 3 INSERT-policies met WITH CHECK (true)
--   3. Gevoelige kolommen: effectieve grant-hardening op de tabellen met
--      secrets/hashes/tokens (de eerdere column-level REVOKE's waren no-ops)
--
-- Uitgangspunt (zoals in 20260821120000): alle DB-toegang loopt via
-- getSupabaseClient(env) met de service_role-key (src/lib/database.js), die
-- RLS bypasst en niet geraakt wordt door grant-wijzigingen voor anon/
-- authenticated. Er is nergens in de codebase een anon- of user-JWT-client.
--
-- Idempotent by design.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. function_search_path_mutable — search_path vastzetten
-- ============================================================================
-- Zonder vaste search_path kan een aanroeper de resolutie van niet-
-- gekwalificeerde namen (endpoint_log, now(), ...) omleiden naar een eigen
-- schema. Zelfde aanpak/stijl als 20260225123000 en 20260420110000:
-- dynamisch over pg_proc zodat de signature niet hardgecodeerd hoeft.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'upsert_endpoint_log',                     -- endpoint-telemetrie (SQL)
        'mini_apps_set_updated_at',                -- updated_at-trigger
        'mini_app_scheduled_tasks_set_updated_at', -- updated_at-trigger
        'mini_app_condition_tasks_set_updated_at'  -- updated_at-trigger
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.signature);
    RAISE NOTICE 'search_path vastgezet op %', fn.signature;
  END LOOP;
END
$$;

-- ============================================================================
-- 2. rls_policy_always_true — INSERT-policies met WITH CHECK (true)
-- ============================================================================
-- information_sets / information_set_fields (20260605120000) en
-- ai_export_presets (20260605140000) kregen bij aanmaak een
-- "FOR INSERT TO authenticated WITH CHECK (true)"-policy, met de gedachte dat
-- de browser rechtstreeks zou kunnen inserten. Dat is nooit gebeurd: de
-- Sales Insight Explorer schrijft via de Worker (service_role), zie
-- src/modules/sales-insight-explorer/. De policy geeft dus geen enkele
-- functionaliteit, maar zou wél iedereen met de anon-key + een user-JWT
-- ongelimiteerd rijen laten toevoegen aan deze (gedeelde, globale)
-- configuratietabellen.
--
-- We droppen ze. De bestaande SELECT-policies met USING (true) blijven staan:
-- dit zijn bewust globaal leesbare configuratietabellen, en de linter sluit
-- SELECT USING(true) expliciet uit.
--
-- Wil je later tóch client-side inserts, dan hoort daar een echte conditie
-- bij, bv. WITH CHECK (auth.uid() = created_by) — alle drie de tabellen
-- hebben een created_by-kolom.

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('information_sets', 'information_set_fields', 'ai_export_presets')
      AND cmd = 'INSERT'
      AND with_check = 'true'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', rec.policyname, rec.tablename);
    RAISE NOTICE 'Permissieve INSERT-policy % op % verwijderd', rec.policyname, rec.tablename;
  END LOOP;
END
$$;

-- ============================================================================
-- 3. Gevoelige kolommen — effectieve grant-hardening
-- ============================================================================
-- Deze tabellen bevatten wachtwoord-hashes, sessie-/invite-tokens of
-- client-secrets. Ze zijn alle uitsluitend server-side in gebruik (auth-flow
-- en Claude-integratie in de Worker, via service_role).
--
-- Waarom een table-level REVOKE en geen column-level:
-- `REVOKE SELECT (token) ... FROM authenticated` is een stille no-op zodra er
-- een TABLE-level grant staat — en Supabase geeft anon/authenticated die
-- standaard. Dat is precies waarom de revokes in
-- 20260225120000_security_rls_hardening.sql op invites.token en sessions.token
-- nooit effect hebben gehad. Hier trekken we de volledige grant in, wat wél
-- werkt en tegelijk password_hash / client_secret_hash / token_hash dekt.
--
-- Rollback indien ooit nodig:
--   GRANT SELECT ON TABLE public.<tabel> TO authenticated;
-- (RLS-policies op die tabellen blijven ongewijzigd bestaan.)

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users',                -- password_hash
    'invites',              -- token
    'sessions',             -- token
    'claude_integrations',  -- client_secret_hash
    'claude_tokens'         -- token_hash
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'Tabel public.% bestaat niet — overgeslagen', t;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', t);
  END LOOP;
END
$$;

COMMIT;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: dynamisch over pg_proc/pg_policies, to_regclass-guard,
--    ALTER FUNCTION ... SET en REVOKE zijn herhaalbaar
-- ✅ Lost 4× function_search_path_mutable (WARN) op
-- ✅ Lost 3× rls_policy_always_true (WARN) op
-- ✅ Repareert de no-op column-revokes uit 20260225120000
-- ✅ Geen functionele impact: Worker gebruikt service_role
-- ============================================================================
