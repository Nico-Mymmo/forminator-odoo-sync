-- Add shared field_meta JSONB column to fs_v2_integrations.
-- Stores per-field UI settings (hidden, alias, show_in_list) for all users.
ALTER TABLE fs_v2_integrations
  ADD COLUMN IF NOT EXISTS field_meta JSONB NOT NULL DEFAULT '{}';
