-- ============================================================================
-- AI Export Presets + Model Descriptions
-- ============================================================================
-- ai_export_presets  — instructies voor de AI die meekomen in de JSON export
-- models             — Odoo modellen met AI-leesbare beschrijving als context
--
-- De model descriptions worden altijd meegestuurd in de JSON export zodat
-- de AI begrijpt wat de data betekent, ongeacht de gekozen preset.
-- ============================================================================

-- ============================================================================
-- 1. ai_export_presets
-- ============================================================================

CREATE TABLE ai_export_presets (
  id           BIGSERIAL PRIMARY KEY,
  label        TEXT NOT NULL,          -- getoond in de UI dropdown
  description  TEXT,                   -- toelichting voor de gebruiker
  instruction  TEXT NOT NULL,          -- de eigenlijke prompt/instructie voor de AI
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE ai_export_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_export_presets_select"
  ON ai_export_presets FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_export_presets_insert"
  ON ai_export_presets FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- 2. models
-- ============================================================================

CREATE TABLE models (
  id               TEXT PRIMARY KEY,      -- slug, bv. 'x_sales_action_sheet'
  odoo_model       TEXT NOT NULL UNIQUE,  -- Odoo technische naam
  label            TEXT NOT NULL,         -- leesbare naam in de UI
  description      TEXT,                  -- AI-context: wat is dit model?
  can_be_startpoint BOOLEAN NOT NULL DEFAULT TRUE,
  can_be_submodel   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "models_select"
  ON models FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 3. Seed — ai_export_presets
-- ============================================================================

INSERT INTO ai_export_presets (label, description, instruction, sort_order) VALUES
  (
    'Geen preset',
    'Geen specifieke instructie — de data wordt zonder extra context geëxporteerd.',
    '',
    0
  ),
  (
    'Analyseer',
    'Vraag de AI om patronen, uitschieters en inzichten te identificeren.',
    'Analyseer deze dataset grondig. Identificeer patronen, uitschieters en opvallende inzichten. Geef een gestructureerd overzicht met de belangrijkste bevindingen, ondersteund door concrete cijfers uit de data.',
    1
  ),
  (
    'Segmenteer',
    'Vraag de AI om de records te groeperen in betekenisvolle segmenten.',
    'Segmenteer de records in deze dataset op basis van de beschikbare velden. Beschrijf elk segment helder: wat kenmerkt het, hoeveel records vallen erin, en wat zijn de implicaties voor de aanpak?',
    2
  ),
  (
    'Dashboard',
    'Vraag de AI om de belangrijkste KPIs en metrics samen te vatten.',
    'Genereer een overzichtelijk dashboard op basis van deze dataset. Bereken en presenteer de belangrijkste KPIs en metrics. Gebruik een duidelijke structuur met secties per thema.',
    3
  ),
  (
    'Kwalificeer en rangschik',
    'Vraag de AI om leads te beoordelen op kans op conversie.',
    'Beoordeel en rangschik de records in deze dataset op basis van hun kans op conversie of prioriteit. Geef per record een score of categorie (hoog / medium / laag) en onderbouw de redenering met de beschikbare data.',
    4
  ),
  (
    'Aanbevelingen',
    'Vraag de AI om concrete actiepunten per record te formuleren.',
    'Formuleer op basis van de beschikbare data concrete en gepersonaliseerde actiepunten voor elk record. Wees specifiek: welke stap moet wanneer gezet worden en waarom?',
    5
  ),
  (
    'Samenvatting per record',
    'Vraag de AI om elke record samen te vatten in begrijpelijke taal.',
    'Schrijf voor elk record een beknopte, begrijpelijke samenvatting in menselijke taal. Vermijd technisch jargon. De samenvatting moet bruikbaar zijn als context voor een verkoopsgesprek of intake.',
    6
  ),
  (
    'Vergelijk en benchmark',
    'Vraag de AI om records onderling te vergelijken.',
    'Vergelijk de records in deze dataset onderling. Identificeer wie boven of onder het gemiddelde scoort op de belangrijkste velden en wat dat betekent in de context van het salesproces.',
    7
  );

-- ============================================================================
-- 4. Seed — models
-- ============================================================================

INSERT INTO models (id, odoo_model, label, description, can_be_startpoint, can_be_submodel, sort_order) VALUES
  (
    'x_sales_action_sheet',
    'x_sales_action_sheet',
    'Actiebladen',
    'Een actieblad (x_sales_action_sheet) is een gedetailleerd intakeformulier dat ingevuld wordt tijdens of na een eerste gesprek met een prospekt. Het bevat open vragen over de huidige situatie, verwachtingen en context van de VME (Vereniging van Mede-eigenaars). Elk actieblad is gelinkt aan één of meerdere CRM leads. De velden zijn ingevuld door een salesmedewerker van OpenVME op basis van een gesprek met de prospekt.',
    TRUE,
    FALSE,
    1
  ),
  (
    'crm_lead',
    'crm.lead',
    'Leads',
    'Een lead (crm.lead) vertegenwoordigt een verkoopskans in het CRM systeem van OpenVME. Een lead doorloopt verschillende stages van eerste contact tot gewonnen of verloren deal. Leads bevatten commerciële informatie zoals prioriteit, verwachte omzet en kans op afsluiting, maar ook herkomst- en marketingdata. Aan een lead kunnen meerdere actiebladen en websitebezoekers gekoppeld zijn.',
    TRUE,
    TRUE,
    2
  );