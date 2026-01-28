# Iteration 8 - Domain-Aware Sales Insight Builder (Design)

**Date:** January 21, 2026  
**Status:** 📐 Design Phase - Conceptual Architecture  
**Builds On:** Iterations 1-7 (Complete Technical Foundation)

---

## 🎯 Context & Correctie

### Wat al bestaat (Iterations 1-7)

Een **productie-klare, schema-driven query engine** met:
- Schema introspection en caching
- Query validation en execution (3 paths)
- Relation traversal mechanisme
- Query persistence en export
- Visual query builder UI

### Wat er mis is met de huidige implementatie

De huidige UI is een **generieke BI query builder**:
- Gebruiker kiest "base model" uit dropdown
- Gebruiker selecteert velden uit schema
- Gebruiker bouwt filters en aggregaties
- **Resultaat:** Technisch correct, maar semantisch verloren

**Probleem:** Een verkoopmanager wil geen "model crm.lead kiezen met veld partner_id.category_id".  
Hij wil weten: **"Welke pijnpunten komen het vaakst voor bij kleine VME's?"**

### De fundamentele correctie

**x_sales_action_sheet is NIET één van de keuzes. Het IS de keuze.**

Dit systeem analyseert **altijd en uitsluitend actiebladen**.  
Alle andere modellen (gebouwen, pain points, meetings, leads, stages) zijn **context rond die actiebladen**.

---

## 1. VAST ANKER: ACTIEBLAD ALS STARTPUNT

### Waarom x_sales_action_sheet het enige geldige startpunt is

**Semantische reden:**
Een actieblad is het primaire sales-artefact. Het representeert:
- Een salesintentie (waarom zijn we hier?)
- Een salescontext (gebouw, contact, situatie)
- Een salesproces (meetings, pijnpunten, uitkomst)
- Een salesresultaat (gewonnen, verloren, reden)

Andere modellen zijn **administratief** of **contextueel**:
- `res.partner` is een contactdatabase-record, geen salesmoment
- `x_building` is een gebouwdossier, geen salesactie
- `crm.lead` is een CRM-administratie-entry
- `x_pain_point` is een observatie binnen een salesproces

**Technische reden:**
x_sales_action_sheet is de **enige hub** die alle salescontext samenbrengt:
```
x_sales_action_sheet (HUB)
├── building_id → x_building (context)
├── contact_person_id → res.partner (context)
├── pain_point_ids → x_pain_point (proces-observatie)
├── meeting_ids → x_meeting_action_sheet (proces-activiteit)
├── lead_id → crm.lead (administratieve koppeling)
├── stage_id → x_sales_stage (processtatus)
└── owner_id → res.users (verantwoordelijkheid)
```

Elk ander startpunt mist deze centrale verbinding.

### Hoe dit het systeem eenvoudiger én krachtiger maakt

**Eenvoudiger:**
- Geen "Kies een model" dropdown
- Geen uitleg over relaties
- Geen "verkeerde base model" fouten
- Elke vraag begint bij: "Over welke actiebladen wil je iets weten?"

**Krachtiger:**
- Automatische access tot alle salescontext
- Betekenisvolle default filters (actieve bladen, dit jaar, mijn team)
- Gegarandeerd valide relaties (alles loopt via action_sheet)
- Semantisch correcte aggregaties (count actiebladen, niet count gebouwen)

### Welke fouten dit voorkomt t.o.v. generieke BI-tools

**BI-tool denken:**
- "Toon alle gebouwen gegroepeerd per type"
  - **Vraag:** Waar zijn de actiebladen? Wat is het salesinzicht?
  
**Sales Insight denken:**
- "Toon actiebladen gegroepeerd per gebouwtype"
  - **Helder:** Hoeveel salesacties per type? Waar focussen we op?

**BI-fouten die nu onmogelijk zijn:**

1. **Verkeerde aggregaties**
   - BI: "Count aantal gebouwen per verkopers"  
   - Insight: "Count actiebladen per verkoper" (hoeveel deals behandelt hij?)

2. **Betekenisloze joins**
   - BI: "Toon alle pain points met hun buildings"  
   - Insight: "Toon actiebladen met hun pain points" (welke deals hadden welke obstakels?)

3. **Administratieve vragen ipv salesvragen**
   - BI: "Hoeveel contacten hebben we?"  
   - Insight: "Hoeveel actiebladen hebben we dit kwartaal?" (wat is onze sales-activiteit?)

**Kernprincipe:**  
Als je het antwoord weet zonder naar actiebladen te kijken, stel je de verkeerde vraag.

---

## 2. SEMANTISCHE KEUZELAGEN (HET HART VAN DE BUILDER)

### De drie beslislagen

De gebruiker ziet **geen velden, modellen of relaties**.  
Hij ziet **betekenisvolle keuzes** die automatisch vertaald worden naar correcte queries.

---

### Laag 1: "Wat wil je weten?" (Informatie-object)

**De vraag die de gebruiker ziet:**
> "Welk aspect van de salesacties wil je analyseren?"

**De keuzes:**

1. **"Pijnpunten & Obstakels"**
   - Label: "Welke pijnpunten komen het vaakst voor?"
   - Technisch: `relation: pain_point_ids`, fields: `[x_pain_point.name]`, aggregation: `count`
   - Default: Group by pijnpunt, order by count desc

2. **"Meetings & Interacties"**
   - Label: "Hoeveel meetings zijn er per actieblad?"
   - Technisch: `relation: meeting_ids`, aggregation: `count`
   - Default: Group by action_sheet, sum meetings

3. **"Gebouwkenmerken"**
   - Label: "Wat voor type gebouwen behandelen we?"
   - Technisch: `relation: building_id`, fields: `[x_building.building_type, x_building.total_floor_area]`
   - Default: Group by building_type

4. **"Salesuitkomst"**
   - Label: "Hoeveel deals worden gewonnen vs verloren?"
   - Technisch: fields: `[stage_id.name, x_won_reason, x_lost_reason]`
   - Default: Group by stage

