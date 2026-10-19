-- Projecten: per project instelbaar waar een afgevinkte taak naartoe gaat.
-- NULL = de laatste sectie (de standaard). Bij de persoonlijke doelen uit Odoo
-- is dat "Opgeleverd", niet "Gearchiveerd".
ALTER TABLE pm_projects ADD COLUMN done_section_id TEXT REFERENCES pm_sections(id) ON DELETE SET NULL;
