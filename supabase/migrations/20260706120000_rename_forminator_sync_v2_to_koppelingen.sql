-- ============================================================================
-- Rename forminator_sync_v2 module (user-facing name only)
-- ============================================================================
-- Geen wijziging aan code/route/architectuur — enkel de weergavenaam die de
-- navbar en admin-schermen tonen. Idempotent.
-- ============================================================================

UPDATE modules
SET name = 'Koppelingen'
WHERE code = 'forminator_sync_v2';
