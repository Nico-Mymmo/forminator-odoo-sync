-- Migration: Authentication & Module System
-- Created: 2026-01-08
-- Description: Add users, invites, sessions, modules, and role-based access control

-- =====================================================
-- TABLE: users
-- Purpose: Store user accounts with role-based access
-- =====================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Authentication
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  
  -- Profile
  full_name VARCHAR(255),
  avatar_url TEXT,
  
  -- Role
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  invited_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT valid_role CHECK (role IN ('admin', 'manager', 'user')),
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT email_lowercase CHECK (email = LOWER(email))
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;
CREATE INDEX idx_users_role ON users(role);

-- Comments
COMMENT ON TABLE users IS 'User accounts with role-based access control';
COMMENT ON COLUMN users.is_active IS 'Account activated on first login after invite acceptance';
COMMENT ON COLUMN users.role IS 'User role: admin (full access), manager (future), user (basic)';

-- =====================================================
-- TABLE: invites
-- Purpose: Invitation system for new users
-- =====================================================
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Recipient
  email VARCHAR(255) NOT NULL,
  
  -- Secure token
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT email_lowercase CHECK (email = LOWER(email)),
  CONSTRAINT token_not_empty CHECK (token != ''),
  CONSTRAINT expires_after_creation CHECK (expires_at > created_at)
);

-- Indexes
CREATE INDEX idx_invites_token ON invites(token) WHERE accepted_at IS NULL;
CREATE INDEX idx_invites_email ON invites(email);
CREATE INDEX idx_invites_expires ON invites(expires_at) WHERE accepted_at IS NULL;
CREATE INDEX idx_invites_created_by ON invites(created_by);

-- Comments
COMMENT ON TABLE invites IS 'Invitation tokens for new user registration (7-day expiry)';
COMMENT ON COLUMN invites.token IS 'Secure random token sent via email';
COMMENT ON COLUMN invites.accepted_at IS 'Timestamp when invite was accepted and account created';

-- =====================================================
-- TABLE: modules
-- Purpose: Available feature modules in the platform
-- =====================================================
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Module identification
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Routing & UI
  route VARCHAR(255) UNIQUE NOT NULL,
  icon VARCHAR(100),
  
  -- Configuration
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT code_lowercase CHECK (code = LOWER(code)),
  CONSTRAINT code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT route_starts_slash CHECK (route LIKE '/%'),
  CONSTRAINT display_order_positive CHECK (display_order >= 0)
);

-- Indexes
CREATE INDEX idx_modules_active ON modules(is_active, display_order);
CREATE INDEX idx_modules_code ON modules(code);
CREATE UNIQUE INDEX idx_modules_default ON modules(is_default) WHERE is_default = true;

-- Comments
COMMENT ON TABLE modules IS 'Feature modules with dynamic routing';
COMMENT ON COLUMN modules.code IS 'Unique code identifier (snake_case)';
COMMENT ON COLUMN modules.is_default IS 'Default module enabled for new users (only one allowed)';

-- =====================================================
-- TABLE: user_modules
-- Purpose: Junction table for user-module access
-- =====================================================
CREATE TABLE user_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- References
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  
  -- Access control
  is_enabled BOOLEAN DEFAULT true,
  
  -- Metadata
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  
  -- Constraints
  CONSTRAINT user_module_unique UNIQUE(user_id, module_id)
);

-- Indexes
CREATE INDEX idx_user_modules_user ON user_modules(user_id, is_enabled);
CREATE INDEX idx_user_modules_module ON user_modules(module_id);

-- Comments
COMMENT ON TABLE user_modules IS 'User access to specific modules (explicit permissions)';
COMMENT ON COLUMN user_modules.is_enabled IS 'Module visible and accessible to user';

-- =====================================================
-- TABLE: sessions
-- Purpose: Secure session management
-- =====================================================
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User reference
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Session token
  token VARCHAR(255) UNIQUE NOT NULL,
  
  -- Context
  user_agent TEXT,
  ip_address INET,
  
  -- Expiry
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Activity tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT token_not_empty CHECK (token != ''),
  CONSTRAINT expires_after_creation CHECK (expires_at > created_at)
);

-- Indexes
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user ON sessions(user_id, expires_at DESC);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

