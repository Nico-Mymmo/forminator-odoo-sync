# Iteration 8 - Implementation Specification

**Date:** January 21, 2026  
**Status:** 🔧 Implementation Ready  
**Builds On:** ITERATION_8_DESIGN + ITERATION_8_ADDENDUM

---

## LEESWIJZER

Dit document vertaalt het conceptuele design naar concrete implementatie-instructies.

**Geen:**
- Herhaling van design rationale
- UX-filosofie
- BI-vergelijkingen
- Theoretische overwegingen

**Wel:**
- Exacte beslislogica per laag
- Concrete query-sjablonen
- Expliciete blokkades
- Configureerbare grenzen
- Implementatievolgorde

---

## A. DEFINITIEVE SEMANTISCHE KEUZELAGEN

### Beslisstructuur

Elke query doorloopt **exact drie lagen** in vaste volgorde:

```
1. INFORMATIE → Wat wil je weten?
2. CONTEXT    → Over welke actiebladen?
3. PRESENTATIE → Hoe wil je het zien?
```

Elke laag heeft:
- Vaste keuzes (eindige set)
- Impliciet betrokken modellen (gebruiker ziet dit niet)
- Verplichte velden (automatisch toegevoegd)
- Blokkerende combinaties (preventief)

---

### LAAG 1: INFORMATIE-OBJECT

**Doel:** Bepaal primaire analyse-as (altijd via x_sales_action_sheet)

**Type:** Exclusieve keuze (radio buttons in UI)

#### 1.1 Pijnpunten & Obstakels (Metric Layer)

**Label:** "Welke obstakels ervaren klanten?"

**Betrokken modellen:**
- `x_sales_action_sheet` (base)
- `x_action_sheet_pain_points` (koppeltabel)
- `x_user_painpoints` (canonieke lijst)

**Verplichte velden:**
- `x_action_sheet_pain_points.score` (0-5)
- `x_user_painpoints.name`

**Type aggregatie:**
- COUNT: Hoeveel actiebladen hebben dit pijnpunt?
- AVG(score): Gemiddelde ernst
- SUM(score): Totale impact
- MAX(score): Hoogste intensiteit

**Sub-keuzes (verplicht kiezen):**
- ○ Meest voorkomend (COUNT, GROUP BY pain point name)
- ○ Meest ernstig (AVG score, GROUP BY pain point name)
- ○ Grootste impact (SUM score, GROUP BY pain point name)

**Niet toegestaan:**
- Lijst zonder aggregatie (score zonder context is zinloos)
- Aggregatie zonder groepering (welk pijnpunt?)
- Combinatie met Stage Distribution (metric vs categorisch conflict)

**Execution hint:** `read_group` (aggregeerbaar)

---

#### 1.2 Meeting-Evolutie (Temporele Layer)

**Label:** "Hoe ontwikkelt klantcontact zich?"

**Betrokken modellen:**
- `x_sales_action_sheet` (base)
- `x_as_meetings` (many2one relation)

**Verplichte velden:**
- `x_as_meetings.x_date`
- `x_as_meetings.x_meeting_type`

**Type aggregatie:**
- COUNT: Aantal meetings
- MIN(x_date): Eerste contact
- MAX(x_date): Laatste contact
- DATE_DIFF(max, min): Tijdsspanne
- COUNT / DATE_DIFF: Frequentie

**Sub-keuzes (verplicht kiezen):**
- ○ Frequentie (aantal per tijdsperiode)
- ○ Timing (eerste vs laatste contact)
- ○ Voor/na conversie (causale vergelijking)
- ○ Type-verdeling (intake, pitch, follow-up)

**Niet toegestaan:**
- Lijst zonder datum
- Groepering per stage (temporeel vs categorisch)
- Aggregatie zonder temporele context

**Execution hint:** `multi_pass` (temporele analyse vereist)

---

#### 1.3 Fase-Verdeling (Categorische Layer)

**Label:** "Waar zitten deals in het proces?"

**Betrokken modellen:**
- `x_sales_action_sheet` (base)
- `x_support_stage` (many2one relation)

**Verplichte velden:**
- `x_support_stage.name`
- `x_support_stage.sequence`
- `x_support_stage.fold` (gesloten ja/nee)

**Type aggregatie:**
- COUNT per stage
- Conversion rate (won/total)
- Drop-off analyse (sequential)

**Sub-keuzes (verplicht kiezen):**
- ○ Verdeling per fase (COUNT GROUP BY stage)
- ○ Conversie-percentage (won vs total)
- ○ Drop-off punten (waar vallen deals uit?)

**Niet toegestaan:**
- Combinatie met temporele velden (x_date)
- Groepering zonder sequence (funnel volgorde essentieel)

**Execution hint:** `read_group` (categorisch aggregeerbaar)

---

#### 1.4 Gebouw & VME Context (Indirecte Layer)

**Label:** "Welk type vastgoed behandelen we?"

**Betrokken modellen:**
- `x_sales_action_sheet` (base)
- `res.partner` (via x_studio_for_company_id)
- `x_estate_stats` (many2many, optioneel)

**Verplichte velden:**
- `res.partner.name`

**Sub-lagen (gebruiker kiest):**

**A. Basis (snel):**
- `res.partner.customer_type`
- `res.partner.x_studio_*` (via introspection)
- Execution: `read_group`

**B. Technisch (langzaam):**
- `x_estate_stats.total_area`
- `x_estate_stats.num_units`
- `x_estate_stats.construction_year`
- Execution: `multi_pass` met performance waarschuwing

**Type aggregatie:**
- COUNT per gebouwtype
- AVG(gebouwgrootte)
- Distribution (klein/middel/groot)

**Niet toegestaan:**
- Gebouw zonder actieblad-context (dit is CRM, geen sales insight)

**Execution hint:** 
- Basis: `read_group`
- Technisch: `multi_pass` + performance warning (2-3s)

---

#### 1.5 Salesuitkomst (Resultaat Layer)

**Label:** "Wat zijn de resultaten?"

**Betrokken modellen:**
- `x_sales_action_sheet` (base)
- `crm.lead` (via lead_id, optioneel)

**Verplichte velden:**
- `x_support_stage.x_stage_type` (in_progress/won/lost)
- `x_won_reason` (indien won)
- `x_lost_reason` (indien lost)

**Type aggregatie:**
- COUNT per uitkomst (won/lost/active)
- Won/lost ratio
- Conversie rate (lead exists)

**Sub-keuzes:**
- ○ Status-verdeling (hoeveel per status)
- ○ Win/loss analyse (redenen)
- ○ Conversie-statistiek (met/zonder lead)

**Niet toegestaan:**
- Lead-analyse zonder actieblad (commercie zonder sales-context)

**Execution hint:** `read_group`

---

#### 1.6 Basisinformatie (Overzicht Layer)

**Label:** "Toon actiebladen met kerngegevens"

**Betrokken modellen:**
- `x_sales_action_sheet` (base)

**Verplichte velden:**
- `name`
- `create_date`
- `x_studio_for_company_id.name` (gebouw)
- `x_support_stage.name`

**Type aggregatie:**
- Geen (lijst)
- COUNT totaal
- Trend over tijd (GROUP BY create_date:month)

**Gebruik:**
- Snelle overzichten
- Tijdsreeks-analyse
- Activiteit-monitoring

**Execution hint:** `read_group` of `search_read` (afhankelijk van aggregatie)

---

### LAAG 2: CONTEXT & FILTERING

**Doel:** Beperk scope van actiebladen

**Type:** Multiple choice (checkboxes, sommige exclusief)

#### 2.1 Gebouwgrootte (Many2one filter)

**Via:** `x_studio_for_company_id → res.partner → x_estate_stats.total_area`

**Opties:**
- ☐ Klein (< 1000m²)
- ☐ Middel (1000-5000m²)
- ☐ Groot (> 5000m²)

**Technische vertaling:**
```javascript
{
  field: 'x_studio_for_company_id.x_estate_stats.total_area',
  operator: '<',
  value: 1000
}
```

**Performance:** Requires multi-pass if estate_stats accessed

---

#### 2.2 Procesfase (Many2one filter)

**Via:** `x_support_stage.x_stage_type`

**Opties (exclusief - radio):**
- ○ Alle
- ○ Actief (in_progress)
- ○ Gewonnen (won)
- ○ Verloren (lost)

**Technische vertaling:**
```javascript
{
  field: 'x_support_stage.x_stage_type',
  operator: '=',
  value: 'won'
}
```

---

#### 2.3 Tijdsperiode (Date filter)

**Via:** `create_date`

**Opties (exclusief - radio):**
- ○ Dit jaar
- ○ Dit kwartaal
- ○ Laatste 30 dagen
- ○ Custom (date picker)

**Technische vertaling:**
```javascript
{
  time_scope: {
    period: 'this_year' // Backend resolves to date range
  }
}
```

---

#### 2.4 Eigenaar (Many2one filter)

**Via:** `owner_id`

