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
        AND (
          policyname IN (
            'Allow all on marketing_signature_settings',
            'Service role full access on marketing_signature_settings',
            'Marketing/admin access on marketing_signature_settings'
          )
          OR policyname ILIKE '%allow all%'
          OR (cmd <> 'SELECT' AND (qual = 'true' OR with_check = 'true'))
        )
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
          auth.jwt() -> 'user_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      )
      WITH CHECK (
        COALESCE(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() -> 'user_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      );
  END IF;
END
$$;

DO $$
DECLARE
  ownership_col text;
  p record;
BEGIN
  IF to_regclass('public.sales_insight_queries') IS NOT NULL THEN
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'sales_insight_queries'
        AND (
          policyname IN (
            'Allow authenticated delete access',
            'Allow authenticated insert access',
            'Allow authenticated update access',
            'Service role full access on sales_insight_queries',
            'User owns row access on sales_insight_queries'
          )
          OR policyname ILIKE '%allow all%'
          OR (cmd <> 'SELECT' AND (qual = 'true' OR with_check = 'true'))
        )
    LOOP
      EXECUTE format('DROP POLICY %I ON public.sales_insight_queries', p.policyname);
    END LOOP;

    SELECT c.column_name
    INTO ownership_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'sales_insight_queries'
      AND c.column_name IN ('user_id', 'owner_id', 'created_by', 'uid')
    ORDER BY CASE c.column_name
      WHEN 'user_id' THEN 1
      WHEN 'owner_id' THEN 2
      WHEN 'created_by' THEN 3
      WHEN 'uid' THEN 4
      ELSE 999
    END
    LIMIT 1;

    IF ownership_col IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY "User owns row access on sales_insight_queries" ON public.sales_insight_queries FOR ALL TO authenticated USING (auth.uid() = %I) WITH CHECK (auth.uid() = %I)',
        ownership_col,
        ownership_col
      );
    ELSE
      RAISE NOTICE 'Locked down public.sales_insight_queries: no ownership column found';
    END IF;
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
        AND (
          policyname IN (
            'Allow all on signature_config',
            'Service role full access on signature_config',
            'Marketing/admin access on signature_config'
          )
          OR policyname ILIKE '%allow all%'
          OR (cmd <> 'SELECT' AND (qual = 'true' OR with_check = 'true'))
        )
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
          auth.jwt() -> 'user_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      )
      WITH CHECK (
        COALESCE(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() -> 'user_metadata' ->> 'role',
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
        AND (
          policyname IN (
            'Allow all on signature_push_log',
            'Service role full access on signature_push_log',
            'Marketing/admin access on signature_push_log'
          )
          OR policyname ILIKE '%allow all%'
          OR (cmd <> 'SELECT' AND (qual = 'true' OR with_check = 'true'))
        )
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
          auth.jwt() -> 'user_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      )
      WITH CHECK (
        COALESCE(
          auth.jwt() -> 'app_metadata' ->> 'role',
          auth.jwt() -> 'user_metadata' ->> 'role',
          auth.jwt() ->> 'role',
          ''
        ) IN ('marketing_signature', 'admin')
      );
  END IF;
END
$$;

DO $$
DECLARE
  ownership_col text;
  p record;
BEGIN
  IF to_regclass('public.user_signature_settings') IS NOT NULL THEN
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'user_signature_settings'
        AND (
          policyname IN (
            'Allow all on user_signature_settings',
            'Service role full access on user_signature_settings',
            'User owns row access on user_signature_settings'
          )
          OR policyname ILIKE '%allow all%'
          OR (cmd <> 'SELECT' AND (qual = 'true' OR with_check = 'true'))
        )
    LOOP
      EXECUTE format('DROP POLICY %I ON public.user_signature_settings', p.policyname);
    END LOOP;

    SELECT c.column_name
    INTO ownership_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'user_signature_settings'
      AND c.column_name IN ('user_id', 'owner_id', 'created_by', 'uid')
    ORDER BY CASE c.column_name
      WHEN 'user_id' THEN 1
      WHEN 'owner_id' THEN 2
      WHEN 'created_by' THEN 3
      WHEN 'uid' THEN 4
      ELSE 999
    END
    LIMIT 1;

    IF ownership_col IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY "User owns row access on user_signature_settings" ON public.user_signature_settings FOR ALL TO authenticated USING (auth.uid() = %I) WITH CHECK (auth.uid() = %I)',
        ownership_col,
        ownership_col
      );
    ELSE
      RAISE NOTICE 'Locked down public.user_signature_settings: no ownership column found';
    END IF;
  END IF;
END
$$;

COMMIT;