5. **"Procesverloop"**
   - Label: "Hoe lang duurt het salesproces?"
   - Technisch: fields: `[create_date, x_converted_date]`, computed: duration
   - Default: Average duration, group by stage

6. **"Basisinformatie"**
   - Label: "Toon actiebladen met hun kerngegevens"
   - Technisch: fields: `[name, building_id.name, contact_person_id.name, stage_id.name]`
   - Default: Geen aggregatie, simpele lijst

**Technische vertaling:**

```javascript
const informationLayers = {
  'pain_points': {
    relation: { path: [{ relation_field: 'pain_point_ids', target_model: 'x_pain_point' }] },
    defaultFields: ['x_pain_point.name', 'x_pain_point.x_pain_category'],
    defaultAggregation: 'count',
    defaultGroupBy: 'x_pain_point.name'
  },
  'meetings': {
    relation: { path: [{ relation_field: 'meeting_ids', target_model: 'x_meeting_action_sheet' }] },
    defaultFields: ['x_meeting_action_sheet.x_date', 'x_meeting_action_sheet.x_meeting_type'],
    defaultAggregation: 'count',
    defaultGroupBy: 'action_sheet.name'
  },
  'building_characteristics': {
    relation: { path: [{ relation_field: 'building_id', target_model: 'x_building' }] },
    defaultFields: ['x_building.building_type', 'x_building.total_floor_area'],
    defaultGroupBy: 'x_building.building_type'
  },
  // etc.
};
```

**Invalid combinaties voorkomen:**
- "Meetings" + "Pijnpunten" samen → UI waarschuwing: "Kies één focus of gebruik advanced mode"
- Aggregatie zonder group by → Automatisch group by action_sheet

---

### Laag 2: "In welke context?" (Filtering & Scope)

**De vraag die de gebruiker ziet:**
> "Over welke actiebladen wil je dit weten?"

**De keuzes:**

1. **"Type gebouw"**
   - Label: "Alleen kleine/grote VME's / Residentieel / Commercieel"
   - Technisch: filter op `building_id.building_type`, `building_id.total_floor_area`
   - UI: Checkboxes met labels, geen veldnamen

2. **"Fase in het proces"**
   - Label: "Alleen actieve / gewonnen / verloren actiebladen"
   - Technisch: filter op `stage_id.x_stage_type` (in_progress, won, lost)
   - UI: Status badges (groen/rood/geel)

3. **"Tijdsperiode"**
   - Label: "Dit jaar / Dit kwartaal / Laatste 30 dagen / Custom range"
   - Technisch: filter op `create_date` met time_scope
   - UI: Datum shortcuts, niet Odoo domain syntax

4. **"Verantwoordelijke"**
   - Label: "Mijn actiebladen / Mijn team / Specifieke verkoper"
   - Technisch: filter op `owner_id`
   - UI: User picker met "Mij" als default

5. **"Met/zonder conversie"**
   - Label: "Alleen geconverteerd naar lead / Zonder lead"
   - Technisch: filter op `lead_id` (exists / not exists)
   - UI: Toggle switch

**Technische vertaling:**

```javascript
const contextFilters = {
  'building_size': {
    label: 'Gebouwgrootte',
    options: [
      { label: 'Kleine VME (< 1000m²)', filter: { field: 'building_id.total_floor_area', operator: '<', value: 1000 } },
      { label: 'Middelgrote VME (1000-5000m²)', filter: { field: 'building_id.total_floor_area', operator: 'between', value: [1000, 5000] } },
      { label: 'Grote VME (> 5000m²)', filter: { field: 'building_id.total_floor_area', operator: '>', value: 5000 } }
    ]
  },
  'stage_type': {
    label: 'Status',
    options: [
      { label: 'Actief (in behandeling)', filter: { field: 'stage_id.x_stage_type', operator: '=', value: 'in_progress' } },
      { label: 'Gewonnen', filter: { field: 'stage_id.x_stage_type', operator: '=', value: 'won' } },
      { label: 'Verloren', filter: { field: 'stage_id.x_stage_type', operator: '=', value: 'lost' } }
    ]
  },
  'time_period': {
    label: 'Periode',
    options: [
      { label: 'Dit jaar', time_scope: { period: 'this_year' } },
      { label: 'Dit kwartaal', time_scope: { period: 'this_quarter' } },
      { label: 'Laatste 30 dagen', time_scope: { period: 'last_30_days' } },
      { label: 'Custom...', time_scope: { period: 'custom' } } // Opens date picker
    ]
  }
};
```

**Invalid combinaties voorkomen:**
- Multiple "Periode" filters → UI toont radio buttons (exclusief), niet checkboxes
- "Gewonnen" + "Verloren" samen → Logische OR in backend, niet AND
- Lege resultset verwacht → UI waarschuwing: "Deze combinatie levert mogelijk geen data op"

---

### Laag 3: "Hoe wil je het zien?" (Aggregatie & Presentatie)

**De vraag die de gebruiker ziet:**
> "Hoe wil je deze informatie samenvatten?"

**De keuzes:**

1. **"Groeperen"**
   - Label: "Groepeer per [keuze uit Laag 1/2]"
   - Technisch: group_by op geselecteerd veld
   - UI: Dropdown met beschikbare groeperingen
   - Voorbeeld: "Per gebouwtype", "Per verkoper", "Per maand"

2. **"Vergelijken"**
   - Label: "Vergelijk [A] met [B]"
   - Technisch: Twee queries met filter verschil, side-by-side resultaten
   - UI: Split view selector
   - Voorbeeld: "Voor vs na conversie", "Team A vs Team B", "Q1 vs Q2"

3. **"Trend"**
   - Label: "Toon evolutie over tijd"
   - Technisch: group_by op datum veld (per maand/week/kwartaal)
   - UI: Tijdsinterval selector
   - Voorbeeld: "Aantal actiebladen per maand", "Gemiddelde deal size per kwartaal"

