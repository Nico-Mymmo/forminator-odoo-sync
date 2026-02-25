BEGIN;

DO $$
DECLARE
  p record;
BEGIN
  IF to_regclass('public.marketing_signature_settings') IS NOT NULL THEN
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'marketing_signature_settings'
        AND policyname = 'Marketing/admin access on marketing_signature_settings'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.marketing_signature_settings', p.policyname);
    END LOOP;

    CREATE POLICY "Marketing/admin access on marketing_signature_settings"
      ON public.marketing_signature_settings
      FOR ALL
      TO authenticated
      USING (
        COALESCE(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      )
      WITH CHECK (
        COALESCE(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      );
  END IF;
END
$$;

DO $$
DECLARE
  p record;
BEGIN
  IF to_regclass('public.signature_config') IS NOT NULL THEN
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'signature_config'
        AND policyname = 'Marketing/admin access on signature_config'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.signature_config', p.policyname);
    END LOOP;

    CREATE POLICY "Marketing/admin access on signature_config"
      ON public.signature_config
      FOR ALL
      TO authenticated
      USING (
        COALESCE(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      )
      WITH CHECK (
        COALESCE(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      );
  END IF;
END
$$;

DO $$
DECLARE
  p record;
BEGIN
  IF to_regclass('public.signature_push_log') IS NOT NULL THEN
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'signature_push_log'
        AND policyname = 'Marketing/admin access on signature_push_log'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.signature_push_log', p.policyname);
    END LOOP;

    CREATE POLICY "Marketing/admin access on signature_push_log"
      ON public.signature_push_log
      FOR ALL
      TO authenticated
      USING (
        COALESCE(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      )
      WITH CHECK (
        COALESCE(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      );
  END IF;
END
$$;

COMMIT;
