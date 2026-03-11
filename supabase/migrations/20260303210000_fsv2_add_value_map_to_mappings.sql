-- ─────────────────────────────────────────────────────────────────────────────
-- Forminator Sync V2 — value_map op fs_v2_mappings
--
-- Voegt een optionele JSONB-kolom toe aan fs_v2_mappings voor keuzeveld-mapping.
--
-- Gebruik:
--   Wanneer een formulierveld van het type radio/checkbox/select gekoppeld is
--   aan een Odoo selection- of many2one-veld, kan de gebruiker per formuileroptie
--   de corresponderende Odoo-waarde instellen.
--
--   Voorbeeld:
--     value_map = {
--       "Webinars":   "webinar",
--       "Trainingen": "training"
--     }
--
--   De worker zoekt de formulierwaarde op in value_map. Bij een treffer wordt
--   de gemapte Odoo-waarde gebruikt; anders de ruwe formulierwaarde (fallback).
--
--   Null / ontbrekend → geen mapping, ruwe waarde wordt doorgeschreven (huidig gedrag).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fs_v2_mappings
  ADD COLUMN IF NOT EXISTS value_map jsonb DEFAULT NULL;

-- Commentaar voor de pg_catalog zodat tooling begrijpt waarvoor de kolom dient.
COMMENT ON COLUMN fs_v2_mappings.value_map IS
  'Optionele waarde-mapping voor keuzevelden (radio/checkbox/select). '
  'Formaat: {"<formulier-waarde>": "<odoo-waarde>", …}. '
  'Null = geen mapping, ruwe formulierwaarde wordt doorgeschreven.';
