# ADDENDUM: Iteration 8 Design - Modelverdieping en Correcties

**Date:** January 21, 2026  
**Type:** Conceptual Addendum  
**Relation to:** ITERATION_8_DESIGN.md (blijft volledig geldig als UX-filosofie)  
**Purpose:** Modelcorrectie, semantische precisering, blinde vlekken elimineren

---

## LEESWIJZER

Dit document is GEEN vervanging van ITERATION_8_DESIGN.  
Het is een **inhoudelijke correctie en verdieping** die:

1. Erkent dat het originele design uitgaat van een **verondersteld schema**
2. Corrigeert dit met het **werkelijke Odoo datamodel**
3. Aanscherpt welke UX-keuzes hierdoor **verplicht** worden
4. Bewijst dat het design hierdoor **sterker** wordt, niet zwakker

Het design blijft staan. De landing op het echte model wordt hier uitgewerkt.

---

## A. MODELBEGRIP — MIJN MENTALE KAART (GECORRIGEERD)

### Primaire as: x_sales_action_sheet

**Wat het is:**
Het centrale sales-artefact. Eén intake, één interpretatie, één salestraject.

**Waarom primair:**
- Alles draait hieromheen
- Alle semantiek loopt hierlangs
- Alle analyses vertrekken hier
- Geen ander object kan deze rol vervullen

**Wat het NIET is:**
- Geen CRM-record (dat is `crm.lead`)
- Geen gebouwdossier (dat is `res.partner`)
- Geen statistiekentiteit (dat is `x_estate_stats`)

Dit is het **narratieve object**. Een actieblad vertelt een verhaal. De rest geeft context.

---

### Semantische kern: Pain Points (CORRECTIE)

**Wat ik dacht:**
Een simpele many2many relatie naar `x_pain_point` met veld `name`.

**Wat het werkelijk is:**
Een **twee-lagig systeem**:

1. **x_user_painpoints** (canonieke lijst)
   - Primair: Definitie van het pain point
   - Bestaat los van actiebladen
   - Is een gecontroleerde vocabulaire
   - Bevat: ID, naam, mogelijk categorie

2. **x_action_sheet_pain_points** (koppeltabel met score)
   - Secundair: Contextopname binnen een actieblad
   - Relaties:
     - many2one naar `x_sales_action_sheet`
     - many2one naar `x_user_painpoints`
   - **Cruciaal veld:** score (0–5)
   - Dit is waar de **intensiteit** leeft

**Waarom dit zwaarder weegt:**

Dit is geen simpele tag. Dit is een **gescoord fenomeen**.

De vraag is niet: "Welke pijnpunten komen voor?"  
De vraag is: "Welke pijnpunten scoren hoog bij welk type actieblad?"

**Semantische implicatie:**
- Aggregaties moeten score meenemen (avg, sum, max)
- Filters moeten score-drempels kennen ("alleen ernstige pijnpunten")
- Vergelijkingen moeten intensiteit tonen ("gemiddelde score voor/na conversie")

**Mijn design-fout:**
Ik had dit als simpele lijst behandeld. Dat mist de kern.

**Correctie:**
Pain points zijn een **metric layer**, geen **tag layer**.

---

### Proces en tijd: Meetings vs Stages (CORRECTIE)

**Wat ik dacht:**
- Meetings: `x_meeting_action_sheet` als many2many
- Stages: `x_sales_stage` als many2one

**Wat het werkelijk is:**
- Meetings: `x_as_meetings` als **many2one** naar `x_sales_action_sheet`
- Stages: `x_support_stage` als many2one

**Waarom dit fundamenteel anders is:**

#### Meetings zijn gebeurtenissen
- Meervoudig (één actieblad, meerdere meetings)
- Getimed (datum, tijd, duur)
- Getypeerd (intake, follow-up, pitch, evaluatie)
- **Dit is de tijdsdimensie**

Meetings zijn **causaal**:
- Voor conversie / na conversie
- Eerste meeting / laatste meeting
- Frequentie, interval, momentum

#### Stages zijn toestanden
- Enkelvoudig (één actieblad, één huidige stage)
- Geordend (volgorde, fold-status)
- Proces-indicatief (funnel positie)
- **Dit is de statusindicatie**

Stages zijn **categorisch**:
- In welk stadium zit dit actieblad?
- Hoeveel actiebladen per stadium?
- Waar vallen ze uit? (drop-off analyse)

**Semantische implicatie:**

Je kunt niet "count meetings per stage" als één aggregatie.  
Dat zijn twee verschillende dimensies:
- Meetings → temporele analyse (evolutie, voor/na, trends)
- Stages → funnel analyse (verdeling, conversie, drop-off)

**Mijn design-fout:**
Ik had meetings en stages als equivalente "proces-lagen" gezien.  
Ze zijn complementair, niet inwisselbaar.

**Correctie:**
- **Laag "Procesverloop"** → moet splitsen in:
  - "Meeting-dynamiek" (temporeel)
  - "Fase-verdeling" (categorisch)

---

### Contextlaag: Gebouw en Estate Stats (NIEUWE INZICHT)

**Wat ik dacht:**
Eenvoudige relatie naar `x_building` met velden `building_type`, `total_floor_area`.

**Wat het werkelijk is:**

#### 1. Gebouw = res.partner
- Relatie: `x_studio_for_company_id` → `res.partner`
- Dit is **geen dedicated gebouwmodel**
- Het is een contactrecord dat **toevallig een VME representeert**

**Implicatie:**
- Veldnamen kunnen generiek zijn (`name`, `type`, custom x_studio_* velden)
- Schema kan per Odoo-installatie verschillen
- Moet via introspection ontdekt worden, niet hardcoded

