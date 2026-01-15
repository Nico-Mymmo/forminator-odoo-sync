-- Quick admin restore
-- Insert admin user record (password will be set via Auth)

INSERT INTO users (id, email, password_hash, role, is_active, full_name)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@mymmo.com',
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- bcrypt hash of 'admin123'
  'admin',
  true,
  'System Administrator'
) ON CONFLICT (email) DO UPDATE SET
  role = 'admin',
  is_active = true;

-- Grant all modules
INSERT INTO user_modules (user_id, module_id, is_enabled)
SELECT 
  (SELECT id FROM users WHERE email = 'admin@mymmo.com'),
  id,
  true
FROM modules
ON CONFLICT (user_id, module_id) DO UPDATE SET is_enabled = true;
