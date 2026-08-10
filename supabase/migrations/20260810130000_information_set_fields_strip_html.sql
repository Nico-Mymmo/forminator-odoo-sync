-- Sales Insight Explorer: optionele HTML-strip per informatieset-veld
--
-- Odoo html-velden (notities, chatter-berichten, beschrijvingen, ...) bevatten
-- vaak enkel opmaak zonder extra informatie -- een <p> rond één zin, een lege
-- <span style="...">. Dat is ruis in query-resultaten, exports en AI-context.
--
-- strip_html is een per-veld schakelaar (beheerd in de admin-tab "Categorieën",
-- zie ui-admin.js) i.p.v. een per-query instelling: een veld wordt op precies
-- dezelfde manier opgehaald overal waar het gebruikt wordt (wizard, mini-apps),
-- dus hoort de keuze bij het veld, niet bij elke afzonderlijke zoekopdracht.
-- De effectieve strip gebeurt in
-- src/modules/sales-insight-explorer/lib/graph/cascade-executor.js, met
-- src/modules/sales-insight-explorer/lib/html-strip.js als implementatie.

ALTER TABLE information_set_fields
  ADD COLUMN IF NOT EXISTS strip_html BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN information_set_fields.strip_html IS
  'Wanneer true wordt HTML-opmaak uit de waarde van dit veld gestript vóór het resultaat teruggaat naar de wizard/mini-apps (zie lib/html-strip.js). Bedoeld voor Odoo html-velden waar de opmaak zelf geen extra informatie draagt.';