#### 2. Estate Stats = x_estate_stats
- **Nieuw model** dat ik gemist had
- **Dubbele relatie:**
  - many2one naar `res.partner` (structurele link)
  - many2many naar `x_sales_action_sheet` (narratieve link)

**Wat dit betekent:**

Estate stats zijn **objectieve metriek** (vierkante meters, units, bouwjaar, energielabel, etc.)  
Ze horen bij een **gebouw** (res.partner), niet bij een **actieblad**.

Maar ze worden **narratief gekoppeld** aan actiebladen (many2many).

**Semantische impact:**

Dit is een **cross-referencing layer**.

Vraag: "Hoeveel actiebladen bij grote gebouwen?"  
→ Moet via `x_studio_for_company_id` naar `res.partner`, dan check estate stats

Vraag: "Gemiddelde gebouwgrootte bij gewonnen deals?"  
→ Moet via many2many naar estate stats, dan aggregeren

**Mijn design-fout:**
Ik had aangenomen dat gebouwkenmerken direct op het actieblad zaten.  
Ze zitten één (res.partner) of twee (x_estate_stats) stappen verder.

**Correctie:**
- "Gebouwkenmerken" moet **twee sub-lagen** krijgen:
  - "Basis (naam, type)" → via res.partner
  - "Technisch (m², units, energie)" → via estate stats

---

### Semantische labels: Tags (NIEUW)

**Wat ik gemist had:**
`x_sales_action_sheet_tag` als many2many.

**Wat het is:**
Lichte, vrije semantiek voor clustering en exploratie.

**Waarom dit minder zwaar weegt:**
- Geen harde businesslogica
- Geen gecontroleerde vocabulaire (zoals pain points)
- Geen scores of intensiteit
- **Gebruik:** ad-hoc segmentatie, exploratie, filtering

**Semantische positie:**
Dit hoort bij **"Laag 2: Context"** (filters), niet bij **"Laag 1: Wat wil je weten?"**

Tags zijn **optionele verfijning**, geen primaire analyse-as.

**Design-impact:**
Toevoegen aan contextfilters:
```
☐ Tags: [pilot-project] [high-priority] [follow-up-needed]
```

Maar **niet** als primaire informatielaag.

---

### Uitkomst: Leads (VALIDATIE)

**Wat ik had:**
Leads als administratieve koppeling.

**Wat het werkelijk is:**
`crm.lead` als **commerciële realiteit** die actiebladen valideert.

**Semantische rol:**

Leads zijn **uitkomst**, niet **input**.

Een actieblad **genereert** een lead (of niet).  
Een lead **valideert** een actieblad (won, lost, pending).

**Design-implicatie:**

Leads zijn de **ground truth voor conversie-analyse**.

- Voor/na conversie → filter op `lead_id exists`
- Won/lost reden → gebruik `crm.lead.won_reason / lost_reason`
- Omzet → gebruik `crm.lead.expected_revenue`

Maar leads sturen **geen** sales insights.  
Ze **bevestigen** wat actiebladen suggereren.

**Mijn design-correctie:**
Leads blijven contextfilter ("Met/zonder lead"), niet primaire as.

---

### Hiërarchie (gewicht van relaties)

**Zwaarste semantiek (primair):**
1. **Pain points met score** — dit is de inhoud
2. **Meetings met tijd** — dit is de evolutie
3. **Stages met volgorde** — dit is de status

**Middelzware semantiek (verrijking):**
4. **Estate stats** — objectieve context
5. **Gebouw (res.partner)** — basis context
6. **Leads** — commerciële validatie

**Lichte semantiek (exploratie):**
7. **Tags** — ad-hoc clustering

**Geforceerde hiërarchie:**

Je kunt niet "estate stats zonder actiebladen" analyseren → dat is BI.  
Je kunt niet "gebouwen zonder sales-context" bekijken → dat is CRM.  
Je kunt niet "leads zonder actiebladen" rapporteren → dat is sales reporting.

**Alles moet via x_sales_action_sheet.**

---

## B. IMPACT OP MIJN DESIGN

### Wat bevestigd wordt

✅ **x_sales_action_sheet als vast anker** — Correct en versterkt door modelstructuur

✅ **Semantische lagen ipv veld-selectie** — Nog relevanter nu blijkt dat relaties complex zijn

✅ **Automatische relatie-navigatie** — Absoluut noodzakelijk (res.partner → estate stats is niet triviaal)

✅ **Geen BI-tool filosofie** — Model dwingt sales-centrisch denken af

---

### Wat bijgestuurd moet worden

#### 1. Pain Points layer — Van tag naar metric

**Origineel design:**
```
"Pijnpunten & Obstakels"
→ relation: pain_point_ids
→ fields: [name, category]
→ aggregation: count
```

**Gecorrigeerd design:**
```
"Pijnpunten & Obstakels"
→ relation: x_action_sheet_pain_points
→ fields: [x_user_painpoints.name, score]
→ aggregations:
  - count (hoeveel actiebladen hebben dit pijnpunt?)
  - avg(score) (gemiddelde ernst)
  - sum(score) (totale impact)
  - max(score) (hoogste intensiteit)
→ filters:
  - score >= 3 (alleen significante pijnpunten)
  - score = 5 (kritieke pijnpunten)
```

**UX-impact:**

Gebruiker moet kunnen kiezen:
- "Meest voorkomende pijnpunten" (count)
- "Meest ernstige pijnpunten" (avg score)
- "Grootste impact pijnpunten" (sum score)

Dit zijn **drie verschillende vragen** over hetzelfde object.

**Nieuwe Laag 1 optie:**
```
● Pijnpunten & Obstakels
  ○ Meest voorkomend (count actiebladen)
  ○ Meest ernstig (gemiddelde score)
  ○ Grootste impact (totaal score × frequentie)
```

---

#### 2. Meetings layer — Van relatie naar tijdsreeks

