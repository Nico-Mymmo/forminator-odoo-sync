-- ============================================================================
-- Koppelingen: waar staat de verstuurknop van een OM-formulier?
-- ============================================================================
--   below = onder de velden, rechts (zoals altijd)
--   1:1 / 2:1 / 3:1 = NAAST het laatste eenregelige veld (tekst, e-mail,
--     telefoon, getal, datum, keuzelijst), in die verhouding (veld : knop).
--     Voor een kort formulier als "e-mail + Naar de cursus". Wat daarna komt
--     (een vinkje) staat onder die rij; zonder zo'n veld staat de knop eronder.
-- Zie submitLayoutVoor() in src/modules/forminator-sync-v2/forms/schema.js.

ALTER TABLE fs_v2_forms
  ADD COLUMN IF NOT EXISTS submit_layout text NOT NULL DEFAULT 'below';

-- Het label van een veld verbergen ("e-mail" boven een vak waar al "jouw@e-mail.be"
-- in staat). Het blijft in de HTML voor schermlezers; enkel het zicht verdwijnt.
ALTER TABLE fs_v2_form_fields
  ADD COLUMN IF NOT EXISTS label_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE fs_v2_forms
  DROP CONSTRAINT IF EXISTS ck_fs_v2_forms_submit_layout;
ALTER TABLE fs_v2_forms
  ADD CONSTRAINT ck_fs_v2_forms_submit_layout
  CHECK (submit_layout IN ('below', '1:1', '2:1', '3:1'));
