-- ============================================================================
-- Sales Insights — Chatter, Activiteiten & Lead Context
-- ============================================================================
-- Voegt toe aan het dynamische wizard-systeem (models + information_sets):
--
--   1. Twee nieuwe submodellen:
--        mail.message  (chatter berichten)
--        mail.activity (activiteiten / to-do's)
--
--   2. Information sets voor elk submodel:
--        chatter_berichten        → mail.message lean velden
--        activiteiten             → mail.activity lean velden
--
--   3. Lead context information set (crm.lead):
--        lead_context             → origin, expert, vme-check velden
--
--   4. base_fields update voor x_sales_action_sheet:
--        stage, gebouw en sales-user worden altijd meegestuurd
--
-- Geverifieerd: alle field_key waarden bestaan in live Odoo (juni 2026).
-- Veldnamen die NIET bestaan in Odoo zijn NIET opgenomen:
--   ❌ total_area, num_units, construction_year (op x_estate_stats)
--   ❌ x_stage_type (op x_support_stage)
--   ❌ x_date, x_meeting_type (op x_as_meetings — wel x_studio_date etc.)
-- ============================================================================


-- ============================================================================
-- 1. Nieuwe modellen: mail.message en mail.activity
-- ============================================================================
-- can_be_startpoint = FALSE  — je begint een query niet op chatter-berichten
-- can_be_submodel   = TRUE   — wel beschikbaar als enrichment op actiebladen
-- ============================================================================

INSERT INTO models (id, odoo_model, label, description, can_be_startpoint, can_be_submodel, sort_order, base_fields)
VALUES
  (
    'mail_message',
    'mail.message',
    'Chatter Berichten',
    'Een chatter bericht (mail.message) is een communicatie-entry die gekoppeld is aan een Odoo record. Voor actiebladen bevat dit interne notities, e-mails en reacties van het salesteam. Lean velden: datum, auteur, berichttype en een kort tekstfragment (preview, geen html). Systeemnotificaties zijn uitgefilterd — alleen type comment en email.',
    FALSE,
    TRUE,
    10,
    '[{"field":"id","label":"ID"},{"field":"date","label":"Datum"},{"field":"author_id","label":"Auteur"},{"field":"message_type","label":"Type"},{"field":"preview","label":"Tekstfragment"}]'::jsonb
  ),
  (
    'mail_activity',
    'mail.activity',
    'Activiteiten',
    'Een activiteit (mail.activity) is een geplande taak of opvolging gekoppeld aan een Odoo record. Voor actiebladen bevat dit call-back reminders, to-do''s en e-mail-taken. Lean velden: type, deadline, samenvatting, status en verantwoordelijke. Geen html-notities tenzij expliciet aangevraagd.',
    FALSE,
    TRUE,
    11,
    '[{"field":"id","label":"ID"},{"field":"activity_type_id","label":"Type"},{"field":"date_deadline","label":"Deadline"},{"field":"summary","label":"Samenvatting"},{"field":"state","label":"Status"},{"field":"user_id","label":"Verantwoordelijke"}]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 2. Information sets voor mail.message (chatter)
-- ============================================================================

INSERT INTO information_sets (id, label, description, model, is_submodel_only, sort_order)
VALUES
  (
    'chatter_berichten',
    'Chatter Berichten',
    'Conversatiegeschiedenis gekoppeld aan het actieblad: interne notities en e-mails van het salesteam. Gefilterd op type comment/email (geen systeem-notificaties). Gebruik "preview" — nooit "body" (bevat ruwe html).',
    'mail.message',
    TRUE,
    1
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('chatter_berichten', 'date',         'Datum',         'Datum en tijdstip van het bericht.',                                                      1),
  ('chatter_berichten', 'author_id',    'Auteur',        'Naam van de persoon die het bericht schreef — intern of extern.',                          2),
  ('chatter_berichten', 'message_type', 'Type',          'comment = interne noot, email = e-mail communicatie.',                                     3),
  ('chatter_berichten', 'preview',      'Tekstfragment', 'Kort tekstfragment van het bericht zonder html-opmaak. Max ~160 tekens. Lean alternatief voor de volledige body.', 4)
ON CONFLICT (set_id, field_key) DO NOTHING;


-- ============================================================================
-- 3. Information sets voor mail.activity (activiteiten)
-- ============================================================================

INSERT INTO information_sets (id, label, description, model, is_submodel_only, sort_order)
VALUES
  (
    'activiteiten_basis',
    'Activiteiten',
    'Open en geplande taken (activiteiten) gekoppeld aan het actieblad. Bevat type (Call, To-Do, Email…), deadline, korte samenvatting en de verantwoordelijke medewerker. Status: today = vandaag, planned = gepland, overdue = verlopen.',
    'mail.activity',
    TRUE,
    1
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('activiteiten_basis', 'activity_type_id', 'Type activiteit', 'Het type taak: Call(2), To-Do(4), Email(1), Calendly Ondersteuning(16).',             1),
  ('activiteiten_basis', 'date_deadline',    'Deadline',        'De verwachte uitvoerdatum van de activiteit.',                                        2),
  ('activiteiten_basis', 'summary',          'Samenvatting',    'Korte omschrijving van de activiteit, ingevuld door de medewerker.',                  3),
  ('activiteiten_basis', 'state',            'Status',          'today = deadline vandaag, planned = toekomst, overdue = verlopen.',                   4),
  ('activiteiten_basis', 'user_id',          'Verantwoordelijke','De medewerker aan wie de activiteit is toegewezen.',                                 5)
ON CONFLICT (set_id, field_key) DO NOTHING;


-- ============================================================================
-- 4. Lead Context information set (crm.lead) — NIEUW
-- ============================================================================
-- Geverifieerde velden (live Odoo juni 2026):
--   x_studio_brand_origin, x_studio_search_syndic_current_admin,
--   x_studio_is_vme_check, x_studio_isexpertlead
-- ============================================================================

INSERT INTO information_sets (id, label, description, model, is_submodel_only, sort_order)
VALUES
  (
    'lead_context',
    'Lead Profiel',
    'Profielinformatie van de lead: herkomstkanaal, huidig beheertype, of een VME-check werd aangevraagd en of het een expert-lead is. Geeft context over het type prospect en de reden van contact.',
    'crm.lead',
    FALSE,
    5
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('lead_context', 'x_studio_brand_origin',               'Lead origin',      'Via welk kanaal of merk de lead is binnengekomen: Meta, organisch, directe registratie…',    1),
  ('lead_context', 'x_studio_search_syndic_current_admin','Huidig beheer',    'Huidig beheertype van de VME bij aanvraag: professioneel, vrijwilliger of zelfsyndicus.',    2),
  ('lead_context', 'x_studio_is_vme_check',               'VME-check aanvraag','Of de lead een VME-check heeft aangevraagd (boolean).',                                      3),
  ('lead_context', 'x_studio_isexpertlead',               'Expert-lead',      'Of dit een expert-lead is — komt via het expert-ondersteuningskanaal binnen.',               4)
ON CONFLICT (set_id, field_key) DO NOTHING;


-- ============================================================================
-- 5. base_fields update — x_sales_action_sheet
-- ============================================================================
-- Voegt fase, gebouw en sales-verantwoordelijke toe aan de altijd-velden.
-- Deze ontbraken in de vorige migrations maar zijn essentieel voor context.
--
-- Correcte veldnamen (geverifieerd):
--   x_studio_stage_id        → fase (was foutief 'x_support_stage' in legacy config)
--   x_studio_for_company_id  → gekoppeld gebouw/VME
--   x_studio_user_id         → sales verantwoordelijke (was foutief 'owner_id')
--   x_active                 → archiveringsstatus
-- ============================================================================

UPDATE models
SET base_fields = '[
  {"field":"id",                      "label":"ID"},
  {"field":"create_date",             "label":"Aangemaakt op"},
  {"field":"x_name",                  "label":"Naam"},
  {"field":"x_studio_stage_id",       "label":"Fase"},
  {"field":"x_studio_for_company_id", "label":"Gebouw"},
  {"field":"x_studio_user_id",        "label":"Sales verantwoordelijke"},
  {"field":"x_active",                "label":"Actief"}
]'::jsonb
WHERE id = 'x_sales_action_sheet';
