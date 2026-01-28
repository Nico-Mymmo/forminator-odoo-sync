-- Baseline migration - Current database state
-- Generated: 2026-01-28
-- Tables: users, modules, user_modules, form_mappings

-- This baseline represents the actual state of the database
-- after manual administrative reset of migration history.

-- Note: This file serves as documentation only.
-- All listed tables already exist in the database.
-- No CREATE statements needed - this is a snapshot baseline.

-- Existing tables (do not recreate):
-- - auth.users (Supabase managed)
-- - public.users
-- - public.modules  
-- - public.user_modules
-- - public.form_mappings

-- This baseline migration is intentionally empty because:
-- 1. The database schema already exists
-- 2. We reset the migration history administratively
-- 3. This marks the starting point for future migrations

SELECT 'Baseline migration - schema already exists' AS status;
