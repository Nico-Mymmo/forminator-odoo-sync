-- Seed default field mappings for all three Odoo models used by Forminator Sync V2.
-- Uses ON CONFLICT DO NOTHING so it is safe to re-run and won't overwrite custom edits.

INSERT INTO fs_v2_model_defaults (odoo_model, fields) VALUES
(
  'res.partner',
  '[
    {"name":"name",   "label":"Naam",     "required":false,"order_index":0},
    {"name":"email",  "label":"E-mail",   "required":false,"order_index":1},
    {"name":"phone",  "label":"Telefoon", "required":false,"order_index":2},
    {"name":"mobile", "label":"Mobiel",   "required":false,"order_index":3},
    {"name":"street", "label":"Straat",   "required":false,"order_index":4},
    {"name":"city",   "label":"Stad",     "required":false,"order_index":5},
    {"name":"zip",    "label":"Postcode", "required":false,"order_index":6}
  ]'::jsonb
),
(
  'crm.lead',
  '[
    {"name":"partner_name","label":"Naam",               "required":false,"order_index":0},
    {"name":"email_from",  "label":"E-mail",             "required":true, "order_index":1},
    {"name":"phone",       "label":"Telefoon",           "required":false,"order_index":2},
    {"name":"description", "label":"Bericht / Notities", "required":false,"order_index":3}
  ]'::jsonb
),
(
  'x_webinarregistrations',
  '[
    {"name":"partner_id", "label":"Contact",        "required":true, "order_index":0},
    {"name":"webinar_id", "label":"Webinar",        "required":true, "order_index":1},
    {"name":"x_name",     "label":"Naam deelnemer", "required":false,"order_index":2},
    {"name":"x_email",    "label":"E-mail deelnemer","required":false,"order_index":3}
  ]'::jsonb
)
ON CONFLICT (odoo_model) DO NOTHING;
