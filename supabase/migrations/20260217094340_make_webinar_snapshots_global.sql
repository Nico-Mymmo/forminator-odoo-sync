-- ============================================================================
-- Make webinar_snapshots global (organization-wide)
-- ============================================================================

-- 1) Remove RLS policies that depend on user_id
DROP POLICY IF EXISTS "Users can view own snapshots" ON webinar_snapshots;
DROP POLICY IF EXISTS "Users can create own snapshots" ON webinar_snapshots;
DROP POLICY IF EXISTS "Users can update own snapshots" ON webinar_snapshots;
DROP POLICY IF EXISTS "Users can delete own snapshots" ON webinar_snapshots;

-- 2) Deduplicate existing rows: keep most recently updated snapshot per webinar
WITH ranked AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY odoo_webinar_id
			ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
		) AS rn
	FROM webinar_snapshots
)
DELETE FROM webinar_snapshots ws
USING ranked r
WHERE ws.id = r.id
	AND r.rn > 1;

-- 3) Replace per-user uniqueness and remove per-user column
DROP INDEX IF EXISTS idx_webinar_snapshots_user_webinar;
DROP INDEX IF EXISTS idx_webinar_snapshots_user_id;
DROP INDEX IF EXISTS idx_webinar_snapshots_odoo_webinar_id;

ALTER TABLE webinar_snapshots
	DROP COLUMN IF EXISTS user_id;

CREATE UNIQUE INDEX idx_webinar_snapshots_odoo_webinar_id
	ON webinar_snapshots(odoo_webinar_id);

-- 4) Global RLS policies: authenticated users can access snapshots
CREATE POLICY "Authenticated users can view snapshots"
	ON webinar_snapshots FOR SELECT
	TO public
	USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create snapshots"
	ON webinar_snapshots FOR INSERT
	TO public
	WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update snapshots"
	ON webinar_snapshots FOR UPDATE
	TO public
	USING (auth.uid() IS NOT NULL)
	WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete snapshots"
	ON webinar_snapshots FOR DELETE
	TO public
	USING (auth.uid() IS NOT NULL);
