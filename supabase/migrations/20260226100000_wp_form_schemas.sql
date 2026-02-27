-- WordPress Form Schemas module
-- Volledig gescheiden van events-operations en forminator_forms tabel.
-- Beheert multi-site WP site registratie + form schema snapshots.

-- ─────────────────────────────────────────────────────────────────────────────
-- wp_sites
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wp_sites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  base_url   text        NOT NULL,
  api_secret text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wp_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_wp_sites"
  ON wp_sites
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- wp_form_schemas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wp_form_schemas (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          uuid        NOT NULL,
  form_id          text        NOT NULL,
  form_name        text        NOT NULL DEFAULT '',
  raw_schema       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  flattened_schema jsonb       NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at   timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_wp_form_schemas_site
    FOREIGN KEY (site_id)
    REFERENCES wp_sites(id)
    ON DELETE CASCADE,

  CONSTRAINT uq_wp_form_schemas_site_form
    UNIQUE (site_id, form_id)
);

ALTER TABLE wp_form_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_wp_form_schemas"
  ON wp_form_schemas
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
