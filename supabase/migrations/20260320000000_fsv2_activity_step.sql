-- FSV2: Activity step columns on fs_v2_targets
-- Adds the five columns that power the create_activity operation_type.

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS activity_type_id          INTEGER,
  ADD COLUMN IF NOT EXISTS activity_deadline_offset  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS activity_summary_template TEXT,
  ADD COLUMN IF NOT EXISTS activity_user_id          INTEGER,
  ADD COLUMN IF NOT EXISTS activity_res_id_source    TEXT;

COMMENT ON COLUMN fs_v2_targets.activity_type_id         IS 'Odoo mail.activity.type ID';
COMMENT ON COLUMN fs_v2_targets.activity_deadline_offset IS 'Days from today for date_deadline (default 1)';
COMMENT ON COLUMN fs_v2_targets.activity_summary_template IS 'Template string with {{field_name}} placeholders for activity summary';
COMMENT ON COLUMN fs_v2_targets.activity_user_id         IS 'Odoo res.users ID to assign activity to (optional, defaults to integration owner)';
COMMENT ON COLUMN fs_v2_targets.activity_res_id_source   IS 'Context key of the record to attach activity to, e.g. step.1.record_id';
