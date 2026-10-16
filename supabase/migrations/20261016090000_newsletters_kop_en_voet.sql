-- Nieuwsbrieven: de kop en de voet van de mail zijn instelbaar.
--  * per soort mailing (reeks): de naam zoals de lezer ze ziet, en de twee
--    voetteksten (leeg = de standaardzin);
--  * per mailing (editie): logo en de twee regels rechtsboven
--    ({"logo_url","titel","ondertitel"}; ontbreekt een sleutel, dan geldt de
--    standaard van de reeks).

ALTER TABLE newsletter_series
  ADD COLUMN IF NOT EXISTS public_name   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS footer_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS footer_line   TEXT NOT NULL DEFAULT '';

ALTER TABLE newsletter_editions
  ADD COLUMN IF NOT EXISTS header JSONB NOT NULL DEFAULT '{}'::jsonb;
