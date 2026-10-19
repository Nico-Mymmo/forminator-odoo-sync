-- Projecten: mijlpalen zijn een eigen laag BOVEN de taken (Nico, 2026-10-19):
-- een mijlpaal heeft een naam en een datum, taken hangen eraan, en ze is
-- gehaald zodra alle taken eronder af zijn. Geen fase, geen taak met een vlag.
CREATE TABLE IF NOT EXISTS pm_milestones (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_date    TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_milestones_project ON pm_milestones (project_id, position);
ALTER TABLE pm_tasks ADD COLUMN milestone_id TEXT REFERENCES pm_milestones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pm_tasks_milestone ON pm_tasks (milestone_id);

-- De mijlpalen van het Odoo-project (Koppeling Mollie) stonden als taken in een
-- sectie "Mijlpalen": die worden echte mijlpalen, de taken hangen eraan via het
-- label dat de import erop zette, en de hulpsectie en -taken gaan weg.
INSERT OR IGNORE INTO pm_milestones (id, project_id, name, due_date, position, created_at)
 SELECT 'odoo:project.milestone:' || odoo_id, project_id, title, due_date, odoo_id, created_at
 FROM pm_tasks WHERE odoo_model = 'project.milestone';
UPDATE pm_tasks SET milestone_id = (
   SELECT m.id FROM pm_milestones m WHERE m.project_id = pm_tasks.project_id AND instr(pm_tasks.labels, '"' || m.name || '"') > 0)
 WHERE odoo_model = 'project.task' AND milestone_id IS NULL;
UPDATE pm_tasks SET labels = '[]'
 WHERE odoo_model = 'project.task' AND milestone_id IS NOT NULL
   AND labels = '["' || (SELECT name FROM pm_milestones m WHERE m.id = pm_tasks.milestone_id) || '"]';
DELETE FROM pm_history WHERE task_id IN (SELECT id FROM pm_tasks WHERE odoo_model = 'project.milestone');
DELETE FROM pm_tasks WHERE odoo_model = 'project.milestone';
DELETE FROM pm_sections WHERE name = 'Mijlpalen' AND kind = 'open'
  AND NOT EXISTS (SELECT 1 FROM pm_tasks t WHERE t.section_id = pm_sections.id);
