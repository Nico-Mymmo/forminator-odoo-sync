# Backlog: Actiebladen Verbetering — CS Onboarding Flow

_Gegenereerd op 2026-06-11 op basis van Odoo model `x_sales_action_sheet` + wishlist collega_

> **Bedrijfscontext:** OpenVME verkoopt software (OpenVME) voor VvE-beheer én een servicepakket (Syndicoach) met drie niveaus: Assistant, Coach en Captain. Actiebladen (`x_sales_action_sheet`) zijn gecentraliseerde formulieren die al vroeg in de salespipeline worden aangemaakt en doorlopen in de support-pipeline. Leads (`crm.lead`) = salespipeline; actiebladen = supportpipeline.

---

## Datamodel — relatie-architectuur

### Nodes en verbindingen

```
res.partner (Contact)          res.partner (Gebouw/VME)
      ▲                                  ▲
      │ contact_id (m2o)                 │ for_company_id (m2o)
      │                                  │ estate_id (m2o, via estate_stats)
      │                                  │
      └──────────── x_sales_action_sheet ────────────┐
                         (Actieblad)                  │
                              ▲ ↕                     │
          as_opportunity_ids  │  (many2many ↔)        │ as_estate_stats_id
          (opportunity_       │                       │ (many2many)
           actionsheet_ids)   │                       ▼
                         crm.lead               x_estate_stats
                       (Salespipeline)        (OpenVME omgeving)
```

### Beschrijving per relatie

| Van | Naar | Veld | Type | Noot |
|-----|------|------|------|------|
| actieblad | res.partner (persoon) | `x_studio_contact_id` | many2one | De voornaamste contactpersoon |
| actieblad | res.partner (gebouw) | `x_studio_for_company_id` | many2one | Het VME-gebouw |
| actieblad | crm.lead | `x_studio_as_opportunity_ids` | many2many ↔ | Bidirectioneel; in praktijk 1 lead per actieblad |
| actieblad | x_estate_stats | `x_studio_as_estate_stats_id` | many2many | OpenVME-omgevingsdata; niet altijd ingevuld |
| x_estate_stats | res.partner (gebouw) | `x_studio_estate_id` | many2one | Koppelt omgeving terug aan gebouw |
| crm.lead | res.partner (persoon) | `partner_id` | many2one | Zelfde persoon als actieblad contact_id (niet afgedwongen) |

### Kritieke observaties

**1. Actieblad wordt vóór Won aangemaakt.**
Uit de data blijkt dat actiebladen al gekoppeld worden aan leads in MQL, SQL en Demo — niet enkel na Won. Het actieblad groeit mee doorheen de volledige sales- én support-pipeline. Dit is een bewuste keuze (discovery-info verzamelen), maar heeft implicaties voor de CS-flow: de stages "Intake" t.e.m. "Goed Opgestart" mogen dus pas actief worden ná Won. De huidige "Discovery" stage is een sales-stage, geen CS-stage.

**2. partner_id op lead ≈ contact_id op actieblad — maar niet afgedwongen.**
In de praktijk wijzen beide naar hetzelfde `res.partner`-record (de contactpersoon). Dit is een conventie, geen technische constraint. Bij verkeerde koppeling of meerdere leads per actieblad kan dit inconsistent worden.

**3. res.partner heeft geen directe backlink naar actiebladen.**
Vanuit een contact of gebouw kan je niet rechtstreeks naar het gekoppelde actieblad navigeren in Odoo. Je navigeert altijd vanuit het actieblad zelf, of via de lead.

**4. Meerdere leads per actieblad is mogelijk (en komt voor).**
Actieblad 755 (VME Dvinsky) heeft 2 gekoppelde leads. Onduidelijk of dit intentioneel is (bv. meerdere contactpersonen in hetzelfde gebouw) of een datakwaliteitsprobleem. Dit patroon moet worden uitgeklaard voor automatiseringen worden gebouwd op de lead-koppeling.

**5. x_estate_stats is niet altijd gevuld.**
Van de 10 recent bekeken actiebladen hebben 2 geen gekoppelde estate_stats. Dit zijn waarschijnlijk leads die nog niet Won zijn en dus nog geen actieve OpenVME-omgeving hebben.

**6. Syndicoach-pakket (Assistant/Coach/Captain) staat nergens gestructureerd.**
Noch op het actieblad, noch op de lead is er een veld dat het aangekochte pakket bevat. Dit is een kritieke gap voor de CS-flow (bepaalt o.a. of Opstarthulp van toepassing is). → Zie BI-01.

