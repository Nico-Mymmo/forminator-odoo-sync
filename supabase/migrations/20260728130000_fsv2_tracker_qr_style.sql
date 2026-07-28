-- FSV2: persist per-tracker QR styling (dot/background color + optional logo)
-- so every user sees the same QR appearance, not just the browser session
-- that configured it (see public/forminator-sync-v2-detail-lifecycle.js openDetail()
-- and forminator-sync-v2-bootstrap.js tracker-qr-*-change handlers).
--
-- qr_logo_key stores the R2 object key under the fsv2-tracker-logos/ prefix
-- (env.R2_ASSETS, shared bucket openvme-assets) -- NOT a full URL. The
-- frontend builds /assets/<key> itself, resolved client-side against the
-- real page origin.
ALTER TABLE fs_v2_integrations
  ADD COLUMN IF NOT EXISTS qr_dot_color TEXT NULL,
  ADD COLUMN IF NOT EXISTS qr_bg_color TEXT NULL,
  ADD COLUMN IF NOT EXISTS qr_logo_key TEXT NULL;
