-- Add is_identifier flag to mappings so any field can be used as identifier for record lookup
ALTER TABLE fs_v2_mappings
  ADD COLUMN IF NOT EXISTS is_identifier boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN fs_v2_mappings.is_identifier IS
  'When true, this mapping field is used to look up / match existing Odoo records (identifier domain).';
