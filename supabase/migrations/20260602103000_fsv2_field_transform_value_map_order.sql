-- Preserve user-defined row order for Forminator Sync v2 value maps.
-- JSONB object key order is not stable, so the UI stores an explicit ordered key list.
ALTER TABLE fs_v2_field_transforms
  ADD COLUMN IF NOT EXISTS value_map_order JSONB DEFAULT NULL;

COMMENT ON COLUMN fs_v2_field_transforms.value_map_order IS
  'Ordered list of source keys for value_map rendering (excluding __catchall__).';
