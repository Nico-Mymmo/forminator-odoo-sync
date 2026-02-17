-- ============================================================================
-- Make event_type_wp_tag_mapping global (organization-wide)
-- ============================================================================

-- 1) Remove user-scoped RLS policies
DROP POLICY IF EXISTS "Users can view own event type mappings" ON event_type_wp_tag_mapping;
DROP POLICY IF EXISTS "Users can create own event type mappings" ON event_type_wp_tag_mapping;
DROP POLICY IF EXISTS "Users can update own event type mappings" ON event_type_wp_tag_mapping;
DROP POLICY IF EXISTS "Users can delete own event type mappings" ON event_type_wp_tag_mapping;

-- 2) Deduplicate existing rows: keep the most recent mapping per odoo_event_type_id
WITH ranked AS (
	SELECT
		id,
		ROW_NUMBER() OVER (
			PARTITION BY odoo_event_type_id
			ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
		) AS rn
	FROM event_type_wp_tag_mapping
)
DELETE FROM event_type_wp_tag_mapping m
USING ranked r
WHERE m.id = r.id
	AND r.rn > 1;

-- 3) Replace per-user uniqueness and remove per-user column
ALTER TABLE event_type_wp_tag_mapping
	DROP CONSTRAINT IF EXISTS unique_user_event_type_mapping;

DROP INDEX IF EXISTS idx_event_type_wp_tag_mapping_user_id;
DROP INDEX IF EXISTS idx_event_type_wp_tag_mapping_user_wp_tag_id;

ALTER TABLE event_type_wp_tag_mapping
	DROP COLUMN IF EXISTS user_id;

ALTER TABLE event_type_wp_tag_mapping
	ADD CONSTRAINT unique_event_type_mapping UNIQUE (odoo_event_type_id);

CREATE INDEX idx_event_type_wp_tag_mapping_wp_tag_id
	ON event_type_wp_tag_mapping(wp_tag_id);

-- 4) Global RLS policies: authenticated users can access mappings
CREATE POLICY "Authenticated users can view event type mappings"
	ON event_type_wp_tag_mapping FOR SELECT
	TO public
	USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create event type mappings"
	ON event_type_wp_tag_mapping FOR INSERT
	TO public
	WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update event type mappings"
	ON event_type_wp_tag_mapping FOR UPDATE
	TO public
	USING (auth.uid() IS NOT NULL)
	WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete event type mappings"
	ON event_type_wp_tag_mapping FOR DELETE
	TO public
	USING (auth.uid() IS NOT NULL);
