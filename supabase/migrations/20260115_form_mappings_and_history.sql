-- Form Mappings and Submissions History Tables
-- Created: 2026-01-15
-- Purpose: Storage for form configurations and submission logs

-- =====================================================
-- FORM MAPPINGS TABLE
-- =====================================================
-- Stores form-to-Odoo mapping configurations
-- Replaces the unreliable KV storage system

CREATE TABLE IF NOT EXISTS public.form_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    field_mapping JSONB NOT NULL DEFAULT '{}',
    value_mapping JSONB NOT NULL DEFAULT '{}',
    workflow JSONB NOT NULL DEFAULT '[]',
    html_card TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_form_mappings_form_id ON public.form_mappings(form_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_form_mappings_deleted ON public.form_mappings(deleted_at);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_form_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS form_mappings_updated_at ON public.form_mappings;

CREATE TRIGGER form_mappings_updated_at
    BEFORE UPDATE ON public.form_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_form_mappings_updated_at();

-- =====================================================
-- FORM MAPPINGS HISTORY TABLE
-- =====================================================
-- Tracks all changes to form mappings for audit trail

CREATE TABLE IF NOT EXISTS public.form_mappings_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mapping_id UUID NOT NULL REFERENCES public.form_mappings(id) ON DELETE CASCADE,
    form_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    field_mapping JSONB NOT NULL,
    value_mapping JSONB NOT NULL,
    workflow JSONB NOT NULL,
    html_card TEXT,
    version INTEGER NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('created', 'updated', 'deleted'))
);

-- Index for querying history
CREATE INDEX IF NOT EXISTS idx_form_mappings_history_mapping_id ON public.form_mappings_history(mapping_id);
CREATE INDEX IF NOT EXISTS idx_form_mappings_history_changed_at ON public.form_mappings_history(changed_at DESC);

-- Trigger to automatically create history records
CREATE OR REPLACE FUNCTION log_form_mapping_changes()
RETURNS TRIGGER AS $$
DECLARE
    change_type_val VARCHAR(50);
BEGIN
    -- Determine change type
    IF TG_OP = 'INSERT' THEN
        change_type_val := 'created';
    ELSIF TG_OP = 'UPDATE' THEN
        change_type_val := 'updated';
    ELSIF TG_OP = 'DELETE' THEN
        change_type_val := 'deleted';
    END IF;
    
    -- Insert history record (use NEW for INSERT/UPDATE, OLD for DELETE)
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.form_mappings_history (
            mapping_id, form_id, name, field_mapping, value_mapping, 
            workflow, html_card, version, changed_by, change_type
        ) VALUES (
            OLD.id, OLD.form_id, OLD.name, OLD.field_mapping, OLD.value_mapping,
            OLD.workflow, OLD.html_card, OLD.version, OLD.updated_by, change_type_val
        );
        RETURN OLD;
    ELSE
        INSERT INTO public.form_mappings_history (
            mapping_id, form_id, name, field_mapping, value_mapping, 
            workflow, html_card, version, changed_by, change_type
        ) VALUES (
            NEW.id, NEW.form_id, NEW.name, NEW.field_mapping, NEW.value_mapping,
            NEW.workflow, NEW.html_card, NEW.version, NEW.updated_by, change_type_val
        );
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS form_mappings_history_trigger ON public.form_mappings;

CREATE TRIGGER form_mappings_history_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.form_mappings
    FOR EACH ROW
    EXECUTE FUNCTION log_form_mapping_changes();

-- =====================================================
-- FORM SUBMISSIONS LOG TABLE
-- =====================================================
-- Tracks all form submissions and their processing status

CREATE TABLE IF NOT EXISTS public.form_submissions_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id VARCHAR(255) NOT NULL,
    entry_id VARCHAR(255),
    submission_data JSONB NOT NULL,
    processed_data JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'success', 'failed', 'skipped')),
    error_message TEXT,
    odoo_record_id INTEGER,
    odoo_model VARCHAR(255),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processing_time_ms INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'
);

-- Indexes for querying submissions
CREATE INDEX IF NOT EXISTS idx_submissions_form_id ON public.form_submissions_log(form_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.form_submissions_log(status);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON public.form_submissions_log(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_entry_id ON public.form_submissions_log(form_id, entry_id);

-- Comment the tables
COMMENT ON TABLE public.form_mappings IS 'Stores form-to-Odoo mapping configurations';
COMMENT ON TABLE public.form_mappings_history IS 'Audit trail for all changes to form mappings';
COMMENT ON TABLE public.form_submissions_log IS 'Log of all form submissions and their processing status';
