-- Projecten: elk project heeft twee VASTE eindfases, Opgeleverd en Gearchiveerd
-- (Nico, 2026-10-19). Vinkje = Opgeleverd, archiefknop = Gearchiveerd; ze staan
-- altijd achteraan en kunnen niet hernoemd of weggehaald worden.
-- `kind`: 'open' (een gewone sectie) | 'opgeleverd' | 'gearchiveerd'.
ALTER TABLE pm_sections ADD COLUMN kind TEXT NOT NULL DEFAULT 'open';

-- Bestaande secties die die rol al speelden, krijgen de rol en de vaste naam.
UPDATE pm_sections SET kind = 'opgeleverd', name = 'Opgeleverd', position = 9000
 WHERE name IN ('Opgeleverd', 'Done', 'Klaar');
UPDATE pm_sections SET kind = 'gearchiveerd', name = 'Gearchiveerd', position = 9100
 WHERE name IN ('Gearchiveerd', 'Archived');

-- Elk project dat er nog geen heeft, krijgt ze erbij.
INSERT INTO pm_sections (id, project_id, name, position, kind)
 SELECT p.id || ':sectie:opgeleverd', p.id, 'Opgeleverd', 9000, 'opgeleverd' FROM pm_projects p
 WHERE NOT EXISTS (SELECT 1 FROM pm_sections s WHERE s.project_id = p.id AND s.kind = 'opgeleverd');
INSERT INTO pm_sections (id, project_id, name, position, kind)
 SELECT p.id || ':sectie:gearchiveerd', p.id, 'Gearchiveerd', 9100, 'gearchiveerd' FROM pm_projects p
 WHERE NOT EXISTS (SELECT 1 FROM pm_sections s WHERE s.project_id = p.id AND s.kind = 'gearchiveerd');

-- Vinkje en sectie zeggen hetzelfde: wat in een eindfase staat is af, de rest niet.
UPDATE pm_tasks SET done = 1, done_at = COALESCE(done_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 WHERE parent_id IS NULL AND section_id IN (SELECT id FROM pm_sections WHERE kind <> 'open') AND done = 0;
UPDATE pm_tasks SET section_id = (SELECT id FROM pm_sections s WHERE s.project_id = pm_tasks.project_id AND s.kind = 'opgeleverd')
 WHERE parent_id IS NULL AND done = 1 AND project_id IS NOT NULL
   AND (section_id IS NULL OR section_id IN (SELECT id FROM pm_sections WHERE kind = 'open'));
