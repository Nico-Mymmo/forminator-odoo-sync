BEGIN;

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'update_updated_at',
        'update_sales_insight_queries_updated_at',
        'update_updated_at_column',
        'grant_default_modules',
        'cleanup_expired_sessions',
        'cleanup_expired_invites',
        'update_form_mappings_updated_at',
        'log_form_mapping_changes'
      ])
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.signature);
  END LOOP;
END
$$;

COMMIT;
