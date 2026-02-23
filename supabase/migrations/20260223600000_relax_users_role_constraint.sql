-- ============================================================================
-- Relax users.role check constraint to allow 'marketing_signature'
-- ============================================================================
-- The baseline migration used CREATE TABLE IF NOT EXISTS, so any pre-existing
-- check constraint on the role column was silently kept. We drop it here
-- (if it exists) and add no new constraint – role values are validated at
-- the application layer only.
-- ============================================================================

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  -- Find any check constraint on users.role by inspecting pg_constraint
  SELECT c.conname INTO v_constraint
  FROM pg_constraint c
  JOIN pg_class t   ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname  = 'users'
    AND c.contype  = 'c'   -- check constraint
    AND pg_get_constraintdef(c.oid) ILIKE '%role%'
  LIMIT 1;

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(v_constraint);
    RAISE NOTICE 'Dropped check constraint % from users.role', v_constraint;
  ELSE
    RAISE NOTICE 'No role check constraint found on users – nothing to drop';
  END IF;
END $$;
