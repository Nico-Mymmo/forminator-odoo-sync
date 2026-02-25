# Security Migrations (2026-02-25)

Deze map documenteert security-gerichte database migraties.

## Toegevoegde migraties

- `supabase/migrations/20260225120000_security_rls_hardening.sql`
  - RLS ingeschakeld op kritieke tabellen.
  - View-hardening voor security invoker.
  - Tokenkolommen afgeschermd voor `anon` en `authenticated`.

- `supabase/migrations/20260225123000_fix_function_search_path_mutable.sql`
  - `search_path` vastgezet op `public` voor kwetsbare functies.

- `supabase/migrations/20260225130000_fix_rls_policy_always_true.sql`
  - Te brede RLS-policies vervangen door striktere varianten.
  - Dynamische detectie en opruiming van permissieve policies op doel-tabellen.

- `supabase/migrations/20260225133000_fix_jwt_user_metadata_rls_policies.sql`
  - JWT role checks gecorrigeerd: geen gebruik van `user_metadata`.
  - Alleen `app_metadata.role` met fallback op root `role`.

## Opmerking

Deze migraties zijn idempotent opgezet en bedoeld als corrective hardening op bestaande schema- en policy-configuratie.
