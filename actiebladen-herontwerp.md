# Herontwerp Actiebladen — Krachtige CS Supportpipeline

_Analyse op basis van volledig Odoo-onderzoek + beantwoorde vragen — bijgewerkt 2026-06-12_

---

## 1. Wat er al staat — het echte beeld

Voordat we iets bouwen, is het cruciaal te begrijpen wat Odoo al doet. Veel is slimmer dan het eruitziet.

### 1.1 Wat goed werkt en je moet bewaren

**Auto-aanmaken actieblad bij Won (server action 1039)**
De code is goed gebouwd: controleert of er al een actieblad bestaat voor het contact, zo ja → koppelt de lead, zo nee → maakt nieuw aan. Behandelt gebouw vs. contactpersoon correct. Markeert de lead rood bij fouten. **Niet aanraken.**

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

## 2. De echte pijplijn — wat er nu echt gebeurt

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
| `x_studio_red_flag` | boolean | 🚩 Red Flag | Escalatiestatus, auto + manueel | Actieblad |
| `x_studio_red_flag_reason` | selection | Reden Red Flag | Geen activiteit / Churn-signaal / Te lang in fase / Manueel | Actieblad |
| `x_studio_won_date` | date | Won op | T0 voor timing (computed van lead.x_studio_became_customer) | Actieblad |
| `x_studio_heeft_opstarthulp` | boolean | Opstarthulp aangekocht | Uit active_products_html / sale order (product id 37) | Actieblad |
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
6. Voeg toe aan header: `x_studio_red_flag` als conditionally zichtbaar 🚩 icoon

---

## 6. Formulierweergave herontwerp

### Nieuw tabblad: "CS Onboarding" (toevoegen vóór Basisgegevens)

