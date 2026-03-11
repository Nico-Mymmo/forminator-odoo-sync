-- Addendum D — Model Registry Consolidation
-- Fase 1: Extend fs_v2_odoo_models with profile columns
--          Migrate fs_v2_model_defaults → fs_v2_odoo_models.default_fields
--          Drop fs_v2_model_defaults

-- 1. Add profile columns to fs_v2_odoo_models (all nullable)
ALTER TABLE fs_v2_odoo_models
  ADD COLUMN IF NOT EXISTS default_fields  jsonb  NULL,
  ADD COLUMN IF NOT EXISTS identifier_type text   NULL,
  ADD COLUMN IF NOT EXISTS update_policy   text   NULL,
  ADD COLUMN IF NOT EXISTS resolver_type   text   NULL;

-- 2. Seed profile data for the three built-in models (idempotent via ON CONFLICT)
INSERT INTO fs_v2_odoo_models (name, label, icon, sort_order, identifier_type, update_policy, resolver_type, default_fields)
VALUES
  (
    'res.partner',
    'Contact',
    'user',
    0,
    'mapped_fields',
    'always_overwrite',
    NULL,
    '[
      {"name":"name",   "label":"Naam",     "required":false},
      {"name":"email",  "label":"E-mail",   "required":false},
      {"name":"phone",  "label":"Telefoon", "required":false},
      {"name":"mobile", "label":"Mobiel",   "required":false},
      {"name":"street", "label":"Straat",   "required":false},
      {"name":"city",   "label":"Stad",     "required":false},
      {"name":"zip",    "label":"Postcode", "required":false}
    ]'::jsonb
  ),
  (
    'crm.lead',
    'Lead',
    'trending-up',
    1,
    'mapped_fields',
    'always_overwrite',
    NULL,
    '[
      {"name":"partner_name","label":"Naam",               "required":false},
      {"name":"email_from",  "label":"E-mail",             "required":true},
      {"name":"phone",       "label":"Telefoon",           "required":false},
      {"name":"description", "label":"Bericht / Notities", "required":false}
    ]'::jsonb
  ),
  (
    'x_webinarregistrations',
    'Webinaarinschrijving',
    'video',
    2,
    'registration_composite',
    'always_overwrite',
    'webinar_by_external_id',
    '[
      {"name":"partner_id","label":"Contact",          "required":true},
      {"name":"webinar_id","label":"Webinar",          "required":true},
      {"name":"x_name",    "label":"Naam deelnemer",   "required":false},
      {"name":"x_email",   "label":"E-mail deelnemer", "required":false}
    ]'::jsonb
  )
ON CONFLICT (name) DO UPDATE
  SET identifier_type = EXCLUDED.identifier_type,
      update_policy   = EXCLUDED.update_policy,
      resolver_type   = EXCLUDED.resolver_type,
      default_fields  = EXCLUDED.default_fields;

-- 3. Migrate any existing rows from fs_v2_model_defaults into fs_v2_odoo_models.default_fields
--    Only updates rows that exist in fs_v2_odoo_models and have not yet been set above.
UPDATE fs_v2_odoo_models om
SET default_fields = md.fields
FROM fs_v2_model_defaults md
WHERE md.odoo_model = om.name
  AND om.default_fields IS NULL
  AND md.fields IS NOT NULL
  AND md.fields != '[]'::jsonb;

-- 4. Drop fs_v2_model_defaults
DROP TABLE IF EXISTS fs_v2_model_defaults;