### Implicatie voor de backlog

- Automatiseringen die uitgaan van "na Won" moeten filteren op `x_studio_became_customer` of de lead-stage, niet op actieblad-aanmaakdatum.
- De "Discovery" stage op actiebladen is feitelijk een sales-fase en staat los van de CS onboarding-flow. Overweeg of Discovery-actiebladen zichtbaar moeten zijn in de CS-kanban.
- Voor de Red Flag automatie (BI-06, BI-07) is `create_date` niet betrouwbaar als startpunt — beter `x_studio_became_customer` van de gekoppelde lead als T0 gebruiken.

---

## Huidige staat in Odoo

**Model:** `x_sales_action_sheet`  
**Stage-model:** `x_support_stage`

### Huidige fasen (stages)

| Seq | ID | Naam | Noot |
|-----|----|------|------|
| 10 | 1 | Discovery | Pre-sales fase |
| 11 | 5 | opstartgesprek | ≈ Intake/Welkomstgesprek |
| 13 | 7 | Opstartsessie Expert | ≈ Planning Opstarthulp |
| 14 | 8 | Basisinstellingen gecontroleerd | ≈ In Configuratie |
| 15 | 9 | Follow-up validatie | ✅ Klopt al |
| 16 | 10 | Done | ≈ Goed Opgestart |

**Ontbreekt:** Red Flag status, "Na te checken" fase, "Goed Opgestart" als aparte/verborgen fase

### Bestaande relevante velden

| Veldnaam | Type | Label | Noot |
|----------|------|-------|------|
| `x_studio_user_id` | many2one → res.users | Sales Verantwoordelijke | Hernoemd/uitgebreid nodig |
| `x_studio_stage_id` | many2one → x_support_stage | Stage | ✅ Aanwezig |
| `x_studio_kanban_state` | selection | kanban state | Kan hergebruikt voor red flag |
| `x_studio_tag_ids` | many2many → x_sales_action_sheet_tag | Labels | ✅ |
| `x_studio_as_opportunity_ids` | many2many → crm.lead | Gekoppelde Leads | Bron voor rollen ophalen |
| `x_studio_contact_id` | many2one → res.partner | Contactpersoon | ✅ |
| `x_studio_for_company_id` | many2one → res.partner | Gebouw | ✅ |
| `activity_ids` | one2many → mail.activity | Activiteiten | Basis voor taak-automatie |

**Ontbreekt als veld:** Assistant, Coach, Captain, Support Verantwoordelijke, Red Flag status, checklist items

---

## Views — huidige staat

### Kanban (view id 3724 + overerving 3725)

**Basisview (3724):**
- Gegroepeerd op `x_studio_stage_id`, gesorteerd op priority → sequence → id desc
- Kleurcodering via `x_color` (handmatig in te stellen per kaart)
- Progressbar boven de kolom: activiteitsstatus (planned/today/overdue)

**Wat er nu op de kanban-tegel staat:**

| Positie | Inhoud |
|---------|--------|
| Top-links | ⭐ Prioriteit (boolean_favorite) + Naam actieblad |
| Top-rechts | Dropdown menu (edit/delete/kleur kiezen) |
| Body | `x_studio_active_products_html` (HTML-veld, computed/readonly) |
| Bottom-links | Activiteiten-icoon + "Volgende activiteit" label + `activity_summary` |
| Bottom-rechts | `x_studio_kanban_state` (state_selection) + `x_studio_user_id` avatar |
| Footer | 4 donut-meters: Interactie, Gegevens, Discovery, Context |

**Wat er NIET op de tegel staat:**
- Contactpersoon (`contact_id`) — niet zichtbaar
- Gebouw (`for_company_id`) — niet zichtbaar (enkel indirect via de naam van het actieblad)
- Syndicoach-pakket — ontbreekt volledig
- Support Verantwoordelijke — ontbreekt (enkel Sales Verantwoordelijke als avatar)
- Red Flag — geen visueel signaal

**Kritieke bevinding — donuts niet aangesloten:**
De 4 donut-meters in de footer hebben hardcoded `--percent: 0` voor Interactie, Gegevens en Context. Enkel Discovery (`x_studio_discovery_progress`) is daadwerkelijk aangesloten op een veld. De andere drie meters zijn visueel aanwezig maar tonen geen echte data.