**Origineel design:**
```
"Meetings & Interacties"
→ relation: meeting_ids
→ aggregation: count
```

**Gecorrigeerd design:**
```
"Meetings & Interacties"
→ relation: x_as_meetings (many2one, dus per actieblad)
→ fields: [x_date, x_meeting_type, x_duration]
→ temporele aggregaties:
  - count (aantal meetings)
  - first(x_date) (eerste contact)
  - last(x_date) (laatste contact)
  - date_diff(last, first) (tijdsspanne)
  - avg(interval) (frequentie)
→ causale filters:
  - vóór conversie (x_date < actieblad.x_converted_date)
  - na conversie (x_date > actieblad.x_converted_date)
```

**UX-impact:**

Meetings zijn **niet** simpelweg te tellen.  
Ze hebben **temporele betekenis**.

**Nieuwe Laag 3 optie voor meetings:**
```
Hoe wil je dit zien?
● Evolutie (eerste → laatste meeting)
● Frequentie (aantal meetings / tijdsspanne)
● Voor/na conversie (vergelijk meeting-gedrag)
● Type-verdeling (intake, pitch, follow-up)
```

---

#### 3. Gebouw layer — Van direct naar indirect

**Origineel design:**
```
"Gebouwkenmerken"
→ relation: building_id
→ fields: [building_type, total_floor_area]
```

**Gecorrigeerd design:**
```
"Gebouw & VME Context"
→ Basis:
  - relation: x_studio_for_company_id → res.partner
  - fields: [name, customer_type, ...via introspection...]
→ Technisch:
  - relation: x_studio_for_company_id → res.partner → x_estate_stats (many2many terugverwijzing)
  - fields: [total_area, num_units, construction_year, energy_label]
```

**Probleem:**

Dit is een **twee-staps relatie** met een **many2many teruglink**.

Odoo kan dit niet in één `read_group`.  
Dit vereist **multi-pass execution**.

**UX-implicatie:**

Gebruiker moet **niet** weten dat estate stats ingewikkeld zijn.  
Maar het systeem **moet** automatisch multi-pass triggeren.

**Design-eis:**
```javascript
// Automatische detectie in semantic-translator.js
if (selectedLayer === 'building_characteristics' && includesEstateStats) {
  query.execution_hint = 'multi_pass'; // Force multi-pass
  query.complexity_warning = true; // Warn user dit kan 2-3s duren
}
```

**Nieuwe Laag 1 sub-opties:**
```
"Gebouw & VME Context"
  ○ Type & locatie (direct via res.partner)
  ○ Technische specs (via estate stats, langzamer)
```

---

#### 4. Nieuwe layer: Tags (Toevoegen)

**Was niet in origineel design.**

**Nieuw in Laag 2 (Context filters):**
```
Tags (optioneel):
☐ pilot-project
☐ high-priority
☐ follow-up-needed
☐ complex-case
```

**Gebruik:**
Lichte, ad-hoc filtering.  
Geen primaire analyse-as.

---

#### 5. Stage vs Meeting scheiding (Scherpen)

**Origineel design:**
Eén "Procesverloop" laag met gemengde logica.

**Gecorrigeerd design:**

**Laag 1A: "Fase-verdeling" (categorisch)**
```
→ relation: x_support_stage
→ fields: [name, sequence, fold]
→ aggregatie: count per stage
→ gebruik: funnel analyse, drop-off detectie
```

**Laag 1B: "Meeting-evolutie" (temporeel)**
```
→ relation: x_as_meetings
→ fields: [x_date, x_meeting_type]
→ aggregatie: tijdsreeks, voor/na, frequentie
→ gebruik: momentum, touchpoint analyse
```

**UX-impact:**

Deze mogen **niet gemengd** worden in één query.  
Gebruiker moet kiezen:
- "Wil je de **status-verdeling** zien?" (stages)
- "Wil je de **tijdslijn** zien?" (meetings)

**Nieuwe Laag 1 opties:**
```
○ Fase-verdeling (hoeveel in welk stadium?)
○ Meeting-evolutie (hoe ontwikkelt contact zich?)
```

---

### Welke UX-keuzes hierdoor verplicht worden

#### Verplichting 1: Score-bewuste aggregaties voor pain points

**Waarom verplicht:**  
Pain points zonder score zijn zinloos.

**UX-enforcement:**
```javascript
if (selectedLayer === 'pain_points') {
  // Forceer score-field altijd mee
  query.fields.push('x_action_sheet_pain_points.score');
  
  // Default aggregatie wordt score-aware
  if (!userSelectedAggregation) {
    query.aggregation = {
      field: 'x_action_sheet_pain_points.score',
      function: 'avg',
      group_by: 'x_user_painpoints.name'
    };
  }
}
```

**UI-tonen:**
```
"Pijnpunten & Obstakels"

Hoe meten?
● Gemiddelde ernst (score 0-5)
○ Aantal keer genoemd
○ Totale impact (freq × ernst)
```

User **kan niet** pain points zonder score-dimensie analyseren.

---

#### Verplichting 2: Temporele context voor meetings

**Waarom verplicht:**  
Meetings zonder tijd zijn nutteloos.

**UX-enforcement:**
```javascript
if (selectedLayer === 'meetings') {
  // Forceer datum-veld
  query.fields.push('x_as_meetings.x_date');
  
  // Suggesties worden temporeel
  query.suggestions = [
    'Eerste vs laatste meeting (evolution)',
    'Voor vs na conversie (causal)',
    'Frequentie over tijd (momentum)'
  ];
}
```

**UI-tonen:**
```
"Meeting-evolutie"

Welk aspect?
● Frequentie (hoe vaak?)
● Timing (wanneer eerste/laatste?)
● Voor/na conversie (causaliteit)
○ Type verdeling (intake, pitch, etc.)
```