4. **"Top/Bottom"**
   - Label: "Top 10 meest voorkomende / Top 5 grootste"
   - Technisch: order_by + limit
   - UI: Number picker + sort direction
   - Voorbeeld: "Top 3 pijnpunten", "Grootste 5 gebouwen"

5. **"Samenvatten"**
   - Label: "Totaal / Gemiddelde / Minimum / Maximum"
   - Technisch: aggregatie zonder group_by
   - UI: Aggregatie function picker
   - Voorbeeld: "Totaal aantal actiebladen", "Gemiddelde deal waarde"

**Technische vertaling:**

```javascript
const presentationModes = {
  'group_by': {
    label: 'Groeperen per',
    availableFields: (selectedLayer) => {
      // Bepaal geldige groepering velden o.b.v. Laag 1
      if (selectedLayer === 'pain_points') {
        return [
          { label: 'Per pijnpunt', field: 'x_pain_point.name' },
          { label: 'Per categorie', field: 'x_pain_point.x_pain_category' },
          { label: 'Per actieblad', field: 'name' }
        ];
      }
      // etc.
    }
  },
  'compare': {
    label: 'Vergelijk',
    comparisons: [
      { 
        label: 'Voor vs na conversie',
        splitOn: { field: 'lead_id', operator: 'exists' },
        labels: ['Zonder lead', 'Met lead']
      },
      {
        label: 'Gewonnen vs verloren',
        splitOn: { field: 'stage_id.x_stage_type' },
        values: ['won', 'lost'],
        labels: ['Gewonnen', 'Verloren']
      }
    ]
  },
  'trend': {
    label: 'Trend over tijd',
    intervals: [
      { label: 'Per maand', group_by: 'create_date:month' },
      { label: 'Per kwartaal', group_by: 'create_date:quarter' },
      { label: 'Per week', group_by: 'create_date:week' }
    ]
  }
};
```

**Invalid combinaties voorkomen:**
- "Trend" zonder datum veld in Laag 1 → UI disabled, tooltip: "Selecteer eerst een datum-veld"
- "Groeperen" + "Samenvatten" zonder aggregatie → Automatisch count toevoegen
- "Top 10" op tekst veld zonder aggregatie → UI disabled, tooltip: "Kan alleen op numerieke velden"

---

### Beslislogica overzicht

```
┌─────────────────────────────────────────────────┐
│ ALTIJD: base_model = x_sales_action_sheet      │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ LAAG 1: Wat wil je weten?                       │
│ → Bepaalt relations + default fields           │
│ → Pijnpunten / Meetings / Gebouw / etc.        │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ LAAG 2: In welke context?                       │
│ → Bepaalt filters                               │
│ → Type / Fase / Periode / Verkoper             │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ LAAG 3: Hoe wil je het zien?                    │
│ → Bepaalt aggregations + group_by              │
│ → Groeperen / Vergelijken / Trend              │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ AUTOMATISCH: Validatie & Optimalisatie         │
│ → Check schema compliance                      │
│ → Kies execution path (read_group/multi_pass)  │
│ → Return validated query definition            │
└─────────────────────────────────────────────────┘
```

---

## 3. UX-FLOW: VAN VRAAG NAAR QUERY (ZONDER BI-TAAL)

### Voorbeeld 1: "Toon me de meest voorkomende pijnpunten bij kleine VME's"

**Stap 1: Wat wil je weten?**

UI toont:
```
┌─────────────────────────────────────────────┐
│ Welk aspect wil je analyseren?              │
│                                              │
│ ○ Pijnpunten & Obstakels                    │
│ ○ Meetings & Interacties                    │
│ ○ Gebouwkenmerken                            │
│ ○ Salesuitkomst                              │
│ ○ Procesverloop                              │
│ ○ Basisinformatie                            │
└─────────────────────────────────────────────┘
```

Gebruiker selecteert: **"Pijnpunten & Obstakels"**

Systeem doet achter de schermen:
```javascript
query.relations = [{
  path: [{ 
    relation_field: 'pain_point_ids', 
    target_model: 'x_pain_point' 
  }],
  fields: ['name', 'x_pain_category']
}];
query.aggregations = [{
  field: 'pain_point_ids',
  function: 'count'
}];
```

---

**Stap 2: In welke context?**

UI toont (nu contextually relevant):
```
┌─────────────────────────────────────────────┐
│ Over welke actiebladen?                     │
│                                              │
│ Gebouwgrootte:                               │
│ ☑ Kleine VME (< 1000m²)                     │
│ ☐ Middelgrote VME (1000-5000m²)             │
│ ☐ Grote VME (> 5000m²)                      │
│                                              │
│ Periode:                                     │
│ ● Dit jaar  ○ Dit kwartaal  ○ Custom       │
│                                              │
│ Status:                                      │
│ ○ Alle  ○ Actief  ○ Gewonnen  ○ Verloren  │
└─────────────────────────────────────────────┘
```

Gebruiker selecteert: **"Kleine VME + Dit jaar + Alle statussen"**

Systeem doet:
```javascript
query.filters = [
  {
    field: 'building_id.total_floor_area',
    operator: '<',
    value: 1000
  }
];
query.time_scope = {
  period: 'this_year'
};
```

---

**Stap 3: Hoe wil je het zien?**

UI toont:
```
┌─────────────────────────────────────────────┐
│ Hoe wil je dit samenvatten?                 │
│                                              │
│ ● Groeperen per pijnpunt (meest voorkomend) │
│ ○ Groeperen per categorie                   │
│ ○ Groeperen per actieblad                   │
│ ○ Trend over tijd                            │
│ ○ Top 10                                     │
└─────────────────────────────────────────────┘
```

Gebruiker selecteert: **"Groeperen per pijnpunt (meest voorkomend)"**

Systeem doet:
```javascript
query.aggregations[0].group_by = 'x_pain_point.name';
query.aggregations[0].order_by = 'count';
query.aggregations[0].order_direction = 'desc';
```

---

**Stap 4: Preview & Execute**

