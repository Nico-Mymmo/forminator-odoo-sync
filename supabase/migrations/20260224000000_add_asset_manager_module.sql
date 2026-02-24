-- ============================================================================
-- Asset Manager Module Registration
-- ============================================================================
-- Migration: 2026-02-24
-- Adds the asset_manager module to the modules table and auto-grants access
-- to all existing admin users.
-- Pattern: identical to mail_signature_designer_v1.sql module registration block.
-- No new tables — MVP uses R2 directly, no DB metadata index.
-- ============================================================================

-- MODULE REGISTRATION
INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'asset_manager',
  'Asset Manager',
  'Centrale bestandsbeheerlaag voor uploads en publieke assets via Cloudflare R2',
  '/assets',
  'folder',
  true,
  false,
  8
)
ON CONFLICT (code) DO NOTHING;

-- AUTO-GRANT TO ADMIN
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'asset_manager'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Compliance Notes:
-- ✅ Idempotent: ON CONFLICT (code) DO NOTHING
-- ✅ Admin auto-grant: mirrors mail_signature_designer pattern
-- ✅ No new tables (MVP — no DB metadata index)
-- ✅ No foreign keys (baseline pattern)
-- ✅ display_order = 8 (next after mail_signature_designer = 7)
-- ============================================================================
