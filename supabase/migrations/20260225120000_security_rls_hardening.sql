BEGIN;

DO $$
BEGIN
  IF to_regclass('public.user_modules_view') IS NOT NULL THEN
    ALTER VIEW public.user_modules_view SET (security_invoker = true);
  END IF;

  IF to_regclass('public.active_invites_view') IS NOT NULL THEN
    ALTER VIEW public.active_invites_view SET (security_invoker = true);
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.modules') IS NOT NULL THEN
    ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.user_modules') IS NOT NULL THEN
    ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.form_mappings') IS NOT NULL THEN
    ALTER TABLE public.form_mappings ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.form_mappings_history') IS NOT NULL THEN
    ALTER TABLE public.form_mappings_history ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.form_submissions_log') IS NOT NULL THEN
    ALTER TABLE public.form_submissions_log ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.invites') IS NOT NULL THEN
    ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
  END IF;

  IF to_regclass('public.signature_push_excluded') IS NOT NULL THEN
    ALTER TABLE public.signature_push_excluded ENABLE ROW LEVEL SECURITY;
  END IF;
END
$$;

DO $$
DECLARE
  has_id boolean;
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'id'
    ) INTO has_id;

    IF has_id THEN
      DROP POLICY IF EXISTS "Users can read own user row" ON public.users;
      CREATE POLICY "Users can read own user row"
        ON public.users
        FOR SELECT
        TO authenticated
        USING (auth.uid() = id);

      DROP POLICY IF EXISTS "Users can update own user row" ON public.users;
      CREATE POLICY "Users can update own user row"
        ON public.users
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
    END IF;
  END IF;
END
$$;

DO $$
DECLARE
  has_user_id boolean;
BEGIN
  IF to_regclass('public.sessions') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sessions'
        AND column_name = 'user_id'
    ) INTO has_user_id;

    IF has_user_id THEN
      DROP POLICY IF EXISTS "Users can read own sessions" ON public.sessions;
      CREATE POLICY "Users can read own sessions"
        ON public.sessions
        FOR SELECT
        TO authenticated
        USING (auth.uid() = user_id);

      DROP POLICY IF EXISTS "Users can create own sessions" ON public.sessions;
      CREATE POLICY "Users can create own sessions"
        ON public.sessions
        FOR INSERT
        TO authenticated
        WITH CHECK (auth.uid() = user_id);

      DROP POLICY IF EXISTS "Users can update own sessions" ON public.sessions;
      CREATE POLICY "Users can update own sessions"
        ON public.sessions
        FOR UPDATE
        TO authenticated
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);

      DROP POLICY IF EXISTS "Users can delete own sessions" ON public.sessions;
      CREATE POLICY "Users can delete own sessions"
        ON public.sessions
        FOR DELETE
        TO authenticated
        USING (auth.uid() = user_id);
    END IF;
  END IF;
END
$$;

DO $$
DECLARE
  has_created_by boolean;
  has_accepted_by boolean;
  invite_match_expr text;
BEGIN
  IF to_regclass('public.invites') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'invites'
        AND column_name = 'created_by'
    ) INTO has_created_by;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'invites'
        AND column_name = 'accepted_by'
    ) INTO has_accepted_by;

    IF has_created_by AND has_accepted_by THEN
      invite_match_expr := '(created_by = auth.uid() OR accepted_by = auth.uid())';
    ELSIF has_created_by THEN
      invite_match_expr := '(created_by = auth.uid())';
    ELSIF has_accepted_by THEN
      invite_match_expr := '(accepted_by = auth.uid())';
    ELSE
      invite_match_expr := NULL;
    END IF;

    IF invite_match_expr IS NOT NULL THEN
      DROP POLICY IF EXISTS "Users can read related invites" ON public.invites;
      EXECUTE format(
        'CREATE POLICY "Users can read related invites" ON public.invites FOR SELECT TO authenticated USING %s',
        invite_match_expr
      );

      DROP POLICY IF EXISTS "Users can update related invites" ON public.invites;
      EXECUTE format(
        'CREATE POLICY "Users can update related invites" ON public.invites FOR UPDATE TO authenticated USING %s WITH CHECK %s',
        invite_match_expr,
        invite_match_expr
      );

      DROP POLICY IF EXISTS "Users can delete own invites" ON public.invites;
      EXECUTE format(
        'CREATE POLICY "Users can delete own invites" ON public.invites FOR DELETE TO authenticated USING %s',
        invite_match_expr
      );
    END IF;

    IF has_created_by THEN
      DROP POLICY IF EXISTS "Users can create own invites" ON public.invites;
      CREATE POLICY "Users can create own invites"
        ON public.invites
        FOR INSERT
        TO authenticated
        WITH CHECK (created_by = auth.uid());
    END IF;
  END IF;
END
$$;

DO $$
DECLARE
  invites_has_token boolean;
  sessions_has_token boolean;
BEGIN
  IF to_regclass('public.invites') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'invites'
        AND column_name = 'token'
    ) INTO invites_has_token;

    IF invites_has_token THEN
      REVOKE SELECT (token) ON TABLE public.invites FROM anon;
      REVOKE SELECT (token) ON TABLE public.invites FROM authenticated;
    END IF;
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sessions'
        AND column_name = 'token'
    ) INTO sessions_has_token;

    IF sessions_has_token THEN
      REVOKE SELECT (token) ON TABLE public.sessions FROM anon;
      REVOKE SELECT (token) ON TABLE public.sessions FROM authenticated;
    END IF;
  END IF;
END
$$;

COMMIT;