UI toont **geen JSON query**, maar:
```
┌─────────────────────────────────────────────┐
│ Je vraag:                                    │
│                                              │
│ "Toon de meest voorkomende pijnpunten       │
│  bij kleine VME's dit jaar"                 │
│                                              │
│ Verwachte resultaten: ~45 actiebladen       │
│ Unieke pijnpunten: ~12                       │
│                                              │
│ [Preview (10 rows)] [Uitvoeren (alle data)] │
└─────────────────────────────────────────────┘
```

Na uitvoering:
```
┌─────────────────────────────────────────────┐
│ Resultaten (47 actiebladen, 14 pijnpunten)  │
│                                              │
│ Pijnpunt                        │ Aantal     │
│─────────────────────────────────┼───────────│
│ Hoge energiekosten              │ 23        │
│ Verouderde verwarming           │ 18        │
│ Isolatieproblemen               │ 15        │
│ Budget onzekerheid              │ 12        │
│ Administratieve complexiteit    │ 9         │
│ ...                             │ ...       │
│                                              │
│ [Export CSV] [Opslaan] [Nieuwe vraag]       │
└─────────────────────────────────────────────┘
```

**Wat de gebruiker NIET ziet:**
- Model namen (x_sales_action_sheet, x_pain_point, x_building)
- Veldnamen (pain_point_ids, building_id.total_floor_area)
- Relation paths
- Aggregation functions (count, group_by)
- JSON query definition

**Wat de gebruiker WEL ziet:**
- Natuurlijke taal beschrijving van zijn vraag
- Verwachte resultaat scope (aantal actiebladen)
- Heldere resultaat tabel met betekenisvolle labels
- Acties die logisch zijn (export, opslaan, nieuwe vraag)

---

### Voorbeeld 2: "Vergelijk meetings vóór en na conversie"

**Stap 1: Wat wil je weten?**

Gebruiker selecteert: **"Meetings & Interacties"**

Systeem voegt automatisch toe:
```javascript
query.relations = [{
  path: [{ 
    relation_field: 'meeting_ids', 
    target_model: 'x_meeting_action_sheet' 
  }],
  fields: ['x_date', 'x_meeting_type']
}];
```

---

**Stap 2: In welke context?**

UI toont:
```
┌─────────────────────────────────────────────┐
│ Over welke actiebladen?                     │
│                                              │
│ Conversie status:                            │
│ ○ Alle                                       │
│ ○ Alleen met lead (geconverteerd)           │
│ ○ Alleen zonder lead                         │
│ ● Beide (voor vergelijking)                 │
└─────────────────────────────────────────────┘
```

Gebruiker selecteert: **"Beide (voor vergelijking)"**

Systeem weet: dit triggert comparison mode in Laag 3

---

**Stap 3: Hoe wil je het zien?**

UI toont (comparison mode actief):
```
┌─────────────────────────────────────────────┐
│ Hoe wil je dit vergelijken?                 │
│                                              │
│ ● Aantal meetings: voor vs na conversie     │
│ ○ Type meetings: voor vs na conversie       │
│ ○ Gemiddelde meetings per actieblad         │
└─────────────────────────────────────────────┘
```

Gebruiker selecteert: **"Aantal meetings: voor vs na conversie"**

Systeem doet:
```javascript
// Comparison query: 2 subqueries
queryA = {
  ...baseQuery,
  filters: [{ field: 'lead_id', operator: 'exists' }],
  aggregations: [{ field: 'meeting_ids', function: 'count' }]
};
queryB = {
  ...baseQuery,
  filters: [{ field: 'lead_id', operator: 'not_exists' }],
  aggregations: [{ field: 'meeting_ids', function: 'count' }]
};
```

---

**Resultaat:**

UI toont side-by-side comparison:
```
┌───────────────────────────────────────────────────────────┐
│ Vergelijking: Meetings voor vs na conversie              │
│                                                           │
│ ┌─────────────────────┬─────────────────────┐            │
│ │ Zonder lead         │ Met lead            │            │
│ ├─────────────────────┼─────────────────────┤            │
│ │ 34 actiebladen      │ 28 actiebladen      │            │
│ │ 89 meetings         │ 147 meetings        │            │
│ │ Ø 2.6 per blad      │ Ø 5.3 per blad      │            │
│ │                     │                     │            │
│ │ → Minder intensief  │ → Meer intensief    │            │
│ │ → Minder effort     │ → Meer touchpoints  │            │
│ └─────────────────────┴─────────────────────┘            │
│                                                           │
│ Conclusie: Geconverteerde leads vereisen 2x meer         │
│            meetings (statistisch significant)            │
│                                                           │
│ [Details] [Export] [Opslaan]                             │
└───────────────────────────────────────────────────────────┘
```

**Wat het systeem automatisch doet:**
- Berekent gemiddelde (Ø)
- Detecteert statistisch verschil (2x)
- Genereert conclusie zinnen
- Toont contextuele insights ("meer touchpoints")

**Wat de gebruiker NIET hoeft te doen:**
- Twee aparte queries schrijven
- Lead exists filter begrijpen
- Aggregation function kiezen
- Resultaten handmatig vergelijken

---

### Voorbeeld 3: "Toon evolutie van aantal actiebladen per kwartaal"

**Stap 1: Wat wil je weten?**

Gebruiker selecteert: **"Basisinformatie"** (geen specifieke relatie)

---

**Stap 2: In welke context?**

Gebruiker selecteert:
```
Periode: Dit jaar + Vorig jaar (voor trend vergelijking)
Status: Alle
```

---

**Stap 3: Hoe wil je het zien?**

UI toont:
```
┌─────────────────────────────────────────────┐
│ Hoe wil je dit samenvatten?                 │
│                                              │
│ ● Trend over tijd                            │
│   Interval: ● Per kwartaal  ○ Per maand    │
│             ○ Per week                       │
│                                              │
│ Wat tellen:                                  │
│ ● Aantal actiebladen                         │
│ ○ Aantal meetings                            │
│ ○ Aantal pijnpunten                          │
└─────────────────────────────────────────────┘
```

