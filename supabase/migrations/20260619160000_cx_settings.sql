-- Algemene instellingen voor CX Automations
CREATE TABLE IF NOT EXISTS cx_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Technical block escalatie-drempels (in dagen vanaf eerste detectie)
INSERT INTO cx_settings (key, value) VALUES
  ('tech_block_orange_days', '3'),
  ('tech_block_red_days',    '5')
ON CONFLICT (key) DO NOTHING;
