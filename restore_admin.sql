-- Recreate admin user with all access
-- Run this manually via Supabase SQL Editor after creating user via Auth UI

DO $$
DECLARE
  admin_user_id UUID := '6ccf4fcd-98ef-4298-8a15-1958133d74c6'; -- Your old admin ID
  module_rec RECORD;
BEGIN
  -- Create user record
  INSERT INTO users (id, email, password_hash, role, is_active, full_name)
  VALUES (
    admin_user_id,
    'admin@mymmo.com',
    '$2b$10$dummy', -- Will use Auth password
    'admin',
    true,
    'System Administrator'
  ) ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    is_active = true;
  
  -- Grant all modules
  FOR module_rec IN SELECT id FROM modules LOOP
    INSERT INTO user_modules (user_id, module_id, is_enabled)
    VALUES (admin_user_id, module_rec.id, true)
    ON CONFLICT (user_id, module_id) DO UPDATE SET is_enabled = true;
  END LOOP;
END $$;
