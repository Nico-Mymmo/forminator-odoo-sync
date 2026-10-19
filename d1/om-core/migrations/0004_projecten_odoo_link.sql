-- Projecten: een project kan, net als een taak, naar een Odoo-record verwijzen.
-- Gebruikt bij het overnemen van de teamdoelen (x_team_goal) en het
-- Odoo-project "Koppeling Mollie" (project.project), zodat de herkomst
-- zichtbaar blijft en een tweede import niets dubbel aanmaakt.

ALTER TABLE pm_projects ADD COLUMN odoo_model TEXT;
ALTER TABLE pm_projects ADD COLUMN odoo_id INTEGER;
ALTER TABLE pm_projects ADD COLUMN odoo_name TEXT;
CREATE INDEX IF NOT EXISTS idx_pm_projects_odoo ON pm_projects (odoo_model, odoo_id);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_odoo ON pm_tasks (odoo_model, odoo_id);
