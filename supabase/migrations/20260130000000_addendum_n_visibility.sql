-- ============================================================================
-- Addendum N: Template Visibility & Permissions
-- ============================================================================
-- Migration: Add visibility, ownership, and editor permissions to templates
-- Date: 2026-01-30
-- Spec: ADDENDUM_N.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Add new columns to project_templates
-- ----------------------------------------------------------------------------
-- Spec: ADDENDUM_N.md "Data Model" section

ALTER TABLE project_templates 
ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private',
ADD COLUMN owner_user_id UUID,
ADD COLUMN editor_user_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- Visibility constraint
ALTER TABLE project_templates
ADD CONSTRAINT visibility_enum_check 
CHECK (visibility IN ('private', 'public_generate', 'public_edit'));

COMMENT ON COLUMN project_templates.visibility IS 'Template visibility mode: private | public_generate | public_edit';
COMMENT ON COLUMN project_templates.owner_user_id IS 'Template owner (set at creation, cannot be transferred)';
COMMENT ON COLUMN project_templates.editor_user_ids IS 'Explicit editor list (only applies in public_edit mode)';

-- ----------------------------------------------------------------------------
-- STEP 2: Migrate existing templates to private with ownership
-- ----------------------------------------------------------------------------
-- Spec: ADDENDUM_N.md "Migration Strategy" section
-- Rule: All existing templates → private mode
-- Rule: Owner = user_id (creator)

UPDATE project_templates 
SET owner_user_id = user_id
WHERE owner_user_id IS NULL;

-- Ensure no NULL owners (data integrity)
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM project_templates WHERE owner_user_id IS NULL;
  
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % templates have NULL owner_user_id', orphan_count;
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- STEP 3: Make owner_user_id NOT NULL after migration
-- ----------------------------------------------------------------------------
ALTER TABLE project_templates
ALTER COLUMN owner_user_id SET NOT NULL;

-- ----------------------------------------------------------------------------
-- STEP 4: Drop old RLS policies and create new ones
-- ----------------------------------------------------------------------------
-- Spec: ADDENDUM_N.md "Permission Enforcement" section
-- Critical: Private templates must not leak existence

DROP POLICY IF EXISTS "Users can view own templates" ON project_templates;
DROP POLICY IF EXISTS "Users can create own templates" ON project_templates;
DROP POLICY IF EXISTS "Users can update own templates" ON project_templates;
DROP POLICY IF EXISTS "Users can delete own templates" ON project_templates;

-- SELECT: Implement canRead logic
-- Private → owner only, Public → everyone
CREATE POLICY "Template visibility enforcement - SELECT"
  ON project_templates FOR SELECT
  TO public
  USING (
    visibility IN ('public_generate', 'public_edit')
    OR owner_user_id = auth.uid()
  );

-- INSERT: Must set owner_user_id = current user
CREATE POLICY "Template visibility enforcement - INSERT"
  ON project_templates FOR INSERT
  TO public
  WITH CHECK (
    owner_user_id = auth.uid()
  );

-- UPDATE: Implement canEdit logic
-- Private/public_generate → owner only
-- Public_edit → owner OR in editor_user_ids
CREATE POLICY "Template visibility enforcement - UPDATE"
  ON project_templates FOR UPDATE
  TO public
  USING (
    owner_user_id = auth.uid()
    OR (visibility = 'public_edit' AND auth.uid() = ANY(editor_user_ids))
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    OR (visibility = 'public_edit' AND auth.uid() = ANY(editor_user_ids))
  );

-- DELETE: Owner only (all modes)
CREATE POLICY "Template visibility enforcement - DELETE"
  ON project_templates FOR DELETE
  TO public
  USING (owner_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- STEP 5: Create index for editor lookups
-- ----------------------------------------------------------------------------
-- Performance: Fast lookup for public_edit templates where user is editor
CREATE INDEX idx_project_templates_editors ON project_templates USING GIN(editor_user_ids);

-- ----------------------------------------------------------------------------
-- STEP 6: Validation queries (verify migration)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  null_owner_count INTEGER;
  invalid_visibility_count INTEGER;
  null_editors_count INTEGER;
BEGIN
  -- Check 1: No NULL owners
  SELECT COUNT(*) INTO null_owner_count FROM project_templates WHERE owner_user_id IS NULL;
  IF null_owner_count > 0 THEN
    RAISE WARNING 'Validation: % templates have NULL owner_user_id', null_owner_count;
  END IF;
  
  -- Check 2: No invalid visibility modes
  SELECT COUNT(*) INTO invalid_visibility_count 
  FROM project_templates 
  WHERE visibility NOT IN ('private', 'public_generate', 'public_edit');
  
  IF invalid_visibility_count > 0 THEN
    RAISE WARNING 'Validation: % templates have invalid visibility', invalid_visibility_count;
  END IF;
  
  -- Check 3: No NULL editor lists
  SELECT COUNT(*) INTO null_editors_count FROM project_templates WHERE editor_user_ids IS NULL;
  IF null_editors_count > 0 THEN
    RAISE WARNING 'Validation: % templates have NULL editor_user_ids', null_editors_count;
  END IF;
  
  -- Report success
  IF null_owner_count = 0 AND invalid_visibility_count = 0 AND null_editors_count = 0 THEN
    RAISE NOTICE 'Addendum N migration completed successfully';
  END IF;
END
$$;

-- ============================================================================
-- End of Migration
-- ============================================================================