User **kan niet** meetings zonder temporele dimensie analyseren.

---

#### Verplichting 3: Multi-pass waarschuwing voor estate stats

**Waarom verplicht:**  
Estate stats vereisen ingewikkelde relatie-navigatie.

**UX-enforcement:**
```javascript
if (selectedLayer === 'building_characteristics' && subLayer === 'technical_specs') {
  // Waarschuw gebruiker
  query.performance_warning = {
    message: "Technische gebouwdata vereist uitgebreide analyse (2-3 seconden)",
    reason: "Estate statistics zijn niet direct gekoppeld aan actiebladen",
    suggestion: "Start met 'Type & locatie' voor snellere resultaten"
  };
  
  // Forceer execution path
  query.execution_hint = 'multi_pass';
}
```

**UI-tonen:**
```
"Gebouw & VME Context"

Welke informatie?
● Type & locatie (snel, ±0.5s)
○ Technische specs (uitgebreid, ±2-3s) ⚠️

[i] Technische specs vereisen extra verwerkingstijd
    omdat ze via meerdere relaties opgehaald worden.
```

User **wordt gewaarschuwd** maar niet geblokkeerd.

---

#### Verplichting 4: Stage-meeting scheiding

**Waarom verplicht:**  
Dit zijn twee verschillende analyse-types.

**UX-enforcement:**
```javascript
if (selectedLayer === 'stage_distribution' && userTriesToAddMeetingFields) {
  // Block invalid combinatie
  ui.showError({
    message: "Fase-verdeling en meeting-evolutie kunnen niet gecombineerd worden",
    explanation: "Stages zijn categorisch (status), meetings zijn temporeel (gebeurtenissen)",
    suggestion: "Maak twee aparte queries of gebruik 'Advanced Mode'"
  });
}
```

**UI-tonen:**
```
Je hebt "Fase-verdeling" geselecteerd.

⚠️ Let op: Je kunt hierbij geen meeting-gegevens toevoegen.
   Meetings zijn temporele gebeurtenissen, stages zijn statussen.
   
   Wil je beide analyseren?
   → Maak twee queries en vergelijk de resultaten
```

User **kan niet** invalide combinaties maken.

---

## C. GEFORCEERDE SEMANTIEK IN DE QUERY BUILDER

### Principe: Semantic Constraints via Layer Design

**Niet meer toestaan:**
- Vrij model kiezen
- Vrij velden selecteren
- Vrij relaties volgen

**Wel toestaan:**
- Semantische laag kiezen (pain points, meetings, stages, gebouw)
- Context verfijnen (filters op betekenisvolle dimensies)
- Presentatie kiezen (groepering, trend, vergelijking)

**Enforcement mechanisme:**

```javascript
// Semantic layer definitie met constraints
const semanticLayers = {
  'pain_points': {
    // Schema mapping (technisch)
    base_model: 'x_sales_action_sheet',
    relation: 'x_action_sheet_pain_points',
    target_model: 'x_user_painpoints',
    
    // Mandatory fields (semantisch verplicht)
    mandatory_fields: ['score'], // Zonder score is pain point zinloos
    
    // Incompatible layers (semantische uitsluiting)
    incompatible_with: ['stage_distribution'], // Categorisch vs metric
    
    // Suggested aggregations (begeleide keuzes)
    default_aggregations: [
      { label: 'Gemiddelde ernst', field: 'score', function: 'avg' },
      { label: 'Aantal actiebladen', field: 'id', function: 'count' },
      { label: 'Totale impact', field: 'score', function: 'sum' }
    ],
    
    // Performance hints (automatische optimalisatie)
    execution_hint: 'read_group', // Pain points zijn aggregeerbaar
    
    // Validation rules (semantische correctheid)
    validate: (query) => {
      if (!query.fields.includes('score')) {
        return { valid: false, error: 'Pain points vereisen score-veld' };
      }
      if (query.aggregation && !query.aggregation.group_by) {
        return { valid: false, error: 'Pain point aggregaties vereisen groepering' };
      }
      return { valid: true };
    }
  },
  
  'meetings': {
    base_model: 'x_sales_action_sheet',
    relation: 'x_as_meetings',
    
    // Temporele verplichting
    mandatory_fields: ['x_date'],
    temporal: true, // Markeert dit als tijdsreeks
    
    // Incompatibel met categorische analyses
    incompatible_with: ['stage_distribution', 'tag_clustering'],
    
    // Temporele aggregaties
    default_aggregations: [
      { label: 'Aantal meetings', field: 'id', function: 'count' },
      { label: 'Eerste contact', field: 'x_date', function: 'min' },
      { label: 'Laatste contact', field: 'x_date', function: 'max' },
      { label: 'Tijdsspanne', field: 'x_date', function: 'date_diff' }
    ],
    
    // Causale filters (voor/na conversie)
    contextual_filters: [
      { 
        label: 'Vóór conversie', 
        filter: (actionSheet) => `x_date < ${actionSheet.x_converted_date}` 
      },
      { 
        label: 'Na conversie', 
        filter: (actionSheet) => `x_date > ${actionSheet.x_converted_date}` 
      }
    ],
    
    execution_hint: 'multi_pass', // Meetings vereisen temporele analyse
    
    validate: (query) => {
      if (!query.fields.includes('x_date')) {
        return { valid: false, error: 'Meeting analyses vereisen datum-veld' };
      }
      if (query.aggregation && !query.aggregation.temporal_aware) {
        return { valid: false, error: 'Meeting aggregaties moeten temporeel zijn' };
      }
      return { valid: true };
    }
  },
  
  'stage_distribution': {
    base_model: 'x_sales_action_sheet',
    relation: 'x_support_stage',
    
    // Categorische analyse
    categorical: true,
    mandatory_fields: ['name', 'sequence'],
    
    // Incompatibel met temporele analyses
    incompatible_with: ['meetings', 'trend_analysis'],
    
    // Funnel-specifieke aggregaties
    default_aggregations: [
      { label: 'Aantal per fase', field: 'id', function: 'count', group_by: 'x_support_stage.name' },
      { label: 'Conversie %', field: 'id', function: 'conversion_rate', by_stage: true },
      { label: 'Drop-off analyse', field: 'id', function: 'drop_off', sequential: true }
    ],
    
    execution_hint: 'read_group', // Stages zijn categorisch aggregeerbaar
    
    validate: (query) => {
      if (query.temporal_filters) {
        return { valid: false, error: 'Stage verdeling is categorisch, geen temporele filters' };
      }
      return { valid: true };
    }
  }
};
```

