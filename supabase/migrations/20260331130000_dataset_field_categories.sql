-- Add field_categories column to claude_dataset_templates.
-- Stores an ordered list of category names that admins can assign to fields.
-- Example: ["Pipeline", "Timing", "Financieel", "Klant", "Intern"]

ALTER TABLE claude_dataset_templates
  ADD COLUMN IF NOT EXISTS field_categories JSONB NOT NULL DEFAULT '[]'::jsonb;
