-- ============================================================================
-- Web Visitor & Ad Touchpoint — modellen, categorieën en velden
-- ============================================================================
-- 1. x_ad_touchpoint toevoegen als model (submodel van x_web_visitor)
-- 2. Field groups voor x_web_visitor
-- 3. Field groups voor x_ad_touchpoint
-- ============================================================================

-- ============================================================================
-- 1. Modellen
-- ============================================================================

INSERT INTO models (id, odoo_model, label, description, can_be_startpoint, can_be_submodel, sort_order)
VALUES (
  'x_web_visitor',
  'x_web_visitor',
  'Web Visitors',
  'Een web visitor (x_web_visitor) vertegenwoordigt een unieke bezoeker op een van de OpenVME websites. '
  'Elke bezoeker heeft een UUID, wordt bijgehouden per site, en bevat UTM-attributiedata. '
  'Bezoekers kunnen gelinkt zijn aan CRM leads. De pages_json bevat een gestructureerde samenvatting '
  'van alle sessies, kanalen en paginabezoeken.',
  TRUE,
  FALSE,
  3
)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  can_be_startpoint = TRUE;

INSERT INTO models (id, odoo_model, label, description, can_be_startpoint, can_be_submodel, sort_order)
VALUES (
  'x_ad_touchpoint',
  'x_ad_touchpoint',
  'Ad Touchpoints',
  'Een ad touchpoint (x_ad_touchpoint) is een geregistreerde advertentieklik of campagne-interactie '
  'gekoppeld aan een web visitor. Bevat campagne-, advertentiegroep- en advertentiedata van platforms '
  'zoals Google Ads en Meta. Meerdere touchpoints per visitor zijn mogelijk.',
  FALSE,
  TRUE,
  4
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. Field groups voor x_web_visitor
-- ============================================================================

INSERT INTO information_sets (id, label, description, model, is_submodel_only, sort_order)
VALUES
  (
    'visitor_identificatie',
    'Identificatie',
    'Unieke identificatoren en basisinfo van de bezoeker: naam, UUID, site en activiteitsstatus.',
    'x_web_visitor',
    FALSE,
    1
  ),
  (
    'visitor_timing',
    'Timing & Sessie',
    'Tijdstippen van eerste en laatste bezoek, sessieduur en bounce-indicatoren.',
    'x_web_visitor',
    FALSE,
    2
  ),
  (
    'visitor_attributie',
    'Attributie & UTM',
    'Marketingattributie via UTM-parameters: bron, medium en campagne van het eerste of laatste bezoek.',
    'x_web_visitor',
    FALSE,
    3
  ),
  (
    'visitor_leads',
    'Gekoppelde Leads',
    'CRM leads die aan deze bezoeker gelinkt zijn.',
    'x_web_visitor',
    FALSE,
    4
  )
ON CONFLICT (id) DO NOTHING;

-- visitor_identificatie velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('visitor_identificatie', 'x_name',              'Omschrijving',  'Automatisch gegenereerde naam van de bezoeker.',                          1),
  ('visitor_identificatie', 'x_studio_uuid',        'UUID',          'Unieke identifier gegenereerd door de website voor deze bezoeker.',        2),
  ('visitor_identificatie', 'x_studio_ref_uuid',    'Ref UUID',      'UUID van dezelfde bezoeker op de andere site (cross-site koppeling).',     3),
  ('visitor_identificatie', 'x_studio_source_site', 'Website',       'De site waarop de bezoeker actief was (bv. openvme.be of mymmo.be).',      4),
  ('visitor_identificatie', 'x_studio_email',       'E-mailadres',   'E-mailadres van de bezoeker indien gekend (bv. via formulier).',           5),
  ('visitor_identificatie', 'x_active',             'Actief',        'Of het bezoekersrecord actief is.',                                        6)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- visitor_timing velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('visitor_timing', 'x_studio_first_seen',      'Eerste bezoek',       'Datum en tijdstip van het allereerste bezoek van deze bezoeker.',          1),
  ('visitor_timing', 'x_studio_last_seen',       'Laatste bezoek',      'Datum en tijdstip van het meest recente bezoek.',                          2),
  ('visitor_timing', 'x_studio_session_duration','Sessieduur',           'Totale of gemiddelde sessieduur van de bezoeker.',                         3),
  ('visitor_timing', 'x_studio_instant_bounce',  'Instant bounce',       'Of de bezoeker meteen vertrok zonder interactie (< enkele seconden).',     4),
  ('visitor_timing', 'x_studio_possible_bounce', 'Mogelijk bounce',      'Of de bezoeker waarschijnlijk geen echte interesse toonde.',               5)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- visitor_attributie velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('visitor_attributie', 'x_studio_utm_source',   'UTM Bron',     'Herkomstbron van het bezoek (bv. google, meta, newsletter).',              1),
  ('visitor_attributie', 'x_studio_utm_medium',   'UTM Medium',   'Marketingmedium (bv. cpc, organic, email, social).',                       2),
  ('visitor_attributie', 'x_studio_utm_campaign', 'UTM Campagne', 'Naam van de marketingcampagne waaruit het bezoek afkomstig is.',            3)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- visitor_leads velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('visitor_leads', 'x_studio_lead_ids', 'Gekoppelde leads', 'Many2many relatie naar crm.lead. Toont welke CRM leads aan deze bezoeker gelinkt zijn.', 1)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- ============================================================================
-- 3. Field groups voor x_ad_touchpoint
-- ============================================================================

INSERT INTO information_sets (id, label, description, model, is_submodel_only, sort_order)
VALUES
  (
    'touchpoint_campagne',
    'Campagne & Advertentie',
    'Campagne-, advertentiegroep- en advertentiedetails van de klik. Bevat IDs en namen voor '
    'rapportage en attributie.',
    'x_ad_touchpoint',
    FALSE,
    1
  ),
  (
    'touchpoint_targeting',
    'Targeting & Context',
    'Targetingdetails: apparaat, zoekwoord, matchtype en doelgroep van de advertentie.',
    'x_ad_touchpoint',
    FALSE,
    2
  ),
  (
    'touchpoint_attributie',
    'Attributie & Bron',
    'Bron, medium, landingspagina en tijdstip van de touchpoint. Geeft inzicht in het kanaal en '
    'het moment van de klik.',
    'x_ad_touchpoint',
    FALSE,
    3
  )
ON CONFLICT (id) DO NOTHING;

-- touchpoint_campagne velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('touchpoint_campagne', 'x_name',                  'Naam',               'Automatisch gegenereerde naam van de touchpoint.',                     1),
  ('touchpoint_campagne', 'x_studio_campaign_id',    'Campagne ID',         'Technisch ID van de campagne op het advertentieplatform.',             2),
  ('touchpoint_campagne', 'x_studio_campaign_name',  'Campagnenaam',        'Leesbare naam van de campagne.',                                       3),
  ('touchpoint_campagne', 'x_studio_adgroup_id',     'Advertentiegroep ID', 'Technisch ID van de advertentiegroep.',                                4),
  ('touchpoint_campagne', 'x_studio_adgroup_name',   'Advertentiegroep',    'Naam van de advertentiegroep binnen de campagne.',                     5),
  ('touchpoint_campagne', 'x_studio_ad_id',          'Advertentie ID',      'Technisch ID van de specifieke advertentie die geklikt werd.',         6),
  ('touchpoint_campagne', 'x_studio_ad_name',        'Advertentienaam',     'Naam of omschrijving van de advertentie.',                             7)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- touchpoint_targeting velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('touchpoint_targeting', 'x_studio_device',    'Apparaat',    'Apparaattype waarop de advertentie geklikt werd (desktop, mobile, tablet).', 1),
  ('touchpoint_targeting', 'x_studio_keyword',   'Zoekwoord',   'Zoekwoord dat de advertentie triggerde (bij search campagnes).',              2),
  ('touchpoint_targeting', 'x_studio_matchtype', 'Matchtype',   'Matchtype van het zoekwoord (exact, phrase, broad).',                         3),
  ('touchpoint_targeting', 'x_studio_audience',  'Doelgroep',   'Doelgroepsegment waarop de advertentie getarget was.',                        4)
ON CONFLICT (set_id, field_key) DO NOTHING;

-- touchpoint_attributie velden
INSERT INTO information_set_fields (set_id, field_key, label, description, sort_order)
VALUES
  ('touchpoint_attributie', 'x_studio_source',       'Bron',            'Platform of kanaal van de touchpoint (bv. google, meta).',                    1),
  ('touchpoint_attributie', 'x_studio_medium',       'Medium',          'Marketingmedium van de touchpoint (bv. cpc, paid_social).',                   2),
  ('touchpoint_attributie', 'x_studio_landing_page', 'Landingspagina',  'URL van de pagina waarop de bezoeker terechtkwam na de klik.',                3),
  ('touchpoint_attributie', 'x_studio_timestamp',    'Tijdstip',        'Exacte datum en tijdstip van de advertentieklik.',                             4)
ON CONFLICT (set_id, field_key) DO NOTHING;