```
┌─ CS Onboarding ──────────────────────────────┐
│ Support Verantwoordelijke: [user]             │
│ Syndicoach Pakket:         [Assistant/Coach/Captain/Geen] │
│ Won op:                    [datum]            │
│ 🚩 Red Flag:               [toggle] [reden]  │
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
- Filter: "🚩 Red Flags" → `[['x_studio_red_flag', '=', True]]`
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

De originele BI-01 t/m BI-20 zijn hieronder geherstructureerd op basis van de volledige analyse. Items zijn opgesplitst in **nu uitvoerbaar** (alles staat er al voor), **afhankelijk van beslissing** (openstaande vraag), en **later**.

---

### 🔴 SPRINT 0 — Opkuis (geen nieuwe features, ballast weg)

#### BI-S0-01 — Pre-sales actiebladen verbergen in CS kanban
**Wat:** Voeg standaard filter toe aan zoekweergave: `stage_id = Pre-sales` verbergen.
**Hoe:** Uitbreiden search view 3560 met default filter.
**Impact:** CS ziet direct enkel actieve dossiers. Geen datawijziging nodig.

#### BI-S0-02 — Lege automations opkuisen of implementeren
**Wat:** Automations 1022 ("Bijwerken stage id") en 1023 ("Bereken sequence") hebben lege code.
**Hoe:** Beslissen: implementeren (zie sprint 1) of verwijderen.
**Impact:** Vermijdt verwarring en onnodige triggers.

#### BI-S0-03 — Donuts verwijderen uit kanban
**Wat:** Alle 4 donuts (Interactie, Gegevens, Context, Discovery) verwijderen uit de kanban-tegel.
**Beslissing:** Donuts waren een oud idee zonder databinding. Discovery was de enige echte, de andere 3 stonden op 0 hardcoded. De volledige donut-footer sectie wordt vervangen door pakket + gebouw + contactinfo (zie §5).
**Hoe:** Xpath in kanban overerving 3725: donut-footer verwijderen.

#### BI-S0-04 — "Stats" tab verwijderen uit formulier
**Wat:** De "Stats" tab in het notebook is volledig leeg.
**Hoe:** `invisible="True"` of volledig verwijderen uit view overerving 3564.

#### BI-S0-05 — Tags editeerbaar maken in formulier
**Wat:** Tags (`x_studio_tag_ids`) zijn momenteel read-only in de formulierweergave. Ze worden manueel ingevuld door CS.
**Hoe:** In view-overerving 3564: `readonly` attribuut verwijderen van het tags-veld.
**Opmerking:** Tags blijven freeform/manueel — geen automatisering.

#### BI-S0-06 — kanban_state vervangen in views
**Wat:** `x_studio_kanban_state` widget zit in kanban-tegel maar is nooit ingevuld in de data.
**Hoe:** Verwijderen uit kanban bottom-right, vervangen door Red Flag icoon (zie sprint 1).

---

### 🟠 SPRINT 1 — Fundament: rollen, pakket, Red Flag

#### BI-S1-01 — Support Verantwoordelijke veld
**Wat:** Nieuw `x_studio_support_user_id` (many2one → res.users) op actieblad.
**Waarom:** Sales verantwoordelijke ≠ CS medewerker. Op kanban-tegel tonen.
**Bij Won-automation:** voorlopig altijd Rob Claes invullen (hard-coded via `user_id` lookup op het e-mailadres).
**Roadmap:** Zodra een tweede CX-medewerker start → round-robin of toewijzingsregel bouwen (bv. op basis van pakket, regio of load-balancing). Zie ook BI-S3-05 voor planning.

#### BI-S1-02 — Syndicoach-pakket veld
**Wat:** Nieuw selection veld `x_studio_syndicoach_package` met waarden: `none`, `assistant`, `coach`, `captain`.
**Hoe invullen:** Manueel door CS op actieblad, lead en res.partner VME. Automatische detectie vanuit producten is niet mogelijk — tiers zitten niet in de productcatalogus.
**Synchronisatie:** Won-automation 1039 uitbreiden: als de lead al een pakket heeft ingevuld, dit overnemen op het actieblad zodat CS niet dubbel hoeft in te vullen.

#### BI-S1-03 — Red Flag statusveld + manuele toggle
**Wat:** Boolean `x_studio_red_flag` + selection `x_studio_red_flag_reason` (geen activiteit / churn-signaal / te lang in fase / manueel).
**Hoe:** Veld aanmaken, manueel instelbaar door CS, auto-trigger via cron (zie BI-S2-02).
**In kanban:** Rood icoon 🚩 conditionally zichtbaar.

#### BI-S1-04 — Won-datum ophalen op actieblad
**Wat:** Computed date veld `x_studio_won_date` dat `x_studio_became_customer` van de gekoppelde lead leest.
**Waarom:** Betrouwbaarder T0 dan `create_date` voor alle timing-automations.

#### BI-S1-05 — Kanban-tegel updaten
**Wat:** Xpath-aanpassingen op overerving view 3725:
- Gebouwnaam toevoegen aan body
- Syndicoach-pakket badge toevoegen
- Red Flag icoon toevoegen (conditionally)
- `kanban_state` vervangen door `support_user_id` avatar
- Sales verantwoordelijke als tweede kleinere avatar

---

### 🟡 SPRINT 2 — Pipeline automatiseren

#### BI-S2-01 — Won → Intake: stage + welkomstaak (automation 41 uitbreiden)
**Wat:** Uitbreiden server action 1039 met:
1. Stage actieblad zetten op "Intake"
2. Activiteit aanmaken: "Welkomsgesprek: klant bellen" → deadline = vandaag + 3 werkdagen → toegewezen aan Support Verantwoordelijke
3. `x_studio_entrypoint` auto-invullen vanuit `lead.source_id` of `lead.medium_id`
**Impact:** Elke nieuwe klant start automatisch in de juiste CS-fase met een taak.

#### BI-S2-02 — Daily cron: Red Flag detectie
**Wat:** Nieuwe dagelijkse cron op `x_sales_action_sheet`:
```
Filter: stage in [Intake, Opstarthulp, In Configuratie, Follow-up Validatie]
Check 1: gebouw.x_studio_onboarding_bucket in ['early_dropout', 'dormant', 'snoozing']
  → Red Flag + reden = "geen activiteit"
Check 2: won_date > 60 dagen geleden EN stage < Follow-up Validatie
  → Red Flag + reden = "te lang in fase"