Gebruiker selecteert: **"Trend per kwartaal, aantal actiebladen"**

Systeem doet:
```javascript
query.aggregations = [{
  field: 'id',
  function: 'count',
  group_by: 'create_date:quarter'
}];
query.time_scope = {
  period: 'custom',
  from: '2025-01-01',
  to: '2026-12-31'
};
```

---

**Resultaat:**

UI toont trend visualisatie:
```
┌───────────────────────────────────────────────────────────┐
│ Trend: Aantal actiebladen per kwartaal                   │
│                                                           │
│   Aantal                                                  │
│   120 │                                    ●              │
│   100 │                         ●                         │
│    80 │              ●                                    │
│    60 │    ●                                              │
│    40 │                                                   │
│    20 │                                                   │
│     0 └─────┬────────┬────────┬────────┬────────┬────    │
│           Q1'25   Q2'25   Q3'25   Q4'25   Q1'26         │
│                                                           │
│ Groei: +95% year-over-year (Q1'25 → Q1'26)               │
│ Hoogste: Q1'26 (118 actiebladen)                         │
│ Trend: Stijgende lijn (+24% per kwartaal gemiddeld)      │
│                                                           │
│ [Download grafiek] [Export data] [Opslaan]               │
└───────────────────────────────────────────────────────────┘
```

**Wat het systeem automatisch doet:**
- Genereert trend grafiek (geen dashboard framework nodig)
- Berekent year-over-year groei
- Detecteert trend (stijgend/dalend)
- Toont key metrics (hoogste, gemiddelde groei)

---

### Actieve begeleiding door het systeem

**Tijdens selectie:**

1. **Disabled options met tooltip uitleg**
   ```
   Laag 3: "Top 10"
   [DISABLED] - Niet beschikbaar
   
   Tooltip: "Top 10 werkt alleen met numerieke velden.
            Selecteer eerst een veld zoals 'Gebouwgrootte'
            of 'Aantal meetings' in Laag 1."
   ```

2. **Suggesties op basis van keuzes**
   ```
   Gebruiker selecteert: "Pijnpunten"
   
   Systeem suggereert:
   💡 "Wil je dit groeperen per pijnpunt categorie?
       Dit geeft vaak meer inzicht dan individuele pijnpunten."
   
   [Ja, groepeer per categorie] [Nee, houd zoals is]
   ```

3. **Waarschuwingen bij kleine datasets**
   ```
   Gebruiker selecteert: "Grote VME's + Dit kwartaal + Gewonnen"
   
   Systeem waarschuwt:
   ⚠️  "Deze combinatie levert slechts ~3 actiebladen op.
       Overweeg de periode te vergroten of filters te versoepelen."
   
   [Aanpassen] [Toch doorgaan]
   ```

4. **Context-aware defaults**
   ```
   Eerste keer gebruiker:
   - Periode: "Dit jaar" (meest relevante scope)
   - Status: "Actief" (geen gesloten deals)
   - Verkoper: "Mijn actiebladen" (persoonlijke data)
   
   Ervaren gebruiker (detectie via usage patterns):
   - Periode: Laatste geselecteerde periode
   - Status: Laatste geselecteerde status
   - Verkoper: Laatst bekeken scope
   ```

---

## 4. AUTOMATISCHE RELATIEKENNIS & EVOLUTIE

### Hoe het systeem relaties automatisch legt en onderhoudt

**Het mapping layer principe:**

```javascript
// FRONT-END: Semantische definitie (stable, user-facing)
const semanticLayers = {
  'pain_points': {
    label: 'Pijnpunten & Obstakels',
    description: 'Welke pijnpunten komen het vaakst voor?',
    icon: 'alert-triangle',
    
    // MAPPING naar schema (kan wijzigen)
    schemaMapping: {
      modelName: 'x_sales_action_sheet',
      relationField: 'pain_point_ids',
      targetModel: 'x_pain_point',
      displayFields: ['name', 'x_pain_category']
    }
  }
};

// BACK-END: Schema introspection (dynamisch)
const currentSchema = await introspectSchema(env);

// VALIDATION: Check if mapping still valid
function validateSemanticLayer(layer, schema) {
  const baseModel = schema.models[layer.schemaMapping.modelName];
  if (!baseModel) {
    return { valid: false, reason: 'Base model not found in schema' };
  }
  
  const relationField = baseModel.fields[layer.schemaMapping.relationField];
  if (!relationField) {
    return { valid: false, reason: 'Relation field not found' };
  }
  
  if (relationField.relation !== layer.schemaMapping.targetModel) {
    return { valid: false, reason: 'Relation target mismatch' };
  }
  
  // All checks passed
  return { valid: true };
}
```

**Bij schema wijzigingen:**

```javascript
// Voorbeeld: x_pain_point wordt hernoemd naar x_obstacle
const schemaChange = {
  old: { modelName: 'x_pain_point' },
  new: { modelName: 'x_obstacle' }
};

// Automatische update van mapping
semanticLayers.pain_points.schemaMapping.targetModel = 'x_obstacle';

// UI blijft EXACT hetzelfde:
// "Pijnpunten & Obstakels" - gebruiker merkt niets
```

**Bij nieuwe velden:**

```javascript
// Schema introspection detecteert nieuw veld: x_pain_point.x_severity
const newField = {
  model: 'x_pain_point',
  field: 'x_severity',
  type: 'selection',
  selection: [
    { key: 'low', label: 'Laag' },
    { key: 'medium', label: 'Gemiddeld' },
    { key: 'high', label: 'Hoog' }
  ]
};

// Automatische enrichment van bestaande layer
semanticLayers.pain_points.schemaMapping.displayFields.push('x_severity');
semanticLayers.pain_points.filterOptions.push({
  label: 'Ernst van pijnpunt',
  field: 'x_pain_point.x_severity',
  type: 'selection',
  options: newField.selection
});

// UI toont nu automatisch nieuwe filter optie:
// "Ernst: ○ Laag  ○ Gemiddeld  ○ Hoog"
```