**Kritieke bevinding — tags readonly:**
In de formulierweergave zijn `x_studio_tag_ids` ingesteld als `readonly="True"` met `force_save="1"`. CS kan de labels dus niet manueel aanpassen — ze worden ergens automatisch gezet.

### Formulierweergave (view id 3559 + overerving 3564)

Opgebouwd uit:
- **Header:** Statusbar voor stage (clickable, met fold-ondersteuning)
- **Smart buttons:** Kansen (leads count) + Gebouw Stats (estate_stats count)
- **Bovenste sectie:** Sales Verantwoordelijke, Aanmaakdatum, Contactpersoon, Gebouw, contact_card_html (readonly), active_products_html (readonly)
- **Meetings inline:** Overzicht van `x_as_meetings` (type, datum, verantwoordelijke, duur, stage)
- **Notebook tabs:**
  - *Basisgegevens* — kavels, syndicus, leeftijdsgroepen, vaardigheidsniveaus
  - *Van Niks Tot In Orde* — registratienummer, verzekering, boekhouding, verdeelsleutels
  - *Discovery* — 5 open vragen met gestructureerde vragenlijsten als richtlijn
  - *Pijnpunten* — scores per pijnpunt (auto-aangemaakt bij opslaan)
  - *Datavelden* — leads en estate_stats (verborgen tab, `invisible="True"`)
  - *Progress* — discovery_progress + AI-analyse (samenvatting, key takeaways, suggestie)
  - *Stats* — leeg (enkel shell aanwezig)

### Lijstweergave (view id 3558 + overerving 3565)

Toont: id (verborgen), aanmaakdatum, stage, Sales Verantwoordelijke, naam, syndicus-type, contactpersoon, gebouw, registratienummer.

### Zoekweergave (view id 3560)

Zoeken op: naam, Sales Verantwoordelijke, labels.  
Filters: "Mijn actiebladen", "Gearchiveerd".  
Groepering: op Verantwoordelijke.

**Gap:** Geen filter op stage, contactpersoon, of Red Flag. Geen groepering op pakket.

---

## Backlog Items

Gegroepeerd per thema. Items zijn onafhankelijk tenzij anders vermeld.

---

### 🧑‍💼 THEMA 1 — Pakket & verantwoordelijken op het actieblad

> **Context:** OpenVME verkoopt software (OpenVME) én een servicepakket (Syndicoach) met drie niveaus: **Assistant**, **Coach** en **Captain**. Een actieblad wordt vroeg aangemaakt en loopt zowel door de sales- als de support-pipeline. Het pakket bepaalt mee welke onboarding-flow van toepassing is.

#### BI-01 — Syndicoach-pakket tonen op actieblad (Assistant / Coach / Captain)
**Prioriteit:** Hoog  
**Type:** Nieuw veld (Studio) of koppeling vanuit lead/verkoop  
**Beschrijving:**  
Voeg een veld toe dat aangeeft welk Syndicoach-pakket de klant heeft: **Assistant**, **Coach** of **Captain** (of "Geen Syndicoach" voor puur OpenVME-klanten). Dit bepaalt o.a. of de "Planning Opstarthulp" fase relevant is en welke checklist-items verplicht zijn.

Implementatieopties:
- **Optie A:** Selection-veld op het actieblad, manueel instelbaar door CS
- **Optie B:** Automatisch ophalen vanuit de gekoppelde sale/lead (aanbevolen — zie BI-02)

Tonen op de kanban-tegel als badge/label zodat CS in één oogopslag ziet wat het pakket is.  
**Acceptatiecriteria:**
- [ ] Pakketniveau zichtbaar op actieblad (formulier + kanban-tegel)
- [ ] Manueel instelbaar door CS
- [ ] Optioneel: automatisch gevuld vanuit lead (zie BI-02)
- [ ] Checklist en flow-logica kan hierop sturen (bv. Opstarthulp alleen voor Coach/Captain)

---

#### BI-02 — Pakket automatisch ophalen vanuit gekoppelde lead/verkoop
**Prioriteit:** Middel  
**Type:** Automatisering (Studio of server action)  
**Afhankelijkheid:** BI-01  
**Beschrijving:**  
Wanneer een lead gekoppeld wordt aan het actieblad (`x_studio_as_opportunity_ids`), automatisch het Syndicoach-pakket invullen op basis van de producten/tags op de lead of de bijhorende sale order.  
**Openstaande vraag:** Op welk veld van `crm.lead` of `sale.order` staat het pakket (Assistant/Coach/Captain)? Is dit een product, een tag, of een custom veld?  
**Acceptatiecriteria:**
- [ ] Bij koppelen lead: pakket wordt automatisch ingevuld (enkel als leeg)
- [ ] Manuele overschrijving blijft mogelijk

