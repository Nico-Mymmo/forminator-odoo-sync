-- ============================================================================
-- Vooraf invullen vanuit een URL-parameter
--
-- Gebruik: een bezoeker krijgt een link met bv. ?e=jan@example.com. Het
-- formulierveld dat aan de parameternaam "e" gekoppeld is, wordt bij het laden
-- van de pagina automatisch met die waarde gevuld. Dat veld blijft daarna
-- gewoon aanpasbaar (behalve verborgen velden, die toch geen zichtbare UI
-- hebben) -- dit is puur een gemak, geen slot.
--
-- Bewust GEEN aparte tabel of relatie: de parameternaam hangt rechtstreeks aan
-- het veld, net zoals default_value en odoo_field_type dat al doen. Eén
-- formulierveld heeft hoogstens één parameternaam.
--
-- Niet elk veldtype leent zich hiervoor: bij checkbox/radio/checkbox_group is
-- er geen enkelvoudige tekstwaarde om zomaar in te vullen (een checkbox is
-- aan/uit, een radio/checkbox_group heeft vaste opties). schema.js weert die
-- typen al bij het opslaan (PREFILL_EXCLUDED_TYPES); deze CHECK is het
-- vangnet voor het geval er ooit rechtstreeks in de tabel geschreven wordt.
-- ============================================================================

ALTER TABLE fs_v2_form_fields
  ADD COLUMN IF NOT EXISTS prefill_param text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fs_v2_form_fields_prefill_param_shape'
  ) THEN
    ALTER TABLE fs_v2_form_fields
      ADD CONSTRAINT ck_fs_v2_form_fields_prefill_param_shape
      CHECK (prefill_param IS NULL OR prefill_param ~ '^[A-Za-z0-9_-]{1,64}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fs_v2_form_fields_prefill_excluded_types'
  ) THEN
    ALTER TABLE fs_v2_form_fields
      ADD CONSTRAINT ck_fs_v2_form_fields_prefill_excluded_types
      CHECK (prefill_param IS NULL OR field_type NOT IN ('checkbox', 'radio', 'checkbox_group'));
  END IF;
END $$;

COMMENT ON COLUMN fs_v2_form_fields.prefill_param IS
  'Naam van de URL-queryparameter waarmee dit veld bij het laden van de pagina automatisch gevuld wordt (bv. "e" voor ?e=..." ). NULL = geen prefill. Niet beschikbaar voor checkbox/radio/checkbox_group.';
