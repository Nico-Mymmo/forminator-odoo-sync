# Sales Insight Explorer — Modellen & Properties Overzicht

> Gegenereerd op basis van live Odoo-analyse (juni 2026).  
> Gebruik dit document als startpunt voor verdere tweaking van categorieën en properties.

---

## Correcties t.o.v. vorige config

De vorige `semantic-layers.js` en `context-filters.js` bevatten meerdere **verkeerde veldnamen** die in Odoo niet bestaan:

| Oud (fout) | Nieuw (correct) | Reden |
|---|---|---|
| `x_as_meetings.x_date` | `x_studio_date` | Studio-prefix verplicht |
| `x_as_meetings.x_meeting_type` | `x_studio_meeting_type` | idem |
| `x_support_stage.name` | `x_name` | Custom model |
| `x_support_stage.sequence` | `x_studio_sequence` | Studio-prefix |
| `x_support_stage.fold` | `x_studio_fold` | idem |
| `x_support_stage.x_stage_type` | **VERWIJDERD** | Bestaat niet |
| `x_action_sheet_pain_points.score` | `x_studio_score` | Studio-prefix |
| `x_action_sheet_pain_points` (model) | `x_action_sheet_pain_po` | Technische naam |
| `x_user_painpoints.name` | `x_name` | Custom model |
| `x_estate_stats.total_area` | **VERWIJDERD** | Bestaat niet |
| `x_estate_stats.num_units` | **VERWIJDERD** | Bestaat niet |
| `x_estate_stats.construction_year` | **VERWIJDERD** | Bestaat niet |
| `lead_id` (op actieblad) | `x_studio_as_opportunity_ids` | Directe many2many |
| `owner_id` | `x_studio_user_id` | Veldnaam op actieblad |

---

## Startmodel: `x_sales_action_sheet` (Actiebladen)

### Altijd opgehaalde basisvelden (lean)
```
id, x_name, create_date, x_active
x_studio_stage_id     → [id, x_name, x_studio_sequence]
x_studio_for_company_id → [id, name]
x_studio_user_id      → [id, name]
```

---

### Categorie: Discovery & Inzichten
*Rijke velden — alleen ophalen als Claude-analyse nodig is*

| Veld | Type | Label |
|---|---|---|
| `x_studio_open_question_reason_for_contact` | html | Reden voor contacteren |
| `x_studio_open_question_current_situation` | html | Huidige situatie |
| `x_studio_open_question_expected_solution` | html | Verwachte voordelen |
| `x_studio_entrypoint` | selection | Ingestroomd via |
| `x_studio_discovery_progress` | float | Discovery % |

> ⚠️ html-velden zijn groot — enkel meenemen als ze inhoud van Claude moeten worden.

---

### Categorie: Gebouwprofiel
*Direct op actieblad, geen submodel nodig*

| Veld | Type | Label |
|---|---|---|
| `x_studio_number_of_plots` | integer | Totaal kavels |
| `x_studio_number_of_apartments` | integer | Bewoonbare kavels |
| `x_studio_number_of_co_owners` | integer | Mede-eigenaars |
| `x_studio_hoa_established` | boolean | VME opgericht |
| `x_studio_has_commercial_plots` | boolean | Commerciële kavels |

> Gebouwgrootte-filter werkt op `x_studio_number_of_plots`. x_estate_stats heeft **geen** oppervlakte-veld.

---

### Categorie: Administratief Profiel
*Selectievelden voor compliance/audit-analyses*

| Veld | Type | Label |
|---|---|---|
| `x_studio_has_registration_number` | selection | Ondernemingsnummer |
| `x_studio_has_doubly_entry_accounting` | selection | Dubbele boekhouding |
| `x_studio_has_advance_payments` | selection | Vraagt voorschotten op |
| `x_studio_has_allocation_keys` | selection | Verdeelsleutels |
| `x_studio_has_annual_statement` | selection | Afrekening |
| `x_studio_has_insurance` | selection | BA verzekeringen |
| `x_studio_has_operating_account` | selection | Werkrekening |
| `x_studio_has_reserve_account` | selection | Reserverekening |

---

### Categorie: Profiel Raad van Mede-Eigenaars
*Kwalitatieve inschatting van de klant*

| Veld | Type | Label |
|---|---|---|
| `x_studio_age_group` | selection | Leeftijdscategorie |
| `x_studio_average_tenant_age` | selection | Gem. leeftijd bewoners |
| `x_studio_interpersonal_relationship` | selection | Onderlinge verstandhouding |
| `x_studio_communication_skill_level` | selection | Communicatievaardigheid |
| `x_studio_digital_skill_level` | selection | Digitale vaardigheid |
| `x_studio_legal_skill_level` | selection | Legale vaardigheid |

---

### Categorie: AI Insights
*Enkel nodig als input voor andere analyses (niet als Claude-prompt-input)*