---

#### BI-03 — [VERWIJDERD — geïntegreerd in BI-01/02]
_Oorspronkelijk: rollen als personen ophalen vanuit lead. Niet van toepassing — Assistant/Coach/Captain zijn pakketniveaus, geen personen._

---

#### BI-04 — Support Verantwoordelijke apart van Sales Verantwoordelijke
**Prioriteit:** Middel  
**Type:** Veld hernoemen + nieuw veld (Studio)  
**Beschrijving:**  
Huidig veld `x_studio_user_id` heet "Sales Verantwoordelijke". Wishlist: **Support Verantwoordelijke** apart weergeven op de tegel. Sales Verantwoordelijke mag van de tegel verdwijnen maar blijft beschikbaar in het formulier.  
**Acceptatiecriteria:**
- [ ] Nieuw veld `x_studio_support_user_id` (many2one → res.users) aangemaakt
- [ ] Support Verantwoordelijke zichtbaar op kanban-tegel
- [ ] Sales Verantwoordelijke (`x_studio_user_id`) verwijderd van kanban-tegel, maar nog in formulier

---

### 🚩 THEMA 2 — Red Flag / Escalatie

#### BI-05 — Red Flag status op actieblad (geen aparte stage)
**Prioriteit:** Hoog  
**Type:** Nieuw statusveld (Studio)  
**Beschrijving:**  
Voeg een **Red Flag** statusveld toe als selection op `x_sales_action_sheet`, onafhankelijk van de stage. Bestaand `x_studio_kanban_state` kan hergebruikt of uitgebreid worden, of een nieuw veld aanmaken.  
Mogelijke waarden: `normal`, `red_flag` (+ eventueel `escalated`)  
Tonen als rood icoon/badge op kanban-tegel wanneer actief.

**Triggers — MANUEEL:**
- CS markeert manueel als klant duidelijk ontevreden is of aangeeft te willen opzeggen (churn)

**Triggers — AUTOMATISCH (zie BI-06 en BI-07 voor implementatie):**
- Geen klantreactie + geen activiteit in OpenVME gedurende X dagen
- Klant is 2 maanden geleden opgestart maar zit nog niet in fase Follow-up Validatie

**Acceptatiecriteria:**
- [ ] Veld aanwezig, manueel instelbaar door CS
- [ ] Zichtbaar als visueel signaal op kanban-tegel (rood icoon/kleur)
- [ ] Filterbaar in kanban- en lijstweergave ("Toon alleen Red Flags")

---

#### BI-06 — Automatische Red Flag: geen activiteit/reactie
**Prioriteit:** Middel  
**Type:** Automatisering (geplande actie / server action)  
**Afhankelijkheid:** BI-05  
**Beschrijving:**  
Dagelijkse cron die actiebladen checkt op:
- Geen activiteit gelogd op het actieblad gedurende X dagen (bepaal drempel samen met team)
- Geen recente activiteit in OpenVME (vereist koppeling via `x_studio_soid` op contact)

Als beide conditions voldaan: automatisch Red Flag zetten + interne notificatie naar Support Verantwoordelijke.  
**Openstaande vraag:** Wat is de exacte timing (X dagen zonder reactie)?  
**Acceptatiecriteria:**
- [ ] Cron draait dagelijks
- [ ] Red Flag wordt automatisch gezet + interne melding verstuurd
- [ ] Logboek/notitie op actieblad wat de trigger was

---

#### BI-07 — Automatische Red Flag: 2 maanden opgestart zonder Follow-up Validatie
**Prioriteit:** Middel  
**Type:** Automatisering (geplande actie)  
**Afhankelijkheid:** BI-05  
**Beschrijving:**  
Dagelijkse cron: actiebladen waarbij `create_date` meer dan 2 maanden geleden is, én stage nog NIET Follow-up Validatie of Goed Opgestart is → Red Flag zetten.  
**Acceptatiecriteria:**
- [ ] Cron draait dagelijks
- [ ] Red Flag + notificatie bij overschrijding
- [ ] Geen dubbele meldingen (eenmalige trigger)

