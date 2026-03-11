-- Addendum F v2: chatter_message target support
-- message_type is ALTIJD 'comment' in Odoo — wordt niet opgeslagen als DB-waarde.
-- Het verschil interne notitie vs publieke discussie wordt bepaald door subtype_xmlid.

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS chatter_template      TEXT,
  ADD COLUMN IF NOT EXISTS chatter_subtype_xmlid TEXT NOT NULL DEFAULT 'mail.mt_note';

COMMENT ON COLUMN fs_v2_targets.chatter_template
  IS 'HTML-sjabloon met {field-id} placeholders. NULL = automatische samenvatting van alle velden.';

COMMENT ON COLUMN fs_v2_targets.chatter_subtype_xmlid
  IS 'Odoo subtype: mail.mt_note (interne notitie) of mail.mt_comment (publieke discussie).';

-- Rollback:
-- ALTER TABLE fs_v2_targets
--   DROP COLUMN IF EXISTS chatter_template,
--   DROP COLUMN IF EXISTS chatter_subtype_xmlid;