-- Comments
COMMENT ON TABLE sessions IS 'Active user sessions with automatic expiry';
COMMENT ON COLUMN sessions.token IS 'Secure session token (UUID or JWT)';

-- =====================================================
-- TRIGGER: Update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_modules_updated_at
  BEFORE UPDATE ON modules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DATA: Initial modules
-- =====================================================
INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES
  ('project_generator', 'Project Generator', 'Generate project structures and templates', '/projects', 'folder-plus', true, true, 1),
  ('forminator_sync', 'Forminator Sync', 'Sync Forminator forms to Odoo CRM', '/forminator', 'workflow', true, false, 2);

-- =====================================================
-- SEED DATA: Initial admin user
-- =====================================================
-- Password: admin123 (CHANGE THIS IN PRODUCTION!)
-- Generate with: bcrypt.hash('admin123', 10)
INSERT INTO users (email, password_hash, full_name, role, is_active)
VALUES (
  'admin@mymmo.com',
  '$2a$10$rL5kQX8pQxH5YGZ5YGZ5YGZ5YGZ5YGZ5YGZ5YGZ5YGZ5YGZ5YGZ5Y',  -- Placeholder hash
  'System Administrator',
  'admin',
  true
);

-- Grant admin access to all modules
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT 
  u.id,
  m.id,
  true,
  u.id
FROM users u
CROSS JOIN modules m
WHERE u.email = 'admin@mymmo.com';

-- =====================================================
-- FUNCTION: Grant default modules to new user
-- =====================================================
CREATE OR REPLACE FUNCTION grant_default_modules()
RETURNS TRIGGER AS $$
BEGIN
  -- Grant access to default module(s) for new users
  INSERT INTO user_modules (user_id, module_id, is_enabled)
  SELECT 
    NEW.id,
    id,
    true
  FROM modules
  WHERE is_default = true AND is_active = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER grant_default_modules_trigger
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION grant_default_modules();

-- =====================================================
-- FUNCTION: Cleanup expired sessions
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create scheduled job to run daily (requires pg_cron extension)
-- Uncomment if pg_cron is available:
-- SELECT cron.schedule('cleanup-sessions', '0 2 * * *', 'SELECT cleanup_expired_sessions()');

-- =====================================================
-- FUNCTION: Cleanup expired invites
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_expired_invites()
RETURNS void AS $$
BEGIN
  DELETE FROM invites
  WHERE expires_at < NOW() AND accepted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) - Optional for Supabase
-- =====================================================
-- Uncomment if using Supabase with RLS enabled

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_modules ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own data
-- CREATE POLICY users_select_own ON users
--   FOR SELECT USING (auth.uid() = id);

-- Policy: Admins can view all users
-- CREATE POLICY users_select_admin ON users
--   FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
--     )
--   );

-- =====================================================
-- VIEWS: Useful queries
-- =====================================================

-- View: User with modules
CREATE OR REPLACE VIEW user_modules_view AS
SELECT 
  u.id AS user_id,
  u.email,
  u.full_name,
  u.role,
  u.is_active,
  json_agg(
    json_build_object(
      'code', m.code,
      'name', m.name,
      'route', m.route,
      'icon', m.icon,
      'is_enabled', um.is_enabled
    ) ORDER BY m.display_order
  ) FILTER (WHERE m.id IS NOT NULL) AS modules
FROM users u
LEFT JOIN user_modules um ON u.id = um.user_id AND um.is_enabled = true
LEFT JOIN modules m ON um.module_id = m.id AND m.is_active = true
GROUP BY u.id;

COMMENT ON VIEW user_modules_view IS 'Users with their enabled modules in JSON format';

-- View: Active invites
CREATE OR REPLACE VIEW active_invites_view AS
SELECT 
  i.*,
  creator.email AS created_by_email,
  creator.full_name AS created_by_name
FROM invites i
JOIN users creator ON i.created_by = creator.id
WHERE i.accepted_at IS NULL 
  AND i.expires_at > NOW()
ORDER BY i.created_at DESC;

COMMENT ON VIEW active_invites_view IS 'Active (non-expired, non-accepted) invites';

-- =====================================================
-- GRANTS: Ensure proper permissions
-- =====================================================
-- Adjust based on your Supabase/PostgreSQL setup

-- GRANT USAGE ON SCHEMA public TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
