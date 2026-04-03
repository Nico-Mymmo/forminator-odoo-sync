-- ─────────────────────────────────────────────────────────────────────────────
-- FSV2: conditionele stap-uitvoering
--
-- Elke stap (fs_v2_targets) kan optioneel een conditie bevatten:
--   condition_field  — de naam van het formulierveld waarop geïnspecteerd wordt
--   condition_values — jsonb array van toegestane waarden (case-insensitive)
--
-- Als condition_field gezet is EN de ingediende waarde staat NIET in
-- condition_values → stap wordt overgeslagen met skipped_reason 'condition_not_met'.
-- Als condition_values leeg of null is → geen conditie, stap loopt altijd.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS condition_field  text,
  ADD COLUMN IF NOT EXISTS condition_values jsonb;

COMMENT ON COLUMN fs_v2_targets.condition_field  IS 'Optioneel: formulierveldnaam waarop de uitvoeringsconditie gebaseerd is.';
COMMENT ON COLUMN fs_v2_targets.condition_values IS 'Optioneel: jsonb array van toegestane veldwaarden (case-insensitief). Null of leeg = altijd uitvoeren.';