---

### Nieuwe velden oppikken zonder UX-breuk

**Scenario: Nieuw veld `x_sales_action_sheet.x_estimated_value` wordt toegevoegd**

**Dag 1: Schema update**
```javascript
// Nightly schema refresh detecteert nieuw veld
const schemaChanges = await detectSchemaChanges(oldSchema, newSchema);

// Detected changes:
{
  fields_added: [
    {
      model: 'x_sales_action_sheet',
      field: 'x_estimated_value',
      type: 'monetary',
      label: 'Geschatte waarde',
      readonly: false
    }
  ]
}
```

**Dag 2: Semantische layer update (automated)**
```javascript
// System detecteert monetary field → past layers aan
semanticLayers.sales_outcome.schemaMapping.displayFields.push('x_estimated_value');
semanticLayers.sales_outcome.aggregationOptions.push({
  label: 'Totale geschatte waarde',
  field: 'x_estimated_value',
  function: 'sum'
});
presentationModes.top_bottom.availableFields.push({
  label: 'Grootste deals (geschatte waarde)',
  field: 'x_estimated_value',
  order: 'desc'
});
```

**Dag 3: Gebruiker ziet nieuwe optie**
```
┌─────────────────────────────────────────────┐
│ Hoe wil je dit samenvatten?                 │
│                                              │
│ ○ Aantal actiebladen                         │
│ ○ Totaal aantal meetings                     │
│ ● Totale geschatte waarde              [NEW] │
│ ○ Gemiddelde procesd uur                     │
└─────────────────────────────────────────────┘
```

**Geen:**
- Code deployments
- UI rebuilds
- Breaking changes
- User retraining

**Wel:**
- Automatische detectie
- Semantische enrichment
- Graceful UI update
- Backward compatibility (oude queries blijven werken)

---

### Veilig omgaan met schema-wijzigingen

**Scenario 1: Veld wordt verwijderd**

```javascript
// x_pain_point.x_pain_category wordt verwijderd
const schemaChanges = {
  fields_removed: [
    { model: 'x_pain_point', field: 'x_pain_category' }
  ]
};

// System detecteert dit bij schema refresh
const brokenQueries = await findQueriesUsingField('x_pain_point.x_pain_category');

// Saved queries die dit veld gebruiken:
[
  { id: 'abc123', name: 'Pijnpunten per categorie', owner: 'user@example.com' },
  { id: 'def456', name: 'Trend analyse categorieën', owner: 'admin@example.com' }
]

// Automatische acties:
1. Mark queries als "NEEDS UPDATE"
2. Email naar query owners:
   "Je opgeslagen query 'Pijnpunten per categorie' gebruikt een veld
    dat niet meer beschikbaar is in Odoo. Klik hier om de query aan te passen."
3. UI toont warning bij laden query:
   "⚠️ Dit veld bestaat niet meer. Kies een alternatief veld."
4. Suggesties voor vervanging (o.b.v. veldtype):
   "Vervang 'x_pain_category' door:"
   - 'name' (tekst veld, beschikbaar)
   - 'create_date' (datum veld, beschikbaar)
```

**Scenario 2: Relatie wijzigt**

```javascript
// x_sales_action_sheet.pain_point_ids wijzigt naar x_sales_action_sheet.obstacle_ids
const schemaChanges = {
  fields_removed: [
    { model: 'x_sales_action_sheet', field: 'pain_point_ids' }
  ],
  fields_added: [
    { model: 'x_sales_action_sheet', field: 'obstacle_ids', relation: 'x_obstacle' }
  ]
};

// System detecteert semantic equivalent:
const migration = {
  from: { field: 'pain_point_ids', model: 'x_pain_point' },
  to: { field: 'obstacle_ids', model: 'x_obstacle' },
  confidence: 0.95, // High confidence (same relation type, similar name)
  reason: 'Model rename detected'
};

// Automatische migratie:
semanticLayers.pain_points.schemaMapping.relationField = 'obstacle_ids';
semanticLayers.pain_points.schemaMapping.targetModel = 'x_obstacle';

// UPDATE alle saved queries automatisch:
await migrateQueriesField({
  fromField: 'pain_point_ids',
  toField: 'obstacle_ids',
  affectedQueries: 24
});

// User notification:
"✅ Je opgeslagen queries zijn automatisch bijgewerkt naar het nieuwe datamodel.
    Geen actie vereist."
```

**Scenario 3: Nieuw model toegevoegd**

```javascript
// Odoo krijgt nieuw model: x_competitor_analysis
const schemaChanges = {
  models_added: ['x_competitor_analysis']
};

// System introspect relation naar action_sheet:
const newRelation = schema.models['x_sales_action_sheet'].fields['competitor_analysis_ids'];

// Automatisch nieuwe semantische layer:
semanticLayers.competitor_insights = {
  label: 'Concurrentie-analyse',
  description: 'Welke concurrenten komen we tegen?',
  icon: 'users',
  schemaMapping: {
    modelName: 'x_sales_action_sheet',
    relationField: 'competitor_analysis_ids',
    targetModel: 'x_competitor_analysis',
    displayFields: await detectKeyFields('x_competitor_analysis') // AI-based field detection
  },
  // Auto-generate defaults
  defaultAggregation: 'count',
  defaultGroupBy: await detectGroupableField('x_competitor_analysis')
};

// Admin notification:
"🆕 Nieuw model gedetecteerd: 'Concurrentie-analyse'
    Automatisch toegevoegd aan Sales Insight Builder.
    
    [Preview nieuwe layer] [Configureer custom labels] [Negeer]"
```

---

### Conceptuele garanties

**1. Semantische stabiliteit**
```
UI labels blijven constant, schema mag wijzigen
↓
"Pijnpunten & Obstakels" === "Pijnpunten & Obstakels"
(zelfs als x_pain_point → x_obstacle)
```

