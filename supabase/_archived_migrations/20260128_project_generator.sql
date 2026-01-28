-- Project Generator Module - Database Schema
-- Migration: Create project_templates table with RLS
-- Date: 2026-01-28

-- Project Templates Table
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) > 0),
  description TEXT,
  blueprint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user queries
CREATE INDEX idx_project_templates_user_id ON project_templates(user_id);

-- RLS Policies
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON project_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own templates"
  ON project_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON project_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON project_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Updated trigger (reuse existing function if available, otherwise create)
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

-- Insert the project_generator module
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

-- Grant access to all existing admin users
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
