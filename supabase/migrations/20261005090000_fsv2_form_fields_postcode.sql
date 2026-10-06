-- Koppelingen — twee veldtypes erbij voor de OM-formulieren: 'postcode' en
-- 'city' (gemeente).
--
-- Een postcode wordt bij een inzending nagekeken tegen de officiële lijst
-- (src/modules/forminator-sync-v2/forms/postcodes.js, gegenereerd uit FOD BOSA
-- BeST Address) en genormaliseerd; een gemeenteveld onder een postcodeveld
-- wordt daaruit ingevuld. Het land van het postcodeveld staat in
-- validation.country (gesloten lijst in de Worker), dus daarvoor is geen kolom
-- nodig -- enkel de check-constraint op field_type moet de twee nieuwe namen
-- kennen.
--
-- De lijst hieronder moet gelijk lopen met FIELD_TYPES in forms/schema.js.

ALTER TABLE fs_v2_form_fields
  DROP CONSTRAINT IF EXISTS ck_fs_v2_form_fields_type;

ALTER TABLE fs_v2_form_fields
  ADD CONSTRAINT ck_fs_v2_form_fields_type
  CHECK (field_type IN (
    'text', 'email', 'tel', 'number', 'date', 'textarea',
    'select', 'radio', 'checkbox', 'checkbox_group',
    'hidden', 'heading', 'paragraph',
    'postcode', 'city'
  ));