---

### Voorbeeld 1: Pain Points zonder Score (BLOCKED)

**User intent:**
"Toon alle pijnpunten"

**User actie:**
```
Laag 1: Selecteert "Pijnpunten & Obstakels"
Laag 3: Selecteert "Lijst (geen aggregatie)"
```

**System response:**
```javascript
// Validation in semantic-translator.js
const layer = semanticLayers.pain_points;
const userQuery = { layer: 'pain_points', aggregation: null };

const validation = layer.validate(userQuery);
// { valid: false, error: 'Pain point aggregaties vereisen groepering' }

// UI toont:
ui.showError({
  title: "Ongeldige combinatie",
  message: "Pijnpunten kunnen niet zonder aggregatie getoond worden",
  explanation: "Pijnpunten bestaan alleen in de context van actiebladen en hebben een score. Je moet kiezen hoe je ze wilt samenvatten.",
  suggestions: [
    "Groepeer per pijnpunt (meest voorkomend)",
    "Gemiddelde ernst per pijnpunt",
    "Totale impact per pijnpunt"
  ]
});
```

**User wordt geforceerd:**
Moet een aggregatie kiezen. Kan geen "lijst van alle pain points" maken.

**Waarom dit correct is:**
Een pain point zonder actieblad-context is betekenisloos.  
Een pain point zonder score is een lege huls.

---

### Voorbeeld 2: Meetings + Stages (BLOCKED)

**User intent:**
"Toon meetings per fase"

**User actie:**
```
Laag 1: Selecteert "Meeting-evolutie"
Laag 2: Voegt filter toe "Status: Gewonnen"
Laag 3: Selecteert "Groepeer per fase"
```

**System response:**
```javascript
// Incompatibility check
const meetingsLayer = semanticLayers.meetings;
const userWantsGroupBy = 'x_support_stage.name';

if (meetingsLayer.incompatible_with.includes('stage_distribution')) {
  ui.showWarning({
    title: "Incompatibele dimensies",
    message: "Meeting-evolutie (temporeel) kan niet gegroepeerd worden per fase (categorisch)",
    explanation: `Meetings zijn gebeurtenissen met tijd en volgorde.
                  Stages zijn statussen zonder temporele betekenis.
                  
                  Je kunt wel:
                  - Meetings analyseren binnen één fase (filter)
                  - Stages analyseren onafhankelijk (aparte query)
                  - Voor/na conversie vergelijken (temporele split)`,
    suggestions: [
      "Filter op fase 'Gewonnen' en analyseer meeting-frequentie",
      "Maak twee queries: één voor meetings, één voor stages",
      "Gebruik 'Voor/na conversie' voor temporele vergelijking"
    ]
  });
}
```

**User wordt geforceerd:**
Kan niet mixen. Moet kiezen: temporeel OF categorisch.

**Waarom dit correct is:**
Meetings en stages zijn orthogonale dimensies.  
Je kunt ze filteren op elkaar, niet groeperen.

---

### Voorbeeld 3: Estate Stats zonder Waarschuwing (WARNED)

**User intent:**
"Toon actiebladen per gebouwgrootte"

**User actie:**
```
Laag 1: Selecteert "Gebouw & VME Context"
Sub-laag: Selecteert "Technische specs (m², units)"
Laag 3: Selecteert "Groepeer per groottecategorie"
```

**System response:**
```javascript
// Performance warning trigger
const estateStatsLayer = semanticLayers.building_characteristics;
if (userQuery.subLayer === 'technical_specs') {
  ui.showInfo({
    type: 'performance',
    message: "Deze analyse vereist extra verwerkingstijd (2-3 seconden)",
    explanation: `Technische gebouwdata (estate stats) zijn niet direct
                  gekoppeld aan actiebladen. Het systeem moet:
                  
                  1. Actiebladen ophalen
                  2. Gebouwen (res.partner) ophalen via x_studio_for_company_id
                  3. Estate stats ophalen via many2many terugverwijzing
                  4. Resultaten combineren
                  
                  Dit is een multi-pass query.`,
    actions: [
      { label: 'Begrijp ik, ga door', action: 'proceed' },
      { label: 'Gebruik snellere "Type & locatie" ipv', action: 'switchToBasic' }
    ]
  });
  
  // Als user doorgaat:
  query.execution_hint = 'multi_pass';
  query.estimated_duration = '2-3s';
}
```

**User wordt NIET geblokkeerd, maar wel geïnformeerd.**

**Waarom dit correct is:**
Estate stats zijn semantisch geldig.  
Ze zijn alleen technisch complex.  
Gebruiker mag kiezen: snelheid of detail.

---

### Voorbeeld 4: Tags als primaire as (BLOCKED)

**User intent:**
"Analyseer tags"

**User actie:**
```
Probeert "Tags" te selecteren als Laag 1 (primaire informatie)
```

