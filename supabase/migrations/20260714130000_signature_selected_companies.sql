-- Mail Signature Designer: replace free-text company/website override with a
-- multi-select of known companies (OpenVME / Syndicoach).
--
-- selected_companies: jsonb array of company keys, e.g. '["openvme","syndicoach"]'.
-- NULL or empty array means "no explicit choice made" -> the merge engine
-- defaults to showing BOTH companies (see signature-merge-engine.js).
--
-- The old company_override / website_url_override columns are dropped: the
-- marketing-level brandName/websiteUrl fallback they depended on has been
-- removed in favour of a fixed, code-defined company directory
-- (src/modules/mail-signature-designer/lib/companies.js).

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS selected_companies jsonb;

ALTER TABLE user_signature_settings
  DROP COLUMN IF EXISTS company_override;

ALTER TABLE user_signature_settings
  DROP COLUMN IF EXISTS website_url_override;
