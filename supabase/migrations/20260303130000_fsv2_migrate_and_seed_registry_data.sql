-- Forminator Sync V2 — migrate sentinel-key data to proper tables
--                        + seed default models
--                        + remove sentinel rows
--
-- Step 1: Migrate any existing __odoo_models__ sentinel data to fs_v2_odoo_models.
--         If the sentinel row exists and has data, each JSON entry becomes a proper row.
--
-- Step 2: Seed the three default models if they are not already present
--         (covers fresh installs and installs that never had the sentinel row).
--
-- Step 3: Migrate any existing __model_links__ sentinel data to fs_v2_model_links.
--
-- Step 4: Delete the two sentinel rows from fs_v2_model_defaults.
--
-- All inserts use ON CONFLICT DO NOTHING so this migration is safe to re-run.

BEGIN;

-- ── Step 1: Migrate __odoo_models__ sentinel data ──────────────────────────
INSERT INTO fs_v2_odoo_models (name, label, icon, sort_order)
SELECT
  (elem->>'name')::text,
  COALESCE(NULLIF(elem->>'label', ''), elem->>'name'),
  COALESCE(NULLIF(elem->>'icon',  ''), 'box'),
  (ordinality - 1)::integer
FROM
  fs_v2_model_defaults,
  jsonb_array_elements(fields) WITH ORDINALITY AS t(elem, ordinality)
WHERE
  odoo_model = '__odoo_models__'
  AND jsonb_typeof(fields) = 'array'
  AND jsonb_array_length(fields) > 0
  AND (elem->>'name') IS NOT NULL
  AND (elem->>'name') <> ''
ON CONFLICT (name) DO NOTHING;

-- ── Step 2: Seed the three default models (safe no-op if already present) ──
INSERT INTO fs_v2_odoo_models (name, label, icon, sort_order) VALUES
  ('res.partner',            'Contact',              'user',         0),
  ('crm.lead',               'Lead',                 'trending-up',  1),
  ('x_webinarregistrations', 'Webinaarinschrijving', 'video',        2)
ON CONFLICT (name) DO NOTHING;

-- ── Step 3: Migrate __model_links__ sentinel data ──────────────────────────
INSERT INTO fs_v2_model_links (model_a, model_b, link_field, link_label)
SELECT
  (elem->>'model_a')::text,
  (elem->>'model_b')::text,
  (elem->>'link_field')::text,
  COALESCE(elem->>'link_label', '')
FROM
  fs_v2_model_defaults,
  jsonb_array_elements(fields) AS t(elem)
WHERE
  odoo_model = '__model_links__'
  AND jsonb_typeof(fields) = 'array'
  AND jsonb_array_length(fields) > 0
  AND (elem->>'model_a')   IS NOT NULL
  AND (elem->>'model_b')   IS NOT NULL
  AND (elem->>'link_field') IS NOT NULL
ON CONFLICT (model_a, model_b, link_field) DO NOTHING;

-- ── Step 4: Remove sentinel rows from fs_v2_model_defaults ─────────────────
DELETE FROM fs_v2_model_defaults
WHERE odoo_model IN ('__odoo_models__', '__model_links__');

COMMIT;
