-- Projecten (src/modules/projecten): interne projecten en to-do's.
-- Een NIEUWE module, dus meteen in om-core (besluit 2026-10-16), niet in Supabase.
-- Type-afspraken: zie 0001_init.sql.
--
-- Wie: alle *_id die naar een persoon wijzen, zijn OM-gebruikers (users.id in
-- Supabase, een uuid als tekst). Er is geen foreign key naar users: die tabel
-- staat (nog) in Supabase.

CREATE TABLE IF NOT EXISTS pm_projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'sky',
  icon        TEXT NOT NULL DEFAULT 'folder-kanban',
  owner_id    TEXT,
  status      TEXT NOT NULL DEFAULT 'op_schema'
              CHECK (status IN ('op_schema', 'risico', 'vertraagd', 'gepauzeerd', 'afgerond')),
  due_date    TEXT,                                  -- YYYY-MM-DD, optioneel
  archived    BOOLEAN NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS pm_sections (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_sections_project ON pm_sections (project_id, position);

-- Een taak zonder project is een losse to-do. Een taak met parent_id is een
-- subtaak (één niveau; de server weigert een subtaak van een subtaak).
CREATE TABLE IF NOT EXISTS pm_tasks (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES pm_projects(id) ON DELETE CASCADE,
  section_id   TEXT REFERENCES pm_sections(id) ON DELETE SET NULL,
  parent_id    TEXT REFERENCES pm_tasks(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  assignee_id  TEXT,
  due_date     TEXT,                                 -- YYYY-MM-DD
  priority     TEXT NOT NULL DEFAULT 'normaal'
               CHECK (priority IN ('laag', 'normaal', 'hoog', 'dringend')),
  is_milestone BOOLEAN NOT NULL DEFAULT 0,
  labels       JSON_TEXT NOT NULL DEFAULT '[]',
  followers    JSON_TEXT NOT NULL DEFAULT '[]',      -- OM-gebruikers die meevolgen
  done         BOOLEAN NOT NULL DEFAULT 0,
  done_at      TIMESTAMPTZ,
  position     INTEGER NOT NULL DEFAULT 0,
  odoo_model   TEXT,                                 -- bv. crm.lead
  odoo_id      INTEGER,
  odoo_name    TEXT,                                 -- naam op het moment van koppelen
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_project  ON pm_tasks (project_id, section_id, position);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_parent   ON pm_tasks (parent_id, position);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_assignee ON pm_tasks (assignee_id, done, due_date);

CREATE TABLE IF NOT EXISTS pm_comments (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  author_id   TEXT,
  body        TEXT NOT NULL,
  mentions    JSON_TEXT NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_comments_task ON pm_comments (task_id, created_at);

-- Een bijlage is een OPGELADEN bestand (R2, map projecten/, enkel via de
-- route van de module te openen) of een VERWIJZING naar een bestand in
-- Assetbeheer (r2_key van daar, url via /assets/).
CREATE TABLE IF NOT EXISTS pm_attachments (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES pm_tasks(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('upload', 'asset', 'link')),
  name         TEXT NOT NULL,
  r2_key       TEXT,
  url          TEXT,
  content_type TEXT,
  size         INTEGER,
  uploaded_by  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_attachments_task ON pm_attachments (task_id);

-- Historiek: wie wijzigde wat. old/new als leesbare tekst, nooit als id.
CREATE TABLE IF NOT EXISTS pm_history (
  id          TEXT PRIMARY KEY,
  task_id     TEXT REFERENCES pm_tasks(id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES pm_projects(id) ON DELETE CASCADE,
  user_id     TEXT,
  action      TEXT NOT NULL,
  field       TEXT,
  old_value   TEXT,
  new_value   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pm_history_task    ON pm_history (task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pm_history_project ON pm_history (project_id, created_at);
