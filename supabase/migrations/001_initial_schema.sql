-- Migration: Initial Schema for Forminator-Odoo Sync
-- Created: 2026-01-05
-- Description: Replace Cloudflare KV with PostgreSQL database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: form_mappings
-- Purpose: Store form configuration mappings
-- =====================================================
CREATE TABLE form_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Form identification
  form_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  
  -- Mapping data (stored as JSONB for flexibility)
  field_mapping JSONB NOT NULL DEFAULT '{}',
  value_mapping JSONB NOT NULL DEFAULT '{}',
  workflow JSONB NOT NULL DEFAULT '[]',
  html_card JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  
  -- Versioning for optimistic locking
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Soft delete support
  deleted_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT form_id_not_empty CHECK (form_id != ''),
  CONSTRAINT name_not_empty CHECK (name != ''),
  CONSTRAINT version_positive CHECK (version > 0)
);

-- Indexes for performance
CREATE INDEX idx_form_mappings_form_id ON form_mappings(form_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_form_mappings_updated_at ON form_mappings(updated_at DESC);
CREATE INDEX idx_form_mappings_name ON form_mappings(name) WHERE deleted_at IS NULL;

-- Comment
COMMENT ON TABLE form_mappings IS 'Form configuration mappings with versioning support';
COMMENT ON COLUMN form_mappings.version IS 'Incremented on each update for optimistic locking';
COMMENT ON COLUMN form_mappings.deleted_at IS 'Soft delete timestamp - NULL means active';

-- =====================================================
-- TABLE: form_mapping_history
-- Purpose: Audit trail for all changes to form mappings
-- =====================================================
CREATE TABLE form_mapping_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to the form mapping
  form_mapping_id UUID REFERENCES form_mappings(id) ON DELETE CASCADE,
  form_id VARCHAR(50) NOT NULL,
  
  -- Snapshot of the complete record at time of change
  snapshot JSONB NOT NULL,
  
  -- Change tracking
  changed_fields TEXT[],
  change_type VARCHAR(20) NOT NULL,
  
  -- Who and when
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by VARCHAR(255),
  
  -- Optional: JSON diff for efficiency (can be computed)
  diff JSONB,
  
  -- Constraints
  CONSTRAINT valid_change_type CHECK (change_type IN ('create', 'update', 'delete'))
);

-- Indexes
CREATE INDEX idx_history_form_id ON form_mapping_history(form_id, changed_at DESC);
CREATE INDEX idx_history_mapping_id ON form_mapping_history(form_mapping_id, changed_at DESC);
CREATE INDEX idx_history_changed_at ON form_mapping_history(changed_at DESC);

-- Comment
COMMENT ON TABLE form_mapping_history IS 'Complete audit trail of all form mapping changes';
COMMENT ON COLUMN form_mapping_history.snapshot IS 'Full JSON snapshot of record at time of change';

-- =====================================================
-- TABLE: form_submissions_log
-- Purpose: Log all form submissions and their processing
-- =====================================================
CREATE TABLE form_submissions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Form identification
  form_id VARCHAR(50) NOT NULL,
  
  -- Request data (original Forminator payload)
  request_data JSONB NOT NULL,
  normalized_data JSONB,
  
  -- Processing result
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  response_data JSONB,
  error_message TEXT,
  error_stack TEXT,
  
  -- Workflow execution details
  workflow_steps JSONB, -- Array of executed steps with their results
  
  -- Timing information
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Odoo integration results
  odoo_records JSONB, -- Array of created/updated Odoo record IDs
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'success', 'error', 'skipped')),
  CONSTRAINT duration_non_negative CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

-- Indexes for common queries
CREATE INDEX idx_submissions_form_id ON form_submissions_log(form_id, submitted_at DESC);
CREATE INDEX idx_submissions_status ON form_submissions_log(status, submitted_at DESC);
CREATE INDEX idx_submissions_date ON form_submissions_log(submitted_at DESC);
CREATE INDEX idx_submissions_processed ON form_submissions_log(processed_at DESC) WHERE processed_at IS NOT NULL;

-- Comment
COMMENT ON TABLE form_submissions_log IS 'Complete log of all form submissions and processing results';
COMMENT ON COLUMN form_submissions_log.workflow_steps IS 'JSONB array tracking execution of each workflow step';