| Veld | Type | Label |
|---|---|---|
| `x_studio_ai_insight_summary` | html | AI samenvatting |
| `x_studio_ai_key_takeaways` | html | AI key takeaways |
| `x_studio_ai_suggested_next_step` | html | AI suggestie volgende stap |
| `x_studio_ai_analysis_date` | datetime | Laatste analyse |

---

### Submodel: Meetings (`x_as_meetings`)
**Via:** `x_studio_linked_as_meetings_ids` (one2many)

**Lean velden:**

| Veld | Type | Label |
|---|---|---|
| `id` | integer | — |
| `x_studio_date` | date | Gepland op |
| `x_studio_meeting_type` | many2one → `x_sales_meeting_type` | Type |
| `x_studio_duration` | integer | Gespendeerde tijd (min) |
| `x_studio_stage_id` | many2one → `x_as_meetings_stage` | Fase |
| `x_studio_user_id` | many2one → res.users | Verantwoordelijke |
| `x_studio_kanban_state` | selection | Kanban status |

**Beschikbare meeting-types (live):**

| ID | Naam |
|---|---|
| 1 | Discovery Call |
| 2 | Demo |
| 3 | Demo #2 |
| 4 | Ondersteuningsgesprek |
| 5 | Discovery & Demo |
| 6 | 1e AV |
| 7 | Opstartsessie |

> ❌ Niet ophalen: `x_studio_notes` (html, groot), `message_ids`, `activity_ids`

---

### Submodel: Pijnpunten (`x_action_sheet_pain_po`)
**Via:** `x_studio_action_sheet_pain_points_scores` (one2many)

**Lean velden:**

| Veld | Type | Label |
|---|---|---|
| `x_studio_pain_point_id` | many2one → `x_user_painpoints` | Pijnpunt naam |
| `x_studio_score` | selection | Score (1=laag, 5=hoog) |

**Beschikbare pijnpunten (live, 14 items):**

| ID | Naam |
|---|---|
| 1 | Communicatie verloopt stroef |
| 2 | Boekhouding |
| 3 | Zoektocht naar expertise, wet |
| 4 | Er is geen transparantie |
| 5 | Lage digitale kennis gebouw |
| 6 | Ontbreken structuur |
| 7 | Te veel tijdsbesteding |
| 8 | Complexiteit |
| 9 | Flexibiliteit |
| 10 | Rendabiliteit kleine gebouwen |
| 12 | Onwetendheid over wettelijke verplichtingen |
| 13 | Discussie en wantrouwen tussen mede-eigenaars |
| 14 | Onvoldoende opvolging van beslissingen |
| 15 | Niet tevreden over professionele syndicus |

---

### Submodel: Chatter Berichten (`mail.message`) — NIEUW
**Via:** `message_ids` + twee-fase query (`chatter-enrichment.js`)

**Lean velden:**

| Veld | Label |
|---|---|
| `date` | Datum |
| `author_id` | Auteur `[id, name]` |
| `message_type` | Type (comment/email) |
| `preview` | Tekstfragment (geen html!) |

**Filter:** `message_type in ['comment', 'email']` — geen systeem-notificaties  
**Limiet:** standaard max 5 berichten per actieblad  
**Payload:** `{ "chatter_enrichment": { "enabled": true, "max_messages": 5 } }`

> **Waarom lean:** `preview` is een berekend Odoo-veld dat al een kort tekstfragment geeft zonder html-tags. Gebruik `body` **niet** tenzij absoluut nodig.

---

### Submodel: Activiteiten (`mail.activity`) — NIEUW
**Via:** `activity_ids` + twee-fase query (`activity-enrichment.js`)

**Lean velden:**

| Veld | Label |
|---|---|
| `activity_type_id` | Type `[id, name]` |
| `date_deadline` | Deadline |
| `summary` | Omschrijving |
| `state` | Status (today/planned/overdue) |
| `user_id` | Verantwoordelijke `[id, name]` |

**Beschikbare types (relevant voor actiebladen):**

| ID | Naam |
|---|---|
| 1 | Email |
| 2 | Call |
| 4 | To-Do |
| 16 | Calendly Ondersteuning |

**Filter:** standaard alleen `state in ['today', 'planned', 'overdue']`  
**Payload:** `{ "activity_enrichment": { "enabled": true, "include_done": false } }`

> ❌ Niet ophalen: `note` (html, vaak leeg), `calendar_event_id`

---

### Submodel: Estate Stats (`x_estate_stats`) — beperkt nuttig
**Via:** `x_studio_as_estate_stats_id` (many2many)

**Beschikbare velden (live):**

| Veld | Type | Label |
|---|---|---|
| `x_name` | char | Naam |
| `x_studio_total_active_owners` | integer | Actieve gebruikers |
| `x_studio_total_documents` | integer | Aantal documenten |
| `x_studio_total_invited_owners` | integer | Uitgenodigde gebruikers |
| `x_studio_stage_id` | many2one | Fase |
| `x_studio_last_sync_dt` | datetime | Laatste sync |

