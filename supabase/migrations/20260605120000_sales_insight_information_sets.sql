-- ============================================================================
-- Information Sets — dynamic field categories for the Sales Insight Wizard
-- ============================================================================
-- Replaces the hardcoded INFORMATION_SETS constant in semantic-wizard.js.
-- Each set groups Odoo field keys with labels and AI-readable descriptions.
-- Sets and fields are shared across all users (no per-user scope).
--
-- Tables:
--   information_sets        — top-level categories (e.g. "Intake & Open vragen")
--   information_set_fields  — individual field keys belonging to a set
-- ============================================================================

-- ============================================================================
-- 1. Tables
-- ============================================================================

CREATE TABLE information_sets (
  id          TEXT PRIMARY KEY,                       -- slug, e.g. 'intake_open_vragen'
  label       TEXT NOT NULL,                         -- display label in wizard UI
  description TEXT,                                  -- context for AI reading the JSON export
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE information_set_fields (
  id          BIGSERIAL PRIMARY KEY,
  set_id      TEXT NOT NULL REFERENCES information_sets(id) ON DELETE CASCADE,
  field_key   TEXT NOT NULL,                         -- Odoo field name, e.g. 'x_studio_open_question_reason_for_contact'
  label       TEXT,                                  -- human-readable field name
  description TEXT,                                  -- context for AI reading the JSON export
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (set_id, field_key)
);

-- ============================================================================
-- 2. RLS — Worker uses service_role (bypasses RLS).
--    Authenticated users (browser) can read and insert.
--    Deletes and updates are service_role only (via Worker).
-- ============================================================================

ALTER TABLE information_sets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE information_set_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "information_sets_select"
  ON information_sets FOR SELECT TO authenticated USING (true);

CREATE POLICY "information_set_fields_select"
  ON information_set_fields FOR SELECT TO authenticated USING (true);

CREATE POLICY "information_sets_insert"
  ON information_sets FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "information_set_fields_insert"
  ON information_set_fields FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- 3. Seed — migrate the hardcoded INFORMATION_SETS from semantic-wizard.js
-- ============================================================================

INSERT INTO information_sets (id, label, description, sort_order) VALUES
  (
    'intake_open_vragen',
    'Intake & Open vragen',
    'Open vragen die de prospect bij intake heeft ingevuld over zijn situatie en verwachtingen.',
    1
  ),
  (
    'communicatie',
    'Communicatie',
    'Communicatieprofiel van de prospect: vaardigheidsniveaus, methoden en relationele context.',
    2
  ),
  (
    'huidig_beheer_werking',
    'Huidig beheer en werking',
    'Hoe het gebouw momenteel beheerd wordt: type syndicus, boekhoudmethode, rekeningen en verzekering.',
    3
  ),
  (
    'financieel_administratief',
    'Financieel en Administratief gedrag',
    'Administratieve volwassenheid van de VME: jaarrekening, verdeelsleutels en vooruitbetalingen.',
    4
  ),
  (
    'gebouw_context',
    'Gebouw en Context',
    'Fysieke en demografische context van het gebouw: grootte, eigendomsstructuur en bewonersprofiel.',
    5
  );

-- intake_open_vragen
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order) VALUES
  ('intake_open_vragen', 'x_studio_open_question_reason_for_contact',   'Reden contact',       'Waarom neemt de prospect contact op? Wat is de directe aanleiding?',                             1),
  ('intake_open_vragen', 'x_studio_open_question_current_situation',    'Huidige situatie',    'Beschrijving van de huidige beheersituatie vanuit het perspectief van de prospect.',              2),
  ('intake_open_vragen', 'x_studio_open_question_expected_solution',    'Verwachte oplossing', 'Wat verwacht de prospect van een nieuwe syndicus of beheerder?',                                  3),
  ('intake_open_vragen', 'x_studio_open_question_running_costs',        'Lopende kosten',      'Inzicht in de huidige kosten die de prospect als relevant beschouwt.',                            4),
  ('intake_open_vragen', 'x_studio_open_question_self_management',      'Zelfredzaamheid',     'In welke mate beheert de VME zaken zelf en wat wil men uitbesteden?',                            5),
  ('intake_open_vragen', 'x_studio_open_question_technical_management', 'Technisch beheer',    'Hoe wordt het technisch onderhoud van het gebouw momenteel georganiseerd?',                      6);