**System response:**
```javascript
// Tags zijn geen primaire laag
const tagsLayer = semanticLayers.tags;
if (tagsLayer.layer_type !== 'primary') {
  ui.showInfo({
    title: "Tags zijn contextfilters, geen primaire analyse",
    message: "Tags kunnen gebruikt worden om actiebladen te filteren, maar zijn geen primaire informatie-laag",
    explanation: `Tags zijn lichte, ad-hoc labels zonder harde semantiek.
                  
                  Ze zijn nuttig voor:
                  - Filteren ("alleen pilot-projecten")
                  - Exploreren ("actiebladen met tag X")
                  
                  Maar niet voor:
                  - Primaire analyse ("verdeling per tag")
                  - Aggregaties ("gemiddelde per tag")`,
    suggestion: "Kies eerst een primaire laag (Pain Points, Meetings, Stages, Gebouw), en gebruik tags als filter in Laag 2"
  });
}
```

**User wordt geforceerd:**
Tags alleen als filter, nooit als primaire as.

**Waarom dit correct is:**
Tags hebben geen intrinsieke semantiek.  
Ze zijn labels, geen data.

---

### Enforcement Matrix (Samengevat)

| Combinatie | Toegestaan? | Enforcement | Reden |
|------------|-------------|-------------|-------|
| Pain Points zonder score | ❌ | BLOCK | Score is kern van semantiek |
| Pain Points zonder groepering | ❌ | BLOCK | Lijst is zinloos zonder context |
| Meetings zonder datum | ❌ | BLOCK | Temporele dimensie is verplicht |
| Meetings + Stages groepering | ❌ | BLOCK | Temporeel vs categorisch conflict |
| Stages zonder sequence | ⚠️ | WARN | Funnel volgorde ontbreekt |
| Estate Stats (complex) | ✅ | WARN | Performance impact, niet semantisch fout |
| Tags als primair | ❌ | BLOCK | Tags zijn context, geen content |
| Leads zonder actiebladen | ❌ | BLOCK | Leads zijn uitkomst, niet input |
| Gebouw zonder actiebladen | ❌ | BLOCK | Context zonder narratief is CRM, niet insight |

---

## D. TERUGKOPPELING NAAR DE ORIGINELE VRAAG

### De vraag

> Stuurt dit gecombineerde model + design daadwerkelijk naar een model-bewuste, intent-gedreven sales insight query builder, of blijft er risico op een verkapte BI-tool?

---

### Het antwoord: JA, dit is GEEN BI-tool

**Waarom ik dit met zekerheid kan zeggen:**

#### 1. Het model dwingt sales-centrisme af

**BI-tool:**
- User kiest vrij model (gebouw, contact, lead, actieblad, whatever)
- User bouwt vrije joins
- User aggregeert wat hij wil

**Resultaat:** Ongeldige vragen zoals:
- "Hoeveel gebouwen hebben we?" (administratie, geen sales)
- "Gemiddeld aantal contacts per gebruiker" (CRM, geen insight)
- "Leads zonder actieblad" (commercie zonder sales-context)

**Dit design:**
- User MOET starten bij actieblad
- User MOET kiezen uit semantische lagen
- User MOET aggregeren via voorgedefinieerde patronen

**Resultaat:** Alleen geldige vragen zoals:
- "Welke pijnpunten (met score) komen voor bij actiebladen?"
- "Hoeveel meetings (met tijd) leiden tot conversie?"
- "Welke gebouwen (met context) hebben meerdere actiebladen?"

**Het model maakt BI onmogelijk.**  
Er is geen "vrije toegang tot data".  
Alles loopt via de narratieve as: x_sales_action_sheet.

---

#### 2. Semantische constraints zijn niet optioneel

**BI-tool:**
- Validatie is technisch (data types, NULL values, foreign keys)
- Semantiek is aan de user

**Dit design:**
- Validatie is semantisch (score verplicht bij pain points, datum bij meetings)
- Techniek is verborgen

**Voorbeeld:**

Een BI-tool laat je dit bouwen:
```sql
SELECT pain_point.name, COUNT(*)
FROM x_action_sheet_pain_points
GROUP BY pain_point.name
```

Technisch correct. Semantisch zinloos (score ontbreekt).

Dit design laat je dit NIET bouwen.  
Het forceert:
```sql
SELECT 
  pain_point.name,
  COUNT(*) as frequency,
  AVG(score) as avg_severity,
  SUM(score) as total_impact
FROM x_action_sheet_pain_points
GROUP BY pain_point.name
```

**Je kunt niet om semantiek heen.**

---

#### 3. Het model heeft geen "algemene BI-paden"

**BI-tool risicozone:**
Modellen met directe, generieke relaties zoals:
- User → Orders → Products (e-commerce BI)
- Patient → Visits → Diagnoses (healthcare BI)
- Student → Courses → Grades (education BI)

**Waarom dit BI wordt:**
De relaties zijn **symmetrisch**.  
Je kunt zowel "products per user" als "users per product" analyseren.  
Beide zijn geldig.

**Dit model:**
- x_sales_action_sheet → pain points (asymmetrisch)
  - Geldig: "Pain points per actieblad"
  - Ongeldig: "Actiebladen per pain point" (wat is de vraag?)
  
- x_sales_action_sheet → meetings (asymmetrisch)
  - Geldig: "Meetings binnen actieblad-context"
  - Ongeldig: "Actiebladen gegroepeerd per meeting-type" (semantisch verward)

- x_sales_action_sheet → res.partner (asymmetrisch)
  - Geldig: "Actiebladen per gebouwtype"
  - Ongeldig: "Gebouwen met hun actieblad-statistiek" (dat is CRM)

**Het model heeft GEEN symmetrische paden.**  
Alles wijst naar actieblad als root.  
Je kunt niet "omdraaien".

---

#### 4. Complexiteit dient semantiek, niet flexibiliteit

**BI-tool filosofie:**
Meer features → Meer kracht → Meer flexibiliteit