> ❌ `total_area`, `num_units`, `construction_year` bestaan NIET. Het model heeft geen fysieke gebouwcijfers.

---

## Submodel voor `crm.lead` (via Lead Enrichment)

**Koppeling:** `x_studio_as_opportunity_ids` (many2many op actieblad → crm.lead)  
**Methode:** twee-fase set-operations in `lead-enrichment.js`

### Groep: Status & Uitkomst *(altijd inbegrepen)*

| Veld | Label |
|---|---|
| `id`, `name` | ID, Naam opportunity |
| `won_status` | Won/lost/pending |
| `stage_id` | CRM fase `[id, name]` |
| `lost_reason_id` | Reden verlies |

### Groep: Tijdslijn *(optioneel)*

| Veld | Label |
|---|---|
| `create_date` | Aangemaakt op |
| `date_last_stage_update` | Laatste fase-update |
| `date_closed` | Afsluitdatum |
| `day_close` | Dagen tot sluiting |

### Groep: Herkomst *(optioneel)*

| Veld | Label |
|---|---|
| `source_id` | Bron `[id, name]` |
| `medium_id` | Medium `[id, name]` |

### Groep: Bedrijfssignalen *(optioneel)*

| Veld | Label |
|---|---|
| `x_studio_hotness_label` | Hotness categorie |
| `x_studio_hotness_score` | Hotness score (int) |
| `x_studio_lifecycle` | Lifecycle fase |

### Groep: Lead Profiel *(optioneel, NIEUW)*

| Veld | Label |
|---|---|
| `x_studio_brand_origin` | Lead origin (Meta/organisch…) |
| `x_studio_search_syndic_current_admin` | Huidig beheertype |
| `x_studio_is_vme_check` | Wil VME-check |
| `x_studio_isexpertlead` | Expert-lead |

---

## Context Filters

### Procesfase
**Veld:** `x_studio_stage_id`  
**Fasen (live):**

| ID | Naam |
|---|---|
| 1 | Discovery |
| 5 | opstartgesprek |
| 7 | Opstartsessie Expert |
| 8 | Basisinstellingen gecontroleerd |
| 9 | Follow-up validatie |
| 10 | Done |

> ❌ Vorige filter gebruikte `x_stage_type` (bestaat niet). Nu direct op stage-ID.

---

### Gebouwgrootte
**Veld:** `x_studio_number_of_plots` (op actieblad, niet via x_estate_stats)  
Opties: < 10 kavels / 10–30 / > 30 / Onbekend

> ❌ m²-filter niet mogelijk (geen oppervlakte in Odoo)

---

### Tijdsperiode
**Veld:** `create_date`  
Opties: Dit jaar / Dit kwartaal / Laatste 30 dagen / Custom

---

### Sales Verantwoordelijke
**Veld:** `x_studio_user_id` *(was `owner_id`, dat bestaat niet)*

---

### Lead-status
**Veld:** `x_studio_as_opportunity_ids` *(was `lead_id`, dat bestaat niet)*  
Opties: Alle / Met lead / Zonder lead

---

### Labels
**Veld:** `x_studio_tag_ids` → dynamisch geladen

---

### Ingestroomd via *(NIEUW)*
**Veld:** `x_studio_entrypoint` → selectie-opties uit Odoo schema

---

### Activiteitsstatus *(NIEUW)*
**Veld:** `activity_state` (computed)  
Opties: Alle / Vervallen / Vandaag / Gepland / Geen activiteit

---

## Tips voor verdere tweaking

### JSON lean houden
1. **html-velden** (`x_studio_open_question_*`, `x_studio_ai_*`, `x_studio_notes`) → enkel ophalen als ze direct in Claude-prompt gaan, anders weglaten
2. **Chatter**: gebruik `preview`, nooit `body`; beperk tot max 5 berichten per actieblad
3. **Lead enrichment**: standaard alleen "Status & Uitkomst" inschakelen; andere groepen opt-in
4. **Meetings**: `x_studio_notes` (html) weglaten, tenzij gespreksinhoud nodig is
5. **Estate stats**: alleen zinvol als platformgebruik (actieve eigenaars, documenten) relevant is

### Nog te verkennen
- `x_calendlymeeting` (via `x_studio_cm_calendlymeeting_ids` op crm.lead) — meeting-details uit Calendly
- `x_as_expectations` (many2many → `x_as_expectations`) — verwachtingen van klant
- `x_communication_method` (many2many) — communicatiemethoden
- `x_studio_current_way_of_working` (many2one → `x_current_wayofworking`) — huidig werkmodel

### Mogelijke nieuwe categorieën
- **Verwachtingen** (`x_studio_as_expectations`) — wat wil de klant bereiken
- **Communicatie** (`x_studio_communication_methods` + `x_studio_communication_skill_level`)
- **Huidig beheer** (`x_studio_current_syndic` + `x_studio_current_syndic_type`)
- **Open kosten-vraag** (`x_studio_open_question_running_costs` html)