**2. Backward compatibility**
```
Oude queries blijven werken via migratie-layer
↓
Query van 3 maanden geleden → automatisch up-to-date schema
```

**3. Graceful degradation**
```
Als veld verdwijnt → warning + suggesties
↓
Niet: ERROR 500 "Field not found"
Maar: "Dit veld is vernieuwd. Kies een vervanger: [...]"
```

**4. Zero-downtime evolutie**
```
Schema update → geen deployment
↓
Nightly schema refresh → automatische UI enrichment
```

**5. Intelligent defaults**
```
Nieuw veld → automatisch juiste layer
↓
Monetary veld → voeg toe aan "Sales outcome"
Date veld → voeg toe aan "Trend" opties
Selection veld → voeg toe aan "Filters"
```

---

## 5. VERSCHIL MET GENERIEKE BI-TOOLS

### BI-tool aanpak (wat we NIET doen)

**Tableau / Power BI / Metabase:**

```
┌────────────────────────────────────────────┐
│ 1. Connect to database                     │
│    └─ Select schema: 'odoo_production'     │
│                                             │
│ 2. Choose table                             │
│    └─ Tables: [x_sales_action_sheet ▼]    │
│                                             │
│ 3. Join tables                              │
│    └─ Join x_building on building_id       │
│    └─ Join x_pain_point on pain_point_ids  │
│                                             │
│ 4. Select columns                           │
│    ☑ x_sales_action_sheet.name             │
│    ☑ x_building.building_type              │
│    ☑ x_pain_point.name                     │
│                                             │
│ 5. Apply filters                            │
│    └─ WHERE building.total_floor_area < 1000│
│                                             │
│ 6. Group and aggregate                      │
│    └─ GROUP BY pain_point.name             │
│    └─ COUNT(*)                              │
│                                             │
│ 7. Build visualization                      │
│    └─ Chart type: Bar chart                │
└────────────────────────────────────────────┘

RESULT: User must understand:
- Database schemas
- Table relationships
- SQL concepts (JOIN, GROUP BY)
- Field naming conventions
- Data types
```

**Probleem:**
- ❌ Vereist technische kennis
- ❌ Focus op data structuur, niet op business vraag
- ❌ Ongeldige queries mogelijk (cart-esian joins, wrong aggregations)
- ❌ Breaking changes bij schema wijzigingen
- ❌ Geen domein-intelligentie

---

### Sales Insight aanpak (wat we WEL doen)

**Domain-Aware Query Builder:**

```
┌────────────────────────────────────────────┐
│ Wat wil je weten over je salesacties?      │
│                                             │
│ ● Pijnpunten & Obstakels                   │
│   "Welke obstakels komen we het vaakst     │
│    tegen in ons salesproces?"              │
│                                             │
│ Bij welke actiebladen?                      │
│ ☑ Kleine VME's (< 1000m²)                  │
│                                             │
│ Hoe wil je dit zien?                        │
│ ● Top 10 meest voorkomende                 │
│                                             │
│ [Preview resultaten]                        │
└────────────────────────────────────────────┘

RESULT: User thinks in:
- Business questions
- Sales concepts (obstacles, building types)
- Natural language
- Desired insights (most common, trend, comparison)
```

**Voordelen:**
- ✅ Geen technische kennis vereist
- ✅ Focus op business vraag
- ✅ Alleen geldige queries mogelijk
- ✅ Automatische schema-aanpassing
- ✅ Domein-specifieke intelligentie

---

### Concrete voorbeelden van het verschil

**Vraag: "Toon pijnpunten bij kleine VME's"**

| Aspect | BI-tool (Tableau) | Sales Insight Builder |
|--------|-------------------|----------------------|
| **Startpunt** | "Select data source" | "Welk aspect wil je analyseren?" |
| **Keuze 1** | "Choose table: x_sales_action_sheet" | "Pijnpunten & Obstakels" |
| **Keuze 2** | "Add join: x_pain_point ON pain_point_ids" | *(automatisch)* |
| **Keuze 3** | "Add join: x_building ON building_id" | *(automatisch)* |
| **Keuze 4** | "Select columns: pain_point.name, building.type" | *(automatisch)* |
| **Keuze 5** | "WHERE building.total_floor_area < 1000" | "☑ Kleine VME's" |
| **Keuze 6** | "GROUP BY pain_point.name" | "Groeperen per pijnpunt" |
| **Keuze 7** | "SELECT COUNT(*) AS count" | *(automatisch)* |
| **Keuze 8** | "ORDER BY count DESC LIMIT 10" | "Top 10" |
| **Resultaat** | Raw query output | "23 actiebladen, 14 pijnpunten" |

**Aantal keuzes:**
- BI-tool: **8 technische stappen**
- Sales Insight: **3 business keuzes**

**Mogelijke fouten:**
- BI-tool: Verkeerde join, missing GROUP BY, wrong aggregation, cartesian product
- Sales Insight: **Geen** (alleen geldige keuzes beschikbaar)

---

### Waarom dit fundamenteel verschilt

**BI-tool filosofie:**
> "Geef de gebruiker toegang tot alle data en laat hem zelf queries bouwen"

**Problemen:**
- Flexibiliteit → Complexiteit
- Kracht → Verantwoordelijkheid
- Vrijheid → Fouten

**Sales Insight filosofie:**
> "Begrijp het domein en leid de gebruiker naar geldige vragen"

**Voordelen:**
- Begeleiding → Juistheid
- Context → Snelheid
- Domein-kennis → Relevantie

---

## 6. IMPLEMENTATIE-AANBEVELINGEN

### Wat moet gebouwd worden bovenop de bestaande engine

**1. Semantic Layer Definition (JSON config)**
```javascript
// /src/modules/sales-insight-explorer/config/semantic-layers.js
export const semanticLayers = {
  pain_points: { /* ... */ },
  meetings: { /* ... */ },
  building_characteristics: { /* ... */ },
  // etc.
};
```

