-- ============================================================================
-- Meertalige formulieren
--
-- Eén formulier kan in meerdere talen bestaan. Bewust GEEN rij per taal:
-- de veldsleutels en de optiewaarden blijven identiek over alle talen heen,
-- en dat is precies waarom één koppeling met één set mappings volstaat. Een
-- Franstalige bezoeker die "Appartement" aanklikt stuurt exact dezelfde waarde
-- naar Odoo als een Nederlandstalige; alleen het LABEL verschilt.
--
-- Een rij per taal zou betekenen: twee koppelingen, twee keer dezelfde mappings
-- onderhouden, en bij elke wijziging de kans dat er eentje achterblijft.
--
-- Vorm van de i18n-kolommen (de standaardtaal staat er NOOIT in -- die staat al
-- in de gewone kolommen, en twee bronnen voor dezelfde tekst is een bug in
-- wording):
--
--   fs_v2_forms.i18n
--     {"fr": {"name": "...", "description": "...",
--             "submit_label": "...", "success_message": "..."}}
--
--   fs_v2_form_fields.i18n
--     {"fr": {"label": "...", "help_text": "...", "placeholder": "...",
--             "options": {"appartement": "Appartement", "huis": "Maison"}}}
--
-- Optielabels hangen aan de WAARDE en niet aan een index: opties herschikken
-- in het Nederlands mag de Franse labels niet door elkaar gooien.
-- ============================================================================

ALTER TABLE fs_v2_forms
  ADD COLUMN IF NOT EXISTS languages        jsonb NOT NULL DEFAULT '["nl"]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_language text  NOT NULL DEFAULT 'nl',
  ADD COLUMN IF NOT EXISTS i18n             jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE fs_v2_form_fields
  ADD COLUMN IF NOT EXISTS i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

-- De standaardtaal moet een taal zijn die we kennen. De lijst zelf wordt in
-- schema.js gevalideerd; deze constraint is het vangnet voor het geval er ooit
-- rechtstreeks in de tabel geschreven wordt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fs_v2_forms_default_language'
  ) THEN
    ALTER TABLE fs_v2_forms
      ADD CONSTRAINT ck_fs_v2_forms_default_language
      CHECK (default_language IN ('nl', 'fr', 'en'));
  END IF;
END $$;

-- languages moet een array zijn die de standaardtaal bevat. Zonder deze eis kan
-- een formulier terugvallen op een taal die het zelf niet zegt te spreken, en
-- dan staat er tekst op een pagina die nergens te bewerken is.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fs_v2_forms_languages_shape'
  ) THEN
    ALTER TABLE fs_v2_forms
      ADD CONSTRAINT ck_fs_v2_forms_languages_shape
      CHECK (
        jsonb_typeof(languages) = 'array'
        AND languages @> to_jsonb(default_language)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fs_v2_forms_i18n_shape'
  ) THEN
    ALTER TABLE fs_v2_forms
      ADD CONSTRAINT ck_fs_v2_forms_i18n_shape
      CHECK (jsonb_typeof(i18n) = 'object');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_fs_v2_form_fields_i18n_shape'
  ) THEN
    ALTER TABLE fs_v2_form_fields
      ADD CONSTRAINT ck_fs_v2_form_fields_i18n_shape
      CHECK (jsonb_typeof(i18n) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN fs_v2_forms.languages IS
  'Talen waarin dit formulier bestaat, bv. ["nl","fr"]. Bevat altijd default_language.';
COMMENT ON COLUMN fs_v2_forms.i18n IS
  'Vertalingen per taal van name/description/submit_label/success_message. Standaardtaal staat hier NIET in.';
COMMENT ON COLUMN fs_v2_form_fields.i18n IS
  'Vertalingen per taal van label/help_text/placeholder, plus options als {waarde: label}. Waarden vertalen nooit.';
