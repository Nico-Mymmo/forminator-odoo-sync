-- Voeg flag_reason toe aan flag_thresholds
-- Mogelijke waarden: no_activity | churn_signal | too_long_in_stage

ALTER TABLE flag_thresholds
  ADD COLUMN IF NOT EXISTS flag_reason TEXT NOT NULL DEFAULT 'no_activity';