**Dit design filosofie:**
Meer constraints → Meer begeleiding → Meer correctheid

**Voorbeelden:**

**BI-tool:**
- Feature: "Custom SQL mode"
- Doel: Flexibiliteit
- Risico: User schrijft `SELECT * FROM x_user_painpoints` (zinloos)

**Dit design:**
- Feature: "Pain point score-drempel filter"
- Doel: Semantische precisie
- Garantie: User kan alleen "score >= 3" filteren (betekenisvol)

**BI-tool:**
- Feature: "Calculated fields"
- Doel: User kan eigen metrics maken
- Risico: User maakt `COUNT(meetings) / COUNT(pain_points)` (onzinnig, verschillende dimensies)

**Dit design:**
- Feature: "Meeting frequentie berekening"
- Doel: Voorgedefinieerde, semantisch geldige metric
- Garantie: Systeem berekent `COUNT(meetings) / DATE_DIFF(last, first)` (frequentie per dag)

**Elke feature versterkt semantiek, niet flexibiliteit.**

---

#### 5. De "escape hatch" test

**Echte test of iets BI is:**
Heeft het een "advanced mode" of "raw SQL" optie?

**Als JA:**
Het is BI met een beginner-laag.  
Uiteindelijk krijg je toch vrije toegang.

**Als NEE:**
Het is een domain-specific tool.  
Er is geen "expert bypass".

**Dit design:**

Er is **GEEN** advanced mode waarin je:
- Vrij modellen kiest
- Eigen joins schrijft
- Custom aggregaties maakt

**Er is WEL:**
- Semantic layer configuratie (admin taak)
- Schema evolution (automatisch)
- Query export (naar externe BI, indien gewenst)

**Maar de query builder zelf:**
Blijft semantisch gelimiteerd.  
Voor altijd.

**Dit is by design.**

Als je "vrije BI" wilt:
- Export de data naar JSON/CSV
- Gebruik Tableau, Power BI, of SQL
- Maar BINNEN dit systeem: semantische constraints blijven.

---

### Wat er NIET ontbreekt

**BI-features die bewust NIET gebouwd worden:**

❌ **Dashboards** — Dit is query building, geen KPI-monitoring  
❌ **Visualisaties** — Export naar BI-tool die dit wel kan  
❌ **Scheduling** — Out of scope (kan later)  
❌ **Alerts** — Out of scope (kan later)  
❌ **Collaboration** — Query sharing is genoeg  
❌ **Custom metrics** — Semantische lagen zijn fixed  
❌ **SQL mode** — Never  
❌ **Model choice** — Never  

**Deze ontbreken niet per ongeluk.**  
Ze ontbreken **opzettelijk** om BI-creep te voorkomen.

---

### Wat er WEL nog kan ontbreken

**Semantische features die het design versterken:**

1. **Preset library per use-case**
   - "Conversie-analyse starters"
   - "Pijnpunt-prioritisatie templates"
   - "Gebouw-segmentatie voorbeelden"

2. **Guided query wizard**
   - "Ik wil weten waarom deals falen"
   - → Systeem suggereert: Pain points (high score) + Stage (lost) + Meetings (frequency)

3. **Insight suggestions**
   - "Je analyseert pijnpunten bij grote VME's. Wist je dat kleine VME's 2× hogere scores hebben?"

4. **Semantic query history**
   - Niet "je laatste 10 queries"
   - Maar "je meest gestelde vraag-types" met patterns

5. **Context-aware defaults**
   - Als user vaak "Gewonnen deals" filtert → maak dat default
   - Als user vaak "Dit kwartaal" gebruikt → onthoud dat

**Deze zijn NIET BI.**  
Deze zijn **sales intelligence assistentie**.

---

### Conclusie: Dit is een Domain-Specific Tool, geen BI

**Bewijs:**

1. ✅ Model dwingt sales-centrisme af (x_sales_action_sheet als enige root)
2. ✅ Semantische constraints zijn hard-coded (geen escape)
3. ✅ Asymmetrische relaties (geen vrije navigatie)
4. ✅ Features dienen semantiek, niet flexibiliteit
5. ✅ Geen advanced mode / SQL escape
6. ✅ Complexiteit komt van domein, niet van BI-ambities

**Risico's:**

⚠️ **Feature creep** — Als we later dashboards toevoegen, kan het afglijden  
⚠️ **User pressure** — "Kan ik niet gewoon een lijst van gebouwen zien?"  
⚠️ **Schema evolution** — Als er generieke modellen bijkomen, kan symmetrie ontstaan

**Mitigatie:**

🛡️ **Hard constraint:** x_sales_action_sheet blijft mandatory root  
🛡️ **No custom SQL:** Nooit toevoegen, zelfs niet voor admins  
🛡️ **Semantic governance:** Nieuwe layers moeten semantisch review passeren  

---

## SLOT: WAT DIT ADDENDUM TOEVOEGT

### Aan het originele design

**ITERATION_8_DESIGN was:**
- UX-filosofie: Semantische lagen ipv BI-velden ✅
- Architectuur: 3-staps wizard ✅
- Principes: Domain-aware, niet generiek ✅

**Dit addendum voegt toe:**
- **Modelcorrectie:** Exacte velden, relaties, tabel-namen
- **Semantische verplichtingen:** Score bij pain points, datum bij meetings
- **Enforcement mechanisme:** Hoe invalid combinaties geblokkeerd worden
- **Bewijs:** Waarom dit GEEN BI-tool kan worden

### Voor implementatie

**Wat nu duidelijk is:**

1. Semantic layer definitie moet **constraints** bevatten:
   - `mandatory_fields`
   - `incompatible_with`
   - `execution_hint`
   - `validate()` functie

