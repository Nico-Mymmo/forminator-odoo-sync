-- Migration: add card_hero_metric to CX Powerboard activity config tables
-- Determines which value is displayed as the large "hero" number on a dashboard card.
-- Options: 'auto' | 'remaining' | 'overdue' | 'today' | 'completed'

ALTER TABLE cx_team_activity_configs
  ADD COLUMN IF NOT EXISTS card_hero_metric TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE cx_team_activity_configs
  DROP CONSTRAINT IF EXISTS cx_team_activity_configs_card_hero_metric_check;

ALTER TABLE cx_team_activity_configs
  ADD CONSTRAINT cx_team_activity_configs_card_hero_metric_check
    CHECK (card_hero_metric IN ('auto', 'remaining', 'overdue', 'today', 'completed'));

ALTER TABLE cx_user_personal_configs
  ADD COLUMN IF NOT EXISTS card_hero_metric TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE cx_user_personal_configs
  DROP CONSTRAINT IF EXISTS cx_user_personal_configs_card_hero_metric_check;

ALTER TABLE cx_user_personal_configs
  ADD CONSTRAINT cx_user_personal_configs_card_hero_metric_check
    CHECK (card_hero_metric IN ('auto', 'remaining', 'overdue', 'today', 'completed'));
