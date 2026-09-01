# Herontwerp Actiebladen — Krachtige CS Supportpipeline

_Analyse op basis van volledig Odoo-onderzoek + beantwoorde vragen — bijgewerkt 2026-06-15_

> **Dit is het enige actieve document voor het actiebladen-herontwerp.** Het oude `actiebladen-backlog.md` is gearchiveerd en niet meer bijgewerkt.

---

## Inhoudsopgave

- [1. Wat er al staat](#1-wat-er-al-staat)
- [2. De echte pijplijn](#2-de-echte-pijplijn)
- [3. Herontwerp — de nieuwe pipeline](#3-herontwerp--de-nieuwe-pipeline)
- [4. Velden](#4-velden--wat-toevoegen-wijzigen-verwijderen)
- [5. Kanban-tegel herontwerp](#5-kanban-tegel-herontwerp)
- [6. Formulierweergave herontwerp](#6-formulierweergave-herontwerp)
- [7. Zoekweergave herontwerp](#7-zoekweergave-herontwerp)
- [8. Activiteiten — structuur invoeren](#8-activiteiten--structuur-invoeren)
- [9. Backlog per sprint](#9-volledig-herziene-backlog)
  - [Sprint 0 — Opkuis](#-sprint-0--opkuis-geen-nieuwe-features-ballast-weg)
  - [Sprint 1 — Fundament](#-sprint-1--fundament-rollen-pakket-red-flag)
  - [Sprint 2 — Pipeline automatiseren](#-sprint-2--pipeline-automatiseren)
  - [Sprint 3 — Langetermijn](#-sprint-3--langetermijn--periodiciteit)
  - [Sprint C — Communicatie](#-sprint-c--communicatie-integratie)
- [10. Samenvatting prioriteiten](#10-samenvatting--prioriteiten-per-sprint)
- [11. Communicatie-integratie](#11-communicatie-integratie--analyse--backlog)
- [12. Voor de integratiepartner (Dynapps)](#12-voor-de-integratiepartner-dynapps)
- [14. Operations Manager — module `cx-automations`](#14-operations-manager--module-cx-automations)

---

## 1. Wat er al staat

Voordat we iets bouwen, is het cruciaal te begrijpen wat Odoo al doet. Veel is slimmer dan het eruitziet.

### 1.1 Wat goed werkt en je moet bewaren

**Auto-aanmaken actieblad bij Won (server action 1039)**
De code is goed gebouwd: controleert of er al een actieblad bestaat voor het contact, zo ja → koppelt de lead, zo nee → maakt nieuw aan. Behandelt gebouw vs. contactpersoon correct. Markeert de lead rood bij fouten. **Uitgebreid in sprint 2:** zet stage op Intake, vult `x_studio_support_user_id` in met Rob Claes, en maakt automatisch een "Welkomsgesprek inplannen" activiteit aan (type ID 26, deadline +3 werkdagen). Werkt zowel voor nieuwe als bestaande actiebladen.

**Onboarding bucket systeem op res.partner (daily cron id 61)**
Dit is de meest waardevolle bestaande logica voor de supportpipeline. De cron draait dagelijks en berekent per gebouw:

| Bucket | Betekenis | Parameters |
|--------|-----------|------------|
| `no_activity` | Nog nooit actief | - |
| `active_onboarder` | Actief binnen 14 dagen | <3 dagen inactief |
| `snoozing` | Binnen onboarding maar stil | ≥3 dagen inactief |
| `early_dropout` | Buiten onboarding, bijna nooit actief | actieve span ≤4 dagen |
| `active_new` | Actief, jong (<60 dagen) | <30 dagen inactief |
| `active_mature` | Actief, matuur (≥60 dagen) | <30 dagen inactief |
| `dormant` | Lang geen activiteit | >30 dagen inactief |

Dit is de basis voor automatische Red Flags. Het wiel hoeft niet opnieuw uitgevonden te worden.

**Productdetectie (cron 82 → server action 1078, + knop → server action 1117)**
Loopt over de sale-orderlijnen van het gekoppelde gebouw en detecteert welke producten actief zijn (`subscription_state` in progress/renewal voor recurrente producten). Aanvankelijk werd dit ook omgezet in een HTML-lijst (`x_studio_active_products_html`) voor weergave op de kanban-tegel — die weergave is sinds BI-S2-04b verwijderd; de berekening dient nu uitsluitend om de productstatus-chips (OpenVME-pakket, Peppol, bankkoppeling, Opstarthulp) te vullen. Twee triggers naar hetzelfde resultaat:
- **Automatisch, elk uur:** scheduled action (`ir.cron` id 82, interval 1u) roept server action 1078 aan, die *alle* actiebladen met een contact of gebouw in bulk herberekent. Deze actie zet **ook** `x_color` (paars bij Opstarthulp, anders op basis van `x_flag_level`) — overlapt met de losse automation "Bij opslaan - Flagged actieblad" (id 64 → action 1159, zie BI-S1-06). Niet per se een probleem (idempotent), maar wel dubbel werk.
- **Manueel, per record:** de knop "Producten ophalen" op het formulier roept server action 1117 aan — dezelfde berekening, maar direct voor het huidige record, voor een instant refresh zonder op de volgende cron-run te wachten.

Nuttig voor CS-context, maar **niet de bron voor het Syndicoach-pakket** — de tiers worden apart bijgehouden (zie §4).

**Dynamisch mailblok systeem (`x_dynamic_mail_block`)**
Een zelfgebouwd conditional content engine. Blokken hebben `x_condition_field` + `x_condition_value` waarmee de inhoud varieert per contact. Al in gebruik voor Meta Lead- en Syndicoach-flows (intro, onderwerp, contactinstructies). De CS check-in mail en welkomstmail kunnen hierop inpikken — de infrastructuur is er al.

**AI-analyse (automation 38)**
ChatGPT-analyse draait op elk opslaan. Levert: `ai_insight_summary`, `ai_key_takeaways`, `ai_suggested_next_step`. Goed — maar de suggestie wordt nergens structureel opgevolgd.

**Pain point scoring systeem**
10 vaste pijnpunten worden automatisch aangemaakt per actieblad bij opslaan. Zinvol voor AI-analyse en klantprofiel. Bewaren.

**Discovery questions**
De 5 open vragen met gestructureerde vragenlijsten zijn waardevol. Bewaren, wel beter integreren in de CS-flow (AI-suggestie zichtbaarder maken).

### 1.2 Wat kapot of nutteloos is (ballast)

| Item | Probleem | Actie |
|------|----------|-------|
| `x_studio_kanban_state` | Altijd `false` in de data, nooit gebruikt | Vervangen door Red Flag veld |
| Automations 1022/1023 ("Bij Aanmaken") | Lege code, doen niets | Implementeren of verwijderen |
| Alle 4 donuts op kanban | Interactie/Gegevens/Context niet gedefinieerd, Discovery enkel wired. | Verwijderen, ruimte maken voor pakket + gebouw info |
| "Stats" tab in formulier | Volledig leeg, maar wordt bewaard (beslissing) | Behouden |
| `x_studio_entrypoint` | Bijna nooit ingevuld (vrijwel altijd `false`) | Automatisch invullen vanuit lead source bij Won |
| `x_studio_tag_ids` readonly | Waarschijnlijk freeform/manueel gebruik, maar readonly gezet in form → onbruikbaar | Editeerbaar maken |
| Discovery stage in CS kanban | Pre-sales actiebladen vervuilen de CS-view | Default filter toevoegen |
| Vage activiteiten | Vrijwel alle activiteiten heten "Algemene opvolging" met lege notes | Templates/structuur per fase |
| "Opstartsessie Expert" stage | Slechts 2 actiebladen actief, naam onduidelijk | Hernoemen naar "Opstarthulp" |

### 1.3 Stage-distributie (huidig)

| Stage | Aantal | Analyse |
|-------|--------|---------|
| Discovery (1) | ~600+ | **Verreweg de meeste** — dit zijn pre-sales actiebladen. CS zou deze niet moeten zien. |
| opstartgesprek (5) | 13 | Actieve CS-dossiers in welkomstfase |
| Opstartsessie Expert (7) | 2 | Vrijwel leeg |
| Basisinstellingen + Follow-up + Done (8/9/10) | 126 | Klanten die in configuratie zijn of klaar |

**Kernprobleem:** ~80% van alle actiebladen zit in "Discovery" — de pre-sales fase. De CS-pipeline is daardoor onleesbaar en bevat geen structuur.

---

## 2. De echte pijplijn

```
Salespipeline (crm.lead)          Actieblad (x_sales_action_sheet)
─────────────────────────         ─────────────────────────────────
MQL
 ↓                                ← Actieblad kan hier al bestaan (manueel)
SQL                                  of nog niet
 ↓                                   Stage: Discovery
Demo ──────────────────────────→  Opstartsessie meeting-type added (auto 35)
 ↓
Follow Up
 ↓
Won ───────────────────────────→  Auto: actieblad aanmaken of linken (auto 41)
                                     Stage: nog steeds Discovery ← GAP
                                     CS moet manueel de stage wijzigen ← GAP
                                     Geen taak aangemaakt ← GAP
                                     Geen deadline ← GAP
```

Er is **geen enkele automatische stage-overgang in de CS-pipeline**. Alles wordt manueel gedaan door CS. De pipeline is een kanban zonder motor.

---

## 3. Herontwerp — de nieuwe pipeline

### 3.1 Stagemap

| # | Nieuwe naam | Huidige naam | Voor wie | Trigger in | Trigger uit |
|---|------------|--------------|----------|-----------|------------|
| 0 | **Pre-sales** | Discovery | Alle actiebladen voor Won | Aanmaken actieblad | Won op lead |
| 1 | **Intake** | opstartgesprek | Alle klanten | Won op lead (auto) | Welkomsgesprek gevoerd |
| 2 | **Opstarthulp** | Opstartsessie Expert | Alleen klanten MET Opstarthulp-product | Intake afsluiten (conditioneel) | Sessie ≥30 min gehad |
| 3 | **In Configuratie** | Basisinstellingen gecontroleerd | Alle klanten | Na Intake (of Opstarthulp) | Checklist 100% verplicht ✓ |
| 4 | **Follow-up Validatie** | Follow-up validatie | Alle klanten | Auto na checklist | 2 weken + mondelinge check |
| 5 | **Goed Opgestart** | Done | Alle klanten | Manueel door CS | — |
| 6 | **Na te checken** | (nieuw) | Reactie op check-in | Reactie op periodieke mail | Manueel opgelost |

**Pre-sales verbergen uit CS-kanban:** via standaard filter `stage_id != Pre-sales` als default view-filter, of aparte actie/menu voor CS.

### 3.2 De automations die je nodig hebt

#### A. Bij Won → Intake (uitbreiding van bestaande automation 41)

Voeg toe aan de bestaande Won-automation (server action 1039):
```python
# Na aanmaken/linken actieblad:
actieblad.write({
    'x_studio_stage_id': <id van Intake stage>,
})
# Taak aanmaken: welkomsgesprek
env['mail.activity'].create({
    'res_model_id': <model id x_sales_action_sheet>,
    'res_id': actieblad.id,
    'activity_type_id': 2,  # Call
    'summary': 'Welkomsgesprek: klant bellen',
    'date_deadline': <vandaag + 3 werkdagen>,
    'user_id': actieblad.x_studio_support_user_id.id or actieblad.x_studio_user_id.id,
})
```

#### B. Daily cron — Red Flag op actiebladen

Nieuwe cron, dagelijks, die actiebladen checkt in actieve CS-stages (Intake t/m Follow-up Validatie):
```python
# Check 1: Onboarding bucket → Red Flag
for actieblad in actiebladen_in_CS_pipeline:
    bucket = actieblad.x_studio_for_company_id.x_studio_onboarding_bucket
    if bucket in ['early_dropout', 'dormant', 'snoozing']:
        actieblad.write({'x_studio_red_flag': True})
        # notificatie naar support verantwoordelijke

# Check 2: 2 maanden geleden Won, nog niet in Follow-up Validatie
    became_customer = actieblad.x_studio_as_opportunity_ids.mapped('x_studio_became_customer')
    # Als > 60 dagen geleden Won en stage nog niet ≥ Follow-up Validatie:
    if <60 dagen verstreken> and actieblad.x_studio_stage_id.x_studio_sequence < <seq Follow-up>:
        actieblad.write({'x_studio_red_flag': True})
```

**Voordeel:** De buckets worden al berekend. Dit is een thin wrapper die ze leest en vertaalt.

#### C. Checklist-voltooiing → doorschuiven naar Follow-up Validatie

Automation `on_create_or_write` met filter op alle checklist-booleans = True:
```python
# Als alle verplichte checkitems True → stage = Follow-up Validatie
# + activiteit: "Follow-up call" deadline = today + 14 dagen
```

#### D. Periodieke check-in voor Goed Opgestart (elke 4 maanden)

Cron maandelijks, filtert actiebladen in "Goed Opgestart" stage waar laatste activiteit > 120 dagen geleden:
```python
env['mail.activity'].create({
    'summary': 'Periodieke check-in',
    'activity_type_id': 2,  # Call
    'date_deadline': today,
    ...
})
```

---

## 4. Velden — wat toevoegen, wijzigen, verwijderen

### Toevoegen

| Veldnaam (voorstel) | Type | Label | Doel | Waar |
|--------------------|------|-------|------|------|
| `x_studio_support_user_id` | many2one → res.users | Support Verantwoordelijke | CS-medewerker, apart van sales | Actieblad |
| `x_studio_syndicoach_package` | selection | Syndicoach Pakket | Manueel: Geen / Assistant / Coach / Captain | Actieblad + Lead + res.partner VME |
| `x_flag_level` | selection | Vlag | `none` Geen · `reminder` Herinnering · `attention` Attentie · `urgent` Urgent · `critical` Kritiek | Actieblad |
| `x_flag_reason` | selection | Reden vlag | Geen activiteit / Churn-signaal / Te lang in fase / Manueel | Actieblad |
| `x_flag_custom_message` | char | Vlag bericht | Vrij tekstveld — contextnota bij de vlag; blijft behouden bij wissen vlag | Actieblad |
| `x_last_response_date` | date | Laatste klantreactie | Startpunt voor inactiviteitsteller | Actieblad |
| `x_studio_won_date` | date | Won op | T0 voor timing (computed van lead.x_studio_became_customer) | Actieblad |
| `x_has_startup_assistance` | boolean | Heeft Opstarthulp | Gezet tijdens active products berekening (product template id 37) | Actieblad |
| `x_studio_opstarthulp_status` | selection | Status Opstarthulp | Niet aangekocht / In te plannen / Gepland / Gehouden | Actieblad |

### Syndicoach-pakket — aanpak (bijgewerkt)

**Beslissing:** Het pakket wordt **manueel bijgehouden** op drie plaatsen: lead, gebouw (res.partner VME), en actieblad. Geen automatische detectie vanuit producten.

**Veld:** Selection `x_studio_syndicoach_package` met waarden:
- `none` → Geen Syndicoach (puur OpenVME)
- `assistant` → Assistant
- `coach` → Coach
- `captain` → Captain

**Synchronisatie:** Bij Won → automation 1039 uitbreiden: als de lead al een pakket heeft, overnemen op het actieblad. Zo hoeft CS het niet dubbel in te vullen.

**Op lead:** Veld `x_studio_syndicoach_package` toevoegen, zichtbaar in formulier en CRM-pipeline.  
**Op res.partner VME:** Idem, zodat het op het contact-record blijft staan ook na closing.

### Checklist — twee-modellen-structuur (herzien, zelfde patroon als pain points)

**Beslissing:** niet langer een simpele M2M, maar exact het patroon van de pain points (`x_user_painpoints` master + `x_action_sheet_pain_po` per-actieblad lijn, auto-aangemaakt via automation 29 → action 974). Twee modellen:

**Master: `x_checklist_item`**
- `x_name` — omschrijving
- `x_type` — selection: `required` (Verplicht) / `dependant` (Afhankelijk) / `optional` (Optioneel) (vervangt de oorspronkelijke boolean `x_verplicht`)
- `x_dependency_field` — char: technische veldnaam op het actieblad, enkel relevant bij `dependant` (bv. `x_has_peppol`, `x_has_linked_bank_account`)
- `x_stage` — **many2one → `x_support_stage`**, verplicht, **on delete: beperken (restrict)** (fase-records zijn structurele configuratie, zelden verwijderd — beperken voorkomt dat een fase per ongeluk verdwijnt terwijl er nog checklist-items aan hangen). Hetzelfde stage-model als `x_studio_stage_id` op het actieblad, dus rechtstreeks vergelijkbaar — geen apart sync-veld met stage-keys nodig. Bekende stage-ids: 1 Discovery, 5 Welkomgesprek, 7 Planning Opstarthulp, 8 In Configuratie, 9 Follow-up validatie, 10 Goed Opgestart.
- `x_studio_sequence` (auto-aangemaakt door de "Aangepast sorteren"-optie in de model-wizard — krijgt altijd de `x_studio_`-prefix, ook al gebruik je voor de rest de veldenbewerker), `x_active`

**Per actieblad: `x_action_sheet_checkli`** (technische modelnaam afgekapt door Odoo's karakterlimiet op custom modelnamen — bedoelde naam was `x_action_sheet_checklist_line`, werd automatisch ingekort)
- `x_name` — **related field** (`related='x_checklist_item_id.x_name'`, `store=True`, alleen-lezen) — toont altijd de actuele naam van het item, live, in de taal van de kijker (zelfde vertaalmechanisme als het brontveld op `x_checklist_item`). **Geen kopie meer** (zie bug-note bij BI-S2-05a: een kopie-op-aanmaakmoment botste met vertalingen — `x_name` op het item is translatable, en enkel de niet-Nederlandse vertalingen waren aangepast bij een hernoeming, waardoor de "sync"-actie in de Nederlandse werkcontext niets te doen vond). `x_action_sheet_id` (m2o → Sales Action Sheet, verplicht, **on delete: cascade** — checklist-lijnen zijn detail-records van het actieblad, ruimen automatisch mee op), `x_checklist_item_id` (m2o → `x_checklist_item`, verplicht, **on delete: beperken (restrict)** — voorkomt dat een master-item verwijderd wordt terwijl er nog historische lijnen naar verwijzen; archiveren via `x_active = False` in plaats van verwijderen)
- `x_done` — boolean
- `x_done_date` — datetime, ingevuld door automation zodra `x_done` naar True gaat (bijhouden wanneer een checkpoint afgevinkt werd)
- `x_stage_id` — many2one → `x_support_stage`, **related field** (`related='x_checklist_item_id.x_stage'`, `store=True`, alleen-lezen) — denormaliseert de fase van het item op de lijn zelf, zodat je erop kan filteren/groeperen zonder een dotted-path domain.
- `x_studio_sequence` (idem, auto-aangemaakt), `x_active`

O2m op actieblad: `x_checklist_line_ids` → `x_action_sheet_checkli`. **Alle lijnen blijven zichtbaar op het formulier, over alle fases heen** (geen fase-filter op de o2m) — CS wil de volledige historiek zien, inclusief afgevinkte items uit eerdere fases. Op de kanban-tegel komt later een eigen afgeleide/samengevatte weergave (zelfbouw door CS, buiten scope van deze automation-laag).

**Generalisatie — niet enkel "In Configuratie":** dit model is stage-onafhankelijk opgezet. Hetzelfde `x_checklist_item`-model bevat ook de planning-items voor de fase "Planning Opstarthulp" (stage id 7) — een item "hoort" bij een fase via zijn `x_stage`-veld, en "Custom | Add Checklist-items on Sales Action Sheets" (zie BI-S2-05) laadt bij élke stage-overgang de items die bij de nieuwe fase horen, niet enkel bij "In Configuratie". Nieuwe fases toevoegen = gewoon nieuwe `x_checklist_item`-records aanmaken met de juiste `x_stage`, geen automation-wijziging nodig.

**Drie statussen (herclassificatie t.o.v. het oorspronkelijke idee):**
- `required` (Verplicht) — komt altijd op het actieblad terecht zodra het In Configuratie ingaat
- `dependant` (Afhankelijk) — komt enkel op het actieblad als het veld in `x_dependency_field` op dat moment True is (bv. "Bankkoppeling gemaakt" enkel als `x_has_linked_bank_account = True`, "Peppol geactiveerd" enkel als `x_has_peppol = True`) — **dit is wat vroeger "optioneel" heette**
- `optional` (Optioneel) — nooit automatisch toegevoegd; CS kan dit zelf toevoegen via een editable o2m-lijst met een domeinfilter `[('x_type','=','optional')]` op de item-picker

Standaard items:
- ✓ Financiële module geactiveerd _(verplicht)_
- ✓ Eerste facturen & bankafschriften ingegeven _(verplicht)_
- ✓ Minimaal 2 relevante documenten opgeladen _(verplicht)_
- ◐ Bankkoppeling gemaakt _(afhankelijk — `x_has_linked_bank_account`)_
- ◐ Peppol geactiveerd _(afhankelijk — `x_has_peppol`)_

**Auto-instantiatie:** trigger niet bij aanmaken van het actieblad (zoals pain points), maar bij binnenkomst in stage "In Configuratie" (stage id 8) — zie BI-S2-05 voor de volledige server-action-code. Met dedup-check (anders dan de pain-points-automation, die deze niet heeft) omdat een actieblad de fase kan verlaten en later terugkeren.

### Wijzigen

| Veld | Nu | Na wijziging |
|------|----|-------------|
| `x_studio_kanban_state` | selection, nooit gebruikt | **Verwijderen** uit views |
| `x_studio_tag_ids` | readonly in form | **Editeerbaar** maken |
| Stage "Discovery" | Zichtbaar in CS kanban | **Default filter** in zoekweergave |
| `x_studio_entrypoint` | Manueel, zelden ingevuld | **Auto-invullen** vanuit `lead.source_id` bij Won |

---

## 5. Kanban-tegel herontwerp

### Huidig (wat er staat)

```
┌─────────────────────────────────┐
│ ⭐ Naam actieblad          [⋮] │
├─────────────────────────────────┤
│ [active_products_html]          │
├─────────────────────────────────┤
│ Volgende activiteit             │
│ 🔔 [activiteit icoon] [summary] │
│               [kanban_state] 👤 │
├─────────────────────────────────┤
│  ⬤Interactie ⬤Gegevens         │
│  ⬤Discovery  ⬤Context          │
└─────────────────────────────────┘
```

Problemen: geen contactnaam, geen gebouw, geen pakket, kanban_state ongebruikt, donuts 2-4 decoratief.

### Nieuw (voorstel)

```
┌─────────────────────────────────┐
│ 🚩 Naam actieblad          [⋮] │  ← 🚩 enkel bij red_flag = True
├─────────────────────────────────┤
│ 📦 Coach  ·  🏠 VME Residentie │  ← pakket badge + gebouwnaam
│ Jan Jansen · jan@voorbeeld.be   │  ← contactnaam + email
│ [actieve producten compact]     │  ← Syndicoach + Ponto + Peppol badges
├─────────────────────────────────┤
│ Volgende activiteit             │
│ 🔔 [activiteit] [summary]       │
│           Won: 12/05  👤 👤    │  ← won_date + support + sales avatar
└─────────────────────────────────┘
```

**Donuts eruit** — de volledige footer-sectie met donuts wordt verwijderd. Ruimte wordt gebruikt voor pakket, gebouw en contact info.

**Concrete wijzigingen in view (xpath op overerving 3725):**
1. Verwijder donut-footer volledig (xpath op `.kanban-extra-footer`)
2. Verwijder `x_studio_kanban_state` widget uit bottom-right
3. Voeg toe aan body: gebouwnaam, contactnaam, pakket badge, compacte product-badges
4. Voeg toe aan bottom-right: `x_studio_support_user_id` avatar (hoofd) + `x_studio_user_id` kleiner
5. Voeg toe aan bottom-left: `x_studio_won_date` als compacte datum
6. Voeg toe aan header: `x_flag_level` als badge (none = verborgen; geel/oranje/rood = gekleurde chip)

---

## 6. Formulierweergave herontwerp

### Nieuw tabblad: "CS Onboarding" (toevoegen vóór Basisgegevens)

```
┌─ CS Onboarding ──────────────────────────────┐
│ Support Verantwoordelijke: [user]             │
│ Syndicoach Pakket:         [Assistant/Coach/Captain/Geen] │
│ Won op:                    [datum]            │
│ Vlag:                      [🟡/🟠/🔴 level] [reden]  │
│ Opstarthulp status:        [selectie]         │
├── Configuratie Checklist ────────────────────┤
│ ✓ Financiële module geactiveerd    [verplicht]│
│ ✓ Eerste facturen ingegeven        [verplicht]│
│ ✓ 2 relevante documenten           [verplicht]│
│ ○ Bankkoppeling (indien aangekocht)[optioneel]│
│ ○ Peppol (indien aangekocht)       [optioneel]│
└──────────────────────────────────────────────┘
```

### Formulier cleanup:
- "Datavelden" tab: **invisible="True"** → OK, maar eventueel verwijderen
- "Stats" tab: **volledig leeg**, maar wordt behouden (beslissing — niet verwijderen)
- AI-suggestie (`x_studio_ai_suggested_next_step`): **prominenter tonen**, bovenaan Progress tab, niet verstopt
- Meetings overzicht: goed, behouden maar Opstartsessie-duur tonen (>30 min check)

---

## 7. Zoekweergave herontwerp

Huidige filters: Mijn actiebladen, Gearchiveerd. Dat is te weinig.

**Toevoegen:**
- Filter: "Alle vlaggen" → `[['x_flag_level', '!=', 'none']]`
- Filter: "🟡 Attentie" → `[['x_flag_level', '=', 'attention']]`
- Filter: "🟠 Urgent" → `[['x_flag_level', '=', 'urgent']]`
- Filter: "🔴 Kritiek" → `[['x_flag_level', '=', 'critical']]`
- Filter: "Pre-sales verbergen" → standaard actief → `[['x_studio_stage_id.x_studio_sequence', '>', 10]]`
- Filter: "Mijn support dossiers" → `[['x_studio_support_user_id', '=', uid]]`
- Groepering: Syndicoach Pakket
- Groepering: Support Verantwoordelijke

---

## 8. Activiteiten — structuur invoeren

**Huidig patroon:** Vrijwel alle activiteiten heten "Algemene opvolging" met lege notes. Rob Claes staat op alles. Geen structuur.

**Oplossing: activiteitstemplates per fase**

| Fase | Activiteitstype | Summary template | Deadline |
|------|----------------|-----------------|---------|
| Intake | Call | "Welkomsgesprek: behoeftepeiling + intake" | Won + 3 werkdagen |
| Opstarthulp | To-Do | "Opstartsessie inplannen met Expert" | Intake + 5 dagen |
| In Configuratie | To-Do | "Configuratiecheck: financiële module" | Stage-ingang + 1 week |
| In Configuratie (auto) | Call | "Follow-up call configuratie" | Checklist voltooid + 14 dagen |
| Follow-up Validatie | Call | "Validatiegesprek: loopt alles naar wens?" | Stage-ingang + 7 dagen |
| Goed Opgestart | Call | "Periodieke check-in (4-maandelijks)" | Laatste check-in + 120 dagen |

---

## 9. Volledig herziene backlog

---

### 🔴 SPRINT 0 — Opkuis (geen nieuwe features, ballast weg)

#### BI-S0-01 — Pre-sales actiebladen verbergen in CS kanban

**Wat:** Voeg standaard filter toe aan zoekweergave: `stage_id = Pre-sales` verbergen.  
**Hoe:** Uitbreiden search view 3560 met default filter. Optioneel: Pre-sales stage persistent folden (zie TECH-01).  
**Impact:** CS ziet direct enkel actieve dossiers. Geen datawijziging nodig.

**Acceptatiecriteria:**
- [x] Domeinfilter `[("x_studio_stage_id", "!=", 1)]` ingesteld op action 953
- [x] Pre-sales kolom staat standaard gefold bij openen kanban _(via Dynapps)_
- [x] CS kan Pre-sales kolom zelf tonen/verbergen via filterknop

---

#### BI-S0-02 — Lege automations opkuisen of implementeren

**Wat:** Automations 1022 ("Bijwerken stage id") en 1023 ("Bereken sequence") hebben lege code.  
**Hoe:** Beslissen: implementeren (zie sprint 1) of verwijderen.  
**Impact:** Vermijdt verwarring en onnodige triggers.

**Beslissing:** Automation 1023 ("Bereken sequence") verwijderd — sequentieveld was nutteloos. Automation 1022 ("Bijwerken stage id") geïmplementeerd: zet nieuwe actiebladen automatisch op stage "Discovery" bij aanmaken.

**Acceptatiecriteria:**
- [x] Automation 1023 verwijderd
- [x] Automation 1022 geïmplementeerd — nieuwe actiebladen krijgen automatisch stage "Discovery"

---

#### BI-S0-03 — Donuts verwijderen uit kanban

**Wat:** Alle 4 donuts (Interactie, Gegevens, Context, Discovery) verwijderen uit de kanban-tegel.  
**Beslissing:** Donuts waren een oud idee zonder databinding. De volledige donut-footer sectie wordt vervangen door pakket + gebouw + contactinfo (zie §5).  
**Hoe:** Xpath in kanban overerving 3725: donut-footer verwijderen.

**Acceptatiecriteria:**
- [x] Donut-footer volledig verwijderd uit kanban-tegel
- [x] Geen visuele breuk of lege ruimte zichtbaar

---

#### BI-S0-05 — Tags editeerbaar maken in formulier

**Wat:** Tags (`x_studio_tag_ids`) zijn momenteel read-only in de formulierweergave. Ze worden manueel ingevuld door CS.  
**Beslissing:** Tags verwijderd uit de formulierweergave — veld is leeg en wordt niet actief gebruikt. Tags worden automatisch meeaangemaakt (infrastructuur staat klaar voor later gebruik).

**Acceptatiecriteria:**
- [x] Tags verwijderd uit formulierweergave (niet readonly maar volledig verborgen)
- [x] Bestaande tags blijven behouden in het model

---

#### BI-S0-06 — kanban_state vervangen in views

**Wat:** `x_studio_kanban_state` widget zit in kanban-tegel maar is nooit ingevuld in de data.  
**Hoe:** Verwijderen uit kanban bottom-right, vervangen door Red Flag icoon (zie sprint 1).

**Acceptatiecriteria:**
- [x] `x_studio_kanban_state` widget verwijderd uit kanban-tegel
- [x] Ruimte ingenomen door Red Flag icoon (BI-S1-03)

---

#### BI-S0-07 — "Mijn actiebladen" filter verwijst naar Support Verantwoordelijke

**Wat:** De standaard "Mijn actiebladen" kanban-filter gebruikte `x_studio_user_id` (sales). Voor CS is de relevante gebruiker de Support Verantwoordelijke (`x_studio_support_user_id`).

**Acceptatiecriteria:**
- [x] Kanban-actie filtert op `x_studio_support_user_id = uid` in plaats van `x_studio_user_id`
- [ ] Extra filters voor andere rollen indien nodig (mijn sales dossiers, alles) — backlog

---

### 🟠 SPRINT 1 — Fundament: rollen, pakket, Red Flag

#### BI-S1-01 — Support Verantwoordelijke veld

**Wat:** Nieuw `x_studio_support_user_id` (many2one → res.users) op actieblad.  
**Waarom:** Sales verantwoordelijke ≠ CS medewerker. Op kanban-tegel tonen.  
**Bij Won-automation:** voorlopig altijd Rob Claes invullen (hard-coded via `user_id` lookup op het e-mailadres).  
**Roadmap:** Zodra een tweede CX-medewerker start → round-robin of toewijzingsregel bouwen. Zie ook BI-S3-05.

**Acceptatiecriteria:**
- [x] Veld `x_studio_support_user_id` aangemaakt op `x_sales_action_sheet`
- [ ] Zichtbaar in formulierweergave (CS Onboarding tab)
- [x] Zichtbaar als avatar op kanban-tegel
- [x] Won-automation 1039 vult het veld automatisch in (voorlopig: altijd Rob Claes)

---

#### BI-S1-02 — Syndicoach-pakket veld

**Wat:** Nieuw selection veld `x_studio_syndicoach_package` met waarden: `none`, `assistant`, `coach`, `captain`.  
**Hoe invullen:** Manueel door CS op actieblad, lead en res.partner VME. Automatische detectie vanuit producten is niet mogelijk — tiers zitten niet in de productcatalogus.  
**Synchronisatie:** Won-automation 1039 uitbreiden: als de lead al een pakket heeft ingevuld, dit overnemen op het actieblad.

**Implementatie:** Veld `x_syndicoach_pack` (selection: assistant/coach/captain) aangemaakt op `res.partner` als bron van waarheid. Related fields op `x_sales_action_sheet` (via `x_studio_for_company_id`) en `crm.lead`, beide store=True en editeerbaar. Geen Won-automation sync nodig — related field synchroniseert automatisch.

**Acceptatiecriteria:**
- [x] Veld aangemaakt op `res.partner` (VME-gebouwen) als bron van waarheid
- [x] Related field op `x_sales_action_sheet` (via `x_studio_for_company_id`)
- [x] Related field op `crm.lead`
- [x] Zichtbaar als gekleurde chip op kanban-tegel (balk tussen header en body, rechts uitgelijnd)
- [x] Won-automation sync niet nodig — related field doet dit automatisch

---

#### BI-S1-03 — Escalatievlag: 🔵 Herinnering / 🟡 Attentie / 🟠 Urgent / 🔴 Kritiek

**Wat:** Vierniveaus-escalatie op actieblad via één selection + reden + bericht + datum laatste klantreactie.  
**Velden:**
- `x_flag_level` (selection): `none` Geen · `reminder` 🔵 Herinnering · `attention` 🟡 Attentie · `urgent` 🟠 Urgent · `critical` 🔴 Kritiek
- `x_flag_reason` (selection): `no_activity` Geen activiteit · `churn_signal` Churn-signaal · `too_long_in_stage` Te lang in fase · `manual` Manueel — **niet getoond bij `reminder`**
- `x_flag_custom_message` (char): Vrij tekstveld — contextnota of snelle note; wordt **niet** gewist bij vlag verwijderen
- `x_last_response_date` (date): Laatste klantreactie — startpunt inactiviteitsteller

**In kanban:** Gekleurde chip + balkkleur + message-strip per niveau (none = geen markering). Kaartkleuring via `x_color` — zie BI-S1-06.  
**Manuele knoppen:** "Klant vlaggen" (popup) + "Vlag verwijderen" op formulier.  
**Auto-trigger:** Dagelijkse cron op inactiviteit en onboarding bucket (zie BI-S2-02).  
**Drempelwaarden (instelbaar in automations):** Geel: 14 d · Oranje: 30 d · Rood: 60 d.

**Acceptatiecriteria:**
- [x] Veld `x_flag_level` (selection, 5 waarden incl. `reminder`) aangemaakt
- [x] Veld `x_flag_reason` (selection, 4 waarden) aangemaakt
- [x] Veld `x_flag_custom_message` (char) aangemaakt
- [x] Veld `x_last_response_date` (date) aangemaakt
- [x] Popup "Klant vlaggen": bij `reminder` enkel bericht tonen, geen reden
- [x] Vlag-chip + gekleurde balk + message-strip conditionally zichtbaar op kanban-tegel
- [ ] Filterbaar via zoekweergave ("🔵 Herinnering", "🟡 Attentie", "🟠 Urgent", "🔴 Kritiek", "Alle vlaggen")
- [x] x_color kaartkleuring via BI-S1-06

---

#### BI-S1-04 — Won-datum ophalen op actieblad

**Wat:** Computed date veld `x_studio_won_date` dat `x_studio_became_customer` van de gekoppelde lead leest.  
**Waarom:** Betrouwbaarder T0 dan `create_date` voor alle timing-automations.

**Acceptatiecriteria:**
- [ ] Veld `x_studio_won_date` aangemaakt (computed of automation-gevuld)
- [ ] Correct gevuld vanuit de gekoppelde lead bij Won
- [ ] Zichtbaar op kanban-tegel (compact formaat)

---

#### BI-S1-05 — Kanban-tegel updaten

**Wat:** Xpath-aanpassingen op overerving view 3725.

**Acceptatiecriteria:**
- [ ] Gebouwnaam zichtbaar op tegel
- [ ] Syndicoach-pakket badge zichtbaar
- [ ] Red Flag icoon conditionally zichtbaar
- [ ] `kanban_state` vervangen door `support_user_id` avatar
- [ ] Sales verantwoordelijke als tweede kleinere avatar behouden
- [ ] Won-datum compact zichtbaar onderaan
- [ ] Donut-footer verwijderd
- [x] Bugfix: activiteit-omschrijving (`activity_summary`) geclampt op 2 lijnen + ellipsis, volledige tekst via hover-tooltip — bestaande `.o_activity_summary`/`.o_activity_title`-CSS matchte niet (dat zijn classes van de `kanban_activity`-widget, niet van het los geplaatste `activity_summary`-veld); opgelost met een eigen wrapper-div (`.activity-summary-clamp`) rond het veld.

---

#### BI-S1-06 — x_color kaartkleuring (vlag + opstarthulp)

**Wat:** Automation die `x_color` zet op basis van `x_flag_level` en `x_has_startup_assistance`. Opstarthulp heeft hogere prioriteit dan vlag.

**Mapping:**

| Conditie | x_color | Kleur |
|---|---|---|
| `x_has_startup_assistance = True` | 11 | Paars |
| `x_flag_level = 'critical'` | 1 | Rood |
| `x_flag_level = 'urgent'` | 2 | Oranje |
| `x_flag_level = 'attention'` | 3 | Geel |
| `x_flag_level = 'reminder'` | 4 | Lichtblauw |
| (geen van bovenstaande) | 0 | Geen kleur |

**Automation:** `Bij opslaan - Flagged actieblad` — gecombineerd met reden-wissen, trigger op `x_flag_level` en `x_has_startup_assistance`:
```python
# Reden wissen bij geen vlag
if not record.x_flag_level or record.x_flag_level == 'none':
    record.write({'x_flag_reason': False})

# x_color bijwerken
if record.x_has_startup_assistance:
    color = 11
elif record.x_flag_level == 'critical':
    color = 1
elif record.x_flag_level == 'urgent':
    color = 2
elif record.x_flag_level == 'attention':
    color = 3
elif record.x_flag_level == 'reminder':
    color = 4
else:
    color = 0
record.write({'x_color': color})
```

**Acceptatiecriteria:**
- [x] Automation aangemaakt (`Bij opslaan - Flagged actieblad`), triggert op beide velden
- [x] Kaart wordt paars bij Opstarthulp (ongeacht vlag)
- [x] Kaart volgt vlagkleur wanneer geen Opstarthulp
- [x] x_color = 0 wanneer geen vlag en geen Opstarthulp

---

### 🟡 SPRINT 2 — Pipeline automatiseren

#### BI-S2-01 — Won → Intake: stage + welkomstaak (automation 41 uitbreiden)

**Wat:** Uitbreiden server action 1039 met:
1. Stage actieblad zetten op "Intake"
2. Activiteit aanmaken: "Welkomsgesprek: klant bellen" → deadline = vandaag + 3 werkdagen → toegewezen aan Support Verantwoordelijke
3. `x_studio_entrypoint` auto-invullen vanuit `lead.source_id` of `lead.medium_id`

**Acceptatiecriteria:**
- [x] Bij Won: actieblad stage wordt automatisch "Intake"
- [x] Activiteit "Welkomsgesprek inplannen" aangemaakt met juiste deadline (3 werkdagen) — activiteitstype ID 26
- [x] Activiteit toegewezen aan Support Verantwoordelijke (Rob Claes, user ID 11)
- [ ] `x_studio_entrypoint` automatisch gevuld
- [x] Werkt ook als actieblad al bestaat (koppeling zonder duplicaat)

---

#### BI-S2-02 — Dagelijkse vlag-cron via Operations Manager

**Aanpak (herzien):** Geen Studio time-based automations met hardcoded delays. In plaats daarvan berekent de Operations Manager dagelijks de flags op basis van de **gebouw-inactiviteit** (`res.partner`), met **per-fase instelbare drempelwaarden**. Support kan de drempels zelf instellen via een module in de Operations Manager (zie §14).

**Databron: gebouw-inactiviteit**

Cron 61 op `res.partner` berekent al dagelijks de onboarding bucket op basis van platformactiviteit per gebouw. We breiden dit uit met één extra veld: `x_days_since_active` (Integer, stored) — het aantal dagen sinds de laatste gebouwactiviteit. Dit veld wordt meegeschreven door cron 61 (kleine uitbreiding, uitvoerbaar in Studio of als kleine Dynapps-aanpassing).

> **Verificatie vereist:** check welk datumveld cron 61 als bron gebruikt voor de bucket-berekening. `x_days_since_active` = `(vandaag - <dat datumveld>).days`. Als het datumveld al bestaat op `res.partner`, kan dit als Studio computed field worden aangemaakt.

**Per-fase drempelwaarden**

De Operations Manager beheert een Supabase-tabel `flag_thresholds` met één rij per CS-stage:

| stage_id | stage_name | yellow_days | orange_days | red_days |
|---|---|---|---|---|
| (Odoo ID) | Intake | 7 | 14 | 30 |
| (Odoo ID) | Opstarthulp | 7 | 14 | 30 |
| (Odoo ID) | In Configuratie | 10 | 21 | 45 |
| (Odoo ID) | Follow-up Validatie | 14 | 30 | 60 |

Support stelt deze waarden in via `/cx-automations` in de Operations Manager (zie §14).

**Cron-logica (dagelijks, in Operations Manager `scheduled()`)**

```
1. Lees drempelwaarden uit Supabase (flag_thresholds)
2. Haal alle actiebladen op uit Odoo in CS-stages (Intake t/m Follow-up Validatie)
   Fields: id, x_studio_for_company_id, x_studio_stage_id, x_flag_level
3. Per actieblad:
   a. Lees x_days_since_active van het gekoppelde gebouw (res.partner)
   b. Zoek de drempelwaarden voor deze stage op
   c. Bepaal het nieuwe vlag-niveau:
      - days >= red_days   → critical
      - days >= orange_days → urgent
      - days >= yellow_days → attention
      - anders             → geen wijziging
   d. Vergelijk met huidige x_flag_level:
      - Alleen escaleren (none < attention < urgent < critical)
      - Nooit automatisch downgraden
      - Als al hoger of gelijk → overslaan
   e. Bij wijziging: schrijf x_flag_level + x_flag_reason ('no_activity') naar Odoo
4. Log het resultaat (run-timestamp, aantal gewijzigd) in Supabase (flag_run_log)
```

**Odoo-automations (vereenvoudigd)**

De oorspronkelijke automations A/B/C/E (time-based op `x_last_response_date`) **vervallen** — de Operations Manager cron neemt hun rol over. Automatie D (bucket-check) vervalt ook om dezelfde reden.

Wat overblijft in Studio:
- Automation "Reden wissen bij Geen vlag" (on save) — blijft
- Automation "Bij opslaan - Flagged actieblad" voor `x_color` — blijft
- Notificatie naar Support Verantwoordelijke: de Operations Manager stuurt een Odoo-activiteit of interne notitie aan bij elke nieuwe vlag

**Escalatieregel:** De cron escaleert altijd. Downgraden (vlag automatisch wissen) gebeurt enkel als CS dat per fase/reden bewust aanzet via **Auto-wissen** in `/cx-automations` (zie §14) — staat dat uit, blijft "Vlag verwijderen" een manuele actie.

**Acceptatiecriteria:**
- [x] Supabase tabel `flag_thresholds` aangemaakt met standaardwaarden
- [x] Supabase tabel `flag_run_log` aangemaakt (audit)
- [x] Operations Manager cron loopt dagelijks en zet flags correct
- [x] Escalatie werkt correct: alleen omhoog, tenzij Auto-wissen expliciet aanstaat voor die fase/reden
- [x] Geen dubbele vlag-updates bij al-gemarkeerde vlaggen
- [x] Drempelwaarden instelbaar via `/cx-automations` module (zie §14)
- [ ] `x_days_since_active` veld beschikbaar op `res.partner` (computed of door cron 61 geschreven) — niet nodig gebleken, cron leest `x_studio_last_activity` rechtstreeks
- [ ] Odoo automations A/B/C/D/E verwijderd of uitgeschakeld

---

#### BI-S2-03 — Heeft Opstarthulp veld + conditionele routing

**Wat:** Boolean `x_has_startup_assistance` (product "Opstarthulp" id 37 aanwezig in actieve sale orders).  
**Waarom:** (1) Bepaalt of stage "Opstarthulp" overgeslagen wordt. (2) Drijft `x_color = 11` (paars) op de kanban-kaart via BI-S1-06.  
**Detectie:** Boolean wordt gezet **tijdens de productdetectie in de server actions** — automatisch elk uur via cron 82 (server action 1078, bulk) en direct bij klikken op "Producten ophalen" (server action 1117, per record) — geen aparte automation nodig.  
**Prioriteit kaartkleuring:** Opstarthulp (paars) heeft hogere prioriteit dan vlagkleur — zie BI-S1-06.  
**Automatisering routing:** Bij stage = Intake, als `heeft_opstarthulp = True` → toon sub-status "Opstartsessie inplannen" + maak taak aan.

**Acceptatiecriteria:**
- [x] Veld `x_has_startup_assistance` aangemaakt (boolean)
- [x] Boolean correct gezet tijdens active products berekening (cron 82 → action 1078, en knop → action 1117)
- [x] Wijziging boolean triggert x_color update (via BI-S1-06)
- [ ] Bij Intake + Opstarthulp: taak "Opstartsessie inplannen" wordt aangemaakt
- [ ] Bij Intake + geen Opstarthulp: stage slaat "Opstarthulp" over

---

#### BI-S2-04 — Opstarthulp sub-status veld

**Wat:** Selection `x_studio_opstarthulp_status`: `niet_aangekocht` / `in_te_plannen` / `gepland` / `gehouden`.  
**Trigger doorschuiven:** CS markeert manueel "gehouden" → auto naar "In Configuratie" + checklist aanmaken.  
**Noot:** Automatische duur-detectie via `x_as_meetings.x_studio_duration` vervalt — CS beslist zelf wanneer de sessie als "gehouden" telt.

**Acceptatiecriteria:**
- [ ] Veld aangemaakt met de 4 statussen
- [ ] Zichtbaar in formulierweergave (CS Onboarding tab), conditioneel (enkel als `heeft_opstarthulp = True`)
- [ ] Bij "gehouden": automatisch doorschuiven naar "In Configuratie"
- [ ] Bij "gehouden": checklist-items aangemaakt op het actieblad

---

#### BI-S2-04a — Opstarthulp beter markeren (aankoopdatum + kanban-icoon)

**Wat:** Los van de sub-status (BI-S2-04): Opstarthulp krijgt een aankoopdatum en wordt visueel duidelijker gemarkeerd op de kanban-tegel.

**Nieuw veld:** `x_startup_assistance_date` (Date, label "Opstarthulp gekocht op") op `x_sales_action_sheet` — aangemaakt via de Technische UI (geen `x_studio_`-prefix, zelfde patroon als `x_has_startup_assistance`).

**Server actions bijgewerkt (active products-berekening, 1078 + 1117):**
- Het "📦 Niet-recurrente producten"-blok wordt niet meer getoond in `x_studio_active_products_html` — enkel recurrente producten blijven zichtbaar. De onderliggende berekening van niet-recurrente producten blijft wel nodig, puur voor de Opstarthulp-detectie.
- Opstarthulp-detectie (product template id 37) levert nu ook de vroegste orderregel-datum op, weggeschreven naar `x_startup_assistance_date`.
- **Valkuil:** Odoo's `safe_eval`-sandbox kent geen `next()`-builtin (`NameError: name 'next' is not defined`) — een generator-expressie met `next(..., None)` moet vervangen worden door een gewone `for`-loop met `break`.
- **Retroactieve backfill:** geen apart eenmalig script nodig — "Run Manually" op cron 82 (Technical → Scheduled Actions) laat server action 1078 in één keer over alle actiebladen lopen en vult beide velden overal met terugwerkende kracht correct in.

**Kanban-tegel (view 3725):** nieuw icoon-only chipje (22×22px, zelfde formaat als het vlag-chipje) links van de Syndicoach-pakketbadge in de pakketbalk, enkel zichtbaar bij `x_has_startup_assistance = True`. Icoon: `fa-rocket`. Kleur: paars, dezelfde tint als `x_color = 11` (kleurenkiezer) die al elders op de kaart voor Opstarthulp gebruikt wordt (`background: #f1e6ff`, `border: rgb(170, 90, 255)`, icoon-kleur `#7b3fd6`). Hover toont `x_startup_assistance_date` via de native `title`-tooltip (`t-attf-title`), geen extra JS.

**Acceptatiecriteria:**
- [x] Veld `x_startup_assistance_date` aangemaakt (Date, Technische UI, model Sales Action Sheet)
- [x] Server action 1117 (knop "Producten ophalen") aangepast: boolean + datum correct gezet, niet-recurrente sectie uit de html, `next()`-fix toegepast
- [x] Server action 1078 (cron 82, bulk) aangepast: idem
- [x] Retroactieve backfill via "Run Manually" op cron 82 — geen apart script nodig
- [x] Kanban-chip toegevoegd op view 3725: icoon-only, paars (kleur 11), links van pakketbadge
- [x] Hover-tooltip toont aankoopdatum

---

#### BI-S2-04b — Productstatus-chips op kanban (OpenVME-pakket, Peppol, Bankkoppeling)

**Wat:** Naast Opstarthulp (BI-S2-04a) krijgen ook het OpenVME-softwarepakket, Peppol-integratie en bankkoppeling een eigen chip op de kanban-tegel, in plaats van de vrije-tekst-HTML-lijst. De volledige `x_studio_active_products_html`-berekening (recurrente + niet-recurrente productenlijst, incl. `render_recurring()`) is hierdoor overbodig geworden en verwijderd uit beide server actions — enkel de detectielogica voor de chips blijft over.

**Productmapping (opgezocht in Odoo):**
- OpenVME-pakket: Basic=34, Smart=35, Unlimited=36, Early Adopter → "Historic"=26 (categorie "OpenVME Licenties"; qty = aantal kavels)
- Peppol integratie = 38 (qty niet betekenisvol — waarden variëren wild, waarschijnlijk facturatie-aantal; enkel actief/inactief getoond)
- Bankkoppeling: huidig product 44 (+ twee ongebruikte legacy-varianten 31/32, voor de zekerheid meegenomen in de detectie); qty = aantal koppelingen

**Nieuwe velden (Technische UI, model Sales Action Sheet):**
- `x_openvme_package` — Selection: `none` / `basic` / `smart` / `unlimited` / `historic` / `pro-invoiced` / `pro-basic` / `pro-smart` / `pro-unlimited` (de vier `pro-*`-waarden later toegevoegd, zie "Pro-varianten" hieronder)
- `x_openvme_package_qty` — Integer (kavels)
- `x_has_peppol` — Boolean
- `x_has_linked_bank_account` — Boolean (productneutrale naam — aanvankelijk `x_has_ponto` genoemd, hernoemd bij het aanmaken)
- `x_linked_bank_account_qty` — Integer

**Server actions 1078 + 1117 — vereenvoudigd:** de `recurring`-tracking en de volledige HTML-opbouw zijn verwijderd. Binnen de bestaande recurrente-productenloop wordt nu gekeken of `tmpl.id` in de pakket-/Peppol-/bankkoppeling-ranges valt, en de bijhorende velden worden weggeschreven. Zonder orderregels blijven de velden gewoon op hun standaardwaarde (`none`/`False`/`0`) — geen aparte lege-lijst-tak meer nodig.

**Pro-varianten (later toegevoegd) — VME's "in beheer" bij een expert:** naast de gewone `basic`/`smart`/`unlimited`/`historic`-detectie op basis van het abonnement, krijgt het gebouw (`res.partner`, `x_studio_for_company_id` op het actieblad) een aparte behandeling als het van het type "VME in beheer" is:
- `res.partner.x_studio_company_type` — many2one → `x_company_type` (géén selectie/integer!). Records: id 1 = "VME", id 2 = "Professioneel Syndicus", **id 3 = "VME in beheer"** — enkel id 3 is relevant hier.
- `res.partner.x_studio_invoiced_by_partner` — boolean, label "Facturatie via Expert".

Logica (toegepast ná de normale pakket-detectie uit de productenloop, vóór de finale `record.write(...)`):
- `x_studio_company_type.id == 3` **en** `x_studio_invoiced_by_partner = True` → `x_openvme_package` wordt geforceerd naar **`pro-invoiced`**, ongeacht welk abonnement-pakket gedetecteerd werd (facturatie loopt via de expert, dus het onderliggende basic/smart/unlimited-onderscheid is hier niet relevant).
- `x_studio_company_type.id == 3` **en** `x_studio_invoiced_by_partner = False` → het normaal gedetecteerde pakket (`basic`/`smart`/`unlimited`) krijgt de `pro-`-prefix: **`pro-basic`**/**`pro-smart`**/**`pro-unlimited`**. Is het gedetecteerde pakket `historic` of `none`, dan blijft dat ongewijzigd — er bestaan bewust geen `pro-historic`/`pro-none`-varianten.
- Is `x_studio_company_type` niet ingevuld of niet id 3 (bv. gewone "VME" of "Professioneel Syndicus"), dan verandert er niets — het bestaande gedrag (`basic`/`smart`/`unlimited`/`historic`/`none`) blijft ongewijzigd.

Toe te voegen code (identiek in beide server actions, net vóór de finale `record.write(...)`, na de productenloop):
```python
    if company.x_studio_company_type and company.x_studio_company_type.id == 3:
        if company.x_studio_invoiced_by_partner:
            openvme_package = 'pro-invoiced'
        elif openvme_package in ('basic', 'smart', 'unlimited'):
            openvme_package = 'pro-' + openvme_package
```
`company` verwijst in beide server actions al naar `record.x_studio_for_company_id` (bestaande variabele, hergebruikt).

**Unlimited-bonus — automatische Peppol + gratis bankkoppeling:** wie `unlimited` heeft (inclusief de pro-variant `pro-unlimited`, aangezien dat dezelfde onderliggende pakket-tier is, enkel anders gefactureerd — niet expliciet bevestigd door gebruiker, wel de meest consistente lezing) krijgt automatisch `x_has_peppol = True` en `x_has_linked_bank_account = True`. `x_linked_bank_account_qty` wordt daarbij met exact 1 verhoogd t.o.v. wat de productenloop al detecteerde op basis van échte bankkoppeling-producten op de factuur (additief: 0 gedetecteerde koppelingen → 1, 2 gedetecteerde → 3).

Toe te voegen code (identiek in beide server actions, ná het pro-varianten-blok hierboven, vóór de finale `record.write(...)` — moet ná de pro-varianten-logica staan zodat `openvme_package` op dat moment al eventueel `pro-unlimited` is):
```python
    if openvme_package in ('unlimited', 'pro-unlimited'):
        has_peppol = True
        has_linked_bank_account = True
        linked_bank_account_qty += 1
```

**Kanban-chip voor de vier `pro-*`-waarden (view 3725, pakketbalk):** icoon wisselt naar `fa-briefcase` i.p.v. `fa-building` zodra de waarde met `pro-` begint (JS-ternary in `t-attf-class`, **geen** Python `if/else` — QWeb's `t-attf-*`-interpolatie compileert naar echte JavaScript, dus `.startsWith()` i.p.v. `.startswith()` en `cond ? a : b` i.p.v. `a if cond else b`):
```xml
<t t-if="record.x_openvme_package.raw_value and record.x_openvme_package.raw_value != 'none'">
    <div t-attf-class="pack-chip ovme-#{record.x_openvme_package.raw_value}">
        <i t-attf-class="fa #{record.x_openvme_package.raw_value.startsWith('pro-') ? 'fa-briefcase' : 'fa-building'}"/>
        <span><t t-esc="record.x_openvme_package.value"/></span>
        <span t-if="record.x_openvme_package.raw_value != 'unlimited' and record.x_openvme_package.raw_value != 'pro-unlimited' and record.x_openvme_package.raw_value != 'pro-invoiced'" class="pack-chip-badge"><t t-esc="record.x_openvme_package_qty.value"/></span>
    </div>
</t>
```
Kwantiteitsbadge nu ook uitgesloten voor `pro-invoiced` (naast `unlimited`/`pro-unlimited`) — die waarde heeft geen betekenisvol aantal (facturatie loopt via de expert, `x_openvme_package_qty` wordt in dat pad niet apart ingevuld), dus een "0"-badge tonen was misleidend.

**CSS-kleuren voor de vier `pro-*`-klassen** (ontbraken aanvankelijk — `ovme-pro-basic`/`ovme-pro-smart`/`ovme-pro-unlimited`/`ovme-pro-invoiced` vielen terug op de kale `.pack-chip`-stijl zonder kleur/rand): `pro-basic`/`pro-smart`/`pro-unlimited` hergebruiken bewust dezelfde kleuren als hun niet-pro tegenhanger (het briefcase-icoon maakt het onderscheid al zichtbaar) — `pro-invoiced` krijgt een eigen, nieuwe indigo/paarse tint (bewust anders dan de Opstarthulp-chip se paars, om verwarring te vermijden):
```css
.o_kanban_renderer .ovme-pro-basic { background: #d1fae5; color: #065f46; border: 1px solid #065f46; }
.o_kanban_renderer .ovme-pro-smart { background: #dbeafe; color: #1e40af; border: 1px solid #1e40af; }
.o_kanban_renderer .ovme-pro-unlimited { background: #e5e7eb; color: #1f2937; border: 1px solid #1f2937; }
.o_kanban_renderer .ovme-pro-invoiced { background: #ede9fe; color: #5b21b6; border: 1px solid #5b21b6; }
```

**Kanban-tegel (view 3725) — pakketbalk uitgebreid, alles in dezelfde rij:**
- OpenVME-pakket: altijd zichtbaar, tekst voluit (bv. "Smart") + wit rondje-badge met het aantal kavels ernaast (behalve bij Unlimited, die toont geen badge). Grijze "OpenVME"-placeholder als geen pakket actief.
- Peppol: icoon-only chip (`fa-exchange`), altijd zichtbaar — groen als actief, grijs als niet.
- Bankkoppeling: chip met icoon (`fa-university` actief / `fa-credit-card` inactief) — blauw + wit rondje-badge met aantal koppelingen als actief, grijs zonder badge als niet.
- Opstarthulp-chip (BI-S2-04a) ook altijd zichtbaar gemaakt (niet enkel bij aanwezig): paars als actief, grijs als niet — zelfde `chip-icon-only`/`chip-inactive`-klassen als Peppol.
- Syndicoach-pakketbadge: bestaande chip ongewijzigd, enkel de placeholder-tekst hernoemd van "Pakket instellen" naar "Syndicoach" (om verwarring met het nieuwe OpenVME-pakket te vermijden — het zijn en blijven twee volledig losse velden/concepten, geen vervanging van elkaar).
- Vlag-icoon verhuisd: stond eerst vooraan in de pakketbalk, staat nu enkel nog in de berichtrij (`flag-message-bar`) — die niet langer een ingevulde berichttekst vereist om te tonen, enkel `x_flag_level != 'none'`. Icoon (bel bij `reminder`, anders uitroepteken) staat inline vóór de berichttekst.
- Alle "actieve" chips (pakketten, Peppol, bankkoppeling actief) kregen een donkere rand in hun eigen accentkleur voor meer visuele definitie — grijze "inactief"-chips blijven bewust vlak/randloos.
- Basisklasse `.pack-chip` kreeg een vaste `height: 22px` + `box-sizing: border-box` zodat alle chips (icoon-only én tekst-chips) exact even hoog uitlijnen.
- Kleur Unlimited aangepast van zwarte/navy vulling naar lichtgrijze vulling + donkergrijze tekst/rand — sluit beter aan bij de lichte pastelstijl van Basic/Smart dan de aanvankelijke zwarte versie.

**Overige recurrente producten (Algemene Vergadering, Boekhouding, Professional, Discount):** hebben geen eigen chip en zijn dus niet meer zichtbaar op de kanban-tegel — bewuste scope-keuze, enkel nog raadpleegbaar via de sale order zelf in Odoo.

**`x_studio_active_products_html`:** veld blijft bestaan op het model (niet verwijderd, enkel niet meer bijgewerkt/getoond). De wrapper-div (`studio_div_ef6d47`) — ankerpunt voor de andere xpaths in deze view — bevat voorlopig 3 lege regels (`<br/>`) als tijdelijke placeholder.

**Acceptatiecriteria:**
- [x] Velden `x_openvme_package`, `x_openvme_package_qty`, `x_has_peppol`, `x_has_linked_bank_account`, `x_linked_bank_account_qty` aangemaakt
- [x] Server actions 1078 + 1117 vereenvoudigd: HTML-opbouw en `recurring`-tracking verwijderd, enkel detectie blijft
- [x] Kanban-chips toegevoegd: OpenVME-pakket (+ badge), Peppol, Bankkoppeling (+ badge) — allemaal altijd zichtbaar (kleur actief / grijs inactief)
- [x] Opstarthulp-chip ook altijd zichtbaar gemaakt (i.p.v. enkel bij aanwezig)
- [x] Syndicoach-placeholder hernoemd naar "Syndicoach"
- [x] Vlag-icoon verplaatst naar de berichtrij, niet langer afhankelijk van een ingevulde berichttekst
- [x] Donkere randjes op alle actieve chips; inactieve chips blijven vlak
- [x] `x_studio_active_products_html`-weergave verwijderd van de kanban-tegel (veld zelf niet verwijderd)
- [ ] Chips voor overige recurrente producten (Algemene Vergadering/Boekhouding/Professional) — bewust niet gebouwd, buiten scope

---

#### BI-S2-05 — Configuratie-checklist

**Wat:** Twee-modellen-structuur zoals de pain points (zie §4 "Checklist — twee-modellen-structuur"): master `x_checklist_item` + per-actieblad lijn `x_action_sheet_checkli`, met drie statussen (`required`/`dependant`/`optional`) i.p.v. een simpele boolean, en een `x_done_date` per lijn. **Stage-onafhankelijk:** laadt telkens de items die horen bij de fase waar het actieblad net binnenkomt — dus zowel "Planning Opstarthulp" (stage id 7) als "In Configuratie" (stage id 8), via `x_checklist_item.x_stage`. Geen apart automation-traject per fase nodig.

**"Custom | Add Checklist-items on Sales Action Sheets" — checklist-items laden bij fase-binnenkomst** (elke fase, niet enkel stage 8) — trigger op `x_studio_stage_id`, **geen filter op een specifieke stage-id** (vuurt bij élke fase-wijziging; de `x_stage`-filter in de `search()` hieronder selecteert vanzelf enkel de items van de nieuwe fase):
```python
Item = env['x_checklist_item']
Line = env['x_action_sheet_checkli']
_METRO_OC = ('(function(){'
    'var el=event.target;if(!el)return;'
    'event.stopPropagation();event.preventDefault();'
    'var lineId=el.dataset.lineId;'
    'var done=!el.classList.contains("metro-dot-done");'
    'el.classList.toggle("metro-dot-done",done);'
    'var lbl=el.nextElementSibling;'
    'if(lbl)lbl.classList.toggle("metro-label-done",done);'
    'fetch("/web/dataset/call_kw",{method:"POST",headers:{"Content-Type":"application/json"},'
    'body:JSON.stringify({jsonrpc:"2.0",method:"call",id:1,params:{model:"x_action_sheet_checkli",'
    'method:"write",args:[[parseInt(lineId)],{x_done:done}],kwargs:{}}})});'
    '})()')

_METRO_OC_MEETING = ('(function(){'
    'var el=event.target;if(!el)return;'
    'event.stopPropagation();event.preventDefault();'
    'var meetingId=el.dataset.meetingId;'
    'var stageId=el.dataset.targetStageId;'
    'el.classList.remove("metro-dot-meeting-clickable");'
    'el.classList.add("metro-dot-done");'
    'el.onclick=null;'
    'var lbl=el.nextElementSibling;'
    'if(lbl)lbl.classList.add("metro-label-done");'
    'fetch("/web/dataset/call_kw",{method:"POST",headers:{"Content-Type":"application/json"},'
    'body:JSON.stringify({jsonrpc:"2.0",method:"call",id:1,params:{model:"x_as_meetings",'
    'method:"write",args:[[parseInt(meetingId)],{x_studio_stage_id:parseInt(stageId)}],kwargs:{}}})});'
    '})()')

def render_checklist_html(rec):
    stage_id = rec.x_studio_stage_id.id if rec.x_studio_stage_id else False
    lines = []
    for l in rec.x_checklist_line_ids:
        if l.x_stage_id.id == stage_id:
            lines.append(l)
    lines = sorted(lines, key=lambda l: l.x_studio_sequence)
    if not lines:
        return (
            "<div class='metro-empty'>"
            "<img class='metro-empty-img' src='https://forminator-sync.openvme-odoo.workers.dev/assets/uploads/persoon-in-zenhouding-aan-computer-blue.svg'/>"
            "</div>"
        )
    rows = ''
    total = len(lines)
    for idx, line in enumerate(lines):
        done = line.x_done
        item_obj = line.x_checklist_item_id
        is_meeting = item_obj.x_auto_complete_source == 'meeting'
        label_cls = 'metro-label metro-label-done' if done else 'metro-label'
        item_cls = 'metro-item metro-item-last' if idx == total - 1 else 'metro-item'
        if not is_meeting:
            dot_cls = 'metro-dot metro-dot-done' if done else 'metro-dot'
            dot_html = "<span class='" + dot_cls + "' data-line-id='" + str(line.id) + "' onclick='" + _METRO_OC + "'></span>"
        elif done:
            dot_html = "<span class='metro-dot metro-dot-done' title='Meeting afgerond'></span>"
        else:
            clickable = item_obj.x_auto_complete_meeting_clickable
            meeting_type = item_obj.x_auto_complete_meeting_type
            target_stage = item_obj.x_auto_complete_meeting_stage
            meeting_id = False
            if clickable and meeting_type and target_stage:
                # Uitsluiten van meetings die de doel-fase al bereikt hebben: bij meerdere
                # meetings van hetzelfde type wil je klikken op de meeting die nog NIET
                # op de doel-fase staat (die moet je nog manueel vooruit zetten), niet op
                # een oudere/andere meeting die toevallig al verder staat. Een meeting die
                # al op de doel-fase staat maar waarvan de lijn toch nog niet is afgevinkt
                # (gemiste automation-trigger) wordt opgevangen door de retroactieve
                # meeting-recheck in "Custom | Sync checklist items to lines" (stap 1b),
                # niet door deze klik-zoekopdracht.
                existing_meeting = env['x_as_meetings'].search([
                    ('x_studio_for_action_sheet', '=', rec.id),
                    ('x_studio_meeting_type', '=', meeting_type.id),
                    ('x_studio_stage_id', '!=', target_stage.id),
                ], order='id desc', limit=1)
                if existing_meeting:
                    meeting_id = existing_meeting.id
            if not clickable:
                dot_html = (
                    "<span class='metro-dot metro-dot-locked' "
                    "title='Wordt automatisch afgevinkt, niet manueel te klikken'></span>"
                )
            elif meeting_id and target_stage:
                dot_html = (
                    "<span class='metro-dot metro-dot-meeting-clickable' "
                    "data-meeting-id='" + str(meeting_id) + "' data-target-stage-id='" + str(target_stage.id) + "' "
                    "title='Klik om de meeting naar " + target_stage.display_name + " te zetten' onclick='" + _METRO_OC_MEETING + "'></span>"
                )
            else:
                dot_html = (
                    "<span class='metro-dot metro-dot-waiting' "
                    "title='Wordt automatisch afgevinkt zodra de meeting bestaat'></span>"
                )
        rows += (
            "<div class='" + item_cls + "'>"
            + dot_html +
            "<span class='" + label_cls + "'>" + (line.x_name or '') + "</span>"
            "</div>"
        )
    return "<div class='metro-checklist'>" + rows + "</div>"

for rec in records:
    stage = rec.x_studio_stage_id
    if not stage:
        continue
    existing_item_ids = set(rec.x_checklist_line_ids.mapped('x_checklist_item_id').ids)
    for item in Item.search([('x_active', '=', True), ('x_stage', '=', stage.id)]):
        if item.id in existing_item_ids:
            continue
        if item.x_type == 'required':
            should_add = True
        elif item.x_type == 'dependant':
            fieldname = item.x_dependency_field
            should_add = bool(fieldname and fieldname in rec._fields and rec[fieldname])
        else:
            should_add = False  # optional: nooit automatisch
        if should_add:
            new_line = Line.create({
                'x_action_sheet_id': rec.id,
                'x_checklist_item_id': item.id,
            })
            if item.x_auto_complete_source == 'meeting' and item.x_auto_complete_meeting_type:
                meeting_domain = [
                    ('x_studio_for_action_sheet', '=', rec.id),
                    ('x_studio_meeting_type', '=', item.x_auto_complete_meeting_type.id),
                ]
                if item.x_auto_complete_meeting_stage:
                    meeting_domain.append(('x_studio_stage_id', '=', item.x_auto_complete_meeting_stage.id))
                has_meeting = env['x_as_meetings'].search_count(meeting_domain) > 0
                if has_meeting:
                    new_line.write({'x_done': True})
            elif item.x_auto_complete_source == 'field' and item.x_auto_complete_field:
                fieldname_ac = item.x_auto_complete_field
                if fieldname_ac in rec._fields and rec[fieldname_ac]:
                    new_line.write({'x_done': True})
    rec.write({'x_checklist_progress_html': render_checklist_html(rec)})
```
Werkt voor elke fase met `x_checklist_item`-records: nu al voor "Planning Opstarthulp" (stage id 7) en "In Configuratie" (stage id 8) tegelijk, zonder aparte automation per fase. Dit is de **volledige, definitieve versie** van deze automation (inclusief de HTML-herberekening uit BI-S2-05a en de auto-complete-check uit BI-S2-05b) — BI-S2-05a en BI-S2-05b beschrijven enkel nog de achtergrond/reden, niet een apart te plakken codefragment.

**"Custom | Add done date to checklist items when checked" — `x_done_date` invullen** — automation op `x_action_sheet_checkli`, trigger op `x_done`:
```python
Line = env['x_action_sheet_checkli']
_METRO_OC = ('(function(){'
    'var el=event.target;if(!el)return;'
    'event.stopPropagation();event.preventDefault();'
    'var lineId=el.dataset.lineId;'
    'var done=!el.classList.contains("metro-dot-done");'
    'el.classList.toggle("metro-dot-done",done);'
    'var lbl=el.nextElementSibling;'
    'if(lbl)lbl.classList.toggle("metro-label-done",done);'
    'fetch("/web/dataset/call_kw",{method:"POST",headers:{"Content-Type":"application/json"},'
    'body:JSON.stringify({jsonrpc:"2.0",method:"call",id:1,params:{model:"x_action_sheet_checkli",'
    'method:"write",args:[[parseInt(lineId)],{x_done:done}],kwargs:{}}})});'
    '})()')

_METRO_OC_MEETING = ('(function(){'
    'var el=event.target;if(!el)return;'
    'event.stopPropagation();event.preventDefault();'
    'var meetingId=el.dataset.meetingId;'
    'var stageId=el.dataset.targetStageId;'
    'el.classList.remove("metro-dot-meeting-clickable");'
    'el.classList.add("metro-dot-done");'
    'el.onclick=null;'
    'var lbl=el.nextElementSibling;'
    'if(lbl)lbl.classList.add("metro-label-done");'
    'fetch("/web/dataset/call_kw",{method:"POST",headers:{"Content-Type":"application/json"},'
    'body:JSON.stringify({jsonrpc:"2.0",method:"call",id:1,params:{model:"x_as_meetings",'
    'method:"write",args:[[parseInt(meetingId)],{x_studio_stage_id:parseInt(stageId)}],kwargs:{}}})});'
    '})()')

def render_checklist_html(rec):
    stage_id = rec.x_studio_stage_id.id if rec.x_studio_stage_id else False
    lines = []
    for l in rec.x_checklist_line_ids:
        if l.x_stage_id.id == stage_id:
            lines.append(l)
    lines = sorted(lines, key=lambda l: l.x_studio_sequence)
    if not lines:
        return (
            "<div class='metro-empty'>"
            "<img class='metro-empty-img' src='https://forminator-sync.openvme-odoo.workers.dev/assets/uploads/persoon-in-zenhouding-aan-computer-blue.svg'/>"
            "</div>"
        )
    rows = ''
    total = len(lines)
    for idx, line in enumerate(lines):
        done = line.x_done
        item_obj = line.x_checklist_item_id
        is_meeting = item_obj.x_auto_complete_source == 'meeting'
        label_cls = 'metro-label metro-label-done' if done else 'metro-label'
        item_cls = 'metro-item metro-item-last' if idx == total - 1 else 'metro-item'
        if not is_meeting:
            dot_cls = 'metro-dot metro-dot-done' if done else 'metro-dot'
            dot_html = "<span class='" + dot_cls + "' data-line-id='" + str(line.id) + "' onclick='" + _METRO_OC + "'></span>"
        elif done:
            dot_html = "<span class='metro-dot metro-dot-done' title='Meeting afgerond'></span>"
        else:
            clickable = item_obj.x_auto_complete_meeting_clickable
            meeting_type = item_obj.x_auto_complete_meeting_type
            target_stage = item_obj.x_auto_complete_meeting_stage
            meeting_id = False
            if clickable and meeting_type and target_stage:
                # Uitsluiten van meetings die de doel-fase al bereikt hebben: bij meerdere
                # meetings van hetzelfde type wil je klikken op de meeting die nog NIET
                # op de doel-fase staat (die moet je nog manueel vooruit zetten), niet op
                # een oudere/andere meeting die toevallig al verder staat. Een meeting die
                # al op de doel-fase staat maar waarvan de lijn toch nog niet is afgevinkt
                # (gemiste automation-trigger) wordt opgevangen door de retroactieve
                # meeting-recheck in "Custom | Sync checklist items to lines" (stap 1b),
                # niet door deze klik-zoekopdracht.
                existing_meeting = env['x_as_meetings'].search([
                    ('x_studio_for_action_sheet', '=', rec.id),
                    ('x_studio_meeting_type', '=', meeting_type.id),
                    ('x_studio_stage_id', '!=', target_stage.id),
                ], order='id desc', limit=1)
                if existing_meeting:
                    meeting_id = existing_meeting.id
            if not clickable:
                dot_html = (
                    "<span class='metro-dot metro-dot-locked' "
                    "title='Wordt automatisch afgevinkt, niet manueel te klikken'></span>"
                )
            elif meeting_id and target_stage:
                dot_html = (
                    "<span class='metro-dot metro-dot-meeting-clickable' "
                    "data-meeting-id='" + str(meeting_id) + "' data-target-stage-id='" + str(target_stage.id) + "' "
                    "title='Klik om de meeting naar " + target_stage.display_name + " te zetten' onclick='" + _METRO_OC_MEETING + "'></span>"
                )
            else:
                dot_html = (
                    "<span class='metro-dot metro-dot-waiting' "
                    "title='Wordt automatisch afgevinkt zodra de meeting bestaat'></span>"
                )
        rows += (
            "<div class='" + item_cls + "'>"
            + dot_html +
            "<span class='" + label_cls + "'>" + (line.x_name or '') + "</span>"
            "</div>"
        )
    return "<div class='metro-checklist'>" + rows + "</div>"

for line in records:
    if line.x_done and not line.x_done_date:
        line.write({'x_done_date': datetime.datetime.utcnow()})

for rec in records.mapped('x_action_sheet_id'):
    rec.write({'x_checklist_progress_html': render_checklist_html(rec)})
```
**Val niet voor `fields.Datetime.now()`** — de `fields`-module (odoo.fields) zit niet in de automation-sandbox (`NameError: name 'fields' is not defined`), enkel de standaard Python `datetime`-module. `datetime.datetime.utcnow()` geeft naive UTC-tijd, wat exact is wat Odoo intern verwacht voor Datetime-velden (zelfde conventie als `fields.Datetime.now()` zou geven, enkel zonder de niet-beschikbare wrapper).

Vult enkel bij de eerste keer aanvinken; bij uit- en terug aanvinken blijft de oorspronkelijke datum staan (bewuste keuze, aanpasbaar als CS liever de laatste aanvink-datum ziet).

**"Custom | Move Action Sheet To Next Stage When Checklist Is Complete" (nog aan te maken, voorstel-naam) — doorschuiven naar Follow-up Validatie** — automation op `x_action_sheet_checkli`, trigger op `x_done`:
```python
Sheet = env['x_sales_action_sheet']
config_stage_id = 8
followup_stage_id = 9

for rec in records.mapped('x_action_sheet_id'):
    if rec.x_studio_stage_id.id != config_stage_id:
        continue
    lines = rec.x_checklist_line_ids.filtered(
        lambda l: l.x_checklist_item_id.x_type in ('required', 'dependant')
    )
    if lines and all(lines.mapped('x_done')):
        rec.write({'x_studio_stage_id': followup_stage_id})
        model_id = env['ir.model'].search([('model', '=', 'x_sales_action_sheet')], limit=1).id
        env['mail.activity'].create({
            'res_model_id': model_id,
            'res_id': rec.id,
            'activity_type_id': 2,
            'summary': 'Follow-up call configuratie',
            'date_deadline': datetime.date.today() + datetime.timedelta(days=14),
            'user_id': rec.x_studio_support_user_id.id or rec.x_studio_user_id.id or env.uid,
        })
```
Enkel `required` + `dependant` items tellen mee voor de voortgangscheck — `optional` items (ook zelf toegevoegde) blokkeren de doorschuif niet.

Deze automation bewaakt specifiek de overgang In Configuratie → Follow-up Validatie. **Nog niet gebouwd:** een symmetrische variant voor Planning Opstarthulp → In Configuratie (zelfde `all(lines.mapped('x_done'))`-check maar met `config_stage_id`/`followup_stage_id` vervangen door 7/8) — pas toevoegen als CS ook daar een auto-advance wil, niet aangenomen.

**Optioneel item toevoegen:** editable o2m-lijst op het formulier (CS Onboarding tab), met domeinfilter `[('x_type','=','optional')]` op de item-picker — puur Studio/view-instelling, geen code.

**"Custom | Sync checklist items to lines"** — manueel te triggeren server-actie (geen automation/trigger, CS voert dit zelf uit na het toevoegen of archiveren van master-items). **Hernoemen hoeft hier niet meer bij** — `x_action_sheet_checkli.x_name` is een related field geworden (zie §4), dus een hernoeming van het master-item is meteen overal zichtbaar, in elke taal, zonder deze actie. Doet drie dingen: (1) nieuwe/actieve items — voegt ze retroactief toe aan actiebladen die al in de bijhorende fase zitten (zelfde `required`/`dependant`-logica als "Custom | Add Checklist-items on Sales Action Sheets", die enkel bij een stage-*wijziging* vuurt en dus niets doet voor actiebladen die al langer in die fase zitten), (1b) meeting-items retroactief herevalueren — bestaande niet-afgevinkte meeting-items opnieuw checken tegen de huidige meeting-stand (vangt gemiste automation-triggers op, zie bug-note hieronder), (2) gearchiveerde items (`x_active = False`) — verwijdert de bijhorende **nog niet afgevinkte** lijnen (bewuste keuze: al afgevinkte lijnen blijven staan als historiek, net zoals de rest van dit ontwerp historiek nooit stilletjes wist). Herberekent daarna `x_checklist_progress_html` voor elk betrokken actieblad.

```python
Line = env['x_action_sheet_checkli']
Item = env['x_checklist_item']
Sheet = env['x_sales_action_sheet']

_METRO_OC = ('(function(){'
    'var el=event.target;if(!el)return;'
    'event.stopPropagation();event.preventDefault();'
    'var lineId=el.dataset.lineId;'
    'var done=!el.classList.contains("metro-dot-done");'
    'el.classList.toggle("metro-dot-done",done);'
    'var lbl=el.nextElementSibling;'
    'if(lbl)lbl.classList.toggle("metro-label-done",done);'
    'fetch("/web/dataset/call_kw",{method:"POST",headers:{"Content-Type":"application/json"},'
    'body:JSON.stringify({jsonrpc:"2.0",method:"call",id:1,params:{model:"x_action_sheet_checkli",'
    'method:"write",args:[[parseInt(lineId)],{x_done:done}],kwargs:{}}})});'
    '})()')

_METRO_OC_MEETING = ('(function(){'
    'var el=event.target;if(!el)return;'
    'event.stopPropagation();event.preventDefault();'
    'var meetingId=el.dataset.meetingId;'
    'var stageId=el.dataset.targetStageId;'
    'el.classList.remove("metro-dot-meeting-clickable");'
    'el.classList.add("metro-dot-done");'
    'el.onclick=null;'
    'var lbl=el.nextElementSibling;'
    'if(lbl)lbl.classList.add("metro-label-done");'
    'fetch("/web/dataset/call_kw",{method:"POST",headers:{"Content-Type":"application/json"},'
    'body:JSON.stringify({jsonrpc:"2.0",method:"call",id:1,params:{model:"x_as_meetings",'
    'method:"write",args:[[parseInt(meetingId)],{x_studio_stage_id:parseInt(stageId)}],kwargs:{}}})});'
    '})()')

def render_checklist_html(rec):
    stage_id = rec.x_studio_stage_id.id if rec.x_studio_stage_id else False
    lines = []
    for l in rec.x_checklist_line_ids:
        if l.x_stage_id.id == stage_id:
            lines.append(l)
    lines = sorted(lines, key=lambda l: l.x_studio_sequence)
    if not lines:
        return (
            "<div class='metro-empty'>"
            "<img class='metro-empty-img' src='https://forminator-sync.openvme-odoo.workers.dev/assets/uploads/persoon-in-zenhouding-aan-computer-blue.svg'/>"
            "</div>"
        )
    rows = ''
    total = len(lines)
    for idx, line in enumerate(lines):
        done = line.x_done
        item_obj = line.x_checklist_item_id
        is_meeting = item_obj.x_auto_complete_source == 'meeting'
        label_cls = 'metro-label metro-label-done' if done else 'metro-label'
        item_cls = 'metro-item metro-item-last' if idx == total - 1 else 'metro-item'
        if not is_meeting:
            dot_cls = 'metro-dot metro-dot-done' if done else 'metro-dot'
            dot_html = "<span class='" + dot_cls + "' data-line-id='" + str(line.id) + "' onclick='" + _METRO_OC + "'></span>"
        elif done:
            dot_html = "<span class='metro-dot metro-dot-done' title='Meeting afgerond'></span>"
        else:
            clickable = item_obj.x_auto_complete_meeting_clickable
            meeting_type = item_obj.x_auto_complete_meeting_type
            target_stage = item_obj.x_auto_complete_meeting_stage
            meeting_id = False
            if clickable and meeting_type and target_stage:
                # Uitsluiten van meetings die de doel-fase al bereikt hebben: bij meerdere
                # meetings van hetzelfde type wil je klikken op de meeting die nog NIET
                # op de doel-fase staat (die moet je nog manueel vooruit zetten), niet op
                # een oudere/andere meeting die toevallig al verder staat. Een meeting die
                # al op de doel-fase staat maar waarvan de lijn toch nog niet is afgevinkt
                # (gemiste automation-trigger) wordt opgevangen door de retroactieve
                # meeting-recheck in "Custom | Sync checklist items to lines" (stap 1b),
                # niet door deze klik-zoekopdracht.
                existing_meeting = env['x_as_meetings'].search([
                    ('x_studio_for_action_sheet', '=', rec.id),
                    ('x_studio_meeting_type', '=', meeting_type.id),
                    ('x_studio_stage_id', '!=', target_stage.id),
                ], order='id desc', limit=1)
                if existing_meeting:
                    meeting_id = existing_meeting.id
            if not clickable:
                dot_html = (
                    "<span class='metro-dot metro-dot-locked' "
                    "title='Wordt automatisch afgevinkt, niet manueel te klikken'></span>"
                )
            elif meeting_id and target_stage:
                dot_html = (
                    "<span class='metro-dot metro-dot-meeting-clickable' "
                    "data-meeting-id='" + str(meeting_id) + "' data-target-stage-id='" + str(target_stage.id) + "' "
                    "title='Klik om de meeting naar " + target_stage.display_name + " te zetten' onclick='" + _METRO_OC_MEETING + "'></span>"
                )
            else:
                dot_html = (
                    "<span class='metro-dot metro-dot-waiting' "
                    "title='Wordt automatisch afgevinkt zodra de meeting bestaat'></span>"
                )
        rows += (
            "<div class='" + item_cls + "'>"
            + dot_html +
            "<span class='" + label_cls + "'>" + (line.x_name or '') + "</span>"
            "</div>"
        )
    return "<div class='metro-checklist'>" + rows + "</div>"

# 1. Nieuwe/actieve items retroactief toevoegen aan actiebladen die al in die fase zitten
for item in Item.search([('x_active', '=', True)]):
    stage = item.x_stage
    if not stage:
        continue
    for rec in Sheet.search([('x_studio_stage_id', '=', stage.id)]):
        existing_item_ids = set(rec.x_checklist_line_ids.mapped('x_checklist_item_id').ids)
        if item.id in existing_item_ids:
            continue
        if item.x_type == 'required':
            should_add = True
        elif item.x_type == 'dependant':
            fieldname = item.x_dependency_field
            should_add = bool(fieldname and fieldname in rec._fields and rec[fieldname])
        else:
            should_add = False
        if should_add:
            new_line = Line.create({
                'x_action_sheet_id': rec.id,
                'x_checklist_item_id': item.id,
            })
            if item.x_auto_complete_source == 'meeting' and item.x_auto_complete_meeting_type:
                meeting_domain = [
                    ('x_studio_for_action_sheet', '=', rec.id),
                    ('x_studio_meeting_type', '=', item.x_auto_complete_meeting_type.id),
                ]
                if item.x_auto_complete_meeting_stage:
                    meeting_domain.append(('x_studio_stage_id', '=', item.x_auto_complete_meeting_stage.id))
                has_meeting = env['x_as_meetings'].search_count(meeting_domain) > 0
                if has_meeting:
                    new_line.write({'x_done': True})
            elif item.x_auto_complete_source == 'field' and item.x_auto_complete_field:
                fieldname_ac = item.x_auto_complete_field
                if fieldname_ac in rec._fields and rec[fieldname_ac]:
                    new_line.write({'x_done': True})

# 1b. Retroactieve meeting-recheck: bestaande, nog niet-afgevinkte meeting-items herevalueren
# tegen de HUIDIGE meeting-stand. Vangt het geval op waarbij een meeting al vroeger de
# doel-fase bereikte maar de automation "Custom | Auto-complete checklist item on meeting
# added" dat moment miste (bv. omdat de automation nog niet actief/gefixt was toen de
# meeting-stage gewijzigd werd) - zonder deze stap blijft zo'n lijn permanent hangen als
# "wordt automatisch afgevinkt" i.p.v. afgevinkt, want er komt geen nieuwe write-trigger
# op die meeting meer.
meeting_items = Item.search([('x_auto_complete_source', '=', 'meeting')])
for item in meeting_items:
    if not item.x_auto_complete_meeting_type:
        continue
    undone_lines = Line.search([
        ('x_checklist_item_id', '=', item.id),
        ('x_done', '=', False),
    ])
    for line in undone_lines:
        rec = line.x_action_sheet_id
        meeting_domain = [
            ('x_studio_for_action_sheet', '=', rec.id),
            ('x_studio_meeting_type', '=', item.x_auto_complete_meeting_type.id),
        ]
        if item.x_auto_complete_meeting_stage:
            meeting_domain.append(('x_studio_stage_id', '=', item.x_auto_complete_meeting_stage.id))
        has_meeting = env['x_as_meetings'].search_count(meeting_domain) > 0
        if has_meeting:
            line.write({'x_done': True})

# 2. Gearchiveerde items: nog niet-afgevinkte lijnen verwijderen (afgevinkte lijnen blijven als historiek)
inactive_items = Item.search([('x_active', '=', False)])
if inactive_items:
    obsolete_lines = Line.search([
        ('x_checklist_item_id', 'in', inactive_items.ids),
        ('x_done', '=', False),
    ])
    if obsolete_lines:
        obsolete_lines.unlink()

# 3. HTML herberekenen voor alle actiebladen, BEHALVE die in fase Discovery (stage id 1) —
# dat is veruit de grootste groep en heeft nooit checklist-items (er bestaat geen
# x_checklist_item met x_stage = Discovery), dus herberekenen daar is pure verspilling.
# Alle andere fases WEL herberekenen, ook al hebben ze nu geen items — zo blijft dit
# automatisch correct als er ooit een checklist-item aan een andere fase toegevoegd wordt.
for rec in Sheet.search([('x_studio_stage_id', '!=', 1)]):
    rec.write({'x_checklist_progress_html': render_checklist_html(rec)})
```

Aan te maken als een gewone server-actie (model: `x_checklist_item`, actie "Python-code uitvoeren"), beschikbaar via het actiemenu (⚙) op de lijst/formulierweergave van dat model — zelfde patroon als de "Eenmalige patches"-knoppen elders in dit project. Geen trigger/automation nodig, CS klikt dit bewust aan na het toevoegen of archiveren van master-items, of wanneer de meeting-status twijfelachtig lijkt.

**Acceptatiecriteria:**
- [x] Model `x_checklist_item` aangemaakt (master), met de 5 standaarditems en correcte `x_type` (3× required, 2× dependant); `x_stage` als **many2one → `x_support_stage`** (niet selection)
- [x] Model `x_action_sheet_checkli` aangemaakt, o2m `x_checklist_line_ids` op actieblad; `x_stage_id` als related many2one (`x_checklist_item_id.x_stage`, store=True); `x_name` als related char (`x_checklist_item_id.x_name`, store=True) — live en vertaalbaar, geen kopie meer
- [x] "Custom | Add Checklist-items on Sales Action Sheets" generalisatie: trigger op élke `x_studio_stage_id`-wijziging (geen stage-filter meer op de trigger zelf), items geladen via `x_stage = stage.id` in de `search()`, met dedup-check
- [ ] Planning Opstarthulp-items (stage id 7) aanmaakbaar in `x_checklist_item` zodra CS de concrete items kent — geen extra automation nodig
- [x] "Custom | Add done date to checklist items when checked": `x_done_date` wordt ingevuld bij eerste keer aanvinken (met `datetime.datetime.utcnow()`, niet `fields.Datetime.now()` — zie sandbox-noot hierboven)
- [ ] "Custom | Move Action Sheet To Next Stage When Checklist Is Complete": bij alle required + dependant items ✓ (fase In Configuratie) → stage naar "Follow-up Validatie" + activiteit "Follow-up call" (+14 dagen)
- [x] Formulierweergave: alle lijnen zichtbaar over alle fases heen (geen fase-filter), checklist aanvinkbaar, `x_done_date` leesbaar per lijn — samengevatte kanban-weergave is zelfbouw door CS, buiten scope
- [ ] "Optioneel item toevoegen"-lijst werkt met domeinfilter, blokkeert de doorschuif niet
- [ ] "Custom | Sync checklist items to lines" server-actie aangemaakt en manueel getest: retroactief toevoegen van nieuwe items, retroactieve meeting-recheck, verwijderen van niet-afgevinkte lijnen bij archiveren

---

#### BI-S2-05a — Checklist metro-line visual op de kanban-kaart

**Wat:** De checklist-voortgang (BI-S2-05) visueel tonen op de kanban-kaart als een "metro-line"/stepper: een verticale lijn met een bolletje per checklist-item, afgevinkt = groen gevuld. **Beslissing: bolletjes zijn rechtstreeks klikbaar op de kaart zelf** (niet enkel doorklikken naar het actieblad) — bewuste keuze ondanks de extra complexiteit/fragiliteit t.o.v. het alternatief. **Faseafhankelijk:** de visual toont enkel de checklist-items van de fase waar het actieblad zich *nu* in bevindt (`line.x_stage_id == rec.x_studio_stage_id`, via een gewone `for`-loop — geen `.filtered(lambda ...)`, want een lambda die `stage_id` uit de omsluitende functie vangt geeft `forbidden opcode(s) in 'lambda': STORE_DEREF, LOAD_CLOSURE` in de safe_eval-sandbox, zelfde categorie als de `next()`-beperking) — sleep je de kaart naar een andere fase, dan herberekent "Custom | Add Checklist-items on Sales Action Sheets" de visual naar wat in die nieuwe fase moet gebeuren (zelfde trigger als een gewone stage-wijziging, drag-and-drop schrijft ook gewoon naar `x_studio_stage_id`). De volledige historiek (alle fases) blijft wel zichtbaar in de editable lijst op het formulier — enkel deze kanban/form-visual is gefilterd op de huidige fase. **Leeg-status:** heeft de huidige fase geen checklist-items, dan toont de visual een illustratie (`persoon-in-zenhouding-aan-computer-blue.svg`) in plaats van een lege lijst.

**Waarom geen rechtstreekse o2m-rendering:** kanban-QWeb-templates kunnen enkel scalaire/relationele ID's van een o2m-veld lezen, niet de onderliggende velden (naam, afgevinkt) van elke lijn zonder een eigen JS-component te bouwen (buiten scope — geen custom modules/JS in dit project). Oplossing: een **berekend HTML-veld** op het actieblad, exact hetzelfde patroon als het vroegere `x_studio_active_products_html`, herberekend door "Custom | Add Checklist-items on Sales Action Sheets" en "Custom | Add done date to checklist items when checked".

**Nieuw veld:** `x_checklist_progress_html` (Html) op `x_sales_action_sheet`, aangemaakt via de veldenbewerker (geen `x_studio_`-prefix).

**Sanitisatie uitschakelen (zelfde patroon als de copy-wizards):**
- View-niveau: `sanitize="false"` op de `<field>`-tag in de kanban-XML.
- Server-niveau: `x_sales_action_sheet` / `x_checklist_progress_html` toegevoegd aan de `TARGETS`-array in `handleDisableSanitize` (`src/modules/cx-automations/routes.js`) — knop "Sanitisatie uitschakelen" in cx-automations opnieuw klikken na deployen.

**Klik-mechanisme:** zelfde `_oc`-achtige inline-JS-truc als de copy-wizards — `onclick` op elk bolletje doet een rechtstreekse `/web/dataset/call_kw`-write naar `x_action_sheet_checkli.x_done`, **met verplichte `event.stopPropagation()` + `event.preventDefault()`** (anders opent de klik ook het record, want een klik op een kanban-kaart opent normaal het record). Visuele toggle gebeurt **optimistic** (CSS-klasse lokaal geflipt vóór de RPC-respons) — de HTML op de kaart zelf wordt niet live herberekend na een klik, enkel bij de volgende page load/reload (aanvaard trade-off, geen custom JS-refresh-mechanisme gebouwd).

**HTML-generatie:** een `render_checklist_html(rec)`-functie, gedupliceerd in "Custom | Add Checklist-items on Sales Action Sheets", "Custom | Add done date to checklist items when checked" en "Custom | Sync checklist items to lines" — automations kunnen geen code delen, dus letterlijk dezelfde functie op drie plekken (volledige code: zie BI-S2-05, niet hier herhaald om driftende kopieën te vermijden). **CSS staat los in een `<style>`-blok per view** (niet inline in de gegenereerde HTML) — bewuste keuze zodat dezelfde class-namen (`.metro-dot`, `.metro-item`, ...) op de kanban-kaart en op het formulier elk hun eigen stijl kunnen krijgen (bv. groter/anders op het formulier), zonder de HTML-generatie te moeten aanpassen.

**Meeting-gedreven items: 4 mogelijke dot-states** (zie BI-S2-05b) — een checklist-item met `x_auto_complete_source = 'meeting'` gebruikt géén apart icoon of gestippelde rand meer (verwijderd na feedback dat dit niet duidelijk/mooi genoeg was) — enkel kleur en vorm van het bolletje zelf maken het onderscheid, met een correcte hover-tooltip per state:
1. **Al afgevinkt** (`x_done = True`) — zelfde groen gevuld bolletje als een gewoon item, niet klikbaar, `title="Meeting afgerond"`.
2. **Nooit manueel klikbaar** (`x_auto_complete_meeting_clickable = False`, bv. "Opstarthulp ingepland") — grijs bolletje met een **kruis (×)** erin (`.metro-dot-locked`), ongeacht of er al een meeting bestaat: dit item vinkt zichzelf automatisch af zodra een meeting van het juiste type de doel-fase bereikt, en mag nooit manueel omgezet worden. `title="Wordt automatisch afgevinkt, niet manueel te klikken"`.
3. **Wél manueel klikbaar toegestaan, maar nog geen geschikte meeting gevonden** (`x_auto_complete_meeting_clickable = True`, geen meeting van het juiste type aanwezig) — **licht grijs, leeg bolletje** (`.metro-dot-waiting`), niet klikbaar. `title="Wordt automatisch afgevinkt zodra de meeting bestaat"`. CS moet dan zelf een meeting aanmaken (normale weg), niet via de kanban-kaart.
4. **Wél manueel klikbaar toegestaan, en er bestaat al een meeting van het juiste type die de doel-fase nog niet bereikt heeft** — **actief bolletje met blauwe rand** (`.metro-dot-meeting-clickable`), klikbaar: een klik schrijft rechtstreeks `x_studio_stage_id` van die **bestaande meeting** naar de doel-fase (niet naar `x_done` op de checklist-lijn zelf — dat gebeurt vanzelf via "Custom | Auto-complete checklist item on meeting added", die op die stage-wijziging triggert). Reden: de fase van een bestaande meeting bijwerken is één simpele write; een meeting *aanmaken* vanuit een klik zou extra info vergen (type, datum, ...) die niet zomaar automatisch in te vullen is — dus dat pad wordt niet ondersteund. **Meerdere meetings van hetzelfde type (bugfix):** de zoekopdracht sluit meetings die de doel-fase al bereikt hebben expliciet uit (`x_studio_stage_id != doel-fase`) — anders kon bij meerdere meetings van hetzelfde type de verkeerde (bv. een oudere, al voorbije) meeting gekozen worden i.p.v. de meeting die nog effectief vooruitgezet moet worden. Een meeting die de doel-fase al bereikt heeft maar waarvan de checklist-lijn toch nog niet is afgevinkt (gemiste automation-trigger) wordt niet via deze klik-zoekopdracht opgevangen, maar via de retroactieve meeting-recheck (stap 1b) in "Custom | Sync checklist items to lines".

Vereist een tweede inline-JS-constante naast `_METRO_OC`: `_METRO_OC_MEETING`, die net als `_METRO_OC` `event.stopPropagation()`/`event.preventDefault()` gebruikt en optimistisch de dot lokaal op "afgevinkt" zet, maar schrijft naar `x_as_meetings.x_studio_stage_id` i.p.v. naar `x_action_sheet_checkli.x_done`.

**Bug gevonden en gefixt (via live check van de 3 server-acties in Odoo):** `_METRO_OC_MEETING` werd in alle drie de automations gebruikt in `render_checklist_html()` maar nergens gedefinieerd — gaf `NameError: name '_METRO_OC_MEETING' is not defined` zodra de klikbare-meeting-tak bereikt werd (dus zodra een item met `x_auto_complete_meeting_clickable = True` een bestaande, niet-op-doelfase meeting vond). Een onafgevangen exception in automation-code rolt de hele transactie van die run terug, wat het inconsistente beeld verklaarde (sommige actiebladen tonen alles correct, andere blijven met verouderde HTML/namen zitten, afhankelijk van of ze de bug-tak raakten). Fix: `_METRO_OC_MEETING`-definitie toegevoegd, meteen na `_METRO_OC`, in alle drie de automations.

**Tweede bug gevonden (na live her-controle op verzoek van CS, "no change" na de eerste fix):** ook na de `_METRO_OC_MEETING`-fix bleven sommige "Opstarthulp gehouden"-lijnen op non-clickable/wachtend staan terwijl de bijhorende meeting al op de doel-fase stond. Root cause: "Custom | Auto-complete checklist item on meeting added" triggert enkel op een *write* op `x_as_meetings.x_studio_stage_id` — als de meeting-stage al vóór (of buiten) die trigger-flow op de doel-fase gezet was, komt er nooit meer een nieuwe write die de automation opnieuw laat vuren, en blijft de lijn permanent `x_done = False` hangen (gerenderd als "wordt automatisch afgevinkt" i.p.v. afgevinkt). Losstaand van de stale-naam-vraag: de rename-stap (1) zelf was en is correct (geverifieerd via live code-read van actie 1174 na de CS-fix — `_METRO_OC_MEETING` staat er correct in, geen syntaxfout); indien namen na een sync-run toch stale blijven, is de meest waarschijnlijke verklaring dat de sync-actie werd uitgevoerd **vóór** het opslaan van de gefixte code, niet een probleem in de code zelf. Fix voor de meeting-kant: stap 2b hierboven, retroactieve meeting-recheck in "Custom | Sync checklist items to lines" — draai deze actie opnieuw na elke keer dat CS twijfelt of de checklist-status nog klopt met de werkelijke meeting-stand.

**Derde bug gevonden — echte root cause van de "stale namen" (na live vergelijking van Odoo-UI vs. API-data):** `x_checklist_item.x_name` is een **vertaalbaar veld** (`translate=True`). Bij het hernoemen van item 8 ("Opstarthulp afgerond" → "Opstarthulp gehouden") werden enkel de Engelse en Franse vertalingen bijgewerkt — de Nederlandse (BE) waarde, de taal waarin CS werkt én waarin de sync-actie draait, bleef "Opstarthulp afgerond". De stap "hernoemde items" vergeleek `line.x_name != item.x_name` in die Nederlandse context — beide kanten waren dus al gelijk, geen mismatch gevonden, niets fout in de code zelf. Dit verklaart alle voorheen "onverklaarbare" stale lijnen volledig; er was geen transactie-rollback of uitvoeringsprobleem nodig als verklaring.

**Architectuurbeslissing (CS: "we gebruiken vertalingen, dat moet blijven werken"):** in plaats van de kopieer-en-vergelijk-aanpak vertaalbaar te maken (wat zou vereisen dat de sync-actie `ir.translation`-records voor élke geïnstalleerde taal apart kopieert), wordt `x_action_sheet_checkli.x_name` omgezet naar een **related field** — exact hetzelfde patroon als `x_stage_id`: `related='x_checklist_item_id.x_name'`, `store=True`, alleen-lezen. Een related field naar een vertaalbaar brontveld is zelf ook automatisch vertaalbaar en toont altijd de naam in de taal van de kijker, live, zonder ooit stale te kunnen worden. **Gevolg:** de hele "hernoemde items"-stap (voorheen stap 1) is overbodig geworden en is verwijderd uit "Custom | Sync checklist items to lines" (zie code hierboven, nu beginnend bij stap 1 = retroactief toevoegen). Ook de `'x_name': item.x_name`-regel in de `Line.create({...})`-aanroepen is verwijderd — een related+store-veld is niet rechtstreeks beschrijfbaar via `create()`/`write()`, Odoo vult het zelf in op basis van `x_checklist_item_id`. **Deze veldwijziging gebeurt via de veldenbewerker/Studio** (veldtype/related-instelling aanpassen op een bestaand veld — geen code, conform de projectregel bovenaan dit document), niet via een server-actie. Na het omzetten herberekent Odoo automatisch alle bestaande lijnen — de bestaande "stale" lijnen lossen zich vanzelf op, geen aparte opkuisactie nodig.

**Kanban-view:** placeholder `<div name="studio_div_ef6d47"><br/><br/><br/></div>` wordt `<div name="studio_div_ef6d47"><field name="x_checklist_progress_html" sanitize="false"/></div>`, met de `.metro-*`-CSS in het bestaande gedeelde `<style>`-blok van die kanban-view.

**Formulierweergave:** hetzelfde veld kan ook getoond worden op het formulier (bv. Config-tab, boven de "Checklist items"-tabel) met `<field name="x_checklist_progress_html" sanitize="false"/>` — met een **eigen, apart `<style>`-blok** in de formulierweergave (zelfde class-namen, eigen regels), zodat de weergave daar losstaand aangepast kan worden t.o.v. de kanban-kaart.

**CSS (toevoegen aan het bestaande `<style>`-blok):**
```css
.metro-checklist { display:flex; flex-direction:column; margin-top:4px; padding:6px 8px; }
.metro-item { position:relative; isolation:isolate; display:flex; align-items:center; min-height:22px; padding-left:22px; }
.metro-item:not(.metro-item-last)::after {
    content:''; position:absolute; left:6px; top:16px; bottom:-6px; width:2px; background:#d0d0d0;
}
.metro-dot {
    position:absolute; left:0; top:3px; width:14px; height:14px; border-radius:50%;
    border:2px solid #b0b0b0; background:#fff; cursor:pointer; box-sizing:border-box; z-index:1;
}
.metro-dot-done { background:#2e7d32; border-color:#2e7d32; }
.metro-dot-locked { background:#e0e0e0; border-color:#c4c4c4; cursor:default; }
.metro-dot-locked::after {
    content:'\2715'; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    font-size:9px; line-height:1; color:#888;
}
.metro-dot-waiting { background:#f0f0f0; border-color:#d8d8d8; cursor:default; }
.metro-dot-meeting-clickable { background:#fff; border-color:#1565c0; cursor:pointer; }
.metro-dot-meeting-clickable:hover { background:#e3f2fd; }
.metro-label { font-size:11px; color:#444; margin-left:6px; line-height:14px; }
.metro-label-done { color:#999; text-decoration:line-through; }
.metro-empty { display:flex; align-items:center; justify-content:center; padding:6px 8px; }
.metro-empty-img { max-width:64px; max-height:64px; opacity:0.85; }
```

**Acceptatiecriteria:**
- [x] Route `handleDisableSanitize` uitgebreid met `x_sales_action_sheet`/`x_checklist_progress_html`
- [ ] Veld `x_checklist_progress_html` (Html) aangemaakt op Sales Action Sheet
- [ ] "Custom | Add Checklist-items on Sales Action Sheets": `render_checklist_html()` toegevoegd, geschreven na item-laad-loop
- [ ] "Custom | Add done date to checklist items when checked": `render_checklist_html()` toegevoegd, geschreven per betrokken actieblad na `x_done_date`-loop
- [ ] "Custom | Sync checklist items to lines": `render_checklist_html()` toegevoegd (stap 4)
- [ ] Kanban-view: veld met `sanitize="false"` op de anchor-plek, CSS toegevoegd (incl. `.metro-dot-locked`/`.metro-dot-waiting`/`.metro-dot-meeting-clickable`)
- [ ] "Sanitisatie uitschakelen"-knop opnieuw uitgevoerd na deploy
- [ ] Test: klik op bolletje → `event.stopPropagation()` voorkomt openen van het record, dot + label togglen lokaal, DB-write bevestigd, status correct na page reload
- [ ] Test: meeting-item met `x_auto_complete_meeting_clickable = False` toont altijd een grijs bolletje met kruis (×), reageert niet op een klik (geen `data-meeting-id`/`onclick`), ongeacht of er al een meeting bestaat
- [ ] Test: meeting-item met `x_auto_complete_meeting_clickable = True` en geen geschikte meeting → licht grijs leeg bolletje, niet klikbaar
- [ ] Test: meeting-item met `x_auto_complete_meeting_clickable = True` en een bestaande meeting (ongeacht huidige fase) → blauw-omrand bolletje, klikbaar, klik zet de meeting naar de doelfase, checklist-item vinkt zichzelf af via "Custom | Auto-complete checklist item on meeting added"
- [ ] Test: meeting-item zonder bestaande meeting → niet klikbaar, enkel tooltip

---

#### BI-S2-05b — Automatisch afvinken van checklist-items (meetings + velden)

**Wat:** Checklist-items automatisch op `x_done = True` zetten op basis van een externe conditie, in plaats van CS die manueel te laten aanvinken. Twee bronnen nu, generiek opzet zodat er later moeiteloos meer bijkomen: (1) een meeting van een bepaald type wordt aangemaakt op het actieblad (`x_as_meetings`), (2) **later** — een boolean-veld op het actieblad wordt True (nog niet gebouwd, model is al wel voorbereid).

**Nieuwe velden op `x_checklist_item`** (via de veldenbewerker, geen prefix):
- `x_auto_complete_source` — selection: `none` (default, manueel) / `meeting` / `field` — uitbreidbaar met verdere bronnen later zonder modelwijziging (enkel een nieuwe waarde + nieuwe automation-tak)
- `x_auto_complete_meeting_type` — many2one → `x_sales_meeting_type`, enkel relevant bij `source = meeting`
- `x_auto_complete_meeting_stage` — many2one → `x_as_meetings_stage`, **optioneel**: leeg = "elke meeting van dit type is genoeg" (ongeacht fase van de meeting zelf), ingevuld = "de meeting moet exact deze fase bereikt hebben" (bv. stage id 3 "Gereed" voor "meeting afgerond")
- `x_auto_complete_meeting_clickable` — boolean, default False. **Expliciete opt-in voor klik-gedrag op de kanban-kaart**: als er nog geen meeting bestaat, is de checklist-dot nooit klikbaar (de gebruiker moet de meeting zelf aanmaken — dat is niet via een simpele klik te vervangen). Staat dit veld op True, dan wordt de dot klikbaar zodra er al een meeting van het juiste type bestaat die de doelfase nog niet heeft — een klik zet dan rechtstreeks de fase van die bestaande meeting naar de doelfase. Bewust een expliciete schakelaar i.p.v. afgeleid uit de fase-volgorde (geen sequence-veld op `x_as_meetings_stage`, en fase-volgorde afleiden zou fragiel zijn). **Praktijkvoorbeeld:** item "Opstarthulp ingepland" (doelfase Nieuw) → False, moet altijd via een échte nieuwe meeting; item "Opstarthulp gehouden" (doelfase In behandeling) → True, klikken op de dot verplaatst de bestaande meeting naar die fase.
- `x_auto_complete_field` — char, technische veldnaam op `x_sales_action_sheet`, enkel relevant bij `source = field` — **losstaand van `x_dependency_field`**: dat laatste bepaalt of een item überhaupt toegevoegd wordt (zichtbaarheid), dit nieuwe veld bepaalt of het automatisch afgevinkt wordt (voortgang). Beide kunnen naar dezelfde technische veldnaam wijzen als dat toevallig samenvalt, maar zijn conceptueel gescheiden — een `required`-item kan evengoed een auto-complete-by-field-regel hebben.

**"Custom | Auto-complete checklist item on meeting added"** — nieuwe automation, model `x_as_meetings`, trigger: bij aanmaken **en** bij bijwerken van `x_studio_stage_id` / `x_studio_meeting_type`:

```python
Item = env['x_checklist_item']
Line = env['x_action_sheet_checkli']

for meeting in records:
    rec = meeting.x_studio_for_action_sheet
    if not rec or not meeting.x_studio_meeting_type:
        continue
    matching_items = Item.search([
        ('x_auto_complete_source', '=', 'meeting'),
        ('x_auto_complete_meeting_type', '=', meeting.x_studio_meeting_type.id),
    ])
    eligible_item_ids = []
    for it in matching_items:
        if not it.x_auto_complete_meeting_stage or it.x_auto_complete_meeting_stage.id == meeting.x_studio_stage_id.id:
            eligible_item_ids.append(it.id)
    if not eligible_item_ids:
        continue
    lines_to_complete = Line.search([
        ('x_action_sheet_id', '=', rec.id),
        ('x_checklist_item_id', 'in', eligible_item_ids),
        ('x_done', '=', False),
    ])
    if lines_to_complete:
        lines_to_complete.write({'x_done': True})
```
Geen `.filtered(lambda ...)` gebruikt om op `x_auto_complete_meeting_stage` te filteren — dat zou `meeting` uit de omsluitende `for`-loop vangen (zelfde `forbidden opcode`-probleem als eerder bij de fase-filter in `render_checklist_html`), dus een gewone `for`-loop met een lijst i.p.v. een lambda.

**Trigger uitgebreid:** niet enkel "bij aanmaken", ook **bij bijwerken van zowel `x_studio_stage_id` als `x_studio_meeting_type`** op `x_as_meetings` — nodig omdat een meeting vaak eerst aangemaakt wordt in stage "Nieuw" en pas later naar "Gereed" gaat; de checklist mag pas afvinken zodra die stage-eis (indien ingesteld) voldaan is. **Beide velden zijn verplicht als trigger-veld, niet enkel de fase** (zie bug-note hieronder) — een meeting kan ook eerst zonder type aangemaakt worden en pas later een type toegewezen krijgen; als enkel `x_studio_stage_id` als trigger-veld staat, mist de automation die tweede write volledig, ook al voldoet de meeting op dat moment al aan de conditie.

**Bug gevonden (live check, "meeting zonder type"):** de automation in Odoo bleek enkel `x_studio_stage_id` als trigger-veld te hebben (bevestigd via `base.automation` id 70, `trigger_field_ids`) — `x_studio_meeting_type` stond er, ondanks de bedoeling hierboven, niet bij. Scenario: een meeting werd aangemaakt zonder type, en kreeg pas nadien een type toegewezen zonder dat de fase op datzelfde moment mee veranderde. Die write raakt enkel `x_studio_meeting_type`, dus de automation vuurde niet — het bijhorende checklist-item bleef onterecht op niet-afgevinkt staan, en de kanban-dot (die enkel herberekend wordt als gevolg van deze automation of van een `x_done`-wijziging) bleef stale. **Fix:** in de automation-configuratie (Instellingen → Technisch → Automatiseringen → "Custom | Auto-complete checklist item on meeting added") `x_studio_meeting_type` toevoegen als tweede trigger-veld naast `x_studio_stage_id` — Studio/Technische UI-wijziging, geen code.

Geen `render_checklist_html()`/HTML-write nodig hier — de `x_done`-write triggert automatisch "Custom | Add done date to checklist items when checked", die de `x_done_date` en de HTML al afhandelt.

**Retroactieve check bij het genereren van items** — als een checklist-item wordt aangemaakt terwijl de onderliggende conditie al voldaan is (bv. de meeting stond er al vóór het item bestond), moet het meteen als afgevinkt aangemaakt worden, niet wachten op een nieuwe meeting. Al verwerkt in de geconsolideerde code van **"Custom | Add Checklist-items on Sales Action Sheets"** in BI-S2-05 (niet hier herhaald, om driftende kopieën te vermijden).

Zelfde uitbreiding toepassen op **"Custom | Sync checklist items to lines"** (stap 2, retroactief nieuwe items toevoegen) — identieke logica, na de `Line.create({...})` in die actie.

**Nog niet gebouwd (bewust, "later"):** een automation die triggert op de daadwerkelijke veldwijziging (bv. `x_has_peppol` → True) en dan het bijhorende `field`-item afvinkt. Het model (`x_auto_complete_source = 'field'` + `x_auto_complete_field`) is al voorbereid; de automation zelf voeg je toe zodra de eerste concrete use-case zich aandient — Odoo's automations ondersteunen meerdere trigger-velden op één automation, dus één generieke automation kan meerdere `field`-items tegelijk bedienen door gewoon extra velden aan de trigger-lijst toe te voegen naarmate er nieuwe `field`-items bijkomen.

**Acceptatiecriteria:**
- [x] Velden `x_auto_complete_source`, `x_auto_complete_meeting_type`, `x_auto_complete_meeting_stage`, `x_auto_complete_field` aangemaakt op `x_checklist_item` (bevestigd via Odoo)
- [ ] Nieuw veld `x_auto_complete_meeting_clickable` (boolean, default False) aangemaakt; True gezet op "Opstarthulp gehouden" (id 8), False/leeg op "Opstarthulp ingepland" (id 7) en de rest
- [ ] "Custom | Auto-complete checklist item on meeting added" aangemaakt (trigger: aanmaken + **beide** `x_studio_stage_id` **en** `x_studio_meeting_type` als trigger-veld — niet enkel de fase, zie bug-note) en getest (nieuwe meeting → matchend item wordt afgevinkt, met correcte stage-check indien ingesteld; ook testen: meeting eerst zonder type aanmaken, dan pas het type instellen → moet ook afvinken)
- [ ] "Custom | Add Checklist-items on Sales Action Sheets" uitgebreid met retroactieve check (incl. stage-filter)
- [ ] "Custom | Sync checklist items to lines" uitgebreid met dezelfde retroactieve check
- [ ] Test: meeting van type "Opstartsessie" bestaat al vóór het item aangemaakt wordt → item komt meteen afgevinkt binnen (rekening houdend met een eventuele meeting-stage-eis)
- [ ] Test: meeting-item in de metro-line is niet klikbaar en toont het kalender-icoon (zie BI-S2-05a)

---

#### BI-S2-06 — Follow-up Validatie afsluiten

**Wat:** Manuele eindcheck door CX. Voeg een "Validatie afgerond" boolean + knop toe die stage naar "Goed Opgestart" zet.

**De "Cindy-check":** Kwalitatieve beoordeling door CX of instellingen correct zijn (leveranciers, verdeelsleutels, grootboekrekeningen). Niet automatiseerbaar.

**Acceptatiecriteria:**
- [ ] Checklist-item "Instellingen gevalideerd" aanwezig in Follow-up Validatie checklist (verplicht)
- [ ] Knop of toggle "Validatie afgerond" beschikbaar in formulierweergave
- [ ] Bij afgerond: stage naar "Goed Opgestart"

---

### 🟢 SPRINT 3 — Langetermijn & periodiciteit

#### BI-S3-01 — Periodieke check-in mail voor Goed Opgestart (via x_dynamic_mail_block)

**Wat:** Maandelijkse cron: actiebladen in "Goed Opgestart" zonder activiteit >120 dagen → automatisch een check-in mail versturen + activiteit aanmaken.

**Implementatie via bestaande mail-infrastructuur:**
1. `mail.template` aanmaken op model `x_sales_action_sheet`
2. `x_dynamic_mail_block`-blokken definiëren voor de check-in mail (per pakket conditioneel)
3. Cron stuurt mail + maakt activiteit "Check-in mail verstuurd" aan

**Acceptatiecriteria:**
- [ ] Mail-template aangemaakt met conditionele blokken per pakket
- [ ] Cron draait maandelijks
- [ ] Mail verstuurd naar klant bij >120 dagen inactiviteit
- [ ] Activiteit "Check-in mail verstuurd" aangemaakt op actieblad
- [ ] Geen dubbele mails (eenmalige trigger per periode)

---

#### BI-S3-02 — "Na te checken" fase

**Wat:** Nieuwe stage na "Goed Opgestart". CS plaatst actieblad hier manueel na reactie op check-in.  
**Automatiseren later:** Als Odoo mail-tracking dit ondersteunt (open/reply tracking).

**Acceptatiecriteria:**
- [ ] Stage "Na te checken" aangemaakt na "Goed Opgestart" in volgorde
- [ ] Manueel verplaatsen door CS mogelijk
- [ ] Stage niet standaard zichtbaar (gefold of apart filter)

---

#### BI-S3-03 — Upsell-signalering vanuit actieblad

**Observatie:** In bestaande activiteiten-data staat al "algemene follow-up > Upsell?" in de notes van Rob Claes. Er is al upsell-denken, maar ongestructureerd.

**Acceptatiecriteria:**
- [ ] Veld `x_studio_upsell_kans` aangemaakt (selection: geen / potentieel / warm / aangemeld)
- [ ] Zichtbaar in formulierweergave
- [ ] Bij `aangemeld`: automatisch nieuwe lead aanmaken in CRM vanuit actieblad

---

#### BI-S3-05 — Auto-toewijzing support verantwoordelijke

**Context:** Rob Claes is hoofd-CX maar er komen meer medewerkers. Nu staat alles op Rob.  
**Voorstel:** Bij Won → toewijzing via round-robin of vaste regel. Implementeer zodra tweede CX-medewerker actief is.

**Acceptatiecriteria:**
- [ ] Round-robin of toewijzingslogica gedefinieerd (bv. op pakket of load)
- [ ] Won-automation gebruikt de toewijzingslogica in plaats van hard-coded Rob Claes
- [ ] Configureerbaar zonder code-aanpassing

---

### 🔵 SPRINT C — Communicatie-integratie

#### BI-SC-01 — Klantcontact valideren bij aanmaken actieblad (QUICK WIN)

**Wat:** Bij Won-automation 1039: controleer of `contact_id.email` en `contact_id.phone` ingevuld zijn. Zo niet → activiteit "Contactgegevens aanvullen" voor de support verantwoordelijke.

**Acceptatiecriteria:**
- [ ] Won-automation checkt email + telefoon van de contactpersoon
- [ ] Bij ontbrekende gegevens: activiteit aangemaakt met deadline +1 dag
- [ ] Activiteit toegewezen aan Support Verantwoordelijke

---

#### BI-SC-02 — AI chatter → veldextractie

**Wat:** Uitbreiden van de bestaande AI-automation (id 38) met een extra prompt die recente chatter-notities analyseert en voorstelt welke checklistitems afgevinkt kunnen worden + of contactgegevens in de chatter staan.

**Output:** Nieuw veld `x_studio_ai_chatter_digest`.  
**Fase 2:** Auto-aanvinken van checklistitems als de AI hoge zekerheid heeft.

**Acceptatiecriteria:**
- [ ] Veld `x_studio_ai_chatter_digest` aangemaakt
- [ ] AI-prompt uitgebreid met chatter-analyse
- [ ] Output zichtbaar in formulierweergave (Progress tab of CS Onboarding tab)
- [ ] (Fase 2) Auto-aanvinken checklist bij hoge AI-zekerheid

---

#### BI-SC-03 — Snelle statusupdate UI

**Wat:** Checklistitems zichtbaar bovenaan het formulier als klikbare rijen. Aanvullen met een "Snel notitie" knop met vaste opties: "Gebeld, geen opname" / "Mail gestuurd" / "Afgesproken" / vrij veld.

**Acceptatiecriteria:**
- [ ] Checklistitems zichtbaar bovenaan formulier (niet alleen in tab)
- [ ] "Snel notitie" knop aanwezig met vaste opties
- [ ] Notitie wordt gelogd in chatter met timestamp en medewerker

---

#### BI-SC-04 — E-mailintegratie: Odoo chatter als mailkanaal

**Beslissing:** Rob is bereid te switchen naar Odoo voor actieblad-communicatie. CX stuurt klantmails voortaan vanuit de Odoo-chatter ("Send message").

**Configuratiestappen:**
1. Inkomende mailserver: `catchall@mymmo.com` toevoegen als fetchmail server (IMAP, Google Workspace)
2. Alias domain: `mymmo.com` is al geconfigureerd ✅
3. Afzenderadres: `openvme.be` toevoegen als alias domain (SPF/DKIM instellen)
4. Outbound server: configureren voor gekozen From-domein

**Acceptatiecriteria:**
- [ ] Inkomende mailserver `catchall@mymmo.com` geconfigureerd en actief
- [ ] Replies op Odoo-mails landen automatisch in de chatter van het juiste actieblad
- [ ] CX kan vanuit de chatter mailen met correct afzenderadres
- [ ] Intercom ontvangt BCC van Odoo-mails (optionele brug)

---

#### BI-SC-05 — Mail templates voor actiebladen

**Wat:** `mail.template` records aanmaken op model `x_sales_action_sheet`.

| Template | Trigger | Inhoud |
|----------|---------|--------|
| Welkomsmail | Bij Intake (of manueel) | Intro OpenVME, wat te verwachten, contactinfo Rob |
| Opvolgingsvraag | Manueel na geen activiteit | "Hoe verloopt de opstart? Loopt er iets vast?" |
| Beginbalans / financieel | Manueel bij blocker | Uitleg + link naar Calendly/afspraakmogelijkheid |
| Afspraakherinnering | Manueel of auto vóór meeting | Datum + link + korte agenda |
| Samenvatting gesprek | Na call (manueel) | Wat besproken, wat klant moet doen, wat CX doet |

**Acceptatiecriteria:**
- [ ] Alle 5 templates aangemaakt op model `x_sales_action_sheet`
- [ ] Dynamische velden correct (naam, gebouw, pakket, contactinfo)
- [ ] Koppeling met `x_dynamic_mail_block` systeem voor conditionele inhoud per pakket
- [ ] Selecteerbaar vanuit chatter "Send message"

---

## 10. Samenvatting — prioriteiten per sprint

| Sprint | Doel | Resultaat voor CS |
|--------|------|------------------|
| 0 | Opkuis | CS ziet alleen relevante dossiers, geen rommel |
| 1 | Rollen + pakket + Red Flag | CS weet van elk dossier wie verantwoordelijk is, wat ze kochten, en welke dossiers alarm slaan |
| 2 | Pipeline automatiseren | Taken verschijnen vanzelf, stages schuiven door, geen enkel dossier valt door de mand |
| 3 | Langetermijn opvolging | Klanten in "Goed Opgestart" worden periodiek gecontacteerd, upsell-kansen worden gevangen |
| C | Communicatie-integratie | Klantmails landen automatisch in het actieblad, WA is zichtbaar in context, AI analyseert de chatter |

---

## 11. Communicatie-integratie — analyse & backlog

### 11.1 Wat er mis is — bevinding op actieblad 156 (Charlotte Vanheule)

De chatter van dit actieblad (24 berichten over 9 maanden) maakt het probleem glashelder.

**Hoe het nu werkt:** CX mailt vanuit Gmail. Klant repliet naar Gmail. CX kopieert de reply manueel als interne notitie in de chatter. De chatter wordt dus uitsluitend gebruikt voor "Log note" (intern), nooit voor "Send message". Dit geldt zowel voor `crm.lead` als voor actiebladen.

**Patroon 1 — Klantenreacties worden manueel overgetypt**
Charlottes e-mailreply van 19 december 2025 ("goedemiddag Rob, ik heb eindelijk de afrekening van 2024 kunnen afwerken...") verschijnt in de chatter als een comment van Rob Claes — hij heeft haar mail manueel gekopieerd en geplakt. Dat is de workflow.

**Patroon 2 — Contactgegevens staan in de chatter, niet in velden**
`charlotte@vanheule.com` en `0474588581` worden twee keer als losse notitie geplakt (oktober en januari). Die info hoort in `res.partner`, niet in de chatter.

**Patroon 3 — Statusupdates als vrijetekstnotities**
"GEEN OPSTARTSESSIE / Boekhouding opgestart en bankafschriften ingevoerd / Ponto Koppeling oke / Geen facturen / Documenten geupload" — dit zijn exact de checklistitems die we in sprint 2 gaan aanmaken. Nu staan ze als vrije tekst.

**Patroon 4 — Cryptische contextnoten**
"actief is niet gelijk aan passief" — begrijpbaar voor Rob op dat moment, maar onleesbaar later of voor een collega.

**WhatsApp:** valt buiten scope van dit project (zie §11.2).

### 11.2 WhatsApp — buiten scope

WhatsApp is momenteel enkel ingesteld voor de `crm.lead`-pipeline. Er zijn gekende problemen: automatisch terugsturen na een Meta leadform werkt niet, en de zichtbaarheid van WA-gesprekken is onduidelijk. Dit wordt opgepakt in een apart **WhatsApp-project** en valt buiten scope van de actiebladen-pipeline.

### 11.3 Technische staat van de mail-integratie

| Component | Status | Gevolg |
|-----------|--------|--------|
| `x_sales_action_sheet` is `mail.thread` | ✅ ja | Model ondersteunt e-mail threading in principe |
| Huidig gebruik chatter | ⚠️ enkel "Log note" | Nooit "Send message" — klant krijgt geen mail vanuit Odoo |
| Inkomende mailserver catchall | ❌ niet geconfigureerd | Zelfs als we "Send message" gaan gebruiken, komen replies niet binnen |
| Inkomende mailserver aankoopfacturen | ✅ actief | Enige geconfigureerde inbound server |
| Alias domains | ✅ `syndicusonline.com` + `mymmo.com` | Beide met catchall — infrastructuur is er |
| Gmail (support@syndicusonline.com) | ✅ uitgaand actief | CX mailt nu van hieruit, buiten Odoo om |

**De twee dingen die moeten veranderen voor echte mail-integratie:**
1. CX moet vanuit de Odoo-chatter ("Send message") mailen in plaats van vanuit Gmail → gedragsverandering
2. Een inkomende mailserver voor `catchall@mymmo.com` configureren → replies landen automatisch in de chatter

---

## 12. Studio-implementatiegids — BI-S1-03 Escalatievlag

### Stap 1 — Velden aanmaken

Open Studio → model `x_sales_action_sheet` → Fields → New.

**Veld 1: `x_flag_level`**
| Instelling | Waarde |
|---|---|
| Type | Selection |
| Veldnaam | `flag_level` (Studio voegt `x_studio_` toe) |
| Label | Vlag |
| Standaardwaarde | `none` |
| Verplicht | nee |

Waarden:
```
Technisch    Label
none         Geen
reminder     🔵 Herinnering
attention    🟡 Attentie
urgent       🟠 Urgent
critical     🔴 Kritiek
```

**Veld 2: `x_flag_reason`**
| Instelling | Waarde |
|---|---|
| Type | Selection |
| Veldnaam | `flag_reason` |
| Label | Reden vlag |
| Standaardwaarde | — (leeg) |

Waarden:
```
Technisch        Label
no_activity      Geen activiteit
churn_signal     Churn-signaal
too_long_in_stage  Te lang in fase
manual           Manueel
```

**Veld 3: `x_flag_custom_message`**
| Instelling | Waarde |
|---|---|
| Type | Char |
| Veldnaam | `flag_custom_message` |
| Label | Vlag bericht |
| Standaardwaarde | — (leeg) |

> Wordt **niet** gewist door de automation "Reden wissen bij Geen vlag" — bewuste keuze. De message blijft als historische notitie.

**Veld 4: `x_last_response_date`**
| Instelling | Waarde |
|---|---|
| Type | Date |
| Veldnaam | `last_response_date` |
| Label | Laatste klantreactie |

---

### Stap 2 — Formulierweergave

Studio → Views → Form → open de CS Onboarding tab.

Voeg toe na `x_studio_support_user_id`:
1. `x_flag_level` — Selection, full width
2. `x_flag_reason` — Selection, **visibility**: `x_flag_level != 'none'`
3. `x_flag_custom_message` — Char, label "Vlag bericht", **visibility**: `x_flag_level != 'none'`
4. `x_last_response_date` — Date, label "Laatste klantreactie"

---

### Stap 3 — Kanban-tegel

Studio → Views → Kanban → sleep `x_flag_level` naar de kaart-header.

- Widget: **Badge**
- Visibility: `x_flag_level != 'none'`
- Kleurmapping (in Studio "Decoration" opties):
  - `attention` → warning
  - `urgent` → danger (Odoo heeft geen native oranje; gebruik danger of custom CSS-klasse via x_color mapping)
  - `critical` → danger

> **Noot:** Gekleurde card-borders (zoals in de mockup) kunnen niet puur via Studio. Gebruik een x_color mapping om per `flag_level`-waarde een CSS-klasse toe te voegen aan de kaart.

---

### Stap 4 — Manuele actieknoppen + popup

Twee actieknoppen bovenaan het formulier (server actions):

**Knop 1: "Klant vlaggen"** — opent popup-formulier (view `__custom__sales_action_sheet.flag_popup`, target: new):
```python
view = env.ref('__custom__sales_action_sheet.flag_popup')
action = {
    'type': 'ir.actions.act_window',
    'name': 'Klant vlaggen',
    'res_model': 'x_sales_action_sheet',
    'res_id': record.id,
    'view_mode': 'form',
    'view_id': view.id,
    'target': 'new',
}
```

**Popup-formulierweergave (Technical → Views, model `x_sales_action_sheet`, XML ID: `__custom__sales_action_sheet.flag_popup`):**
```xml
<form string="Klant vlaggen">
    <div style="padding: 4px 0 16px;">
        <div style="font-size:12px; color:#999; margin-bottom:16px;">
            Selecteer een niveau en optioneel een reden.
        </div>
        <div style="margin-bottom:16px;">
            <div style="font-size:11px; font-weight:700; color:#888; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:8px;">Niveau</div>
            <field name="x_flag_level" widget="selection_badge" nolabel="1"/>
        </div>
        <div invisible="x_flag_level == 'none' or not x_flag_level">
            <div style="font-size:11px; font-weight:700; color:#888; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:8px;">Reden</div>
            <field name="x_flag_reason" widget="selection_badge" nolabel="1"/>
        </div>
        <div invisible="x_flag_level == 'none' or not x_flag_level" style="margin-top:12px;">
            <div style="font-size:11px; font-weight:700; color:#888; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:8px;">Bericht (optioneel)</div>
            <field name="x_flag_custom_message" nolabel="1" placeholder="Bijv. klant heeft niet gereageerd op 3 pogingen..."/>
        </div>
    </div>
    <footer>
        <button string="Toepassen" class="btn-primary" special="save"/>
        <button string="Annuleren" class="btn-secondary" special="cancel"/>
    </footer>
</form>
```

**Knop 2: "Vlag verwijderen"** — server action, visibility: `x_flag_level != 'none'`:
```python
record.write({'x_flag_level': 'none', 'x_flag_reason': False})
# x_flag_custom_message wordt bewust NIET gewist
```

**Automation: "Reden wissen bij Geen vlag"** (on_create_or_write, trigger: x_flag_level wijzigt, filter: x_flag_level == 'none'):
```python
record.write({'x_flag_reason': False})
# x_flag_custom_message niet aanraken
```

**Computed field `x_flag_banner_html`** (HTML, stored, dependencies: `x_flag_level,x_flag_reason,x_flag_custom_message`):
```python
for record in self:
    level = record.x_flag_level
    reason_map = {
        'no_activity': 'Geen activiteit',
        'churn_signal': 'Churn-signaal',
        'too_long_in_stage': 'Te lang in fase',
        'manual': 'Manueel',
    }
    reason = reason_map.get(record.x_flag_reason, '')
    styles = {
        'reminder':  ('🔵 Herinnering', '#0d47a1', '#e3f2fd', '#1e88e5'),
        'attention': ('🟡 Attentie',    '#7a5c00', '#fff8e1', '#f0c040'),
        'urgent':    ('🟠 Urgent',      '#7a3300', '#fff3e0', '#e8872a'),
        'critical':  ('🔴 Kritiek',     '#7a0000', '#ffebee', '#e53935'),
    }
    if level in styles:
        label, color, bg, border = styles[level]
        reason_html = f' &nbsp;·&nbsp; <span style="opacity:0.75;">{reason}</span>' if reason else ''
        msg = record.x_flag_custom_message
        msg_html = f'<div style="margin-top:4px;font-size:12px;opacity:0.8;">{msg}</div>' if msg else ''
        record['x_flag_banner_html'] = (
            f'<div style="background:{bg};border-left:4px solid {border};color:{color};'
            f'padding:8px 14px;border-radius:4px;font-weight:500;">'
            f'{label}{reason_html}{msg_html}</div>'
        )
    else:
        record['x_flag_banner_html'] = ''
```

---

### Stap 5 — Automations

Ga naar Settings → Technical → Automations → New.

**Automatie A: Geel na 14 dagen geen reactie**
| Instelling | Waarde |
|---|---|
| Model | Sales Action Sheet |
| Trigger | Based on timed condition |
| Date field | `x_last_response_date` |
| Delay | +14 days |
| Before/After | After |
| Filter | `x_flag_level = 'none'` + stage in CS-pipeline |
| Action | Update record: `flag_level = 'attention'`, `flag_reason = 'no_activity'` |
| Notificatie | Send message → Support Verantwoordelijke |

**Automatie B: Oranje na 30 dagen**  
Identiek aan A, maar delay = +30 dagen, filter `flag_level in ('none','attention')`, actie `flag_level = 'urgent'`.

**Automatie C: Rood na 60 dagen**  
Delay = +60 dagen, filter `flag_level != 'critical'`, actie `flag_level = 'critical'`.

**Automatie E: Te lang in fase (60 dagen na Won)**
| Instelling | Waarde |
|---|---|
| Date field | `x_studio_won_date` |
| Delay | +60 days |
| Filter | stage sequence < Follow-up Validatie EN `flag_level != 'critical'` |
| Action | `flag_level = 'critical'`, `flag_reason = 'too_long_in_stage'` |

> **Bucket-check (Automatie D):** Vereist een relatie-filter op `res.partner.x_studio_onboarding_bucket`. Implementeer als Python cron in de custom module.

---

### Stap 6 — Zoekfilters toevoegen

Studio → Views → Search → Filters → New:

| Naam | Domein |
|---|---|
| Alle vlaggen | `[('x_flag_level', '!=', 'none')]` |
| 🟡 Attentie | `[('x_flag_level', '=', 'attention')]` |
| 🟠 Urgent | `[('x_flag_level', '=', 'urgent')]` |
| 🔴 Kritiek | `[('x_flag_level', '=', 'critical')]` |

---

Alles bovenstaande is uitvoerbaar in Studio.

---

## 14. Operations Manager — module `cx-automations`

### Doel

Support kan per CS-fase instellen hoeveel dagen gebouw-inactiviteit vereist zijn voor een gele, oranje of rode vlag. Afzonderlijk: escalatiesnelheid voor actiebladen zonder gebouw (technical block). De module toont ook een lijst van actieve technische blokkades en wanneer de cron voor het laatst liep.

### Bestandsstructuur

```
src/modules/cx-automations/
  module.js     — definitie + routes
  routes.js     — API-handlers
  cron.js       — runFlagCron(env)
public/
  cx-automations.html   — UI
  cx-automations.js     — client-side logica
```

### API-routes

| Method | Route | Beschrijving |
|---|---|---|
| `GET /` | HTML via ASSETS.fetch | Pagina |
| `GET /api/odoo-config` | Stages + redenen uit Odoo | Dynamisch opgehaald (sequence 11–15) |
| `GET /api/thresholds` | Drempelwaarden uit Supabase | Per stage_id |
| `POST /api/thresholds` | Opslaan drempelwaarden | Upsert per stage_id, validatie oplopend |
| `GET /api/settings` | Tech-block escalatie-instellingen | Uit `cx_settings` |
| `POST /api/settings` | Opslaan escalatie-instellingen | Naar `cx_settings` |
| `GET /api/technical-blocks` | Actiebladen zonder gebouw | Uit Odoo, CS-stages only |
| `GET /api/log` | Laatste 10 cron-runs | Uit `flag_run_log` |
| `POST /api/run-cron` | Cron manueel triggeren | Roept `runFlagCron(env)` aan |

### Supabase tabellen

**`flag_thresholds`** — inactiviteitsdrempels per CS-fase
```sql
CREATE TABLE flag_thresholds (
  id                  SERIAL PRIMARY KEY,
  stage_id            INTEGER NOT NULL UNIQUE,
  stage_name          TEXT NOT NULL,              -- cache van Odoo-naam
  yellow_days         INTEGER NOT NULL DEFAULT 14,
  orange_days         INTEGER NOT NULL DEFAULT 30,
  red_days            INTEGER NOT NULL DEFAULT 60,
  flag_reason         TEXT    NOT NULL DEFAULT 'no_activity',
  auto_clear_enabled  BOOLEAN NOT NULL DEFAULT false,  -- vlag automatisch wissen zodra niet meer van toepassing
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_by          TEXT
);
```

Standaardseed: 5 (Opstartgesprek), 7 (Opstartsessie Expert), 8 (Basisinstellingen gecontroleerd), 9 (Follow-up validatie). Fasenamen worden bij paginaladen dynamisch herladen vanuit Odoo. `auto_clear_enabled` staat default op `false` per fase — CS zet dit bewust aan per fase/reden.

**Belangrijk — reden bepaalt of een config een actieblad mag aanraken:** deze drempel-rij (`flag_reason`) mag een actieblad enkel escaleren, wissen of het bericht bijwerken als er nog geen vlag staat, óf als de actieve vlag exact voor deze reden gezet is. Een handmatig gezette vlag met een andere reden (bv. `churn_signal`, `manual`) wordt door deze dagen-gebaseerde config niet aangeraakt — geen overschreven bericht, geen ongewenste escalatie. Op termijn komen er drempel-rijen bij voor andere redenen (niet noodzakelijk dagen-gebaseerd); vandaar dat de kolom **Reden** vooraan in de UI-tabel staat.

**`flag_run_log`** — cron-runs
```sql
CREATE TABLE flag_run_log (
  id                   SERIAL PRIMARY KEY,
  ran_at               TIMESTAMPTZ DEFAULT NOW(),
  actiebladen_checked  INTEGER,
  flags_updated        INTEGER,
  error                TEXT
);
```

**`cx_settings`** — algemene instellingen
```sql
CREATE TABLE cx_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);
-- Standaard seed:
-- tech_block_orange_days = 3
-- tech_block_red_days    = 5
```

### Cron-logica (`cron.js`)

`runFlagCron(env)` draait dagelijks via `scheduled()` in `src/index.js`:

```js
ctx.waitUntil(runFlagCron(env));
```

**Inactiviteitsvlaggen (normaal pad):**
1. Laad `flag_thresholds` + `cx_settings` uit Supabase
2. Haal CS-stage IDs op uit Odoo (sequence 11–15)
3. Haal alle actiebladen in die stages op (inclusief `x_flag_reason`, `x_flag_custom_message`)
4. Haal `x_studio_last_activity` per gebouw op in één batch-call
5. Per actieblad: check eerst of de drempel-rij (reden) mag toepassen — enkel als er nog geen vlag staat, of als de actieve vlag exact deze reden heeft. Zo niet: actieblad overslaan, niets schrijven.
6. Bereken `daysSince()` → vergelijk met drempels:
   - Hoger niveau dan huidige vlag → escaleren (level + reden + bericht bijwerken)
   - Lager niveau dan huidige vlag (conditie niet meer van toepassing) → enkel wissen als `auto_clear_enabled` aanstaat voor deze fase/reden; anders niets doen (vlag én bericht blijven bevroren tot manuele opruiming)
   - Zelfde niveau → enkel bericht verversen indien gewijzigd
7. Bericht dagelijks bijwerken voor elk geflagd actieblad: `[DD/MM/YYYY] Auto: X dagen inactief | <manuele tekst>`. Manuele tekst na ` | ` blijft bewaard.
8. Log naar `flag_run_log`

**Technical block pad** (actieblad zonder gekoppeld gebouw):
- `x_flag_reason = 'technical_block'`
- Start op `x_flag_level = 'attention'` (geel) bij eerste detectie
- Escaleer naar `urgent` / `critical` op basis van `cx_settings.tech_block_orange_days` en `tech_block_red_days`
- "Sinds"-datum opgeslagen in het bericht: `geen gebouw gekoppeld (sinds DD/MM/YYYY)`. Volgende runs parsen deze datum om escalatiedagen te berekenen.

### UI — secties

1. **Vlag-drempelwaarden per fase** — tabel met kolommen Reden / Geel / Oranje / Rood / Auto-wissen per CS-fase; fasenamen dynamisch uit Odoo; [Opslaan]-knop
2. **Technische blokkades** — kaart met badge-teller; tabel met links naar Odoo-records
3. **Technische blokkade — escalatie** — twee number-inputs (Oranje na X dagen / Rood na Y dagen); [Opslaan]-knop
4. **Cron-log** — laatste 10 runs; [Nu uitvoeren]-knop

### Odoo-vereiste

`x_studio_last_activity` (Date) bestaat al op `res.partner`. De Operations Manager berekent het aantal dagen zelf in JS — geen extra veld nodig.

Voeg `technical_block` toe als selectiewaarde bij het veld **`x_flag_reason`** op model `x_sales_action_sheet` in Odoo Studio (label: "Technische blokkade").

### Acceptatiecriteria

- [x] Module aangemaakt en geregistreerd (`/cx-automations`, requiresAdmin, code `cx_automations`)
- [x] Fasenamen dynamisch uit Odoo, niet hardcoded
- [x] Redenen dynamisch uit Odoo via `fields_get`
- [x] UI: drempelwaarden per fase instelbaar + validatie oplopend
- [x] UI: technical-block escalatie instelbaar (oranje/rood na X/Y dagen)
- [x] UI: lijst actieve technische blokkades met Odoo-links
- [x] Cron: inactiviteitsvlaggen — escaleert altijd; downgrade enkel als `auto_clear_enabled` aanstaat voor die fase/reden
- [x] Cron: drempel-config raakt enkel actiebladen aan zonder vlag, of met een actieve vlag van exact dezelfde reden
- [x] Cron: bericht dagelijks bijwerken, manuele tekst bewaard
- [x] Cron: technical_block als reden, level start op attention, escaleert op instelbare drempels
- [x] Cron: "since"-datum in bericht voor escalatieberekening
- [x] Manuele trigger via POST /api/run-cron
- [x] Supabase: `flag_thresholds`, `flag_run_log`, `cx_settings` aangemaakt
- [x] `runFlagCron(env)` geïntegreerd in `scheduled()` in `src/index.js`
- [ ] Odoo Studio: `technical_block` toevoegen aan `x_flag_reason` selectie

---

## 13. Voor de integratiepartner (Dynapps)

> Dit onderdeel groepeert alle technische aanpassingen die **niet via Odoo Studio of de Technische UI** kunnen worden doorgevoerd en dus in een Python-module moeten worden geïmplementeerd door de integratiepartner. De module draait op de Odoo.sh-omgeving van mymmo, in de custom module `mymmo_fixes` (of een aparte module naar keuze van Dynapps).
>
> **Omgeving:** Odoo 17, beheerd op Odoo.sh. De custom module staat in `/home/odoo/src/user/parts/custom/`. Er is een staging-branch beschikbaar voor tests.

---

### TECH-01 — Persistente kanban-fold voor de Pre-sales stage

**Prioriteit:** Middel (onderdeel van BI-S0-01)

**Achtergrond:**  
Het `x_support_stage`-model is aangemaakt via Odoo Studio. Studio-modellen zijn niet aanwezig in de Python ORM-registry — ze bestaan enkel in de database. Dit betekent dat klassieke `_inherit`-overerving in een Python-module **niet werkt**: Odoo gooit een `TypeError: Model 'x_support_stage' does not exist in registry`.

Odoo 17 vereist een kolom genaamd precies `fold` (boolean) op het stage-model om kanban-kolommen persistent samengevouwen te houden. Studio heeft het veld `x_studio_fold` aangemaakt, maar Odoo erkent dit niet als het kanban-fold veld. Hernoeming naar `fold` is geblokkeerd door de Odoo-constraint `ir_model_fields_name_manual_field` die vereist dat custom velden beginnen met `x_` — dit is bevestigd via rechtstreekse SQL-test op staging.

**Gewenst resultaat:**  
De "Pre-sales" (Discovery) kolom staat bij het openen van de kanban standaard samengevouwen (fold). De staat blijft behouden per gebruiker (Odoo-standaardgedrag zodra het `fold`-veld correct is).

**Oplossing:**  
Een `post_init_hook` in de `mymmo_fixes`-module voegt via raw SQL een `fold`-kolom toe aan de `x_support_stage`-tabel, en vult deze initieel vanuit de bestaande `x_studio_fold`-kolom. Er wordt **geen** `ir.model.fields` record aangemaakt — de kolom bestaat puur op DB-niveau, buiten het Studio-veldensysteem om.

```python
# hooks.py
def post_init_hook(env):
    env.cr.execute("""
        ALTER TABLE x_support_stage 
        ADD COLUMN IF NOT EXISTS fold boolean DEFAULT false;
        UPDATE x_support_stage SET fold = x_studio_fold;
    """)
```

```python
# __manifest__.py
{
    'name': 'mymmo Fixes',
    'version': '17.0.1.0.0',
    'depends': ['base'],
    'installable': True,
    'post_init_hook': 'post_init_hook',
}
```

```python
# __init__.py
from . import hooks
```

**Verificatie na installatie:**
- Technische UI → Database structuur → tabel `x_support_stage`: kolom `fold` aanwezig
- Record ID 1 (Pre-sales stage) instellen op `fold = True` via Technische UI → Model `x_support_stage`
- Kanban openen: Pre-sales kolom staat dichtgevouwen en blijft zo na reload

**Aandachtspunt:**  
Bij een `--update=all` of module-update probeert Odoo de velden te synchroniseren. Omdat er geen `ir.model.fields` record is voor `fold`, laat Odoo de kolom ongemoeid. De `x_studio_fold`-kolom blijft ook bestaan — geen conflict.

**Acceptatiecriteria:**
- [ ] Module geïnstalleerd op staging zonder errors
- [ ] Kolom `fold` aanwezig op `x_support_stage` tabel
- [ ] Pre-sales stage persistent gefold in kanban na reload
- [ ] Andere stages niet beïnvloed
- [ ] Module geïnstalleerd op productie