---

### 🗂️ THEMA 3 — Fases herstructureren

#### BI-08 — Fase "Intake / Welkomstgesprek" hernoemen en verhelderen
**Prioriteit:** Middel  
**Type:** Stage aanpassen (Studio)  
**Beschrijving:**  
Huidige stage "opstartgesprek" (id 5) hernoemen naar **"Intake / Welkomstgesprek"** en beschrijving/context toevoegen. Seq blijft 11.  
**Acceptatiecriteria:**
- [ ] Stage hernoemd
- [ ] Automatie: bij instroom in deze fase → taak aanmaken "Klant bellen binnen 3 werkdagen" (zie BI-10)

---

#### BI-09 — Fase "Planning Opstarthulp" omzetten naar stage met sub-statussen
**Prioriteit:** Middel  
**Type:** Stage aanpassen + statusveld toevoegen (Studio)  
**Beschrijving:**  
Huidige stage "Opstartsessie Expert" (id 7) hernoemen naar **"Planning Opstarthulp"** en een sub-status veld toevoegen op het actieblad:
- `geen_opstartsessie` — Geen opstartsessie aangekocht
- `in_te_plannen` — Nog in te plannen
- `gepland` — Opstartsessie ingepland
- `gehouden` — Opstartsessie heeft plaatsgevonden

**Harde trigger naar volgende fase:** Minimaal 1 opstartsessie van > 30 minuten gehad.  
**Openstaande vraag:** Hoe registreer je de duurtijd van de sessie? Via `x_as_meetings` (heeft `x_studio_duration` veld)?  
**Acceptatiecriteria:**
- [ ] Stage hernoemd
- [ ] Sub-status veld aanwezig, zichtbaar in formulier
- [ ] Automaties op basis van sub-status mogelijk (zie BI-11)

---

#### BI-10 — Fase "In Configuratie" + checklist
**Prioriteit:** Hoog  
**Type:** Stage aanpassen + checklist velden (Studio)  
**Beschrijving:**  
Huidige stage "Basisinstellingen gecontroleerd" (id 8) hernoemen naar **"In Configuratie"**.  
Voeg een M2M checklist toe (of aparte boolean velden — zie overwegingen) met verplichte en optionele items:

**Verplichte items:**
- [ ] Financiële module geactiveerd
- [ ] Eerste facturen & bankafschriften ingegeven
- [ ] Er zijn minimaal 2 relevante documenten opgeladen

**Optionele items (enkel als aangekocht):**
- [ ] Bankkoppeling gemaakt
- [ ] Peppol geactiveerd

**Implementatieopties:**
- **Optie A:** Aparte boolean velden per checkitem op het actieblad (simpel, weinig flexibel)
- **Optie B:** M2M naar een `x_checklist_item` model met `verplicht/optioneel` vlag (aanbevolen — CS kan zelf items toevoegen, zoals beschreven in wishlist)

**Automatie bij voltooiing:** Als alle verplichte items aangevinkt → automatisch doorschuiven naar Follow-up Validatie + taak aanmaken voor call (datum + 2 weken) (zie BI-13).  
**Acceptatiecriteria:**
- [ ] Checklist zichtbaar en aanvinkbaar in formulierweergave
- [ ] Duidelijk onderscheid verplicht vs optioneel
- [ ] Automatie bij 100% verplichte items (zie BI-13)

---

#### BI-11 — Fase "Goed Opgestart" verbergen (folded)
**Prioriteit:** Laag  
**Type:** Stage aanpassen (Studio)  
**Beschrijving:**  
Stage "Done" hernoemen naar **"Goed Opgestart"** en instellen als gefoldede/verborgen kolom in kanban.  
**Acceptatiecriteria:**
- [ ] Stage hernoemd naar "Goed Opgestart"
- [ ] `x_studio_fold = true` → verborgen in kanban by default

---

#### BI-12 — Nieuwe fase "Na te checken" toevoegen
**Prioriteit:** Middel  
**Type:** Nieuwe stage (Studio)  
**Beschrijving:**  
Na "Goed Opgestart": nieuwe fase **"Na te checken"** voor klanten die gereageerd hebben op de periodieke check-in mail. CS volgt manueel op via call/mail.  
**Acceptatiecriteria:**
- [ ] Stage aangemaakt na "Goed Opgestart" in volgorde
- [ ] Manueel verplaatsen door CS

---