2. UI moet **blokkeren**, niet waarschuwen:
   - Pain points zonder score → ERROR, niet WARNING
   - Meetings zonder datum → BLOCK, niet SUGGEST
   - Tags als primair → IMPOSSIBLE, niet DISCOURAGED

3. Relatie-navigatie moet **automatisch** en **verborgen**:
   - User ziet "Gebouw technische specs"
   - Systeem doet `x_studio_for_company_id → res.partner → x_estate_stats`
   - User merkt niets van multi-pass complexity

4. Schema evolution moet **semantic validation** triggeren:
   - Nieuw veld → check of het bij bestaande layer past
   - Nieuw model → check of het sales-relevant is
   - Veld verdwijnt → check of semantic layer breekt

---

**Addendum complete.**  
**Originele design blijft geldig.**  
**Landing op echt model is nu scherp.**  
**BI-risico is bewezen afwezig.**

---

## UPDATE: SEMANTIC WIZARD HARD SIMPLIFICATION

**Date:** January 22, 2026  
**Type:** Critical Correction - Emergency Simplification  
**Trigger:** 400 Bad Request errors due to malformed semantic payloads

### PROBLEM STATEMENT

The semantic wizard was causing 400 Bad Request errors because it:
- Asked too many questions
- Inferred structure automatically
- Sent partially-guessed semantics
- Hallucinated field names and joins
- Auto-completed semantic objects without user input

**Root cause:** The wizard was TOO intelligent. It tried to help by filling in gaps, which violated the semantic contract.

### HARD REQUIREMENTS (Non-Negotiable)

The wizard must:
1. ❌ **STOP all inference and hallucination**
2. ❌ **STOP auto-completing fields**
3. ❌ **STOP inventing joins**
4. ✅ **ONLY send what user explicitly selected**
5. ✅ **Display payload BEFORE execution**
6. ✅ **Let validator fail if something is missing**

### NEW FLOW (Exactly This)

#### STEP 1 — WHAT TO FETCH

**Always included:**
- `x_sales_action_sheet` (base model)

**Explicit yes/no toggles:**
- ☐ Include Pain Points (adds: `x_action_sheet_pain_points`, `x_user_painpoints`)
- ☐ Include res.partner (adds: `partner_id`)
- ☐ Include crm.lead (adds: `x_lead_id`)

**Rules:**
- No defaults
- No implicit joins
- If toggle = false → nothing related to that model exists in the query
- This step defines ONLY: selected entities and explicit joins

#### STEP 2 — TIME CONTEXT ONLY

**Single filter:**
- `x_sales_action_sheet.create_date`
- From date / To date

**Rules:**
- No other filters
- No phases
- No grouping
- No aggregation
- This step defines ONLY: WHERE clause on create_date

#### STEP 3 — DOES NOT EXIST

Removed completely. No third step. No presentation modes. No grouping logic.

### PAYLOAD STRUCTURE (Minimal & Deterministic)

```javascript
{
  base_model: 'x_sales_action_sheet',
  fields: ['id', 'x_name', 'create_date'],  // Always
  filters: [
    // Only if time filter provided:
    { field: 'create_date', operator: '>=', value: '2026-01-01' },
    { field: 'create_date', operator: '<=', value: '2026-01-31' }
  ]
  // Additional fields ONLY if explicitly toggled:
  // - If pain_points: ['x_action_sheet_pain_points', 'x_user_painpoints']
  // - If res_partner: ['partner_id']
  // - If crm_lead: ['x_lead_id']
}
```

### PAYLOAD VISIBILITY (Mandatory)

**Before calling `/semantic/run`:**
1. Log to console: `console.log('📦 PAYLOAD TO BE SENT:', JSON.stringify(payload, null, 2))`
2. Display on page in a card:
   ```html
   <div class="card bg-base-200">
     <div class="card-body">
       <h3>📦 Query Payload</h3>
       <pre><code>{ JSON payload }</code></pre>
     </div>
   </div>
   ```

**This allows user to verify:** "Yes, that is exactly what I asked for"

### IMPLEMENTATION CHANGES

**File:** `public/semantic-wizard.js`
- Removed: All semantic layer definitions (pain_points, meeting_evolution, stage_distribution, etc.)
- Removed: All context filters (building_size, stage_type, time_period, owner, etc.)
- Removed: All presentation modes (group_by, compare, trend, top_bottom, summarize)
- Removed: 3-step wizard (renderLayer1, renderLayer2, renderLayer3)
- Simplified: WizardState to only track: includes + timeFilter
- Added: buildPayload() - minimal, explicit, no inference
- Added: Payload display before execution
- Reduced: From ~738 lines to ~500 lines (32% reduction)

**File:** `src/modules/sales-insight-explorer/ui.js`
- Added: `<div id="payload-display">` element for payload visibility

### SUCCESS CONDITION

This is successful when:
1. ✅ `/semantic/run` no longer returns 400
2. ✅ The payload is understandable by a human
3. ✅ The user can say: "yes, that is exactly what I asked for"
4. ✅ No intelligence is added beyond user choice

### WHAT THIS MEANS FOR ITERATION 8

The original ITERATION_8_DESIGN.md vision of "semantic layers" was:
- **Conceptually correct** — Domain-specific abstraction is the right approach
- **Prematurely complex** — Cannot be built until semantic validator is proven
- **Architecturally sound** — Pain points, meetings, stages ARE the right layers

**New reality:**
1. Build simplest possible wizard first (2 steps, explicit toggles)
2. Prove semantic validator accepts minimal payloads
3. Test with real data, real queries
4. THEN add semantic intelligence layer-by-layer
5. Each layer must pass validation before next layer

**This is not failure. This is PROPER ENGINEERING.**

Start simple. Prove correctness. Add intelligence incrementally.

---

*"A domain-specific tool disguised as a query builder is still a domain-specific tool."*
