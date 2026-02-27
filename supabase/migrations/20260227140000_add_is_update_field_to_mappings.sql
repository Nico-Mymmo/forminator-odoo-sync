-- Add is_update_field flag to mappings.
-- When true (default), the field is written on both create AND update.
-- When false, the field is ONLY written on create, not when updating an existing record.
ALTER TABLE fs_v2_mappings
  ADD COLUMN IF NOT EXISTS is_update_field boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN fs_v2_mappings.is_update_field IS
  'When true (default), this field is written on both create and update. When false, only written on create (e.g. active=true should only set on creation, not overwrite on subsequent syncs).';