### ⚡ THEMA 4 — Automatiseringen & taken

#### BI-13 — Automatische taak: klant bellen binnen 3 werkdagen (Intake)
**Prioriteit:** Hoog  
**Type:** Automatisering (Studio automation / server action)  
**Afhankelijkheid:** BI-08  
**Beschrijving:**  
Wanneer actieblad naar fase "Intake / Welkomstgesprek" gaat → automatisch een activiteit/taak aanmaken op het actieblad: "Welkomsgesprek: klant bellen" met deadline = vandaag + 3 werkdagen, toegewezen aan Support Verantwoordelijke.  
**Acceptatiecriteria:**
- [ ] Taak wordt automatisch aangemaakt bij stage-overgang
- [ ] Deadline correct berekend (werkdagen, geen weekends)
- [ ] Toegewezen aan Support Verantwoordelijke van het actieblad

---

#### BI-14 — Automatische overgang + taak bij voltooide configuratie-checklist
**Prioriteit:** Hoog  
**Type:** Automatisering  
**Afhankelijkheid:** BI-10  
**Beschrijving:**  
Wanneer alle verplichte checklist-items in "In Configuratie" aangevinkt zijn:
1. Actieblad automatisch doorschuiven naar "Follow-up Validatie"
2. Activiteit aanmaken: "Call Follow-up" met datum = vandaag + 2 weken  
**Acceptatiecriteria:**
- [ ] Trigger werkt bij aanvinken laatste verplicht item
- [ ] Stage-overgang + taak worden aangemaakt
- [ ] Notitie gelogd op actieblad

---

#### BI-15 — Automatische terugkerende activiteit in "Goed Opgestart" (elke 4 maanden)
**Prioriteit:** Middel  
**Type:** Automatisering (geplande actie)  
**Beschrijving:**  
Actiebladen in fase "Goed Opgestart": elke 4 maanden automatisch een activiteit aanmaken "Periodieke check-in: mail + overzicht versturen" + eventueel automatisch een template-mail versturen.  
**Openstaande vraag:** Is er al een mail-template voor de check-in mail? Welke info staat erin?  
**Acceptatiecriteria:**
- [ ] Cron elke 4 maanden per actieblad in "Goed Opgestart"
- [ ] Activiteit aangemaakt (of mail verstuurd)
- [ ] Na versturen: actieblad eventueel naar "Na te checken" (als reactie ontvangen — zie BI-16)

---

#### BI-16 — Trigger "Na te checken" bij reactie op check-in mail
**Prioriteit:** Laag  
**Type:** Automatisering  
**Afhankelijkheid:** BI-12, BI-15  
**Beschrijving:**  
Wanneer een klant reageert op de periodieke check-in mail → actieblad automatisch naar fase "Na te checken" schuiven.  
**Openstaande vraag:** Hoe wordt de reactie gedetecteerd? Via Odoo mail tracking / Intercom webhook?  
**Acceptatiecriteria:**
- [ ] Automatische stage-overgang bij reactie
- [ ] Notificatie naar Support Verantwoordelijke

---

### 📋 THEMA 5 — Kanban & formulierweergave

#### BI-17 — Kanban-tegel updaten: pakket + support verantwoordelijke, sales verbergen
**Prioriteit:** Middel  
**Type:** View aanpassen (Studio — overerving view 3725)  
**Afhankelijkheid:** BI-01, BI-04  
**Beschrijving:**  
Kanban-tegel aanpassen (via xpath op de bestaande overerving of nieuwe inherit):
- **Toevoegen:** Syndicoach-pakket als badge (zie BI-01)
- **Toevoegen:** Support Verantwoordelijke als avatar (of vervang Sales avatar)
- **Verwijderen/verplaatsen:** Sales Verantwoordelijke van bottom-right (blijft in formulier)
- **Toevoegen:** Red Flag badge/icoon wanneer status actief (zie BI-05)

Huidig in bottom-right: `x_studio_kanban_state` + `x_studio_user_id`. Aanpak: `x_studio_user_id` vervangen door Support Verantwoordelijke, kanban_state behouden of vervangen door Red Flag widget.  
**Acceptatiecriteria:**
- [ ] Pakket zichtbaar als badge op de tegel
- [ ] Support Verantwoordelijke zichtbaar als avatar
- [ ] Red Flag visueel herkenbaar (rood icoon)
- [ ] Sales Verantwoordelijke van tegel verwijderd, blijft in formulier

