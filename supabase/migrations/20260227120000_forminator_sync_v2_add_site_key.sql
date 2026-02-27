-- Store which WordPress site key was used when an integration was created.
-- Allows the detail view to re-fetch form fields (field list overview).
ALTER TABLE fs_v2_integrations
  ADD COLUMN IF NOT EXISTS site_key text NULL;
