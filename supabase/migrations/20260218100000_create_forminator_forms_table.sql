-- Create forminator_forms table for managing form picker options
-- Similar to event_type_tag_mapping, this provides a user-manageable list

CREATE TABLE forminator_forms (
  id SERIAL PRIMARY KEY,
  form_id TEXT NOT NULL UNIQUE,
  form_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments
COMMENT ON TABLE forminator_forms IS 'Manageable list of Forminator forms for event form picker';
COMMENT ON COLUMN forminator_forms.form_id IS 'Forminator form ID (e.g., "14547")';
COMMENT ON COLUMN forminator_forms.form_name IS 'Display name for form picker dropdown';
COMMENT ON COLUMN forminator_forms.description IS 'Optional description/notes';
COMMENT ON COLUMN forminator_forms.is_active IS 'Hide inactive forms from dropdown';
COMMENT ON COLUMN forminator_forms.display_order IS 'Sort order in dropdown (ASC)';

-- Insert default forms (migrated from hardcoded values)
INSERT INTO forminator_forms (form_id, form_name, description, display_order) VALUES
  ('14547', 'Webinar Inschrijving (Standaard)', 'Standaard webinar inschrijfformulier', 1),
  ('15201', 'Workshop Inschrijving', 'Workshop inschrijfformulier', 2),
  ('16034', 'Training Enrollment', 'Training enrollment form', 3);

-- Create index for active forms query
CREATE INDEX idx_forminator_forms_active_order ON forminator_forms (is_active, display_order);

-- RLS Policies
ALTER TABLE forminator_forms ENABLE ROW LEVEL SECURITY;

-- Public read access (for form picker dropdown)
CREATE POLICY "Public read access to active forms"
  ON forminator_forms
  FOR SELECT
  USING (is_active = true);

-- Admin full access (authenticated users can manage)
CREATE POLICY "Authenticated users can manage forms"
  ON forminator_forms
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER update_forminator_forms_updated_at
  BEFORE UPDATE ON forminator_forms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT SELECT ON forminator_forms TO anon, authenticated;
GRANT ALL ON forminator_forms TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE forminator_forms_id_seq TO authenticated;

-- Rollback instructions (comment)
-- To rollback:
-- DROP TABLE forminator_forms CASCADE;
