-- ============================================================================
-- Sales Insights — res.partner als startmodel
-- ============================================================================
-- Voegt toe:
--   1. Model res.partner (can_be_startpoint=TRUE, can_be_submodel=FALSE)
--   2. Information sets:
--        partner_profiel     → kernvelden VME/syndicus
--        partner_gebouw      → gebouwstatistieken
--        partner_beheer      → beheer-gerelateerde velden
--        partner_platform    → platformgebruik (activiteit, activatie)
--
-- Geverifieerde velden (live Odoo juni 2026):
--   x_studio_company_type, x_studio_company_status, x_studio_number_of_plots,
--   x_studio_number_of_apartments, x_studio_number_of_co_owners,
--   x_studio_hoa_established, x_studio_current_syndic_type,
--   x_studio_registration_number, x_studio_soid, x_studio_first_activity,
--   x_studio_last_activity, x_studio_days_since_last_activity
--
-- Filtering via wizard:
--   - always: is_company = true
--   - optioneel: x_studio_company_type (VME=1, VME in beheer=3, Prof. Syndicus=2)
--   - optioneel: x_studio_company_status (Free Trial/Active/Inactive/Internal/Blocked)
-- ============================================================================


-- ============================================================================
-- 1. Model registratie
-- ============================================================================

INSERT INTO models (id, odoo_model, label, description, can_be_startpoint, can_be_submodel, sort_order, base_fields)
VALUES (
  'res_partner',
  'res.partner',
  'Partners (VME''s & Syndici)',
  'Een partner (res.partner) vertegenwoordigt een bedrijfscontact in Odoo. In mymmo-context: VME''s (in advies of in beheer) en professionele syndici. Altijd gefilterd op is_company=true. Bevat gebouwprofiel, beheertype, company-status en platformgebruiksdata.',
  TRUE,
  FALSE,
  5,
  '[
    {"field":"id",                       "label":"ID"},
    {"field":"name",                     "label":"Naam"},
    {"field":"x_studio_company_type",    "label":"Type"},
    {"field":"x_studio_company_status",  "label":"Status"},
    {"field":"x_studio_number_of_plots", "label":"Totaal kavels"},
    {"field":"create_date",              "label":"Aangemaakt op"}
  ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 2. Information sets
-- ============================================================================

INSERT INTO information_sets (id, label, description, model, is_submodel_only, sort_order)
VALUES
  (
    'partner_profiel',
    'Partner Profiel',
    'Kernidentificatie van de partner: company-type (VME/VME in beheer/Professioneel Syndicus), company-status (Free/Active/Inactive/Blocked), ondernemingsnummer en OpenVME-ID. Gebruik voor segmentatie en statusanalyse.',
    'res.partner',
    FALSE,
    1
  ),
  (
    'partner_gebouw',
    'Gebouwprofiel',
    'Fysieke en juridische kenmerken van het gebouw: totaal kavels, bewoonbare kavels, mede-eigenaars, VME-status en commerciële kavels. Let op: dit zijn velden direct op de partner, niet via x_estate_stats.',
    'res.partner',
    FALSE,
    2
  ),
  (
    'partner_beheer',
    'Beheer & Syndicus',
    'Informatie over het huidige beheertype (professioneel, vrijwilliger, zelfsyndicus), de huidige syndicus (res.partner) en de adviserend syndicus (helpdesk.team). Nuttig voor analyse van overnamepotentieel.',
    'res.partner',
    FALSE,
    3
  ),
  (
    'partner_platform',
    'Platformgebruik',
    'Activiteitsdata op het mymmo-platform: eerste activiteit, laatste activiteit, actieve periode in dagen, en dagen sinds laatste activiteit. Geeft inzicht in de betrokkenheid van de VME.',
    'res.partner',
    FALSE,
    4
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 3. Velden per information set
-- ============================================================================

-- partner_profiel
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('partner_profiel', 'x_studio_company_type',   'Type partner',      'Many2one → x_company_type: VME(1), VME in beheer(3), Professioneel Syndicus(2).',         1),
  ('partner_profiel', 'x_studio_company_status',  'Status',            'Selectieveld: Free Trial, Active, Inactive, Internal, Blocked.',                           2),
  ('partner_profiel', 'x_studio_registration_number', 'Ondernemingsnummer', 'KBO-ondernemingsnummer van de VME.',                                                  3),
  ('partner_profiel', 'x_studio_soid',            'OpenVME ID',        'Intern platform-ID in OpenVME/mymmo.',                                                     4)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- partner_gebouw
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('partner_gebouw', 'x_studio_number_of_plots',       'Totaal kavels',        'Totaal aantal kavels in het gebouw.',                                              1),
  ('partner_gebouw', 'x_studio_number_of_apartments',  'Bewoonbare kavels',    'Aantal bewoonbare (residentiële) kavels.',                                         2),
  ('partner_gebouw', 'x_studio_number_of_co_owners',   'Mede-eigenaars',       'Aantal mede-eigenaars.',                                                            3),
  ('partner_gebouw', 'x_studio_hoa_established',       'VME opgericht',        'Boolean: of de VME juridisch is opgericht.',                                       4),
  ('partner_gebouw', 'x_studio_has_commercial_plots',  'Commerciële kavels',   'Boolean: heeft het gebouw commerciële kavels.',                                    5)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- partner_beheer
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('partner_beheer', 'x_studio_current_syndic_type', 'Huidig type beheer',   'Selectie: hoe wordt de VME momenteel beheerd (professioneel, vrijwilliger, zelfsyndicus).', 1),
  ('partner_beheer', 'x_studio_current_syndic',      'Huidige syndicus',     'Many2one → res.partner: de huidige beheerdende partij.',                            2),
  ('partner_beheer', 'x_studio_adviserend_syndicus',  'Adviserend syndicus',  'Many2one → helpdesk.team: het advieskantoor van mymmo.',                           3)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- partner_platform
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('partner_platform', 'x_studio_first_activity',            'Eerste activiteit',     'Datum eerste actieve sessie op het platform.',                              1),
  ('partner_platform', 'x_studio_last_activity',             'Laatste activiteit',    'Datum laatste actieve sessie op het platform.',                             2),
  ('partner_platform', 'x_studio_days_since_creation',       'Dagen sinds activatie', 'Berekend veld: dagen tussen aanmaakaatum en vandaag.',                      3),
  ('partner_platform', 'x_studio_days_since_last_activity',  'Dagen inactief',        'Berekend veld: dagen sinds de laatste activiteit op het platform.',         4),
  ('partner_platform', 'x_studio_days_to_activation',        'Dagen tot activatie',   'Berekend veld: hoe lang het duurde voor de VME actief werd na aanmaak.',   5)
ON CONFLICT (set_id, field_key) DO NOTHING;