-- communicatie
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order) VALUES
  ('communicatie', 'x_studio_contact_id',                 'Contact',                   'De gekoppelde contactpersoon voor deze lead.',                                             1),
  ('communicatie', 'x_studio_communication_methods',      'Communicatiemethoden',      'Voorkeursmethoden voor communicatie (email, telefoon, WhatsApp, ...).',                   2),
  ('communicatie', 'x_studio_communication_skill_level',  'Communicatievaardigheid',   'Hoe vaardig is de prospect in zakelijke communicatie?',                                   3),
  ('communicatie', 'x_studio_digital_skill_level',        'Digitale vaardigheid',      'Mate van digitale geletterdheid van de prospect.',                                        4),
  ('communicatie', 'x_studio_legal_skill_level',          'Juridische vaardigheid',    'Kennis van juridische en reglementaire aspecten van VME-beheer.',                        5),
  ('communicatie', 'x_studio_interpersonal_relationship', 'Interpersoonlijke relatie', 'Kwaliteit van de relatie binnen de mede-eigenaarsgroep.',                                 6),
  ('communicatie', 'x_studio_job_description',            'Functieomschrijving',       'Professionele achtergrond of rol van de contactpersoon.',                                 7);

-- huidig_beheer_werking
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order) VALUES
  ('huidig_beheer_werking', 'x_studio_current_syndic',               'Huidige syndicus',       'Naam of type van de huidige syndicus.',                                           1),
  ('huidig_beheer_werking', 'x_studio_current_syndic_type',          'Type syndicus',          'Professioneel, vrijwilliger of zelfsyndicus.',                                    2),
  ('huidig_beheer_werking', 'x_studio_current_way_of_working',       'Werkwijze',              'Hoe worden vergaderingen, documenten en communicatie momenteel georganiseerd?',   3),
  ('huidig_beheer_werking', 'x_studio_has_doubly_entry_accounting',  'Dubbele boekhouding',    'Of de VME dubbele boekhouding voert (verplicht boven bepaalde drempel).',         4),
  ('huidig_beheer_werking', 'x_studio_has_operating_account',        'Werkingsrekening',       'Of er een aparte werkingsrekening bestaat.',                                      5),
  ('huidig_beheer_werking', 'x_studio_has_reserve_account',          'Reserverekening',        'Of er een reserverekening bestaat voor grote werken.',                            6),
  ('huidig_beheer_werking', 'x_studio_has_registration_number',      'Ondernemingsnummer',     'Of de VME een eigen ondernemingsnummer heeft.',                                   7),
  ('huidig_beheer_werking', 'x_studio_has_insurance',                'Verzekering',            'Of de VME correct verzekerd is.',                                                 8);

-- financieel_administratief
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order) VALUES
  ('financieel_administratief', 'x_studio_has_annual_statement', 'Jaarrekening',      'Of er een goedgekeurde jaarrekening is.',                         1),
  ('financieel_administratief', 'x_studio_has_allocation_keys',  'Verdeelsleutels',   'Of de kostenverdeling formeel vastgelegd is.',                    2),
  ('financieel_administratief', 'x_studio_has_advance_payments', 'Vooruitbetalingen', 'Of mede-eigenaars maandelijkse of kwartaalvoorschotten betalen.', 3);

-- gebouw_context
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order) VALUES
  ('gebouw_context', 'x_studio_for_company_id',       'VME / Gebouw',         'De gekoppelde VME of onderneming waarvoor de actionsheet geldt.',        1),
  ('gebouw_context', 'x_studio_hoa_established',      'VME opgericht',        'Of de VME juridisch is opgericht.',                                      2),
  ('gebouw_context', 'x_studio_number_of_plots',      'Aantal kavels',        'Totaal aantal kavels in het gebouw.',                                    3),
  ('gebouw_context', 'x_studio_number_of_apartments', 'Aantal appartementen', 'Aantal residentiële eenheden.',                                          4),
  ('gebouw_context', 'x_studio_number_of_co_owners',  'Aantal mede-eigenaars','Aantal actieve mede-eigenaars.',                                         5),
  ('gebouw_context', 'x_studio_has_commercial_plots', 'Commerciële kavels',   'Of er commerciële of gemengde kavels aanwezig zijn.',                    6),
  ('gebouw_context', 'x_studio_average_tenant_age',   'Gemiddelde leeftijd',  'Gemiddelde leeftijd van de bewoners/eigenaars.',                         7),
  ('gebouw_context', 'x_studio_age_group',            'Leeftijdsgroep',       'Categorisering van het bewonersprofiel op basis van leeftijd.',          8);