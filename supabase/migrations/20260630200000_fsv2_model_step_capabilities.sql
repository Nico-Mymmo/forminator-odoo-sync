-- Voegt allow_chatter en allow_activities toe aan fs_v2_odoo_models.
-- Default true = backwards compatible (alle bestaande modellen ondersteunen beide).

ALTER TABLE fs_v2_odoo_models
  ADD COLUMN IF NOT EXISTS allow_chatter    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_activities boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN fs_v2_odoo_models.allow_chatter    IS 'Geeft aan of chatterberichten gepost kunnen worden op records van dit model';
COMMENT ON COLUMN fs_v2_odoo_models.allow_activities IS 'Geeft aan of activiteiten aangemaakt kunnen worden op records van dit model';
