-- CX Powerboard: card extended display settings
-- Adds: title override, model filter, pills mode (standard/compact/hidden), view mode (stats/leaderboard)

ALTER TABLE cx_team_activity_configs
  ADD COLUMN IF NOT EXISTS card_title_override TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_model_filter   TEXT[]  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_pills_mode     TEXT    DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS card_view_mode      TEXT    DEFAULT 'stats';

ALTER TABLE cx_user_personal_configs
  ADD COLUMN IF NOT EXISTS card_title_override TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_model_filter   TEXT[]  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS card_pills_mode     TEXT    DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS card_view_mode      TEXT    DEFAULT 'stats';
