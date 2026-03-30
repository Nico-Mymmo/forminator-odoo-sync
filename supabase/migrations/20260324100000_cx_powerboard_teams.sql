-- ============================================================================
-- CX Powerboard Teams
-- ============================================================================
-- Adds:
--   cx_teams                  — named team definitions
--   cx_team_members           — user-to-team membership
--   cx_team_activity_configs  — which activity types a team tracks (with overrides)
--   cx_user_personal_configs  — individual user extra activity types
--
-- Design:
--   cx_activity_mapping stays the global registry (manages keep_done in Odoo).
--   Teams and personal configs reference mapping rows and add per-context overrides.
--   Users with NO team and NO personal configs → empty dashboard (noTeamAssigned).
-- ============================================================================

-- Shared updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION cx_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- cx_teams
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cx_teams (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER cx_teams_updated_at
  BEFORE UPDATE ON cx_teams
  FOR EACH ROW EXECUTE FUNCTION cx_set_updated_at();

-- ----------------------------------------------------------------------------
-- cx_team_members
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cx_team_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID        NOT NULL REFERENCES cx_teams(id)   ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- ----------------------------------------------------------------------------
-- cx_team_activity_configs
-- Per-team overrides of the global cx_activity_mapping defaults.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cx_team_activity_configs (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                  UUID        NOT NULL REFERENCES cx_teams(id)            ON DELETE CASCADE,
  mapping_id               UUID        NOT NULL REFERENCES cx_activity_mapping(id) ON DELETE CASCADE,
  priority_weight          INTEGER     NOT NULL DEFAULT 10,
  show_on_dashboard        BOOLEAN     NOT NULL DEFAULT true,
  danger_threshold_overdue INTEGER     NOT NULL DEFAULT 1,
  danger_threshold_today   INTEGER     NOT NULL DEFAULT 3,
  include_in_streak        BOOLEAN     NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, mapping_id)
);

CREATE TRIGGER cx_team_activity_configs_updated_at
  BEFORE UPDATE ON cx_team_activity_configs
  FOR EACH ROW EXECUTE FUNCTION cx_set_updated_at();

-- ----------------------------------------------------------------------------
-- cx_user_personal_configs
-- Individual user's extra activity types on top of team configs.
-- Personal config overrides team config for the same activity type.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cx_user_personal_configs (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES users(id)              ON DELETE CASCADE,
  mapping_id               UUID        NOT NULL REFERENCES cx_activity_mapping(id) ON DELETE CASCADE,
  priority_weight          INTEGER     NOT NULL DEFAULT 10,
  show_on_dashboard        BOOLEAN     NOT NULL DEFAULT true,
  danger_threshold_overdue INTEGER     NOT NULL DEFAULT 1,
  danger_threshold_today   INTEGER     NOT NULL DEFAULT 3,
  include_in_streak        BOOLEAN     NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, mapping_id)
);

CREATE TRIGGER cx_user_personal_configs_updated_at
  BEFORE UPDATE ON cx_user_personal_configs
  FOR EACH ROW EXECUTE FUNCTION cx_set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- All writes go through the Worker (service_role bypasses RLS).
-- ----------------------------------------------------------------------------
ALTER TABLE cx_teams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cx_team_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cx_team_activity_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cx_user_personal_configs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read teams and membership (needed for switcher + settings)
CREATE POLICY "cx_teams_select"
  ON cx_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "cx_team_members_select"
  ON cx_team_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "cx_team_activity_configs_select"
  ON cx_team_activity_configs FOR SELECT TO authenticated USING (true);

-- Users can only read their own personal configs
CREATE POLICY "cx_user_personal_configs_select"
  ON cx_user_personal_configs FOR SELECT TO authenticated
  USING (user_id = auth.uid());
