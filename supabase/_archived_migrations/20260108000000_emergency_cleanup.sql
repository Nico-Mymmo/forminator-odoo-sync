-- EMERGENCY RECOVERY: Drop all public schema and rebuild
-- This restores the database to a clean state

-- Drop all existing tables (order matters due to foreign keys)
DROP TABLE IF EXISTS form_mapping_history CASCADE;
DROP TABLE IF EXISTS form_mappings CASCADE;
DROP TABLE IF EXISTS form_submissions_log CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS invites CASCADE;
DROP TABLE IF EXISTS user_modules CASCADE;
DROP TABLE IF EXISTS modules CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Now the original 20260108152310_auth_system.sql content will recreate everything
