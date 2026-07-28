-- FSV2: Add tracker (trackable short link / QR code) integration type
ALTER TABLE fs_v2_integrations
  ALTER COLUMN forminator_form_id DROP NOT NULL,
  ALTER COLUMN odoo_connection_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS destination_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS tracker_slug TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fsv2_integrations_tracker_slug
  ON fs_v2_integrations(tracker_slug)
  WHERE tracker_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS fs_v2_tracker_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL,
  hit_at timestamptz NOT NULL DEFAULT now(),
  origin text NOT NULL DEFAULT 'link',
  referrer text,
  user_agent text,
  CONSTRAINT fk_fs_v2_tracker_hits_integration
    FOREIGN KEY (integration_id)
    REFERENCES fs_v2_integrations(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fs_v2_tracker_hits_integration_hitat
  ON fs_v2_tracker_hits (integration_id, hit_at DESC);
