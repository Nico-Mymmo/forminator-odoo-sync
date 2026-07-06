-- ============================================================================
-- Forminator Sync V2 (Koppelingen) — Mappen & Tags
-- ============================================================================
-- Voegt mappenstructuur (geneste mappen) en herbruikbare tags toe aan
-- koppelingen (fs_v2_integrations), t.b.v. categorisering en filtering in
-- het overzicht. Idempotent by design.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Mappen (onbeperkt geneste boomstructuur) ────────────────────────────────
CREATE TABLE IF NOT EXISTS fs_v2_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES fs_v2_folders(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fs_v2_folders_parent
  ON fs_v2_folders (parent_id, order_index);

-- ── Koppeling → map (optioneel; NULL = geen map) ────────────────────────────
ALTER TABLE fs_v2_integrations
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES fs_v2_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fs_v2_integrations_folder
  ON fs_v2_integrations (folder_id);

-- ── Herbruikbare tags ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fs_v2_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fs_v2_tags_name_lower
  ON fs_v2_tags (lower(name));

-- ── Koppeling ↔ tag (many-to-many) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fs_v2_integration_tags (
  integration_id uuid NOT NULL REFERENCES fs_v2_integrations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES fs_v2_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_fs_v2_integration_tags_tag
  ON fs_v2_integration_tags (tag_id);
