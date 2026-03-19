-- ============================================================================
-- CX Powerboard — Dashboard card configuration columns
-- Adds show_on_dashboard + danger thresholds to cx_activity_mapping
-- ============================================================================

ALTER TABLE cx_activity_mapping
  ADD COLUMN show_on_dashboard        BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN danger_threshold_overdue INTEGER  NOT NULL DEFAULT 1,
  ADD COLUMN danger_threshold_today   INTEGER  NOT NULL DEFAULT 3;

COMMENT ON COLUMN cx_activity_mapping.show_on_dashboard        IS 'When true, this activity type appears as a card on the Dashboard tab';
COMMENT ON COLUMN cx_activity_mapping.danger_threshold_overdue IS 'Card turns red when overdue count >= this value';
COMMENT ON COLUMN cx_activity_mapping.danger_threshold_today   IS 'Card turns red when due-today count >= this value';
