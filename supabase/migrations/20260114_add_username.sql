-- Migration: Add username to users
-- Created: 2026-01-14
-- Description: Add username field for display purposes

-- Add username column
ALTER TABLE users 
ADD COLUMN username VARCHAR(50);

-- Add unique constraint
ALTER TABLE users 
ADD CONSTRAINT users_username_unique UNIQUE (username);

-- Add check constraint for valid username format (alphanumeric, underscore, hyphen)
ALTER TABLE users 
ADD CONSTRAINT username_format CHECK (username IS NULL OR username ~* '^[a-z0-9_-]+$');

-- Add index for faster lookups
CREATE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Comment
COMMENT ON COLUMN users.username IS 'Unique username for display (optional, defaults to email if not set)';
