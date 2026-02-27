-- WordPress Connections registry
-- Laat meerdere WP-sites configureren voor gebruik in Forminator Sync V2.
-- Events-operations blijft de legacy env-vars (WORDPRESS_URL + WP_API_TOKEN) gebruiken
-- en wordt NIET geraakt door deze migratie.

CREATE TABLE IF NOT EXISTS wp_connections (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  base_url   text        NOT NULL,
  auth_token text        NOT NULL,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: alleen service-role mag lezen/schrijven (beheerde tabel, niet user-facing)
ALTER TABLE wp_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_wp_connections"
  ON wp_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