**Opties:**
- ○ Mijn actiebladen (current user)
- ○ Mijn team (user's team_id)
- ○ Specifieke gebruiker (user picker)
- ○ Alle

**Technische vertaling:**
```javascript
{
  field: 'owner_id',
  operator: '=',
  value: currentUser.id
}
```

---

#### 2.5 Lead-status (Boolean filter)

**Via:** `lead_id`

**Opties (exclusief - radio):**
- ○ Alle
- ○ Geconverteerd (lead exists)
- ○ Niet geconverteerd (lead not exists)

**Technische vertaling:**
```javascript
{
  field: 'lead_id',
  operator: 'exists' // of 'not_exists'
}
```

**Gebruik:** Voor voor/na conversie analyses

---

#### 2.6 Tags (Many2many filter)

**Via:** `x_sales_action_sheet_tag`

**Opties:** Dynamisch (loaded from Odoo)
- ☐ pilot-project
- ☐ high-priority
- ☐ follow-up-needed
- ☐ (etc.)

**Technische vertaling:**
```javascript
{
  field: 'x_sales_action_sheet_tag',
  operator: 'in',
  value: [tagId1, tagId2]
}
```

**Belangrijk:** Tags alleen als filter, NOOIT als primaire analyse-as

---

### LAAG 3: PRESENTATIE & AGGREGATIE

**Doel:** Bepaal hoe data samengevat wordt

**Type:** Exclusieve keuze met context-afhankelijke opties

#### 3.1 Groeperen

**Beschikbaar:** Afhankelijk van Laag 1 keuze

**Opties:**

**Als Laag 1 = Pain Points:**
- ○ Per pijnpunt naam
- ○ Per categorie
- ○ Per actieblad

**Als Laag 1 = Meetings:**
- ○ Per meeting type
- ○ Per maand
- ○ Per actieblad

**Als Laag 1 = Gebouw:**
- ○ Per gebouwtype
- ○ Per groottecategorie
- ○ (etc., via introspection)

**Technische vertaling:**
```javascript
{
  aggregations: [{
    function: 'count', // of avg, sum, etc.
    group_by: 'x_user_painpoints.name'
  }]
}
```

---

#### 3.2 Vergelijken

**Beschikbaar:** Altijd

**Opties:**
- Voor vs na conversie (lead_id exists)
- Gewonnen vs verloren (stage_type)
- Dit jaar vs vorig jaar (time comparison)
- Team A vs Team B (owner_id)

**Technische vertaling:**
Twee queries met verschillende filters, side-by-side resultaten

```javascript
{
  comparison: {
    type: 'lead_conversion',
    queryA: { filters: [{ field: 'lead_id', operator: 'not_exists' }] },
    queryB: { filters: [{ field: 'lead_id', operator: 'exists' }] }
  }
}
```

---

#### 3.3 Trend

**Beschikbaar:** Alleen met datum-veld

**Opties:**
- ○ Per maand
- ○ Per kwartaal
- ○ Per week

**Technische vertaling:**
```javascript
{
  aggregations: [{
    function: 'count',
    group_by: 'create_date:month'
  }]
}
```

---

#### 3.4 Top/Bottom

**Beschikbaar:** Bij numerieke velden of COUNT aggregaties

**Opties:**
- Top 5, 10, 20
- Bottom 5, 10, 20

**Technische vertaling:**
```javascript
{
  aggregations: [{
    function: 'count',
    group_by: 'x_user_painpoints.name',
    order_by: 'count',
    order_direction: 'desc',
    limit: 10
  }]
}
```

---

#### 3.5 Samenvatten

**Beschikbaar:** Bij numerieke velden

**Opties:**
- Totaal (SUM)
- Gemiddelde (AVG)
- Minimum (MIN)
- Maximum (MAX)
- Aantal (COUNT)

**Technische vertaling:**
```javascript
{
  aggregations: [{
    field: 'x_action_sheet_pain_points.score',
    function: 'avg'
    // Geen group_by = single summary value
  }]
}
```

---

### Beslislogica: Combinatie-matrix

| Laag 1 | Laag 3 Toegestaan | Laag 3 Geblokkeerd |
|--------|-------------------|---------------------|
| Pain Points | Groeperen, Top, Samenvatten | Trend (geen datum) |
| Meetings | Groeperen, Vergelijken, Trend | - |
| Fase-Verdeling | Groeperen, Vergelijken | Trend (categorisch) |
| Gebouw | Groeperen, Top | Trend (geen inherente datum) |
| Salesuitkomst | Groeperen, Vergelijken | - |
| Basisinfo | Alle | - |

**Blokkade-mechanisme:**

```javascript
function validateLayerCombination(layer1, layer3) {
  if (layer1.type === 'categorical' && layer3.type === 'trend') {
    return {
      valid: false,
      message: 'Categorische data kan niet als trend getoond worden',
      suggestion: 'Gebruik "Groeperen" of "Vergelijken"'
    };
  }
  
  if (layer1.mandatory_fields.includes('date') === false && layer3.type === 'trend') {
    return {
      valid: false,
      message: 'Trend vereist een datum-veld',
      suggestion: 'Selecteer een laag met tijdsdimensie (Meetings, Basisinfo)'
    };
  }
  
  return { valid: true };
}
```

---

## B. CONCRETE QUERY-SJABLONEN

### Sjabloon 1: Terugkerende pijnpunten bij kleine VME's

**Menselijke vraag:**
"Welke obstakels komen het vaakst voor bij kleine VME's die uiteindelijk klant werden?"

**Semantische lagen:**
- **Laag 1:** Pijnpunten & Obstakels → Meest voorkomend
- **Laag 2:** Gebouwgrootte = Klein, Lead-status = Geconverteerd
- **Laag 3:** Top 10, Groeperen per pijnpunt

**Betrokken modellen (impliciet):**
- x_sales_action_sheet (base)
- x_action_sheet_pain_points (koppeltabel met score)
- x_user_painpoints (namen)
- res.partner (gebouw via x_studio_for_company_id)
- x_estate_stats (total_area)
- crm.lead (via lead_id voor conversie-check)

**Type aggregatie:**
COUNT met GROUP BY + ORDER BY

**Vertaalde query:**
```javascript
{
  base_model: 'x_sales_action_sheet',
  relations: [{
    path: [
      { relation_field: 'x_action_sheet_pain_points', target_model: 'x_action_sheet_pain_points' },
      { relation_field: 'x_user_painpoints', target_model: 'x_user_painpoints' }
    ],
    fields: ['name']
  }],
  filters: [
    {
      field: 'x_studio_for_company_id.x_estate_stats.total_area',
      operator: '<',
      value: 1000
    },
    {
      field: 'lead_id',
      operator: 'exists'
    }
  ],
  aggregations: [{
    field: 'id',
    function: 'count',
    group_by: 'x_user_painpoints.name',
    order_by: 'count',
    order_direction: 'desc',
    limit: 10
  }],
  execution_hint: 'multi_pass' // Estate stats requires multi-pass
}
```

**Expected result:**
```
Pijnpunt                           Aantal actiebladen
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hoge energiekosten                 23
Verouderde verwarming              18
Budget onzekerheid                 15
Administratieve complexiteit       12
Isolatieproblemen                  9
...
```

---

### Sjabloon 2: Meeting-frequentie voor vs na conversie

**Menselijke vraag:**
"Hoeveel meetings zijn gemiddeld nodig voor een lead-conversie vergeleken met actiebladen die niet converteren?"

**Semantische lagen:**
- **Laag 1:** Meeting-Evolutie → Frequentie
- **Laag 2:** Tijdsperiode = Dit jaar
- **Laag 3:** Vergelijken = Voor vs na conversie

**Betrokken modellen (impliciet):**
- x_sales_action_sheet (base)
- x_as_meetings (many2one)
- crm.lead (via lead_id voor split)

**Type aggregatie:**
Comparison met COUNT + AVG

**Vertaalde query:**
```javascript
{
  comparison: {
    type: 'lead_conversion',
    queryA: {
      base_model: 'x_sales_action_sheet',
      relations: [{
        path: [{ relation_field: 'x_as_meetings', target_model: 'x_as_meetings' }],
        fields: ['x_date', 'x_meeting_type']
      }],
      filters: [
        { field: 'lead_id', operator: 'not_exists' },
        { time_scope: { period: 'this_year' } }
      ],
      aggregations: [
        { field: 'x_as_meetings.id', function: 'count' },
        { field: 'id', function: 'count' }
      ]
    },
    queryB: {
      base_model: 'x_sales_action_sheet',
      relations: [{
        path: [{ relation_field: 'x_as_meetings', target_model: 'x_as_meetings' }],
        fields: ['x_date', 'x_meeting_type']
      }],
      filters: [
        { field: 'lead_id', operator: 'exists' },
        { time_scope: { period: 'this_year' } }
      ],
      aggregations: [
        { field: 'x_as_meetings.id', function: 'count' },
        { field: 'id', function: 'count' }
      ]
    },
    computed: {
      avgMeetingsA: 'queryA.meeting_count / queryA.action_sheet_count',
      avgMeetingsB: 'queryB.meeting_count / queryB.action_sheet_count',
      difference: 'avgMeetingsB - avgMeetingsA'
    }
  },
  execution_hint: 'multi_pass'
}
```

**Expected result:**
```
Vergelijking: Meeting-frequentie voor/na conversie

Zonder lead              Met lead
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
34 actiebladen           28 actiebladen
89 meetings              147 meetings
Ø 2.6 per blad           Ø 5.3 per blad

Verschil: +2.7 meetings (104% meer)

Conclusie: Geconverteerde leads vereisen 2× meer meetings
```

---

### Sjabloon 3: Drop-off analyse in salesfunnel

**Menselijke vraag:**
"In welke fase vallen de meeste deals uit?"

**Semantische lagen:**
- **Laag 1:** Fase-Verdeling → Drop-off punten
- **Laag 2:** Tijdsperiode = Dit kwartaal, Status = Alle
- **Laag 3:** Groeperen per fase (met sequence)

**Betrokken modellen (impliciet):**
- x_sales_action_sheet (base)
- x_support_stage (many2one)

**Type aggregatie:**
COUNT per stage met sequential analysis

**Vertaalde query:**
```javascript
{
  base_model: 'x_sales_action_sheet',
  relations: [{
    path: [{ relation_field: 'x_support_stage', target_model: 'x_support_stage' }],
    fields: ['name', 'sequence', 'fold']
  }],
  filters: [
    { time_scope: { period: 'this_quarter' } }
  ],
  aggregations: [{
    field: 'id',
    function: 'count',
    group_by: 'x_support_stage.name',
    order_by: 'x_support_stage.sequence',
    order_direction: 'asc'
  }],
  computed: {
    drop_off: 'sequential_difference', // Per stage: count(stage_n) - count(stage_n+1)
    drop_off_percentage: 'drop_off / count(stage_n) * 100'
  },
  execution_hint: 'read_group'
}
```

**Expected result:**
```
Fase                    Aantal    Drop-off    Drop-off %
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Eerste contact          87        -12         13.8%  ⚠️
Behoeftebepaling        75        -8          10.7%
Offerte aangevraagd     67        -23         34.3%  🔴
Onderhandeling          44        -5          11.4%
Gewonnen                39        -           -

Grootste drop-off: Offerte aangevraagd → Onderhandeling (34%)
```

---

### Sjabloon 4: Gemiddelde pijnpunt-ernst per gebouwtype

**Menselijke vraag:**
"Hebben grote VME's ernstiger problemen dan kleine VME's?"

**Semantische lagen:**
- **Laag 1:** Pijnpunten & Obstakels → Meest ernstig (AVG score)
- **Laag 2:** Status = Gewonnen (alleen succesvolle deals)
- **Laag 3:** Groeperen per gebouwgrootte

**Betrokken modellen (impliciet):**
- x_sales_action_sheet (base)
- x_action_sheet_pain_points (koppeltabel met score)
- x_user_painpoints (namen)
- res.partner (gebouw)
- x_estate_stats (total_area voor categorisering)

**Type aggregatie:**
AVG(score) met GROUP BY gebouwgrootte-categorie

**Vertaalde query:**
```javascript
{
  base_model: 'x_sales_action_sheet',
  relations: [
    {
      path: [
        { relation_field: 'x_action_sheet_pain_points', target_model: 'x_action_sheet_pain_points' }
      ],
      fields: ['score']
    },
    {
      path: [
        { relation_field: 'x_studio_for_company_id', target_model: 'res.partner' },
        { relation_field: 'x_estate_stats', target_model: 'x_estate_stats' }
      ],
      fields: ['total_area']
    }
  ],
  filters: [
    {
      field: 'x_support_stage.x_stage_type',
      operator: '=',
      value: 'won'
    }
  ],
  aggregations: [{
    field: 'x_action_sheet_pain_points.score',
    function: 'avg',
    group_by: 'building_size_category', // Computed field
    computed_group_by: {
      field: 'x_estate_stats.total_area',
      categories: [
        { label: 'Klein (< 1000m²)', min: 0, max: 1000 },
        { label: 'Middel (1000-5000m²)', min: 1000, max: 5000 },
        { label: 'Groot (> 5000m²)', min: 5000, max: 999999 }
      ]
    }
  }],
  execution_hint: 'multi_pass' // Estate stats + score aggregation
}
```

**Expected result:**
```
Gebouwgrootte           Gem. ernst    Aantal actiebladen
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Klein (< 1000m²)        3.8           42
Middel (1000-5000m²)    3.2           31
Groot (> 5000m²)        2.9           18

Conclusie: Kleine VME's ervaren ernstiger pijnpunten (3.8 vs 2.9)
```

---

### Sjabloon 5: Trend van nieuwe actiebladen per maand

**Menselijke vraag:**
"Groeien we? Hoeveel nieuwe actiebladen creëren we per maand?"

**Semantische lagen:**
- **Laag 1:** Basisinformatie (geen specifieke relatie)
- **Laag 2:** Tijdsperiode = Dit jaar + vorig jaar, Eigenaar = Alle
- **Laag 3:** Trend = Per maand

**Betrokken modellen (impliciet):**
- x_sales_action_sheet (base, alleen create_date)

**Type aggregatie:**
COUNT met GROUP BY create_date:month

**Vertaalde query:**
```javascript
{
  base_model: 'x_sales_action_sheet',
  fields: ['create_date'],
  filters: [
    {
      time_scope: {
        period: 'custom',
        from: '2025-01-01',
        to: '2026-12-31'
      }
    }
  ],
  aggregations: [{
    field: 'id',
    function: 'count',
    group_by: 'create_date:month',
    order_by: 'create_date',
    order_direction: 'asc'
  }],
  computed: {
    yoy_growth: 'compare_periods', // Jan 2025 vs Jan 2026, etc.
    trend_line: 'linear_regression'
  },
  execution_hint: 'read_group'
}
```

**Expected result:**
```
Maand           Aantal    YoY groei
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Jan 2025        34        -
Feb 2025        38        -
Mar 2025        42        -
...
Jan 2026        67        +97%  📈
Feb 2026        72        +89%  📈

Gemiddelde groei: +24% per kwartaal
Trend: Stijgend
```

---

### Sjabloon 6: Top 5 meest impactvolle pijnpunten (score × frequentie)

**Menselijke vraag:**
"Welke pijnpunten zijn het belangrijkst om op te lossen (ernst × hoe vaak)?"

**Semantische lagen:**
- **Laag 1:** Pijnpunten & Obstakels → Grootste impact (SUM score)
- **Laag 2:** Tijdsperiode = Dit jaar, Status = Alle
- **Laag 3:** Top 5

**Betrokken modellen (impliciet):**
- x_sales_action_sheet (base)
- x_action_sheet_pain_points (koppeltabel met score)
- x_user_painpoints (namen)

**Type aggregatie:**
SUM(score) + COUNT met GROUP BY

**Vertaalde query:**
```javascript
{
  base_model: 'x_sales_action_sheet',
  relations: [{
    path: [
      { relation_field: 'x_action_sheet_pain_points', target_model: 'x_action_sheet_pain_points' },
      { relation_field: 'x_user_painpoints', target_model: 'x_user_painpoints' }
    ],
    fields: ['name', 'score']
  }],
  filters: [
    { time_scope: { period: 'this_year' } }
  ],
  aggregations: [
    {
      field: 'x_action_sheet_pain_points.score',
      function: 'sum',
      group_by: 'x_user_painpoints.name',
      order_by: 'sum',
      order_direction: 'desc',
      limit: 5
    },
    {
      field: 'id',
      function: 'count',
      group_by: 'x_user_painpoints.name'
    },
    {
      field: 'x_action_sheet_pain_points.score',
      function: 'avg',
      group_by: 'x_user_painpoints.name'
    }
  ],
  execution_hint: 'read_group'
}
```

**Expected result:**
```
Pijnpunt                        Impact    Freq.   Gem. ernst
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hoge energiekosten              115       23      5.0  🔴
Verouderde verwarming           90        18      5.0  🔴
Budget onzekerheid              75        15      5.0  🔴
Isolatieproblemen               54        9       6.0  🔴
Administratieve complexiteit    48        12      4.0  🟠

Prioriteit: Focus op energiegerelateerde pijnpunten (hoogste impact)
```

---

### Sjabloon 7: Meeting-types voor/na conversie

**Menselijke vraag:**
"Verschilt het type meeting na conversie (pitch vs follow-up)?"

**Semantische lagen:**
- **Laag 1:** Meeting-Evolutie → Type-verdeling
- **Laag 2:** Lead-status = Beide (voor vergelijking)
- **Laag 3:** Vergelijken = Voor vs na conversie + Groeperen per meeting type

**Betrokken modellen (impliciet):**
- x_sales_action_sheet (base)
- x_as_meetings (many2one)
- crm.lead (voor split op x_converted_date)

**Type aggregatie:**
COUNT per meeting type, split op conversie-datum

**Vertaalde query:**
```javascript
{
  comparison: {
    type: 'temporal_split',
    split_field: 'x_converted_date',
    queryA: {
      base_model: 'x_sales_action_sheet',
      relations: [{
        path: [{ relation_field: 'x_as_meetings', target_model: 'x_as_meetings' }],
        fields: ['x_date', 'x_meeting_type']
      }],
      filters: [
        { field: 'lead_id', operator: 'exists' }, // Alleen geconverteerde
        {
          // Meetings vóór conversie
          custom: 'x_as_meetings.x_date < x_sales_action_sheet.x_converted_date'
        }
      ],
      aggregations: [{
        field: 'id',
        function: 'count',
        group_by: 'x_as_meetings.x_meeting_type'
      }]
    },
    queryB: {
      base_model: 'x_sales_action_sheet',
      relations: [{
        path: [{ relation_field: 'x_as_meetings', target_model: 'x_as_meetings' }],
        fields: ['x_date', 'x_meeting_type']
      }],
      filters: [
        { field: 'lead_id', operator: 'exists' },
        {
          // Meetings ná conversie
          custom: 'x_as_meetings.x_date > x_sales_action_sheet.x_converted_date'
        }
      ],
      aggregations: [{
        field: 'id',
        function: 'count',
        group_by: 'x_as_meetings.x_meeting_type'
      }]
    }
  },
  execution_hint: 'multi_pass'
}
```

**Expected result:**
```
Meeting type         Vóór conversie    Ná conversie
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Intake               67 (46%)          5 (4%)
Pitch                52 (35%)          12 (9%)
Evaluatie            28 (19%)          38 (29%)
Follow-up            -                 75 (58%)

Verschuiving: Van intake/pitch → evaluatie/follow-up na conversie
```

---

## C. GEFORCEERDE SEMANTIEK: WAT KAN NIET?

### Blokkerende Combinaties

#### 1. Pain Points zonder Score

**Scenario:** User selecteert Pain Points maar wil lijst zonder aggregatie

**Blokkade:**
```javascript
if (layer1 === 'pain_points' && !aggregation) {
  throw new SemanticError({
    code: 'PAIN_POINTS_REQUIRE_AGGREGATION',
    message: 'Pijnpunten kunnen niet zonder aggregatie getoond worden',
    explanation: 'Pijnpunten bestaan alleen met een score in context van actiebladen',
    suggestions: [
      'Groepeer per pijnpunt (meest voorkomend)',
      'Gemiddelde ernst per pijnpunt',
      'Totale impact per pijnpunt'
    ]
  });
}
```

**UI-effect:** "Lijst" optie is disabled in Laag 3 wanneer Pain Points geselecteerd is

**Waarom:** Score is kerngegevens. Een pain point zonder score is een lege naam.

---

#### 2. Meetings zonder Datum

**Scenario:** User selecteert Meetings maar datum-veld wordt verwijderd

**Blokkade:**
```javascript
if (layer1 === 'meetings' && !fields.includes('x_date')) {
  throw new SemanticError({
    code: 'MEETINGS_REQUIRE_DATE',
    message: 'Meeting-analyse vereist datum-informatie',
    explanation: 'Meetings zijn temporele gebeurtenissen. Zonder tijd is er geen context.',
    suggestions: [
      'Datum-veld wordt automatisch toegevoegd',
      'Kies een andere laag als tijd niet relevant is'
    ]
  });
}
```

**UI-effect:** Datum-veld automatisch geselecteerd en disabled (niet uitvinken)

**Waarom:** Meetings zijn inherent temporeel. Zonder tijd zijn het betekenisloze rijen.

---

#### 3. Meetings + Stage Groepering

**Scenario:** User selecteert Meetings en probeert te groeperen per Stage

**Blokkade:**
```javascript
if (layer1 === 'meetings' && groupBy.startsWith('x_support_stage')) {
  throw new SemanticError({
    code: 'TEMPORAL_CATEGORICAL_CONFLICT',
    message: 'Meeting-evolutie kan niet gegroepeerd worden per fase',
    explanation: 'Meetings zijn temporeel (tijd), Stages zijn categorisch (status). Dit zijn orthogonale dimensies.',
    suggestions: [
      'Filter op een specifieke fase en analyseer meetings daarbinnen',
      'Maak twee aparte queries: één voor meetings, één voor stages',
      'Gebruik "Voor/na conversie" voor temporele vergelijking'
    ]
  });
}
```

**UI-effect:** Stage-velden disabled in "Groeperen per" dropdown wanneer Meetings laag actief

**Waarom:** Dit mixt twee verschillende analyse-types. Je kunt stages gebruiken als filter, niet als groepering.

---

#### 4. Stage Distribution + Temporal Filters

**Scenario:** User selecteert Stage Distribution en probeert "Trend over tijd"

**Blokkade:**
```javascript
if (layer1 === 'stage_distribution' && presentation === 'trend') {
  throw new SemanticError({
    code: 'CATEGORICAL_NO_TREND',
    message: 'Fase-verdeling kan niet als trend getoond worden',
    explanation: 'Stages zijn categorisch (status op moment X), geen tijdsreeks',
    suggestions: [
      'Gebruik "Groeperen per fase" voor verdeling',
      'Kies "Meeting-evolutie" voor temporele analyse',
      'Maak een snapshot per periode (aparte queries)'
    ]
  });
}
```

**UI-effect:** "Trend" optie disabled wanneer Stage Distribution geselecteerd

**Waarom:** Stages hebben geen inherente temporele volgorde. Een stage-verandering is een event, geen trend.

---

#### 5. Tags als Primaire Laag

**Scenario:** User probeert Tags te selecteren in Laag 1 (informatie-object)

**Blokkade:**
```javascript
if (attemptedLayer1 === 'tags') {
  throw new SemanticError({
    code: 'TAGS_NOT_PRIMARY',
    message: 'Tags zijn contextfilters, geen primaire informatie',
    explanation: 'Tags zijn lichte labels zonder semantiek. Ze dienen om actiebladen te selecteren, niet om te analyseren.',
    suggestions: [
      'Kies een primaire laag (Pain Points, Meetings, Stages, Gebouw)',
      'Gebruik tags als filter in Laag 2'
    ]
  });
}
```

**UI-effect:** Tags verschijnen NIET in Laag 1, alleen in Laag 2 als checkboxes

**Waarom:** Tags hebben geen intrinsieke betekenis. "Verdeling per tag" is administratie, geen sales insight.

---

#### 6. Gebouw zonder Actieblad-Context

**Scenario:** User probeert (via advanced mode hypothetisch) gebouwen te analyseren zonder actiebladen

**Blokkade:**
```javascript
if (baseModel !== 'x_sales_action_sheet') {
  throw new SemanticError({
    code: 'MUST_START_WITH_ACTION_SHEET',
    message: 'Alle analyses starten bij actiebladen',
    explanation: 'Dit is een sales insight tool, geen gebouwdatabase. Gebouwen zijn context rond sales-activiteit.',
    suggestions: [
      'Start met actiebladen en filter op gebouwtype',
      'Gebruik Odoo CRM voor gebouw-administratie'
    ]
  });
}
```

**UI-effect:** Er IS GEEN model-keuze dropdown. x_sales_action_sheet is hard-coded.

**Waarom:** Dit is het fundamentele anker. Zonder dit wordt het een BI-tool.

---

#### 7. Lead-Analyse zonder Actieblad

**Scenario:** User probeert crm.lead als base model (hypothetisch)

**Blokkade:**
```javascript
if (baseModel === 'crm.lead') {
  throw new SemanticError({
    code: 'LEADS_ARE_OUTCOME',
    message: 'Leads zijn uitkomst, niet input',
    explanation: 'Een lead ontstaat uit een actieblad. Lead-analyse zonder sales-context is commerciële rapportage, geen sales insight.',
    suggestions: [
      'Analyseer actiebladen met filter "Lead bestaat"',
      'Gebruik Odoo sales reporting voor lead-statistieken'
    ]
  });
}
```

**UI-effect:** Lead model bestaat niet in dit systeem. Only via filter "Geconverteerd ja/nee"

**Waarom:** Leads valideren actiebladen, ze zijn geen primaire data-bron.

---

#### 8. Estate Stats zonder Performance Waarschuwing

**Scenario:** User selecteert Gebouw → Technische specs

**Waarschuwing (geen blokkade):**
```javascript
if (layer1.subLayer === 'building_technical_specs') {
  showPerformanceWarning({
    type: 'info',
    severity: 'medium',
    message: 'Technische gebouwdata vereist extra verwerkingstijd (2-3 seconden)',
    explanation: `Estate stats zijn niet direct gekoppeld aan actiebladen.
                  
                  Stappen:
                  1. Haal actiebladen op
                  2. Navigeer naar gebouwen (res.partner)
                  3. Haal estate stats op (many2many)
                  4. Combineer resultaten
                  
                  Dit is multi-pass execution.`,
    alternatives: [
      {
        label: 'Gebruik "Type & locatie" (sneller)',
        action: () => switchToBasicBuilding()
      }
    ],
    continueButton: 'Ik begrijp het, ga door'
  });
  
  query.execution_hint = 'multi_pass';
  query.estimated_duration_seconds = 3;
}
```

**UI-effect:** Modal dialog met uitleg + keuze om door te gaan of te switchen

**Waarom:** Technisch complex maar semantisch geldig. User mag kiezen: snelheid vs detail.

---

#### 9. Aggregatie zonder Groepering (voor niet-summary cases)

**Scenario:** User kiest AVG(score) maar geen group_by

**Auto-correct:**
```javascript
if (aggregation && !groupBy && aggregation.function !== 'summary') {
  // Auto-add default group_by
  if (layer1 === 'pain_points') {
    groupBy = 'x_user_painpoints.name';
  } else if (layer1 === 'meetings') {
    groupBy = 'x_sales_action_sheet.name';
  }
  
  showInfo({
    message: 'Automatische groepering toegevoegd',
    explanation: `Aggregatie zonder groepering geeft één getal.
                  Voor overzicht groeperen we per ${groupBy}.
                  
                  Wil je toch één totaalwaarde? Kies "Samenvatten" in Laag 3.`
  });
}
```

**UI-effect:** Automatische toevoeging + notificatie

**Waarom:** COUNT zonder GROUP BY is bijna altijd een vergissing. Dit voorkomt lege resultaten.

---

### Afdwingingsmatrix

| Combinatie | Actie | Mechanisme | Boodschap |
|------------|-------|------------|-----------|
| Pain Points zonder score | BLOCK | Semantic validator | "Score is verplicht veld" |
| Pain Points zonder aggregatie | BLOCK | UI disabled | "Kies aggregatie-type" |
| Meetings zonder datum | AUTO-FIX | Force field inclusion | "Datum automatisch toegevoegd" |
| Meetings + Stage groepering | BLOCK | Incompatibility check | "Temporeel vs categorisch conflict" |
| Stage + Trend | BLOCK | UI disabled | "Categorisch heeft geen trend" |
| Tags als primair | PREVENT | Not in options | Niet zichtbaar in Laag 1 |
| Gebouw zonder actieblad | PREVENT | Hard-coded base model | Geen model-keuze |
| Lead zonder actieblad | PREVENT | Hard-coded base model | Geen model-keuze |
| Estate stats complex | WARN | Performance modal | "2-3 sec, doorgaan?" |
| Aggregatie zonder groepering | AUTO-FIX | Smart default | "Auto-groepering toegevoegd" |

**Principes:**
- **PREVENT:** Optie bestaat niet in UI
- **BLOCK:** Validation error met uitleg
- **WARN:** User kan doorgaan na acknowledgment
- **AUTO-FIX:** Systeem corrigeert stil of met notificatie

---

### Hoe dit voorkomt dat systeem BI wordt

**BI-tool gedrag:**
- Validatie is technisch (foreign key exists? data type correct?)
- Alles wat technisch mogelijk is, is toegestaan
- User is verantwoordelijk voor semantische correctheid

**Dit systeem gedrag:**
- Validatie is semantisch (maakt deze combinatie inhoudelijk zin?)
- Technisch mogelijke dingen kunnen semantisch geblokkeerd zijn
- Systeem is verantwoordelijk voor betekenisvolle resultaten

**Voorbeeld:**

**BI-tool staat toe:**
```sql
SELECT tag_name, COUNT(*)
FROM x_sales_action_sheet_tag
GROUP BY tag_name
```
Technisch geldig. Semantisch betekenisloos (tags zonder actieblad-context).

**Dit systeem blokkeert:**
User kan tags niet als primaire laag kiezen. Tags zijn alleen filter.

**Resultaat:** Onmogelijk om semantisch ongeldige queries te bouwen.

---

## D. ADMIN-LAAG: CONFIGURATIE ZONDER SCHADE

### Wat Configureerbaar Is

#### 1. Labels & Weergavenamen

**Scope:** Alle user-facing tekst

**Configureerbaar:**
```javascript
{
  semantic_layers: {
    pain_points: {
      label: 'Pijnpunten & Obstakels', // ← CONFIGUREERBAAR
      description: 'Welke obstakelen ervaren klanten?', // ← CONFIGUREERBAAR
      icon: 'alert-triangle', // ← CONFIGUREERBAAR
      
      // NIET configureerbaar: technische mapping
      base_model: 'x_sales_action_sheet', // ← LOCKED
      relation_field: 'x_action_sheet_pain_points', // ← LOCKED
      mandatory_fields: ['score'] // ← LOCKED
    }
  }
}
```

**Admin UI:**
```
┌──────────────────────────────────────────────┐
│ Laag: Pijnpunten & Obstakels                 │
│                                               │
│ Weergavenaam: [Pijnpunten & Obstakels    ]  │
│ Beschrijving: [Welke obstakelen ervaren..]  │
│ Icoon:        [alert-triangle ▼]            │
│                                               │
│ ⚠️ Technische velden kunnen niet gewijzigd   │
│   worden zonder schemavalidatie               │
│                                               │
│ [Opslaan] [Annuleren]                         │
└──────────────────────────────────────────────┘
```

**Effect:** User ziet andere labels, maar logica blijft identiek

---

#### 2. Tooltips & Helptekst

**Scope:** Uitleg per laag, veld, optie

**Configureerbaar:**
```javascript
{
  pain_points: {
    tooltip: 'Analyseer welke obstakelen klanten ervaren tijdens het salesproces', // ← CONFIGUREERBAAR
    help_text: {
      most_common: 'Toon pijnpunten gesorteerd op hoe vaak ze voorkomen', // ← CONFIGUREERBAAR
      most_severe: 'Toon pijnpunten gesorteerd op gemiddelde ernst (score 0-5)' // ← CONFIGUREERBAAR
    }
  }
}
```

**Admin UI:**
```
┌──────────────────────────────────────────────┐
│ Helpteksten: Pijnpunten & Obstakels          │
│                                               │
│ Algemene tooltip:                             │
│ ┌────────────────────────────────────────┐   │
│ │Analyseer welke obstakelen klanten     │   │
│ │ervaren tijdens het salesproces        │   │
│ └────────────────────────────────────────┘   │
│                                               │
│ Sub-optie "Meest voorkomend":                 │
│ ┌────────────────────────────────────────┐   │
│ │Toon pijnpunten gesorteerd op hoe vaak │   │
│ │ze voorkomen                            │   │
│ └────────────────────────────────────────┘   │
│                                               │
│ [Opslaan]                                     │
└──────────────────────────────────────────────┘
```

**Effect:** Betere uitleg zonder logica te wijzigen

---

#### 3. Default Waarden

**Scope:** Pre-fills voor Laag 2 (context filters)

**Configureerbaar:**
```javascript
{
  default_filters: {
    time_period: 'this_year', // ← CONFIGUREERBAAR
    owner: 'current_user', // ← CONFIGUREERBAAR
    stage_type: 'all' // ← CONFIGUREERBAAR
  }
}
```

**Admin UI:**
```
┌──────────────────────────────────────────────┐
│ Standaard Filters                             │
│                                               │
│ Tijdsperiode: ● Dit jaar                      │
│               ○ Dit kwartaal                  │
│               ○ Laatste 30 dagen              │
│                                               │
│ Eigenaar:     ● Mijn actiebladen              │
│               ○ Mijn team                     │
│               ○ Alle                          │
│                                               │
│ Status:       ● Alle                          │
│               ○ Actief                        │
│               ○ Gewonnen                      │
│                                               │
│ [Opslaan]                                     │
└──────────────────────────────────────────────┘
```

**Effect:** User ziet slimmere defaults maar kan alles nog aanpassen

---

#### 4. Zichtbaarheid van Lagen

**Scope:** Welke semantic layers zichtbaar zijn voor welke user roles

**Configureerbaar:**
```javascript
{
  layer_visibility: {
    pain_points: {
      visible_for_roles: ['sales_manager', 'sales_user', 'admin'], // ← CONFIGUREERBAAR
      visible: true // ← CONFIGUREERBAAR
    },
    building_technical_specs: {
      visible_for_roles: ['admin', 'technical_consultant'], // ← CONFIGUREERBAAR
      visible: false // ← CONFIGUREERBAAR (disabled voor iedereen)
    }
  }
}
```

**Admin UI:**
```
┌──────────────────────────────────────────────┐
│ Laag Zichtbaarheid                            │
│                                               │
│ ☑ Pijnpunten & Obstakels                     │
│   Rollen: [x] Sales Manager                  │
│           [x] Sales User                      │
│           [x] Admin                           │
│                                               │
│ ☐ Gebouw Technische Specs                    │
│   (Uitgeschakeld voor alle gebruikers)       │
│                                               │
│ ☑ Meeting-Evolutie                           │
│   Rollen: [x] Alle rollen                    │
│                                               │
│ [Opslaan]                                     │
└──────────────────────────────────────────────┘
```

**Effect:** Simplificatie voor bepaalde user groepen zonder logica te breken

---

#### 5. Veld-Aliassen (voor introspected fields)

**Scope:** Custom labels voor Odoo velden

**Configureerbaar:**
```javascript
{
  field_aliases: {
    'x_studio_for_company_id': 'Gebouw', // ← CONFIGUREERBAAR
    'x_support_stage': 'Salesfase', // ← CONFIGUREERBAAR
    'x_converted_date': 'Conversiedatum' // ← CONFIGUREERBAAR
  }
}
```

**Admin UI:**
```
┌──────────────────────────────────────────────┐
│ Veld Aliassen                                 │
│                                               │
│ Technische naam              Weergavenaam     │
│ ──────────────────────────── ───────────────  │
│ x_studio_for_company_id    → Gebouw          │
│ x_support_stage            → Salesfase       │
│ x_converted_date           → Conversiedatum  │
│                                               │
│ [+ Nieuwe alias]                              │
│                                               │
│ [Opslaan]                                     │
└──────────────────────────────────────────────┘
```

**Effect:** User-vriendelijke namen zonder schema-wijzigingen

---

### Wat NIET Configureerbaar Is

#### 1. Base Model

**Locked:** `base_model: 'x_sales_action_sheet'`

**Reden:** Dit is het fundamentele anker. Wijzigen hiervan maakt het een BI-tool.

**Admin UI:** Niet zichtbaar, niet aanpasbaar

**Als admin vraagt:** "Kan ik een andere base model kiezen?"
**Antwoord:** "Nee. Dit systeem analyseert altijd actiebladen. Voor andere analyses gebruik Odoo reporting."

---

#### 2. Semantic Constraints

**Locked:**
- `mandatory_fields: ['score']` voor pain points
- `incompatible_with: ['stage_distribution']` voor meetings
- `execution_hint: 'multi_pass'` voor estate stats

**Reden:** Deze dwingen semantische correctheid af

**Admin UI:** Zichtbaar (read-only) maar niet aanpasbaar

```
┌──────────────────────────────────────────────┐
│ Laag: Pijnpunten & Obstakels                 │
│                                               │
│ Verplichte velden: score                 🔒  │
│ Incompatibel met: Fase-verdeling         🔒  │
│                                               │
│ ℹ️ Deze constraints kunnen niet gewijzigd    │
│   worden omdat ze semantische correctheid     │
│   garanderen                                  │
└──────────────────────────────────────────────┘
```

---

#### 3. Validation Logic

**Locked:** Alle `validate()` functies

**Reden:** Dit is de kern van "niet-BI" enforcement

**Admin UI:** Niet zichtbaar

**Code is protected:**
```javascript
// In semantic-layers.js
export const SEMANTIC_CONSTRAINTS = Object.freeze({
  pain_points: {
    validate: Object.freeze((query) => {
      // Deze functie kan NIET gewijzigd worden via admin UI
    })
  }
});
```

---

#### 4. Relation Paths

**Locked:**
- `x_sales_action_sheet → x_action_sheet_pain_points → x_user_painpoints`
- `x_sales_action_sheet → x_as_meetings`
- etc.

**Reden:** Schema-afhankelijk, moet via introspection

**Admin UI:** Read-only weergave

```
┌──────────────────────────────────────────────┐
│ Relaties: Pijnpunten & Obstakels             │
│                                               │
│ x_sales_action_sheet                          │
│  └─ x_action_sheet_pain_points            🔒 │
│      └─ x_user_painpoints                 🔒 │
│                                               │
│ ℹ️ Relaties worden automatisch onderhouden    │
│   via schema introspection                    │
└──────────────────────────────────────────────┘
```

---

#### 5. Aggregation Functions

**Locked:** Beschikbare functies (COUNT, AVG, SUM, MIN, MAX)

**Reden:** Odoo RPC beperking

**Admin UI:** Niet configureerbaar

**Als admin vraagt:** "Kan ik MEDIAN toevoegen?"
**Antwoord:** "Nee. Odoo ondersteunt alleen basic aggregations. Voor advanced statistics: export naar BI-tool."

---

### Admin Workflow: Label Aanpassing

**Use case:** Admin wil "Pijnpunten & Obstakels" hernoemen naar "Klantuitdagingen"

**Stappen:**

1. **Admin navigeert naar config:**
   ```
   Admin Dashboard → Sales Insight Config → Semantische Lagen
   ```

2. **Selecteert laag:**
   ```
   [Pijnpunten & Obstakels] → Edit
   ```

3. **Wijzigt labels:**
   ```
   Weergavenaam: Klantuitdagingen
   Beschrijving: Welke uitdagingen ervaren klanten?
   Icoon: help-circle
   ```

4. **Slaat op:**
   ```
   [Opslaan] → "Labels succesvol bijgewerkt"
   ```

5. **Gebruiker ziet:**
   ```
   Laag 1: Wat wil je weten?
   ○ Klantuitdagingen         ← (was: Pijnpunten & Obstakels)
   ○ Meeting-Evolutie
   ○ Fase-Verdeling
   ...
   ```

**Wat NIET verandert:**
- Technische mapping (`x_action_sheet_pain_points`)
- Verplicht score-veld
- Aggregatie-logica
- Validation rules

**Impact:** Puur cosmetisch, geen breaking changes

---

### Admin Workflow: Default Filter Aanpassen

**Use case:** Admin wil dat nieuwe gebruikers standaard "Dit kwartaal" zien ipv "Dit jaar"

**Stappen:**

1. **Admin navigeert:**
   ```
   Admin Dashboard → Sales Insight Config → Standaard Instellingen
   ```

2. **Wijzigt default:**
   ```
   Tijdsperiode: ○ Dit jaar
                 ● Dit kwartaal   ← selecteert deze
                 ○ Laatste 30 dagen
   ```

3. **Slaat op:**
   ```
   [Opslaan] → "Standaarden bijgewerkt"
   ```

4. **Nieuwe gebruiker ziet:**
   ```
   Laag 2: Over welke actiebladen?
   
   Periode: ● Dit kwartaal   ← (pre-selected)
            ○ Dit jaar
            ○ Laatste 30 dagen
   ```

5. **Bestaande saved queries:**
   ```
   Niet beïnvloed. Defaults gelden alleen voor nieuwe queries.
   ```

---

### Admin Workflow: Laag Verbergen

**Use case:** Admin wil "Gebouw Technische Specs" verbergen (te complex voor reguliere users)

**Stappen:**

1. **Admin navigeert:**
   ```
   Admin Dashboard → Sales Insight Config → Laag Zichtbaarheid
   ```

2. **Deselecteert laag:**
   ```
   ☑ Gebouw Basis (snel)
   ☐ Gebouw Technische Specs   ← unchecked
   ```

3. **Slaat op:**
   ```
   [Opslaan] → Waarschuwing:
   
   "Let op: 3 saved queries gebruiken deze laag.
    Deze queries blijven werken maar gebruikers kunnen
    geen nieuwe queries met deze laag maken.
    
    [Doorgaan] [Annuleren]"
   ```

4. **Admin bevestigt:**
   ```
   [Doorgaan] → "Zichtbaarheid bijgewerkt"
   ```

5. **Gebruiker ziet:**
   ```
   Gebouw & VME Context
   ○ Basis (snel)
   
   (Technische specs optie verdwenen)
   ```

6. **Saved queries:**
   ```
   Blijven executeerbaar maar tonen banner:
   "Deze query gebruikt een verborgen laag. Dupliceer om aan te passen."
   ```

---

### Configuratie Grenzen (Validatie)

**Admin probeert iets onveiligs:**

#### Voorbeeld 1: Verplicht veld verwijderen

**Admin actie:**
```
Probeert 'score' uit mandatory_fields te verwijderen
```

**Systeem response:**
```
❌ Fout: Kan verplicht veld niet verwijderen

'score' is een semantisch verplicht veld voor pijnpunten.
Verwijderen hiervan breekt de logica van deze laag.

Dit veld kan niet geconfigureerd worden.
```

---

#### Voorbeeld 2: Base model wijzigen

**Admin actie:**
```
Probeert base_model te wijzigen naar 'res.partner'
```

**Systeem response:**
```
❌ Fout: Base model is niet configureerbaar

Dit systeem is gebouwd rond x_sales_action_sheet als anker.
Wijzigen hiervan transformeert het in een generieke BI-tool.

Als je partner-analyse wilt: gebruik Odoo CRM rapportage.
```

---

#### Voorbeeld 3: Incompatibility verwijderen

**Admin actie:**
```
Probeert 'stage_distribution' uit incompatible_with te halen voor meetings
```

**Systeem response:**
```
❌ Fout: Incompatibiliteit kan niet verwijderd worden

Meetings (temporeel) en Stages (categorisch) kunnen niet
gecombineerd worden zonder semantische fouten.

Deze constraint is hard-coded en niet configureerbaar.
```

---

### Configuratie vs Customization

**Configuratie (toegestaan):**
- Labels aanpassen
- Tooltips schrijven
- Defaults instellen
- Zichtbaarheid togglen
- Veld-aliassen maken

**Customization (niet toegestaan):**
- Semantic constraints wijzigen
- Validation logic aanpassen
- Base model veranderen
- Nieuwe aggregation functions toevoegen
- Relation paths handmatig schrijven

**Grensregel:**
> Als het de semantische correctheid raakt → niet configureerbaar
> Als het de user experience verbetert → configureerbaar

---

## E. IMPLEMENTATIEVOLGORDE

### Fase 0: Pre-Implementatie (Week 0)

**Doel:** Zorg dat foundation solid is

#### 0.1 Schema Introspection Validatie
- Verify huidige schema cache werkt voor x_sales_action_sheet
- Test relatie-navigatie naar alle 7 gerelateerde modellen
- Confirm field types correct gedetecteerd worden

**Blocker voor:** Alles. Zonder schema-kennis kun je niets bouwen.

**Success criteria:**
```javascript
const schema = await introspectSchema();
assert(schema.models['x_sales_action_sheet']);
assert(schema.models['x_sales_action_sheet'].fields['x_action_sheet_pain_points']);
assert(schema.models['x_action_sheet_pain_points'].fields['score']);
```

---

#### 0.2 Query Executor Smoke Test
- Test bestaande 3 execution paths (read_group, multi_pass, search_read)
- Verify ze werken voor x_sales_action_sheet base queries
- Benchmark performance (baseline)

**Blocker voor:** Query translator. Moet weten dat executor betrouwbaar is.

**Success criteria:**
- Simple COUNT query: < 500ms
- Pain points with score AVG: < 1s
- Estate stats multi-pass: < 3s

---

### Fase 1: Semantic Layer Foundation (Week 1)

**Doel:** Bouw de semantic-to-technical translation layer

#### 1.1 Semantic Layer Definition Schema
**File:** `/src/modules/sales-insight-explorer/config/semantic-layers.js`

**Content:**
```javascript
export const SEMANTIC_LAYERS = {
  pain_points: {
    id: 'pain_points',
    label: 'Pijnpunten & Obstakels',
    type: 'metric',
    base_model: 'x_sales_action_sheet',
    relations: [ /* ... */ ],
    mandatory_fields: ['score'],
    incompatible_with: ['stage_distribution'],
    // etc.
  },
  // 5 andere layers
};
```

**Dependencies:** Geen
**Blocks:** Alles daarna
**Test:** Load config, validate structure

---

#### 1.2 Semantic Validator
**File:** `/src/modules/sales-insight-explorer/lib/semantic-validator.js`

**Functions:**
- `validateLayerCombination(layer1, layer3)`
- `validateMandatoryFields(layer, query)`
- `checkIncompatibilities(selectedLayers)`

**Dependencies:** 1.1
**Blocks:** Query builder UI
**Test:** Unit tests voor alle blokkerende combinaties

---

#### 1.3 Semantic-to-Technical Translator
**File:** `/src/modules/sales-insight-explorer/lib/semantic-translator.js`

**Function:**
```javascript
export function translateSemanticQuery(semanticQuery, schema) {
  // Input: { layer: 'pain_points', sub_option: 'most_common', context: {...}, presentation: {...} }
  // Output: Full QueryDefinition compatible with existing validator
}
```

**Dependencies:** 1.1, 1.2
**Blocks:** Guided builder
**Test:** All 7 query sjablonen from section B

---

### Fase 2: Guided Query Builder UI (Week 2-3)

**Doel:** Replace generic builder met semantic wizard

#### 2.1 Laag 1 Component (Information Object Selector)
**File:** `/src/modules/sales-insight-explorer/components/layer1-selector.js`

**UI:**
- Radio button lijst van 6 semantic layers
- Tooltips met beschrijvingen
- Disabled states voor unavailable layers (role-based)

**Dependencies:** 1.1
**Blocks:** 2.2
**Test:** Visual regression, accessibility

---

#### 2.2 Laag 2 Component (Context Filters)
**File:** `/src/modules/sales-insight-explorer/components/layer2-filters.js`

**UI:**
- Context-aware filters (afhankelijk van Laag 1)
- Checkboxes/radios voor filter opties
- Default values loaded from config

**Dependencies:** 2.1
**Blocks:** 2.3
**Test:** Filter combinations, default loading

---

#### 2.3 Laag 3 Component (Presentation Mode)
**File:** `/src/modules/sales-insight-explorer/components/layer3-presentation.js`

**UI:**
- Presentation options (groeperen, vergelijken, trend, etc.)
- Disabled states voor incompatible opties
- Dynamic options based on Laag 1

**Dependencies:** 2.2
**Blocks:** 2.4
**Test:** Disabling logic, option filtering

---

#### 2.4 Wizard Container
**File:** `/src/modules/sales-insight-explorer/components/guided-wizard.js`

**Function:**
- Orchestrate 3 layers
- Show progress (step 1/3, 2/3, 3/3)
- Validate before moving to next step
- Preview button (use translator to show expected query description)

**Dependencies:** 2.1, 2.2, 2.3, 1.3
**Blocks:** Niets, dit is feature-complete
**Test:** End-to-end user flow

---

### Fase 3: Query Execution Integration (Week 3)

**Doel:** Connect wizard to existing query executor

#### 3.1 Wizard → Translator → Validator Pipeline
**File:** `/src/modules/sales-insight-explorer/lib/query-pipeline.js`

**Flow:**
```
Wizard output (semantic query)
  → Translator (technical query definition)
  → Validator (schema compliance check)
  → Executor (existing 3 paths)
  → Results
```

**Dependencies:** 2.4, 1.3
**Blocks:** 3.2
**Test:** All 7 sjablonen execute successfully

---

#### 3.2 Natural Language Query Describer
**File:** `/src/modules/sales-insight-explorer/lib/query-describer.js`

**Function:**
```javascript
export function describeQuery(semanticQuery) {
  // "Toon de meest voorkomende pijnpunten bij kleine VME's dit jaar"
}
```

**Use:**
- Preview in wizard ("Je vraag:")
- Saved query titles
- Query history descriptions

**Dependencies:** 1.3
**Blocks:** UI polish
**Test:** Descriptions zijn menselijk leesbaar

---

#### 3.3 Comparison Query Executor
**File:** Extend existing executor voor comparison mode

**Function:**
- Execute queryA en queryB parallel
- Compute differences
- Format side-by-side results

**Dependencies:** 3.1
**Blocks:** Comparison presentation mode
**Test:** Sjabloon 2 (meetings voor/na conversie)

---

### Fase 4: Schema Evolution & Admin Config (Week 4)

**Doel:** Make system resilient en configureerbaar

#### 4.1 Schema Change Detection
**File:** `/src/modules/sales-insight-explorer/lib/schema-evolution.js`

**Functions:**
- `detectSchemaChanges(oldSchema, newSchema)`
- `findBrokenSemanticLayers(changes, layers)`
- `suggestMigrations(brokenLayers)`

**Dependencies:** 1.1
**Blocks:** 4.2
**Test:** Mock schema changes, verify detection

---

#### 4.2 Saved Query Migration
**File:** Extend saved queries met migration layer

**Function:**
- Detect saved queries using removed/changed fields
- Attempt auto-migration
- Mark as "needs review" if auto-migration fails
- Email notifications

**Dependencies:** 4.1
**Blocks:** Schema updates zonder query breakage
**Test:** Create saved query, change schema, verify migration

---

#### 4.3 Admin Configuration UI
**File:** `/src/modules/sales-insight-explorer/admin/semantic-config.js`

**Features:**
- Label editing
- Tooltip editing
- Default filters
- Layer visibility toggle
- Read-only view van locked properties

**Dependencies:** 1.1
**Blocks:** Niets, optional polish
**Test:** Change labels, verify user sees updates

---

### Fase 5: Polish & Production Hardening (Week 5)

**Doel:** Production-ready maken

#### 5.1 Error Handling & User Feedback
- Graceful degradation bij Odoo errors
- Helpful error messages (niet "Query failed", maar "Te weinig data voor deze periode")
- Loading states met progress indication
- Timeout handling voor slow queries

**Dependencies:** All previous
**Blocks:** Production deployment
**Test:** Error scenarios, slow network, Odoo downtime

---

#### 5.2 Performance Optimization
- Query result caching (Supabase + KV)
- Schema cache invalidation strategy
- Lazy loading van heavy components
- Debouncing van filter changes

**Dependencies:** 5.1
**Blocks:** Scale testing
**Test:** Load testing, cache hit rates

---

#### 5.3 Documentation
**Files:**
- `/docs/semantic-layers-guide.md` (voor developers)
- `/docs/admin-config-guide.md` (voor admins)
- `/docs/user-guide.md` (voor end users)

**Content:**
- How to add nieuwe semantic layer
- How to configure existing layers
- How to use guided wizard
- Troubleshooting

**Dependencies:** All features complete
**Blocks:** User training
**Test:** Technical review, user testing

---

### Fase 6: User Testing & Iteration (Week 6)

**Doel:** Validate met echte gebruikers

#### 6.1 Sales Team Beta Testing
- 5-10 sales users
- Give 3-5 concrete vragen om te beantwoorden
- Observe usage patterns
- Collect feedback

**Success criteria:**
- 80% kan query bouwen zonder hulp binnen 2 minuten
- 0% bouwt semantisch ongeldige query (should be impossible)
- 90% begrijpt resultaten

---

#### 6.2 Iteration Based on Feedback
- Adjust labels die verwarrend zijn
- Add missing tooltips
- Fix unintuitive flows
- Optimize slow queries

**Dependencies:** 6.1
**Blocks:** Production release
**Test:** Re-test met users na wijzigingen

---

### Implementatie Dependencies (Grafisch)

```
┌─────────────────────────────────────────────────────┐
│ FASE 0: PRE-IMPLEMENTATION                          │
│ ┌─────────────┐  ┌─────────────┐                    │
│ │ Schema      │  │ Executor    │                    │
│ │ Validation  │  │ Smoke Test  │                    │
│ └──────┬──────┘  └──────┬──────┘                    │
└────────┼─────────────────┼───────────────────────────┘
         │                 │
         └────────┬────────┘
                  │
┌─────────────────┼─────────────────────────────────┐
│ FASE 1: SEMANTIC FOUNDATION                       │
│           ┌─────▼─────┐                            │
│           │ 1.1 Layer │                            │
│           │ Definition│                            │
│           └─────┬─────┘                            │
│                 │                                  │
│         ┌───────┴───────┐                          │
│    ┌────▼────┐    ┌────▼────┐                     │
│    │1.2      │    │1.3      │                     │
│    │Validator│    │Translator│                    │
│    └────┬────┘    └────┬────┘                     │
└─────────┼──────────────┼────────────────────────┘
          │              │
          └──────┬───────┘
                 │
┌────────────────┼───────────────────────────────────┐
│ FASE 2: GUIDED UI                                  │
│           ┌────▼────┐                               │
│           │2.1 Laag1│                               │
│           └────┬────┘                               │
│                │                                    │
│           ┌────▼────┐                               │
│           │2.2 Laag2│                               │
│           └────┬────┘                               │
│                │                                    │
│           ┌────▼────┐                               │
│           │2.3 Laag3│                               │
│           └────┬────┘                               │
│                │                                    │
│           ┌────▼────┐                               │
│           │2.4      │                               │
│           │Wizard   │                               │
│           └────┬────┘                               │
└────────────────┼──────────────────────────────────┘
                 │
┌────────────────┼───────────────────────────────────┐
│ FASE 3: EXECUTION                                  │
│           ┌────▼────┐                               │
│           │3.1      │                               │
│           │Pipeline │                               │
│           └────┬────┘                               │
│                │                                    │
│         ┌──────┴──────┐                             │
│    ┌────▼────┐  ┌────▼────┐                        │
│    │3.2      │  │3.3      │                        │
│    │Describer│  │Compare  │                        │
│    └────┬────┘  └────┬────┘                        │
└─────────┼────────────┼──────────────────────────┘
          │            │
          └─────┬──────┘
                │
┌───────────────┼────────────────────────────────────┐
│ FASE 4: EVOLUTION & ADMIN                          │
│          ┌────▼────┐                                │
│          │4.1      │                                │
│          │Change   │                                │
│          │Detection│                                │
│          └────┬────┘                                │
│               │                                     │
│          ┌────▼────┐                                │
│          │4.2      │                                │
│          │Migration│                                │
│          └────┬────┘                                │
│               │                                     │
│          ┌────▼────┐                                │
│          │4.3 Admin│                                │
│          │Config UI│                                │
│          └────┬────┘                                │
└───────────────┼───────────────────────────────────┘
                │
┌───────────────┼────────────────────────────────────┐
│ FASE 5: POLISH                                     │
│          ┌────▼────┐                                │
│          │5.1 Error│                                │
│          │Handling │                                │
│          └────┬────┘                                │
│               │                                     │
│          ┌────▼────┐                                │
│          │5.2 Perf │                                │
│          │Optimize │                                │
│          └────┬────┘                                │
│               │                                     │
│          ┌────▼────┐                                │
│          │5.3 Docs │                                │
│          └────┬────┘                                │
└───────────────┼───────────────────────────────────┘
                │
┌───────────────▼────────────────────────────────────┐
│ FASE 6: USER TESTING                               │
│          ┌─────────┐                                │
│          │6.1 Beta │                                │
│          │Testing  │                                │
│          └────┬────┘                                │
│               │                                     │
│          ┌────▼────┐                                │
│          │6.2      │                                │
│          │Iteration│                                │
│          └────┬────┘                                │
└───────────────┼───────────────────────────────────┘
                │
          PRODUCTION READY
```

---

### Critical Path

**Minimale implementatie voor working prototype:**

```
0.1 Schema Validation
  → 1.1 Layer Definition
  → 1.3 Translator
  → 2.1 + 2.2 + 2.3 (Basic UI)
  → 2.4 Wizard
  → 3.1 Pipeline
  → Working Prototype (3 weeks minimum)
```

**Full production:**
All phases (6 weeks)

---

### Risk Mitigation

**Risico 1: Schema introspection faalt**
- Mitigation: Fase 0 smoke tests VOOR je begint bouwen
- Fallback: Hard-code schema voor MVP

**Risico 2: Performance van multi-pass queries**
- Mitigation: Benchmark in Fase 0
- Fallback: Cache aggressive, warn users upfront

**Risico 3: User confusion ondanks begeleiding**
- Mitigation: Beta testing in Fase 6
- Fallback: Add "Voorbeeld vragen" preset library

**Risico 4: Schema wijzigingen breken saved queries**
- Mitigation: Migration layer in Fase 4
- Fallback: Version saved queries, show compatibility warnings

---

## SLOT: VAN DESIGN NAAR CODE

### Wat Dit Document Oplevert

**Voor Developer:**
- Exacte semantic layer structuur (section A)
- 7 concrete query voorbeelden om mee te testen (section B)
- Volledige lijst van edge cases en blokkades (section C)
- Duidelijke grenzen tussen config en code (section D)
- Implementatievolgorde zonder giswerk (section E)

**Voor Product Owner:**
- Valideerbare acceptance criteria (B: query sjablonen)
- Expliciet wat NIET kan (C: blokkades)
- Beheersbare configuratie-opties (D: admin layer)
- Realistische planning (E: 6 weken)

**Voor Sales Manager (End User):**
- Niets. Hij ziet alleen een simpele wizard.
- Maar achter die wizard zit nu een volledig gespecificeerd systeem.

---

### Validation Checklist (Is Implementation Compleet?)

**Semantic Layer:**
- [ ] 6 layers defined in semantic-layers.js
- [ ] Alle mandatory fields configured
- [ ] Alle incompatibilities defined
- [ ] Validator blocks ongeldige combinaties

**Query Sjablonen:**
- [ ] Alle 7 sjablonen executeren zonder errors
- [ ] Resultaten matchen expected output format
- [ ] Performance binnen target (< 3s voor complexte)

**UI Wizard:**
- [ ] 3-staps flow werkt
- [ ] Disabled states correct
- [ ] Tooltips helpful
- [ ] Natural language descriptions accurate

**Admin Config:**
- [ ] Labels aanpasbaar
- [ ] Defaults instelbaar
- [ ] Locked properties niet wijzigbaar
- [ ] Changes reflecteren in user UI

**Production Hardening:**
- [ ] Error handling graceful
- [ ] Performance acceptable onder load
- [ ] Documentation compleet
- [ ] User testing passed (>80% success rate)

---

### Success Metrics (Post-Launch)

**Week 1-2:**
- 50% adoption door sales team
- < 5% support vragen over "hoe werkt dit"
- 0 semantisch ongeldige queries (impossible by design)

**Week 3-4:**
- 80% adoption
- 10+ saved queries in use
- Average query build time < 90 seconden

**Week 5-8:**
- 5+ new insights discovered
- Schema update zonder user impact
- Feature requests zijn configuratie, geen code changes

---

**IMPLEMENTATION SPECIFICATION COMPLETE**

**Ready for Development**

Dit document is de brug tussen conceptueel design en concrete code.  
Elke vraag van "hoe implementeer ik dit?" moet hier beantwoord zijn.

Als dat niet het geval is: dit document is incomplete.  
Als wel: start building.

---

*"Implementation zonder specificatie is gokken. Specificatie zonder implementatie is dromen. Dit document is neither."*