Bij Red Flag: interne notificatie naar Support Verantwoordelijke
```
**Voordeel:** Hergebruikt de bucket-logica die al dagelijks draait. Geen nieuwe berekeningen nodig.

#### BI-S2-03 — Heeft Opstarthulp veld + conditionele routing
**Wat:** Boolean `x_studio_heeft_opstarthulp` (computed uit sale order producten, product "Opstarthulp" id 37).
**Waarom:** Bepaalt of stage "Opstarthulp" overgeslagen wordt of niet.
**Automatisering:** Bij stage = Intake, als `heeft_opstarthulp = True` → toon sub-status "Opstartsessie inplannen" + maak taak aan.

#### BI-S2-04 — Opstarthulp sub-status veld
**Wat:** Selection `x_studio_opstarthulp_status`: `niet_aangekocht` / `in_te_plannen` / `gepland` / `gehouden`.
**Trigger doorschuiven:** CS markeert manueel "gehouden" → auto naar "In Configuratie" + checklist aanmaken.
**Noot:** Automatische duur-detectie via `x_as_meetings.x_studio_duration` vervalt — wordt in de praktijk niet bijgehouden. CS beslist zelf wanneer de sessie als "gehouden" telt.

#### BI-S2-05 — Configuratie-checklist
**Wat:** 5 boolean-velden op actieblad (verplicht/optioneel):
- `x_studio_check_financieel` (verplicht)
- `x_studio_check_facturen` (verplicht)
- `x_studio_check_documenten` (verplicht)
- `x_studio_check_bankkoppeling` (optioneel, tonen als Ponto-product actief)
- `x_studio_check_peppol` (optioneel, tonen als Peppol-product actief)

**Automation:** `on_create_or_write`, filter = alle verplichte checks = True:
→ Stage naar "Follow-up Validatie" + activiteit "Follow-up call" deadline vandaag + 14 dagen.

**Aanpak:** M2M model `x_cs_checklist_item` (zie §4 — Checklist). CS kan items beheren zonder view-aanpassingen.

#### BI-S2-06 — Follow-up Validatie afsluiten
**Wat:** Manuele eindcheck door CX. Geen volledige automatisering, maar: voeg een "Validatie afgerond" boolean + knop toe die stage naar "Goed Opgestart" zet.

**De "Cindy-check":** Cindy is de ingebouwde AI-assistent in OpenVME. De eindscreening gebeurt door CX die manueel verifieert of de gegevens in de applicatie correct zijn (leveranciers, verdeelsleutels, grootboekrekeningen). Dit is een kwalitatieve beoordeling, geen automatiseerbare stap.

**Voorstel:** Voeg een checklist-item toe in de Follow-up Validatie checklist: "Instellingen gevalideerd (leveranciers, verdeelsleutels, GB-rekeningen)" → verplicht aanvinken voor afsluiting.

---

### 🟢 SPRINT 3 — Langetermijn & periodiciteit

#### BI-S3-01 — Periodieke check-in mail voor Goed Opgestart (via x_dynamic_mail_block)
**Wat:** Maandelijkse cron: actiebladen in "Goed Opgestart" zonder activiteit >120 dagen → automatisch een check-in mail versturen + activiteit aanmaken.

**Implementatie via bestaande mail-infrastructuur:**
Het systeem `x_dynamic_mail_block` is al gebouwd en in gebruik voor Meta Lead + Syndicoach flows. Blokken hebben `x_condition_field` + `x_condition_value` voor conditionele inhoud.

Aanpak:
1. Maak een Odoo `mail.template` aan op model `x_sales_action_sheet`
2. Definieer `x_dynamic_mail_block`-blokken voor de check-in mail:
   - Introductieblok (per pakket: Geen / Assistant / Coach / Captain kan anders zijn)
   - Overzichtsblok (actieve producten, gebouwnaam)
   - Call-to-action blok
3. Sla verstuurde blok-referentie op het actieblad op
4. Cron stuurt mail + maakt activiteit "Check-in mail verstuurd" aan

**Flow na mail:** CS monitort reacties manueel. Bij reactie → actieblad naar "Na te checken".

#### BI-S3-02 — "Na te checken" fase
**Wat:** Nieuwe stage na "Goed Opgestart". CS plaatst actieblad hier manueel na reactie op check-in.
**Automatiseren later:** Als Odoo mail-tracking dit ondersteunt (open/reply tracking).

#### BI-S3-03 — Upsell-signalering vanuit actieblad
**Observatie:** In bestaande activiteiten-data staat al "algemene follow-up > Upsell?" in de notes van Rob Claes. Er is al upsell-denken, maar ongestructureerd.
**Voorstel:**
- Voeg `x_studio_upsell_kans` selection toe: `geen` / `potentieel` / `warm` / `aangemeld`
- Bij `aangemeld`: automatisch een nieuwe lead aanmaken in CRM vanuit actieblad

#### BI-S3-05 — Auto-toewijzing support verantwoordelijke
**Context:** Rob Claes is hoofd-CX maar er komen meer medewerkers. Nu staat alles op Rob.
**Voorstel:** Bij Won → toewijzing via round-robin of vaste regel (bv. op basis van pakket of regio). Implementeer zodra tweede CX-medewerker actief is.
**Voorlopig:** Bij Won → altijd Rob Claes als support_user_id (hard-coded tot multi-CX).

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

Alternatief zonder gedragsverandering: de Gmail-inbox van CX integreren met Odoo (Google Workspace connector) zodat mails die vanuit Gmail gestuurd worden automatisch gelogd worden op het actieblad. Dit is technisch complexer maar minder afhankelijk van teamtraining.

---

### 🔵 SPRINT C — Communicatie-integratie

#### BI-SC-01 — Klantcontact valideren bij aanmaken actieblad (QUICK WIN)
**Wat:** Bij Won-automation 1039: controleer of `contact_id.email` en `contact_id.phone` ingevuld zijn. Zo niet → activiteit "Contactgegevens aanvullen" voor de support verantwoordelijke.
**Waarom:** Contactinfo wordt nu handmatig in de chatter getypt omdat de velden leeg zijn. Dit lost patroon 2 op.

#### BI-SC-02 — AI chatter → veldextractie
**Wat:** Uitbreiden van de bestaande AI-automation (id 38) met een extra prompt die recente chatter-notities analyseert en voorstelt:
- Welke checklistitems afgevinkt kunnen worden op basis van wat er beschreven staat
- Of contactgegevens in de chatter staan die nog niet in `res.partner` zitten
- Wat de huidige status/blocker is op basis van de laatste notities

**Output:** Nieuw veld `x_studio_ai_chatter_digest` — een kort AI-gegenereerd overzicht van de chatter, aanvullend op `ai_suggested_next_step`.
**Fase 2:** Auto-aanvinken van checklistitems als de AI hoge zekerheid heeft (bv. "Ponto Koppeling oke" → `x_studio_check_bankkoppeling = True`).

#### BI-SC-03 — Snelle statusupdate UI
**Wat:** Checklistitems zichtbaar bovenaan het formulier als klikbare rijen (niet verborgen in een tab). Aanvullen met een "Snel notitie" knop met vaste opties: "Gebeld, geen opname" / "Mail gestuurd" / "Afgesproken" / vrij veld.
**Doel:** De drempel om het actieblad bij te werken verlagen zodat CX minder snel naar Gmail of WhatsApp vlucht voor snelle updates.

#### BI-SC-04 — E-mailintegratie: Odoo chatter als mailkanaal (Optie A)

**Beslissing:** Rob is bereid te switchen naar Odoo voor actieblad-communicatie. CX stuurt klantmails voortaan vanuit de Odoo-chatter ("Send message"). Context: Rob gebruikt momenteel Intercom (ingelogd als support@mymmo.com) voor alle klantcommunicatie en zal dat blijven doen voor andere kanalen.

**Hoe het werkt:**
Odoo verstuurt elke "Send message" met:
- `From: Rob van OpenVME <support@openvme.be>` — wat de klant ziet
- `Reply-To: catchall+x_sales_action_sheet-{id}@mymmo.com` — waar de reply automatisch naartoe gaat

De klant antwoordt, Odoo vangt de reply op via de catchall, en linkt hem terug aan het juiste actieblad. Geen handmatig kopiëren meer.

**Configuratiestappen:**
1. **Inkomende mailserver:** `catchall@mymmo.com` toevoegen als fetchmail server (IMAP, Gmail/Google Workspace)
2. **Alias domain:** `mymmo.com` is al geconfigureerd — catchall alias ook ✅
3. **Afzenderadres:** `openvme.be` toevoegen als alias domain in Odoo (SPF/DKIM instellen). **Open keuze:**
   - Optie A: persoonlijk per medewerker — `Rob van OpenVME <rob@openvme.be>`, `Thomas van OpenVME <thomas@openvme.be>`. Klant weet wie ze schrijven, antwoorden zijn persoonlijker.
   - Optie B: gedeeld support-adres — `Rob van OpenVME <support@openvme.be>`, `Thomas van OpenVME <support@openvme.be>`. Consistenter, makkelijker te beheren bij wissel van medewerkers, maar minder persoonlijk.
   - Aanbeveling: Optie B past beter bij een CS-team dat groeit (nieuwe medewerkers = geen extra domeinconfiguratie). Optie A geeft meer persoonlijk gevoel maar vereist een apart mailbox per medewerker op openvme.be.
4. **Outbound server:** Bestaande Gmail SMTP (`support@syndicusonline.com`) vervangen door een server geauthenticeerd voor het gekozen From-domein, OF de Gmail server uitbreiden om ook `openvme.be` te mogen sturen (GSuite alias).

**Intercom ↔ Odoo in de loop houden:**
_Opmerking voor later — nog te analyseren als apart project._
Eenvoudigste brug: elke "Send message" vanuit Odoo verstuurt een BCC naar het e-mail-in adres van de Intercom-inbox (te vinden in Intercom onder Settings > Channels > Email). Zo verschijnt de Odoo-mail ook in Intercom als leesoverzicht. Klantreacties gaan via Reply-To terug naar Odoo — Odoo is de databron, Intercom is het leesvenster.

#### BI-SC-05 — Mail templates voor actiebladen
**Wat:** `mail.template` records aanmaken op model `x_sales_action_sheet` zodat CX met één klik een gestandaardiseerde mail kan sturen vanuit de chatter.

**Templates (prioriteit):**
| Template | Trigger | Inhoud |
|----------|---------|--------|
| Welkomsmail | Bij Intake (of manueel) | Intro OpenVME, wat te verwachten, contactinfo Rob |
| Opvolgingsvraag | Manueel na geen activiteit | "Hoe verloopt de opstart? Loopt er iets vast?" |
| Beginbalans / financieel | Manueel bij blocker | Uitleg + link naar Calendly/afspraakmogelijkheid |
| Afspraakherinnering | Manueel of auto vóór meeting | Datum + link + korte agenda |
| Samenvatting gesprek | Na call (manueel) | Wat besproken, wat klant moet doen, wat CX doet |

**Hoe:** Odoo Studio of Technisch > E-mailtemplates. Body kan dynamische velden bevatten (`{{ object.x_name }}`, `{{ object.x_studio_contact_id.name }}`). Koppelen aan `x_dynamic_mail_block` systeem voor conditionele inhoud per pakket (zie §1.1).

---

## 10. Samenvatting — prioriteiten per sprint

| Sprint | Doel | Resultaat voor CS |
|--------|------|------------------|
| 0 | Opkuis | CS ziet alleen relevante dossiers, geen rommel |
| 1 | Rollen + pakket + Red Flag | CS weet van elk dossier wie verantwoordelijk is, wat ze kochten, en welke dossiers alarm slaan |
| 2 | Pipeline automatiseren | Taken verschijnen vanzelf, stages schuiven door, geen enkel dossier valt door de mand |
| 3 | Langetermijn opvolging | Klanten in "Goed Opgestart" worden periodiek gecontacteerd, upsell-kansen worden gevangen |
| C | Communicatie-integratie | Klantmails landen automatisch in het actieblad, WA is zichtbaar in context, AI analyseert de chatter |
