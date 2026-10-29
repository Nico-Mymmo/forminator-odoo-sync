-- Koppelingen — veldtype 'street' (Straat en huisnummer) voor de OM-formulieren.
--
-- De straat wordt bij een inzending herkend in de officiële lijst van de
-- postcode erboven (forms/straten.js, tabel `straten` in D1 om-core) en krijgt
-- dan de officiële schrijfwijze. De lijst hieronder moet gelijk lopen met
-- FIELD_TYPES in forms/schema.js.

ALTER TABLE fs_v2_form_fields
  DROP CONSTRAINT IF EXISTS ck_fs_v2_form_fields_type;

ALTER TABLE fs_v2_form_fields
  ADD CONSTRAINT ck_fs_v2_form_fields_type
  CHECK (field_type IN (
    'text', 'email', 'tel', 'number', 'date', 'textarea',
    'select', 'radio', 'checkbox', 'checkbox_group',
    'hidden', 'heading', 'paragraph',
    'postcode', 'city', 'street'
  ));
