-- Migration: Allow spaces in username
-- Created: 2026-01-15
-- Description: Remove username format restriction to allow any characters including spaces

-- Drop the old format constraint
ALTER TABLE users 
DROP CONSTRAINT IF EXISTS username_format;

-- Add comment to clarify new behavior
COMMENT ON COLUMN users.username IS 'Unique username for display (optional, allows any characters, defaults to email if not set)';
