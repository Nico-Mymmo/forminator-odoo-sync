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

**Active products HTML (automation 50)**
Wordt automatisch berekend vanuit sale orders en toont actieve producten per klant: "All in", "Syndicoach", "Opstarthulp", "Bankkoppeling via Ponto", "Peppol integratie". Nuttig voor CS-context, maar **niet de bron voor het Syndicoach-pakket** — de tiers worden apart bijgehouden (zie §4).

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
| "Stats" tab in formulier | Volledig leeg | Verwijderen |
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

### Checklist — M2M model (bevestigd)

Model: `x_cs_checklist_item` met velden:
- `x_name` — omschrijving van het item
- `x_verplicht` — boolean (verplicht vs. optioneel)
- `x_stage` — selection (In Configuratie / Follow-up Validatie / ...) voor filtering

M2M veld op actieblad: `x_studio_checklist_done_ids` (many2many → x_cs_checklist_item).

Auto-advance trigger: `on_create_or_write` → tel verplichte items, als alle afgevinkt → stage = Follow-up Validatie.

Standaard items (aangemaakt bij creatie actieblad, zoals pain points):
- ✓ Financiële module geactiveerd _(verplicht)_
- ✓ Eerste facturen & bankafschriften ingegeven _(verplicht)_
- ✓ Minimaal 2 relevante documenten opgeladen _(verplicht)_
- ○ Bankkoppeling gemaakt _(optioneel)_
- ○ Peppol geactiveerd _(optioneel)_

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
- "Stats" tab: **volledig leeg** → verwijderen
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

#### BI-S0-04 — "Stats" tab verwijderen uit formulier

**Wat:** De "Stats" tab in het notebook is volledig leeg.  
**Hoe:** `invisible="True"` of volledig verwijderen uit view overerving 3564.

**Acceptatiecriteria:**
- [ ] "Stats" tab niet meer zichtbaar in de formulierweergave

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
- [ ] Ruimte ingenomen door Red Flag icoon (BI-S1-03) — nog te doen

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

#### BI-S2-02 — Daily cron: escalatievlag detectie

**Wat:** Drie Studio-automations (time-based) + bucket-check op `x_sales_action_sheet`.

**Automatie A — Inactiviteit Geel (instelbaar, standaard 14 d):**
```
Trigger: x_last_response_date + 14 dagen
Filter: stage in CS-pipeline EN flag_level = none
Actie: flag_level = attention, flag_reason = no_activity
```

**Automatie B — Inactiviteit Oranje (instelbaar, standaard 30 d):**
```
Trigger: x_last_response_date + 30 dagen
Filter: stage in CS-pipeline EN flag_level in [none, attention]
Actie: flag_level = urgent, flag_reason = no_activity
```

**Automatie C — Inactiviteit Rood (instelbaar, standaard 60 d):**
```
Trigger: x_last_response_date + 60 dagen
Filter: stage in CS-pipeline EN flag_level != critical
Actie: flag_level = critical, flag_reason = no_activity
```

**Automatie D — Bucket-check (dagelijks, via Python/Dynapps):**
```
snoozing → attention (reden: churn_signaal)
early_dropout → urgent (reden: churn_signaal)
dormant → critical (reden: churn_signaal)
```

**Automatie E — Te lang in fase (instelbaar, standaard 60 d na won_date):**
```
Trigger: x_studio_won_date + 60 dagen
Filter: stage < Follow-up Validatie EN flag_level != critical
Actie: flag_level = critical, flag_reason = too_long_in_stage
```

Bij elke nieuwe vlag: interne notificatie naar Support Verantwoordelijke.

**Acceptatiecriteria:**
- [ ] Automaties A/B/C aangemaakt in Studio (time-based op last_response_date)
- [ ] Automatie E aangemaakt in Studio (time-based op won_date)
- [ ] Automatie D (bucket-check) geïmplementeerd
- [ ] Escalatie werkt correct: attention → urgent → critical (geen downgrade door cron)
- [ ] Geen dubbele meldingen bij al-gemarkeerde vlaggen
- [ ] Interne notificatie verstuurd naar Support Verantwoordelijke
- [ ] Logboek/notitie op actieblad met reden

---

#### BI-S2-03 — Heeft Opstarthulp veld + conditionele routing

**Wat:** Boolean `x_has_startup_assistance` (product "Opstarthulp" id 37 aanwezig in actieve sale orders).  
**Waarom:** (1) Bepaalt of stage "Opstarthulp" overgeslagen wordt. (2) Drijft `x_color = 11` (paars) op de kanban-kaart via BI-S1-06.  
**Detectie:** Boolean wordt gezet **tijdens de berekening van `x_studio_active_products_html`** (automation 50 + server action 1117) — geen aparte automation nodig.  
**Prioriteit kaartkleuring:** Opstarthulp (paars) heeft hogere prioriteit dan vlagkleur — zie BI-S1-06.  
**Automatisering routing:** Bij stage = Intake, als `heeft_opstarthulp = True` → toon sub-status "Opstartsessie inplannen" + maak taak aan.

**Acceptatiecriteria:**
- [x] Veld `x_has_startup_assistance` aangemaakt (boolean)
- [x] Boolean correct gezet tijdens automation 50 + server action 1117 (active products berekening)
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

#### BI-S2-05 — Configuratie-checklist

**Wat:** Boolean-velden of M2M checklist op actieblad:
- `x_studio_check_financieel` (verplicht)
- `x_studio_check_facturen` (verplicht)
- `x_studio_check_documenten` (verplicht)
- `x_studio_check_bankkoppeling` (optioneel)
- `x_studio_check_peppol` (optioneel)

**Automation:** `on_create_or_write`, filter = alle verplichte checks = True → Stage naar "Follow-up Validatie" + activiteit "Follow-up call" deadline vandaag + 14 dagen.

**Acceptatiecriteria:**
- [ ] Alle 5 checklistitems aanwezig en aanvinkbaar in formulier
- [ ] Optionele items duidelijk onderscheiden van verplichte
- [ ] Bij alle verplichte items ✓: automatisch doorschuiven naar Follow-up Validatie
- [ ] Activiteit "Follow-up call" aangemaakt met deadline +14 dagen

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
