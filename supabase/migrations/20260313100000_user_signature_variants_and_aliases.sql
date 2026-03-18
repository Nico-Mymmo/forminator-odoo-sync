-- ─────────────────────────────────────────────────────────────────────────────
-- user_signature_variants
--
-- Per-user named signature variants. A variant stores JSONB config overrides
-- that are applied on top of the user's base merged config before compiling.
-- This lets a user maintain multiple signature flavours, e.g.:
--   "Volledig"       – all blocks enabled (default)
--   "Compact reply"  – meeting link / LinkedIn / event blocks hidden
--
-- config_overrides keys mirror the config object from signature-merge-engine,
-- e.g. { "meetingLinkEnabled": false, "eventPromoEnabled": false }
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE user_signature_variants (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email       TEXT        NOT NULL,
  variant_name     TEXT        NOT NULL,
  config_overrides JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_user_variant_name UNIQUE (user_email, variant_name)
);

CREATE INDEX idx_usv_user_email ON user_signature_variants (user_email);

CREATE TRIGGER user_signature_variants_updated_at
  BEFORE UPDATE ON user_signature_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_signature_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_user_signature_variants"
  ON user_signature_variants FOR ALL
  USING (true) WITH CHECK (true);

COMMENT ON TABLE user_signature_variants IS
  'Per-user named signature variants with JSONB config overrides on top of base settings.';

COMMENT ON COLUMN user_signature_variants.config_overrides IS
  'Flat JSONB object with config keys to override, e.g. {"meetingLinkEnabled":false}.';

-- ─────────────────────────────────────────────────────────────────────────────
-- user_alias_assignments
--
-- Maps each Gmail sendAs address (alias) to a signature variant for a user.
--
-- Rules:
--   variant_id = NULL  → use the base (full) signature for this alias
--   No row for alias   → alias is not touched during a push
--   Row for primary    → overrides what is pushed to the primary sendAs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE user_alias_assignments (
  user_email    TEXT NOT NULL,
  send_as_email TEXT NOT NULL,
  variant_id    UUID REFERENCES user_signature_variants(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_email, send_as_email)
);

CREATE TRIGGER user_alias_assignments_updated_at
  BEFORE UPDATE ON user_alias_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_alias_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_user_alias_assignments"
  ON user_alias_assignments FOR ALL
  USING (true) WITH CHECK (true);

COMMENT ON TABLE user_alias_assignments IS
  'Maps each Gmail sendAs address to a signature variant. No row = alias not touched on push.';