-- =====================================================
-- TRIGGER: Auto-update updated_at timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_form_mappings_updated_at
BEFORE UPDATE ON form_mappings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TRIGGER: Auto-increment version on update
-- =====================================================
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_form_mappings_version
BEFORE UPDATE ON form_mappings
FOR EACH ROW
EXECUTE FUNCTION increment_version();

-- =====================================================
-- TRIGGER: Automatic history tracking
-- =====================================================
CREATE OR REPLACE FUNCTION track_form_mapping_changes()
RETURNS TRIGGER AS $$
DECLARE
  changed_fields_array TEXT[];
  operation_type VARCHAR(20);
  snapshot_data JSONB;
BEGIN
  -- Determine operation type
  IF TG_OP = 'INSERT' THEN
    operation_type := 'create';
    snapshot_data := row_to_json(NEW)::JSONB;
    changed_fields_array := ARRAY['*']; -- All fields are "new"
  ELSIF TG_OP = 'UPDATE' THEN
    operation_type := 'update';
    snapshot_data := row_to_json(NEW)::JSONB;
    -- Identify changed fields
    SELECT ARRAY_AGG(key)
    INTO changed_fields_array
    FROM (
      SELECT key
      FROM jsonb_each(to_jsonb(NEW))
      WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key
        AND key NOT IN ('updated_at', 'version') -- Exclude auto-updated fields
    ) AS changed;
  ELSIF TG_OP = 'DELETE' THEN
    operation_type := 'delete';
    snapshot_data := row_to_json(OLD)::JSONB;
    changed_fields_array := ARRAY['*']; -- All fields are "removed"
  END IF;
  
  -- Insert history record
  INSERT INTO form_mapping_history (
    form_mapping_id,
    form_id,
    snapshot,
    changed_fields,
    change_type,
    changed_by
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    COALESCE(NEW.form_id, OLD.form_id),
    snapshot_data,
    changed_fields_array,
    operation_type,
    COALESCE(NEW.updated_by, OLD.updated_by)
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_form_mapping_changes
AFTER INSERT OR UPDATE OR DELETE ON form_mappings
FOR EACH ROW
EXECUTE FUNCTION track_form_mapping_changes();

-- =====================================================
-- VIEWS: Convenience views for common queries
-- =====================================================

-- Active mappings only (not soft-deleted)
CREATE VIEW active_form_mappings AS
SELECT 
  id,
  form_id,
  name,
  field_mapping,
  value_mapping,
  workflow,
  html_card,
  created_at,
  updated_at,
  created_by,
  updated_by,
  version
FROM form_mappings
WHERE deleted_at IS NULL;

COMMENT ON VIEW active_form_mappings IS 'Only active (non-deleted) form mappings';

-- Recent submission statistics
CREATE VIEW submission_stats AS
SELECT 
  form_id,
  COUNT(*) AS total_submissions,
  COUNT(*) FILTER (WHERE status = 'success') AS successful,
  COUNT(*) FILTER (WHERE status = 'error') AS errors,
  COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
  AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS avg_duration_ms,
  MAX(submitted_at) AS last_submission,
  MIN(submitted_at) AS first_submission
FROM form_submissions_log
GROUP BY form_id;

COMMENT ON VIEW submission_stats IS 'Aggregated statistics per form';

-- =====================================================
-- FUNCTIONS: Utility functions
-- =====================================================

-- Get form mapping with history count
CREATE OR REPLACE FUNCTION get_form_mapping_with_stats(p_form_id VARCHAR)
RETURNS TABLE (
  mapping JSONB,
  history_count BIGINT,
  last_modified TIMESTAMPTZ,
  submission_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    row_to_json(fm)::JSONB AS mapping,
    (SELECT COUNT(*) FROM form_mapping_history WHERE form_id = p_form_id) AS history_count,
    fm.updated_at AS last_modified,
    (SELECT COUNT(*) FROM form_submissions_log WHERE form_id = p_form_id) AS submission_count
  FROM form_mappings fm
  WHERE fm.form_id = p_form_id
    AND fm.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_form_mapping_with_stats IS 'Get form mapping with metadata (history count, submissions)';

-- =====================================================
-- Row Level Security (RLS) - voorbereid voor toekomstige auth
-- =====================================================

-- Enable RLS (disabled by default voor workers die full access hebben)
-- ALTER TABLE form_mappings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE form_mapping_history ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE form_submissions_log ENABLE ROW LEVEL SECURITY;

-- Policies kunnen later worden toegevoegd als er user authentication komt

-- =====================================================
-- Initial data seeding gebeurt in aparte migratie
-- =====================================================
