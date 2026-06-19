-- CX Automations: vlag-drempelwaarden per Odoo CS-fase
-- Odoo stage IDs (geverifieerd 2026-06-19):
--   5  = opstartgesprek  (Intake)
--   7  = Opstartsessie Expert  (Opstarthulp)
--   8  = Basisinstellingen gecontroleerd  (In Configuratie)
--   9  = Follow-up validatie

CREATE TABLE IF NOT EXISTS flag_thresholds (
  id          SERIAL PRIMARY KEY,
  stage_id    INTEGER NOT NULL UNIQUE,
  stage_name  TEXT NOT NULL,
  yellow_days INTEGER NOT NULL DEFAULT 14,
  orange_days INTEGER NOT NULL DEFAULT 30,
  red_days    INTEGER NOT NULL DEFAULT 60,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  TEXT
);

INSERT INTO flag_thresholds (stage_id, stage_name, yellow_days, orange_days, red_days) VALUES
  (5, 'opstartgesprek',                          7,  14, 30),
  (7, 'Opstartsessie Expert',                    7,  14, 30),
  (8, 'Basisinstellingen gecontroleerd',         10,  21, 45),
  (9, 'Follow-up validatie',                     14,  30, 60)
ON CONFLICT (stage_id) DO NOTHING;

-- Audit log voor de dagelijkse cron-runs
CREATE TABLE IF NOT EXISTS flag_run_log (
  id                    SERIAL PRIMARY KEY,
  ran_at                TIMESTAMPTZ DEFAULT NOW(),
  actiebladen_checked   INTEGER,
  flags_updated         INTEGER,
  error                 TEXT
);
