-- ============================================================================
-- Project Generator Iteration 5 - Generation History
-- ============================================================================
-- Migration: Create project_generations table with RLS
-- Date: 2026-01-28
-- Iteration: 5 (Generation History & Post-Generation UX)
-- Spec: ITERATION_4_DESIGN.md lines 383-450
-- Baseline Pattern: Matches project_templates (NO foreign key on user_id/template_id)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: project_generations
-- ----------------------------------------------------------------------------
-- Purpose: Track Odoo project generation attempts with status and results
-- Owner: User-scoped (RLS enforced)
-- Spec: ITERATION_4_DESIGN.md lines 388-417
-- Pattern: Matches project_templates (application-enforced references, no FK)

CREATE TABLE project_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_id UUID NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  
  -- Odoo entity IDs
  odoo_project_id INTEGER,
  odoo_project_url TEXT,
  
  -- Generation model snapshot (audit trail)
  generation_model JSONB NOT NULL,
  
  -- Odoo ID mappings (blueprint UUID → Odoo ID)
  odoo_mappings JSONB DEFAULT '{}',
  
  -- Error tracking
  error_message TEXT,
  failed_step TEXT,
  
  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE project_generations IS 'Tracks Odoo project generation attempts with status, results, and error recovery';
COMMENT ON COLUMN project_generations.user_id IS 'Owner user ID (application-enforced, no FK per baseline pattern)';
COMMENT ON COLUMN project_generations.template_id IS 'Source template ID (application-enforced, no FK per baseline pattern)';
COMMENT ON COLUMN project_generations.status IS 'Generation state: pending, in_progress, completed, failed';
COMMENT ON COLUMN project_generations.generation_model IS 'Canonical model snapshot from generate.js Step 2 (audit trail)';
COMMENT ON COLUMN project_generations.odoo_mappings IS 'Blueprint UUID to Odoo ID mappings: {stages: {...}, tasks: {...}}';
COMMENT ON COLUMN project_generations.failed_step IS 'Step identifier where generation failed (e.g., "create_project", "create_tasks")';

-- Indexes for user-scoped queries and status filtering
CREATE INDEX idx_project_generations_user_id ON project_generations(user_id);
CREATE INDEX idx_project_generations_template_id ON project_generations(template_id);
CREATE INDEX idx_project_generations_status ON project_generations(status);
CREATE INDEX idx_project_generations_user_template ON project_generations(user_id, template_id);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Pattern: User-scoped isolation (auth.uid() = user_id)
-- Spec: Same RLS pattern as project_templates
-- Baseline: user_roles lines 336-340, project_templates lines 43-66

ALTER TABLE project_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generations"
  ON project_generations FOR SELECT
  TO public
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own generations"
  ON project_generations FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own generations"
  ON project_generations FOR UPDATE
  TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own generations"
  ON project_generations FOR DELETE
  TO public
  USING (auth.uid() = user_id);

-- ============================================================================
-- END MIGRATION
-- ============================================================================
-- Design Rationale:
--
-- 1. NO FOREIGN KEYS
--    - Matches baseline pattern (users, modules, user_modules have no FKs)
--    - Matches project_templates pattern (application-enforced relationships)
--    - Prevents cascade issues if templates deleted
--
-- 2. IDEMPOTENCY
--    - CREATE TABLE without IF NOT EXISTS (migration should run once)
--    - No conditional logic (Supabase migration framework handles this)
--
-- 3. RLS CONSISTENCY
--    - Policies target TO public (matches all existing patterns)
--    - User-scoped isolation via auth.uid() = user_id
--    - Standard CRUD policies (SELECT, INSERT, UPDATE, DELETE)
--
-- 4. STATUS CONSTRAINTS
--    - CHECK constraint enforces valid status values
--    - Prevents invalid states at database level
--
-- 5. NULLABLE FIELDS
--    - odoo_project_id/url: NULL until completed
--    - error_message/failed_step: NULL unless failed
--    - completed_at: NULL until completed/failed
--    - odoo_mappings: Default empty object, populated during generation
--
-- 6. INDEXES
--    - user_id: Primary access pattern (user views their generations)
--    - template_id: Secondary access pattern (generations per template)
--    - status: Filter pattern (show only failed, in_progress, etc.)
--    - user_id + template_id: Composite for duplicate generation checks
--
-- ============================================================================