---

#### BI-18 — Formulierweergave: Planning Opstarthulp sub-status + CS-pipeline tab
**Prioriteit:** Middel  
**Type:** View aanpassen (Studio — overerving view 3564)  
**Afhankelijkheid:** BI-09, BI-10  
**Beschrijving:**  
Formulier aanpassen:
- Sub-status veld voor Opstarthulp toevoegen (conditionally visible: enkel in relevante fase)
- Checklist voor "In Configuratie" toevoegen als nieuwe sectie of nieuwe tab
- Overweeg een aparte "CS Onboarding" tab in het notebook voor alles wat CS-specifiek is (pakket, sub-status, checklist, Red Flag)

Huidig notebook: Basisgegevens | Van Niks Tot In Orde | Discovery | Pijnpunten | Datavelden (verborgen) | Progress | Stats (leeg).  
**Acceptatiecriteria:**
- [ ] Sub-status veld zichtbaar in formulier, conditioneel getoond
- [ ] Checklist beschikbaar en aanvinkbaar
- [ ] CS-relevante velden gegroepeerd (niet verspreid over tabs)

---

#### BI-19 — Donuts aansluiten op echte data
**Prioriteit:** Laag  
**Type:** View aanpassen + velden toevoegen  
**Beschrijving:**  
De 4 donut-meters op de kanban-tegel (Interactie, Gegevens, Discovery, Context) hebben momenteel `--percent: 0` hardcoded voor 3 van de 4. Enkel Discovery is aangesloten op `x_studio_discovery_progress`. De andere drie moeten worden aangesloten op meetbare velden of berekende scores.

**Openstaande vraag:** Wat meet "Interactie", "Gegevens" en "Context" precies? Zijn hier al scores voor gedefinieerd?  
**Acceptatiecriteria:**
- [ ] Alle 4 donuts aangesloten op een reëel percentage-veld
- [ ] Velden worden automatisch berekend (server action of computed field)

---

#### BI-20 — Zoekweergave uitbreiden
**Prioriteit:** Laag  
**Type:** View aanpassen (Studio — view 3560)  
**Beschrijving:**  
Huidige zoekweergave mist filters op stage, contactpersoon, Red Flag en pakket.  
Toevoegen:
- Filter "Red Flag" (snel alle geëscaleerde actiebladen zien)
- Groepering op pakket (Assistant/Coach/Captain)
- Filter op stage
**Acceptatiecriteria:**
- [ ] Red Flag filter aanwezig
- [ ] Groepering op pakket aanwezig

---

## Openstaande vragen voor team

1. **Pakket vanuit lead:** Op welk veld van `crm.lead` of `sale.order` staat het Syndicoach-pakket (Assistant/Coach/Captain)? Is dit een product, tag of custom veld?
2. **Red Flag timing:** Hoeveel dagen zonder activiteit = automatische Red Flag?
3. **Opstartsessie duurtijd:** Wordt dit geregistreerd via `x_as_meetings.x_studio_duration`? Klopt de huidige registratie?
4. **Checklist implementatie:** Aparte booleans per item (A) of een flexibel M2M model (B)? (Aanbeveling: B)
5. **Check-in mail:** Is er al een template? Wat staat erin?
6. **Reactie detectie:** Hoe detecteer je dat een klant reageerde op de check-in mail? (Odoo mail / Intercom?)
7. **"Na te checken" na check-in:** Moet dit altijd manueel zijn, of wil je een trigger?

---

## Prioriteitenvoorstel (MVP eerst)

**Sprint 1 — Pakket zichtbaar + Red Flag**
- BI-01 Syndicoach-pakket (Assistant/Coach/Captain) op actieblad
- BI-04 Support Verantwoordelijke
- BI-05 Red Flag statusveld
- BI-17 Kanban-tegel update

**Sprint 2 — Fasen herstructureren**
- BI-08 Intake hernoemd
- BI-09 Planning Opstarthulp + sub-status
- BI-10 In Configuratie + checklist
- BI-11 Goed Opgestart verbergen
- BI-12 Na te checken

**Sprint 3 — Automatiseringen**
- BI-13 Taak bij Intake
- BI-14 Overgang bij voltooide checklist
- BI-06 Auto Red Flag: geen activiteit
- BI-07 Auto Red Flag: 2 maanden
- BI-15 Periodieke check-in
- BI-03 Rollen vanuit lead
- BI-16 Reactie op check-in