**2. UI Component: Guided Query Builder**
```javascript
// /src/modules/sales-insight-explorer/components/guided-builder.js
// Replaces generic query builder with domain-aware wizard
export function GuidedQueryBuilder() {
  // Step 1: Information layer selector
  // Step 2: Context filters
  // Step 3: Presentation mode
  // Step 4: Preview & execute
}
```

**3. Query Translator**
```javascript
// /src/modules/sales-insight-explorer/lib/semantic-translator.js
export function translateSemanticQuery(semanticQuery, schema) {
  // Input: { layer: 'pain_points', context: { building_size: 'small' }, presentation: 'group_by' }
  // Output: Full QueryDefinition voor bestaande validator/executor
}
```

**4. Schema Evolution Monitor**
```javascript
// /src/modules/sales-insight-explorer/lib/schema-evolution.js
export async function detectSemanticChanges(oldSchema, newSchema, semanticLayers) {
  // Check if semantic mappings still valid
  // Suggest migrations
  // Update saved queries
}
```

**5. Natural Language Query Describer**
```javascript
// /src/modules/sales-insight-explorer/lib/query-describer.js
export function describeQuery(semanticQuery) {
  // Input: Semantic query object
  // Output: "Toon de meest voorkomende pijnpunten bij kleine VME's dit jaar"
}
```

---

### Wat NIET gebouwd hoeft te worden

**❌ Nieuwe query validator** - Bestaande validator blijft werken  
**❌ Nieuwe executor** - 3 execution paths blijven ongewijzigd  
**❌ Nieuwe schema introspection** - Blijft schema-driven  
**❌ Nieuwe export engine** - JSON/CSV export blijft werken  
**❌ Nieuwe persistence** - Queries blijven opgeslagen in Supabase  

**Wat we WEL doen:**
✅ Toevoegen van semantische laag bovenop bestaande techniek  
✅ Nieuwe UI die semantische keuzes vertaalt naar technische queries  
✅ Automatische mapping tussen business concepten en schema  

---

## 7. SUCCESS CRITERIA

### Een niet-technische gebruiker kan:

1. **Binnen 2 minuten een query bouwen**
   - Zonder training
   - Zonder technische kennis
   - Zonder fouten

2. **Begrijpen wat hij aan het doen is**
   - Natural language beschrijvingen
   - Business termen, geen veldnamen
   - Visuele begeleiding

3. **Vertrouwen op de resultaten**
   - Weet welke data gebruikt werd
   - Ziet hoeveel actiebladen geanalyseerd zijn
   - Begrijpt wat de cijfers betekenen

4. **Saved queries hergebruiken**
   - Ook na schema wijzigingen
   - Zonder technische migraties
   - Met automatische updates

5. **Nieuwe insights ontdekken**
   - Door suggesties van het systeem
   - Door nieuwe velden die automatisch verschijnen
   - Door vergelijkingen en trends

---

### Het systeem kan:

1. **Schema evolotion absorberen**
   - Veldnamen wijzigen zonder UX-breuk
   - Nieuwe modellen automatisch oppikken
   - Saved queries migreren

2. **Domein-intelligentie tonen**
   - Weet dat x_sales_action_sheet het anker is
   - Begrijpt relaties tussen modellen
   - Suggereert relevante combinaties

3. **Fouten voorkomen**
   - Ongeldige queries onmogelijk maken
   - Waarschuwingen bij kleine datasets
   - Disabled opties met uitleg

4. **Schaalbaar blijven**
   - Nieuwe semantic layers toevoegen zonder refactor
   - Meer modellen ondersteunen zonder complexity
   - Sneller worden bij meer gebruik (caching)

---

## 8. NEXT STEPS

### Iteration 8 Implementation Plan

**Phase 1: Semantic Layer Definition** (Week 1)
- Define semantic-layers.json config
- Map to current Odoo schema
- Write semantic-to-technical translator

**Phase 2: Guided UI** (Week 2-3)
- Build 3-step wizard component
- Replace generic query builder
- Add natural language descriptions

**Phase 3: Schema Evolution** (Week 4)
- Implement schema change detection
- Build migration engine
- Add admin notifications

**Phase 4: Testing & Refinement** (Week 5)
- User testing with sales team
- Iterate on labels and flow
- Document semantic layer patterns

**Phase 5: Production Deployment** (Week 6)
- Deploy to production
- Monitor usage patterns
- Collect feedback

---

## 9. CONCLUSIE

### Wat we hebben bereikt

**Iterations 1-7:**
Een technisch perfecte, schema-driven query engine.

**Iteration 8 (design):**
Een domein-aware laag die het systeem bruikbaar maakt voor niet-technische gebruikers.

### Het fundamentele verschil

**Van:**
"Kies een model, selecteer velden, bouw filters"

**Naar:**
"Wat wil je weten? In welke context? Hoe wil je het zien?"

### Waarom dit werkt

1. **x_sales_action_sheet als anker** - Voorkomt ongeldige queries
2. **Semantische lagen** - Vertalen business vragen naar techniek
3. **Automatische relaties** - Gebruiker hoeft niets te weten over schema
4. **Schema evolutie** - Systeem past zich aan zonder UX-breuk
5. **Domein-intelligentie** - Begeleidt gebruiker naar correcte insights

### De belofte

Een verkoopmanager kan binnen 2 minuten antwoord krijgen op:
- "Welke pijnpunten komen het vaakst voor?"
- "Hoeveel meetings zijn nodig voor conversie?"
- "Welke gebouwtypes zijn het succesvol st?"

**Zonder:**
- SQL kennis
- Data model begrip
- Technische training
- Risico op fouten

**Met:**
- Natuurlijke taal
- Begeleide keuzes
- Automatische validatie
- Betrouwbare resultaten

---

**Iteration 8 Design Complete**  
**Ready for Implementation**  
**Builds on rock-solid technical foundation (Iterations 1-7)**  
**Adds domain-aware UX that makes it actually usable**

---

*"The best query builder is the one you don't notice you're using."*
