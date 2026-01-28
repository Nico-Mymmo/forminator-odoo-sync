-- Create admin user with password: PLN1ry5!hKadnlk*
-- Password hash: SHA256 in format $2a$XX$hash

INSERT INTO users (email, password_hash, role, is_active)
VALUES (
  'admin@mymmo.com',
  '$2a20$ad39e5167860dd488590a844e29696062f9430fdb44fecdebb71ee14da0e3a',
  'admin',
  true
)
ON CONFLICT (email) 
DO UPDATE SET 
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active;

-- Give admin access to all modules
INSERT INTO user_modules (user_id, module_id)
SELECT 
  u.id,
  m.id
FROM users u
CROSS JOIN modules m
WHERE u.email = 'admin@mymmo.com'
ON CONFLICT (user_id, module_id) DO NOTHING;
