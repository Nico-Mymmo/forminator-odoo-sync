-- ============================================================================
-- Project Generator V1 - Database Foundation
-- ============================================================================
-- Migration: Create project_templates table with RLS and module registration
-- Date: 2026-01-28
-- Iteration: 1 (Database Foundation)
-- Spec: TECHNICAL_ANALYSIS_V1.md lines 77-140 (corrected per baseline analysis)
-- Baseline Pattern Analysis: ITERATION_11_NEW_IMPLEMENTATION_PLAN.md STEP 0
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: project_templates
-- ----------------------------------------------------------------------------
-- Purpose: Store project blueprint templates for Odoo project generation
-- Owner: User-scoped (RLS enforced)
-- Spec: TECHNICAL_ANALYSIS_V1.md lines 83-95
-- Pattern: Matches user_modules, user_roles (NO foreign key on user_id)

CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) > 0),
  description TEXT,
  blueprint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE project_templates IS 'User-owned project blueprint templates for Odoo generation';
COMMENT ON COLUMN project_templates.user_id IS 'Owner user ID (application-enforced, no FK per baseline pattern)';
COMMENT ON COLUMN project_templates.blueprint_data IS 'JSONB structure: {taskStages, milestones, tasks, dependencies}';

-- Index for user-scoped queries
CREATE INDEX idx_project_templates_user_id ON project_templates(user_id);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Pattern: User-scoped isolation (auth.uid() = user_id)
-- Spec: TECHNICAL_ANALYSIS_V1.md lines 99-118
-- Baseline: user_roles lines 336-340, user_profiles lines 298-302

ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON project_templates FOR SELECT
  TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own templates"
  ON project_templates FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON project_templates FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON project_templates FOR DELETE
  TO public
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- TRIGGER: Auto-update updated_at timestamp
-- ----------------------------------------------------------------------------
-- Spec: TECHNICAL_ANALYSIS_V1.md lines 120-130
-- Note: Conditional function creation for idempotency

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at'
  ) THEN
    CREATE FUNCTION update_updated_at()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END
$$;

CREATE TRIGGER project_templates_updated_at
  BEFORE UPDATE ON project_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- MODULE REGISTRATION
-- ----------------------------------------------------------------------------
-- Purpose: Register Project Generator module in platform registry
-- Spec: Implicit in TECHNICAL_ANALYSIS_V1.md and ITERATION_11_IMPLEMENTATION_LOG.md

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'project_generator',
  'Project Generator',
  'Template-based Odoo project creation with task stages, milestones, tasks, subtasks, and dependencies',
  '/project-generator',
  'folder-kanban',
  true,
  false,
  4
)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- AUTO-GRANT TO ADMIN USERS
-- ----------------------------------------------------------------------------
-- Purpose: Grant project_generator access to all existing admin users
-- Pattern: Self-granted (granted_by = user.id)
-- Idempotency: NOT EXISTS check prevents duplicates

INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT 
  u.id,
  m.id,
  true,
  u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'project_generator'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um 
    WHERE um.user_id = u.id AND um.module_id = m.id
  );

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Baseline alignment: ✅ No foreign keys on user_id
-- Baseline alignment: ✅ RLS policies target TO public
-- Baseline alignment: ✅ Matches user_roles, user_profiles pattern
-- ============================================================================
