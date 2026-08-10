-- ============================================================================
-- Sales Insights — x_estate_stats als model (startpunt + submodel van Gebouwen)
-- ============================================================================
-- x_estate_stats hangt aan res.partner (gebouw/VME) via x_studio_estate_id
-- (many2one). Die koppeling zelf staat NIET hier maar declaratief in
-- src/modules/sales-insight-explorer/lib/graph/graph-edges.js (edge
-- 'x_estate_stats>res.partner', alias __gebouw / inverse __estate_stats) --
-- zie CLAUDE.md "Sales Insight Explorer — één graaf, één cascade-motor".
-- Deze migratie voegt enkel de UI-config toe: het model zelf (kan als
-- vertrekpunt EN als submodel van Gebouwen/VME's gekozen worden) en de
-- veldcategorieën.
--
-- Geverifieerde velden (live Odoo, 2026-08-10):
--   x_studio_estate_id (many2one -> res.partner), x_studio_stage_id,
--   x_studio_kanban_state, x_studio_tag_ids, x_studio_priority,
--   x_studio_user_id, x_studio_last_sync_dt, x_active,
--   x_stats_total_open_projects, x_stats_total_closed_projects,
--   x_stats_total_pending_projects, x_stats_total_open_tasks,
--   x_stats_total_closed_tasks, x_stats_average_actions_project,
--   x_stats_dt_last_upserted_project, x_stats_dt_last_upserted_task,
--   x_stats_dt_last_closed_task, x_stats_total_active_bulletins,
--   x_stats_total_inactive_bulletins, x_stats_total_announcements,
--   x_stats_total_conversations, x_stats_total_conversations_with_provider,
--   x_stats_average_number_of_threads_in_conversation,
--   x_stats_average_number_of_threads_per_bulletin,
--   x_stats_total_pinned_messages, x_stats_total_polls,
--   x_stats_dt_last_upserted_bulletin, x_stats_dt_last_upserted_conversation,
--   x_stats_total_required_follow_ups(_with_deadline),
--   x_stats_total_optional_follow_ups(_with_deadline),
--   x_stats_total_suggested_follow_ups(_with_deadline),
--   x_stats_total_reportings, x_studio_total_active_owners,
--   x_studio_total_invited_owners, x_studio_total_documents,
--   x_stats_has_accounting_activated, x_stats_total_booked_invoices,
--   x_stats_total_collected_advances, x_stats_total_one_time_advances,
--   x_stats_total_recurrent_advances, x_stats_total_assets,
--   x_stats_total_events, x_stats_has_completed_required_scan,
--   x_stats_has_completed_optional_scan, x_stats_has_completed_suggested_scan
-- ============================================================================

-- ============================================================================
-- 1. Model registratie
-- ============================================================================

INSERT INTO models (id, odoo_model, label, description, can_be_startpoint, can_be_submodel, sort_order, base_fields)
VALUES (
  'x_estate_stats',
  'x_estate_stats',
  'Gebouwstatistieken',
  'Een gebouwstatistiek (x_estate_stats) is een geaggregeerd dashboard per gebouw/VME (res.partner via '
  'x_studio_estate_id): platformgebruik, dossiers/taken, communicatie op het prikbord, opvolgingen en '
  'boekhoudstatus. Zowel als vertrekpunt te gebruiken (bv. "alle gebouwen met een openstaand dossier") '
  'als als toevoeging onder Gebouwen/VME''s.',
  TRUE,
  TRUE,
  6,
  '[
    {"field":"id",                        "label":"ID"},
    {"field":"x_name",                    "label":"Omschrijving"},
    {"field":"x_studio_stage_id",         "label":"Fase"},
    {"field":"x_studio_last_sync_dt",     "label":"Laatste synchronisatie"},
    {"field":"x_active",                  "label":"Actief"}
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  can_be_startpoint = TRUE,
  can_be_submodel = TRUE;

-- ============================================================================
-- 2. Information sets
-- ============================================================================

INSERT INTO information_sets (id, label, description, model, is_submodel_only, sort_order)
VALUES
  (
    'estate_stats_status',
    'Status & Beheer',
    'Fase, kanban-status, labels, prioriteit en verantwoordelijke van de gebouwstatistiek, plus wanneer '
    'ze het laatst gesynchroniseerd is met de bron-applicatie.',
    'x_estate_stats',
    FALSE,
    1
  ),
  (
    'estate_stats_dossiers',
    'Dossiers & Taken',
    'Aantal open/gesloten/lopende dossiers en taken, gemiddeld aantal acties per dossier, en de meest '
    'recente aanmaak- of afsluitdatum ervan.',
    'x_estate_stats',
    FALSE,
    2
  ),
  (
    'estate_stats_communicatie',
    'Communicatie & Prikbord',
    'Activiteit op het prikbord: mededelingen, actieve/inactieve berichten, peilingen, vastgepinde '
    'berichten en gesprekken (ook met leveranciers), met gemiddeld aantal reacties.',
    'x_estate_stats',
    FALSE,
    3
  ),
  (
    'estate_stats_opvolging',
    'Opvolgingen & Meldingen',
    'Aantal verplichte, optionele en aanbevolen opvolgingen (met en zonder deadline), en het aantal '
    'meldingen op het gebouw.',
    'x_estate_stats',
    FALSE,
    4
  ),
  (
    'estate_stats_platform',
    'Portaalgebruik & Boekhouding',
    'Actieve en uitgenodigde gebruikers, aantal documenten, boekhoudstatus (facturen, opvragingen), '
    'voorzieningen, events en de voltooiingsstatus van de gebouwscan.',
    'x_estate_stats',
    FALSE,
    5
  )
ON CONFLICT (id) DO NOTHING;

-- estate_stats_status velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('estate_stats_status', 'x_studio_stage_id',      'Fase',                  'Many2one -> x_estate_stats_stage: de huidige fase van de gebouwstatistiek.', 1),
  ('estate_stats_status', 'x_studio_kanban_state',  'Kanban status',         'Selectie: voortgangsindicator (bv. normaal, actie vereist, gereed).',        2),
  ('estate_stats_status', 'x_studio_tag_ids',       'Labels',                'Many2many -> x_estate_stats_tag: vrije labels op de gebouwstatistiek.',      3),
  ('estate_stats_status', 'x_studio_priority',      'Hoge prioriteit',       'Boolean: of dit gebouw als prioritair gemarkeerd is.',                        4),
  ('estate_stats_status', 'x_studio_user_id',       'Verantwoordelijke',     'Many2one -> res.users: interne verantwoordelijke voor dit gebouw.',           5),
  ('estate_stats_status', 'x_studio_last_sync_dt',  'Laatste synchronisatie','Datum/tijd van de laatste update van deze statistieken vanuit de bron.',      6),
  ('estate_stats_status', 'x_active',               'Actief',                'Of het statistiekenrecord actief is (niet gearchiveerd).',                    7)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- estate_stats_dossiers velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('estate_stats_dossiers', 'x_stats_total_open_projects',            'Open dossiers',              'Aantal momenteel openstaande dossiers.',                          1),
  ('estate_stats_dossiers', 'x_stats_total_pending_projects',         'Dossiers in behandeling',     'Aantal dossiers dat in behandeling is.',                          2),
  ('estate_stats_dossiers', 'x_stats_total_closed_projects',          'Gesloten dossiers',           'Aantal afgesloten dossiers.',                                     3),
  ('estate_stats_dossiers', 'x_stats_total_open_tasks',               'Open taken',                  'Aantal openstaande taken binnen dossiers.',                       4),
  ('estate_stats_dossiers', 'x_stats_total_closed_tasks',             'Afgeronde taken',             'Aantal afgeronde taken.',                                         5),
  ('estate_stats_dossiers', 'x_stats_average_actions_project',        'Gem. acties per dossier',     'Gemiddeld aantal acties per dossier.',                            6),
  ('estate_stats_dossiers', 'x_stats_dt_last_upserted_project',       'Laatst dossier aangemaakt/aangepast', 'Tijdstip van de meest recente dossierwijziging.',         7),
  ('estate_stats_dossiers', 'x_stats_dt_last_upserted_task',          'Laatste taak aangemaakt',     'Tijdstip van de meest recent aangemaakte taak.',                  8),
  ('estate_stats_dossiers', 'x_stats_dt_last_closed_task',            'Laatste taak afgerond',       'Tijdstip van de meest recent afgeronde taak.',                    9)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- estate_stats_communicatie velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('estate_stats_communicatie', 'x_stats_total_announcements',                     'Mededelingen',                    'Aantal mededelingen op het prikbord.',                              1),
  ('estate_stats_communicatie', 'x_stats_total_active_bulletins',                  'Actieve prikbordberichten',       'Aantal momenteel actieve prikbordberichten.',                       2),
  ('estate_stats_communicatie', 'x_stats_total_inactive_bulletins',                'Inactieve prikbordberichten',     'Aantal niet langer actieve prikbordberichten.',                     3),
  ('estate_stats_communicatie', 'x_stats_total_pinned_messages',                   'Vastgepinde berichten',           'Aantal vastgepinde prikbordberichten.',                             4),
  ('estate_stats_communicatie', 'x_stats_total_polls',                             'Peilingen',                       'Aantal peilingen op het prikbord.',                                 5),
  ('estate_stats_communicatie', 'x_stats_total_conversations',                     'Gesprekken',                      'Totaal aantal gesprekken (mede-eigenaars onderling).',              6),
  ('estate_stats_communicatie', 'x_stats_total_conversations_with_provider',       'Gesprekken met leveranciers',     'Aantal gesprekken met externe leveranciers.',                       7),
  ('estate_stats_communicatie', 'x_stats_average_number_of_threads_in_conversation','Gem. reacties per gesprek',      'Gemiddeld aantal reacties binnen een gesprek.',                     8),
  ('estate_stats_communicatie', 'x_stats_average_number_of_threads_per_bulletin',  'Gem. reacties per bericht',       'Gemiddeld aantal reacties per prikbordbericht.',                    9),
  ('estate_stats_communicatie', 'x_stats_dt_last_upserted_bulletin',               'Laatst bericht geplaatst',        'Tijdstip van het meest recente prikbordbericht.',                  10),
  ('estate_stats_communicatie', 'x_stats_dt_last_upserted_conversation',           'Laatst gesprek gestart',          'Tijdstip van het meest recent gestarte gesprek.',                  11)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- estate_stats_opvolging velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('estate_stats_opvolging', 'x_stats_total_required_follow_ups',                'Verplichte opvolgingen',                    'Aantal verplichte opvolgingen.',                                1),
  ('estate_stats_opvolging', 'x_stats_total_required_follow_ups_with_deadline',  'Verplichte opvolgingen met deadline',       'Waarvan er een deadline is ingevuld.',                          2),
  ('estate_stats_opvolging', 'x_stats_total_optional_follow_ups',                'Optionele opvolgingen',                    'Aantal optionele opvolgingen.',                                 3),
  ('estate_stats_opvolging', 'x_stats_total_optional_follow_ups_with_deadline',  'Optionele opvolgingen met deadline',       'Waarvan er een deadline is ingevuld.',                          4),
  ('estate_stats_opvolging', 'x_stats_total_suggested_follow_ups',               'Aanbevolen opvolgingen',                   'Aantal aanbevolen (niet-verplichte) opvolgingen.',              5),
  ('estate_stats_opvolging', 'x_stats_total_suggested_follow_ups_with_deadline', 'Aanbevolen opvolgingen met deadline',      'Waarvan er een deadline is ingevuld.',                          6),
  ('estate_stats_opvolging', 'x_stats_total_reportings',                         'Meldingen',                                 'Aantal meldingen (bv. schade of overlast) op het gebouw.',      7)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- estate_stats_platform velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('estate_stats_platform', 'x_studio_total_active_owners',              'Actieve gebruikers',            'Aantal mede-eigenaars dat het portaal effectief gebruikt.',                1),
  ('estate_stats_platform', 'x_studio_total_invited_owners',             'Uitgenodigde gebruikers',       'Aantal uitgenodigde mede-eigenaars (actief of niet).',                     2),
  ('estate_stats_platform', 'x_studio_total_documents',                  'Documenten',                    'Aantal documenten in de documentenbibliotheek van het gebouw.',            3),
  ('estate_stats_platform', 'x_stats_has_accounting_activated',         'Boekhouding geactiveerd',       'Of de boekhoudmodule voor dit gebouw actief is.',                          4),
  ('estate_stats_platform', 'x_stats_total_booked_invoices',            'Facturen',                      'Aantal geboekte facturen.',                                                5),
  ('estate_stats_platform', 'x_stats_total_collected_advances',         'Opgevraagde opvragingen',       'Aantal reeds opgevraagde voorschotten/opvragingen.',                       6),
  ('estate_stats_platform', 'x_stats_total_one_time_advances',          'Eenmalige opvragingen',         'Aantal eenmalige opvragingen.',                                            7),
  ('estate_stats_platform', 'x_stats_total_recurrent_advances',         'Lopende opvragingen',           'Aantal recurrente (periodieke) opvragingen.',                              8),
  ('estate_stats_platform', 'x_stats_total_assets',                     'Voorzieningen',                 'Aantal geregistreerde voorzieningen (bv. lift, fietsenberging).',          9),
  ('estate_stats_platform', 'x_stats_total_events',                     'Events',                        'Aantal geregistreerde events op het gebouw.',                             10),
  ('estate_stats_platform', 'x_stats_has_completed_required_scan',      'Verplichte gebouwscan afgerond','Of het verplichte deel van de gebouwscan is afgerond.',                   11),
  ('estate_stats_platform', 'x_stats_has_completed_optional_scan',      'Optionele gebouwscan afgerond', 'Of het optionele deel van de gebouwscan is afgerond.',                    12),
  ('estate_stats_platform', 'x_stats_has_completed_suggested_scan',     'Aanbevolen gebouwscan afgerond','Of het aanbevolen deel van de gebouwscan is afgerond.',                   13)
ON CONFLICT (set_id, field_key) DO NOTHING;
