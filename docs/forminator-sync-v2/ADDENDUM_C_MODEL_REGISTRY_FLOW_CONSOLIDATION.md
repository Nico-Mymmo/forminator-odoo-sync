# Addendum C — Model Registry & Flow Consolidation Analysis

**Status:** Analysedocument — geen implementatie, geen code  
**Datum:** 2026-03-03  
**Scope:** Forminator Sync V2

---

## 1. Huidige Situatie (Feitelijk)

### 1.1 Tabellen en hun effectieve verantwoordelijkheid

| Tabel | Wat het bevat | Effectief gebruikt voor |
|---|---|---|
| `fs_v2_integrations` | Naam, formulier-ID, site_key, is_active | Koppeling formulier ↔ Odoo-pijplijn |
| `fs_v2_resolvers` | Resolver-type, input_source_field, output_context_key | Opzoeken bestaande Odoo-records vóór uitvoering |
| `fs_v2_targets` | odoo_model, identifier_type, update_policy, execution_order, label | Definitie van één schrijfstap per integratie |
| `fs_v2_mappings` | odoo_field, source_type, source_value, is_identifier, is_update_field | Veldkoppelingen per stap |
| `fs_v2_model_defaults` | odoo_model (UNIQUE), fields (jsonb) | Suggesties van te tonen velden in de wizard; slaat ook legacy sentinelrijen op (verwijderd via migratie) |
| `fs_v2_odoo_models` | name (UNIQUE), label, icon, sort_order | Beheerbare lijst van Odoo-modellen beschikbaar in de UI |
| `fs_v2_model_links` | model_a, model_b, link_field, link_label, UNIQUE(model_a,model_b,link_field) | Definitie van many2one-koppelingen tussen modellen, gebruikt voor chain-suggesties in de detail view |
| `fs_v2_submissions` | status, payload, resolved_context, retry-metadata | Uitvoeringslog per formuliersubmissie |
| `fs_v2_submission_targets` | submission_id, target_id, action, odoo_record_id | Resultaat per stap per run |

### 1.2 Overlap en legacy-artefacten

**`fs_v2_model_defaults`:**
- Oorspronkelijk aangemaakt om per model een gesuggereerde veldlijst op te slaan voor de wizard.
- Is later tijdelijk misbruikt als sentinel-keyopslag voor `__odoo_models__` en `__model_links__` (JSON in `fields`-kolom).
- Die sentinel-rijen zijn verwijderd via `20260303130000_fsv2_migrate_and_seed_registry_data.sql`.
- De legitieme functie — default velden per model opslaan — bestaat nog steeds en is actief in de UI via `renderDefaults()`.
- De tabel is echter hardcoded aan de 3 `ACTIONS`-sleutels (`contact`, `lead`, `webinar`). Toevoegen van een custom model in `fs_v2_odoo_models` leidt niet automatisch tot een corresponderende entry in `fs_v2_model_defaults`.

**Hardcoded `ACTIONS`-object in `core.js`:**
- Bevat 3 vaste sleutels: `contact`, `lead`, `webinar`.
- Elk bevat: label, description, icon, badgeClass, odoo_model, identifier_type, update_policy, resolver_type (alleen webinar), en een handmatige `odooFields`-lijst.
- Gebruikt op minstens 4 plekken:
  1. `renderDefaults()` — itereert `Object.keys(ACTIONS)` om de defaults-editor te tonen.
  2. `renderList()` — zoekt label/icon/badge via match op `odoo_model` of `resolver_type`.
  3. `getActionCfgByModel()` — probeert eerst match in `ACTIONS`, valt terug op `odooModelsCache`.
  4. `submitWizard()` — leest `cfg.resolver_type`, `cfg.identifier_type`, `cfg.update_policy` om target en resolver aan te maken.

**`getActionCfgByModel()` in `core.js`:**
- Brug tussen het oude `ACTIONS`-systeem en het nieuwe `odooModelsCache`-systeem.
- Als model niet in `ACTIONS` zit, bouwt het een minimale config zonder `resolver_type`, met defaults `identifier_type: 'mapped_fields'` en `update_policy: 'always_overwrite'`.
- Velden (`odooFields`) zijn leeg voor custom modellen — de wizard toont dan geen voorgeselecteerde velden.

### 1.3 Hoe de wizard modellen ophaalt

1. `bootstrap()` laadt `loadOdooModels()` → vult `S.odooModelsCache` via `GET /settings/odoo-models` → leest `fs_v2_odoo_models`.
2. `renderWizardActions()` leest `S().odooModelsCache` als primaire bron.
3. Als de cache leeg is (first-load race of lege DB), valt het terug op `Object.keys(ACTIONS)` → de 3 hardcoded modellen.
4. Voor elk model roept het `getActionCfgByModel(m.name)` aan voor display-metadata (icon, description, badge).
5. Bij selectie van een model (`wizardSelectAction`) wordt `getActionCfgByModel` opnieuw aangeroepen om de veldkoppelings-sectie te renderen.
6. `submitWizard()` leest ook `getActionCfgByModel` om te bepalen of een resolver aangemaakt moet worden.

**Gevolg:** Als een custom model in `fs_v2_odoo_models` staat, verschijnt het in de wizard. Maar het heeft geen `resolver_type`, geen `odooFields`-lijst, geen `identifier_type`-advies. De wizard werkt, maar de gebruiker krijgt een lege veldkoppelings-sectie zonder suggesties.

### 1.4 Hoe de detail view modellen ophaalt

1. `openDetail()` laadt de targets uit `fs_v2_targets` via `GET /integrations/:id`.
2. `renderDetailMappings()` toont de cards op basis van die targets. Het model staat in `target.odoo_model` (een arbitrary string — volledig vrij veld in de DB).
3. Labels worden via `MODEL_LABELS` (hardcoded dictionary in `detail.js`) opgehaald, of via `S().odooModelsCache` via de nieuw toegevoegde `modelLabel()`-helper.
4. Odoo-veldmeta wordt dynamisch geladen via `loadOdooFieldsForModel(model)` → Odoo RPC `fields_get`.
5. Model-links (chain-suggesties) worden geladen uit `S().modelLinksCache` → `fs_v2_model_links`.

**Gevolg:** De detail view is volledig agnostisch voor het model. Het werkt op basis van de `odoo_model` string in de target-rij. De registry speelt hier geen rol in de uitvoering, alleen in de UX-labels.

---

## 2. Conceptueel Probleem

### 2.1 Wat is een "Odoo model" in Forminator Sync V2?

Op dit moment bestaat er geen eenduidige definitie. Het begrip "Odoo model" heeft minstens vijf overlappende betekenissen:

| Betekenis | Waar gedefinieerd | Wie gebruikt het |
|---|---|---|
| **Wizard-keuze** | `ACTIONS`-object (`core.js`) | Wizard (stap 3) |
| **Registry-entry** | `fs_v2_odoo_models` | Settings-pagina, wizard-fallback |
| **Live Odoo-resource** | Odoo RPC `fields_get` | Detail view (veldkoppelingen), wizard-mapping |
| **Target-waarde** | `fs_v2_targets.odoo_model` (free text) | Worker, detail view, renderer |
| **Linkable entity** | `fs_v2_model_links.model_a/model_b` | Chain-suggesties in detail view |

### 2.2 Waar zit de conceptuele breuk

Het probleem is dat deze vijf betekenissen **nergens samenkomen in een gedeelde definitie**.

- `ACTIONS` kent een model als een wizard-keuze met vaste metadata.
- `fs_v2_odoo_models` kent een model als een beheersbare UI-entry (naam + label + icoon).
- `fs_v2_targets.odoo_model` kent een model als een ruwe string — volledig losgekoppeld van de registry.
- Odoo zelf kent het model als een technisch object met velden en relaties.
- `fs_v2_model_links` kent een model als een endpoint van een many2one-relatie.

**Er is geen tabel of structuur die zegt: "dit is een geldig, volledig geconfigureerd model in dit systeem."**

De wizard simuleert dit via `ACTIONS`. De detail view doet het niet — die accepteert elke string. De settings-registry (`fs_v2_odoo_models`) is een poging tot een centrale lijst, maar is nog niet gezaghebbend: de worker gebruikt hem niet, de wizard valt terug op `ACTIONS`, en `fs_v2_targets.odoo_model` heeft geen foreign key naar de registry.

---

## 3. UX-Inconsistentie Analyse

### 3.1 Wizard flow vs. detail (pipeline) flow

| Aspect | Wizard | Detail View |
|---|---|---|
| **Model kiezen** | Keuze uit `odooModelsCache` (of `ACTIONS` fallback) | Niet van toepassing — model staat vast in target |
| **Model toevoegen** | Niet mogelijk vanuit wizard | "Stap toevoegen" voegt target toe met model-selector |
| **Veldkoppelingen invoeren** | Wizard-mapping sectie (stap 4) — statisch, op basis van `odooFields` uit `ACTIONS` | `MappingTable`-component — dynamisch, op basis van live Odoo `fields_get` |
| **Odoo-velden ophalen** | Alleen als `odooFieldsCache` leeg is, na model-selectie | Altijd bij openen van een stap |
| **Extra velden toevoegen** | Via `wizard.extraMappings` state + FieldPicker | Via `_extraRowsByTarget` state + FieldPicker |
| **Chain-koppelingen** | Niet ondersteund | Wel: chain-suggesties via `modelLinksCache` |
| **Opslaan** | Één knop "Integratie aanmaken" — alles in één keer | Per stap "Stap opslaan" |
| **Identifier-veld aanduiden** | Checkbox per rij in wizard-mapping | Checkbox per rij in MappingTable |
| **Update-veld aanduiden** | Checkbox per rij in wizard-mapping | Checkbox per rij in MappingTable |

### 3.2 Gedeelde componenten

- **`FieldPicker`** (`field-picker-component.js`): Gebruikt in zowel wizard als detail view, maar via verschillende wrapper-logica.
- **`MappingTable`** (`forminator-sync-v2-mapping-table.js`): Gebruikt in detail view. **Niet** gebruikt in wizard.
- **`renderStaticInput`** (`wizard.js`): Gebruik in wizard-mapping. Gedeeltelijk overlappend met de MappingTable-static-input logica.
- **`getActionCfgByModel`** (`core.js`): Gebruikt in wizard, detail-header, lijst-view. Centrale helper, maar met beperkte dekking voor custom modellen.

### 3.3 Duplicatie

- De veldkoppelings-UI bestaat twee keer: één variant in wizard (stap 4), één variant in detail view (MappingTable). Ze hanteren dezelfde concepten (form-veld → odoo-veld, identifier, update-check) maar zijn apart geïmplementeerd.
- Identifier/update checkboxes bestaan in beide implementaties, met verschillende name-attributen en state-management.
- `MODEL_LABELS` in `detail.js` is een hardcoded dictionary die overlapt met `fs_v2_odoo_models.label` en `ACTIONS[key].label`.

### 3.4 Waarom dit aanvoelt als twee systemen

De wizard is gebouwd als een **éénmalig aanmaakformulier** voor bekende modellen. Hij veronderstelt een vast `ACTIONS`-profiel per model: welke velden, welk `identifier_type`, of er een resolver nodig is.

De detail view is gebouwd als een **beheertool voor een bestaande integratie**. Hij veronderstelt niets over het model — alles komt dynamisch uit Odoo en uit de opgeslagen staat.

Deze twee filosofieën zijn nooit samengekomen. Het resultaat: aanmaken en beheren zijn conceptueel hetzelfde (je definieert stappen en veldkoppelingen), maar de implementatie is volledig gescheiden.

---

## 4. Doelarchitectuur (Conceptueel)

### 4.1 Eén model registry als gezaghebbende bron

`fs_v2_odoo_models` wordt de enige gezaghebbende lijst van ondersteunde modellen. Wat er in staat, is wat beschikbaar is in de wizard én in de detail view. De `ACTIONS`-config wordt gereduceerd tot een optioneel profiel dat een model kan hebben: aanbevolen `identifier_type`, aanbevolen velden, `resolver_type` indien van toepassing. Dit profiel is additionele metadata op de registry-entry, geen vervanging ervan.

Geen model kan in een integratie gebruikt worden dat niet in de registry staat. `fs_v2_targets.odoo_model` krijgt een soft-validatie of foreign key naar `fs_v2_odoo_models.name`.

### 4.2 Wizard = eerste stap van de pipeline

De wizard maakt één integratie aan met een beginstap. Hij is geen apart systeem — hij is een gestroomlijnde versie van hetzelfde interface dat de detail view biedt. Na aanmaken belandt de gebruiker direct in de detail view, waar de pipeline uitgebreid kan worden. De wizard vraagt minimuminformatie: naam, formulier, eerste model. Meer niet.

Veldkoppelingen kunnen optioneel ingesteld worden in de wizard, maar het is niet vereist. De detail view is de primaire plek voor veldkoppeling.

### 4.3 MappingTable als gedeeld component

De veldkoppelings-UI bestaat één keer. De wizard gebruikt hetzelfde `MappingTable`-component als de detail view, met dezelfde state-conventies. Geen aparte `wizard.extraMappings` en `_extraRowsByTarget` — één mechanisme.

### 4.4 Model-defaults als profieldata, niet als aparte tabel

De inhoud van `fs_v2_model_defaults` (aanbevolen standaardvelden per model) hoort bij het model-profiel. Een model in de registry kan optioneel een lijst van aanbevolen velden hebben. Dit is geen aparte tabel maar een kolom of gerelateerde entiteit per model. De wizard gebruikt deze lijst als pre-selectie.

### 4.5 Eén flow: aanmaken is de eerste bewerking

Het begrip "aanmaken" verdwijnt als aparte flow. Een integratie bestaat altijd uit:
1. Kies formulier + site.
2. Definieer stap 1 (model + veldkoppelingen).
3. Optioneel: voeg meer stappen toe.

Stap 1 kan in een wizard-achtige UI worden aangeboden, maar de onderliggende componenten zijn identiek aan de detail view.

---

## 5. Decommission-strategie (Conceptueel)

### 5.1 Kandidaten voor uitfasering

| Component | Reden | Prioriteit |
|---|---|---|
| `ACTIONS`-object (`core.js`) | Hardcoded model-configuratie; wordt vervangen door registry met optioneel profiel | Hoog |
| `MODEL_LABELS` dictionary (`detail.js`) | Hardcoded labels; worden vervangen door `odooModelsCache` → `label` | Hoog |
| `wizard.extraMappings` state | Afwijkend mapping-mechanisme naast `_extraRowsByTarget`; verdwijnt als wizard MappingTable gebruikt | Middel |
| `renderDefaults()` + defaults-editor (`core.js`) | Gebonden aan `Object.keys(ACTIONS)`; herbruikbaar als het op de registry gebouwd wordt | Middel |
| Sentinel-rijen in `fs_v2_model_defaults` | Al verwijderd via migratie; de tabel zelf is een kandidaat voor fusie met model-registry profiel | Laag |
| Wizard stap 4 (aparte mapping-implementatie) | Duplicaat van MappingTable-logica; verwijderbaar als wizard MappingTable adopteert | Hoog |
| `odooFields`-arrays in `ACTIONS` | Handmatig onderhouden veldlijsten; overbodig als live Odoo `fields_get` de bron is | Middel |

### 5.2 Wat behouden blijft

- `fs_v2_targets`, `fs_v2_mappings` — kernstructuur van de pijplijn, geen wijziging nodig.
- `fs_v2_model_links` — correct opgezet, nieuwe tabel, bruikbaar as-is.
- `fs_v2_odoo_models` — nieuwe tabel, juiste richting, wordt uitgebreid met profieldata.
- `MappingTable`-component — het juiste fundament voor veldkoppelings-UI.
- `getActionCfgByModel()` — handig als transitie-helper; uiteindelijk vervangen door directe registry-lookup.

### 5.3 Wat nog niet aangeraakt moet worden

`fs_v2_model_defaults` is op dit moment actief in gebruik voor de defaults-editor. Uitfasering vereist dat profieldata naar de registry verplaatst is. Dat is een migratie, geen verwijdering.

De wizard-flow zelf hoeft niet te verdwijnen — alleen de implementatie ervan moet op dezelfde componenten gebouwd worden als de detail view.

---

## Samenvatting

Het systeem heeft twee lagen die nog niet samengekomen zijn:

**Laag 1 (oud):** `ACTIONS`, `MODEL_LABELS`, wizard-mapping, `fs_v2_model_defaults` — vastgekoppeld aan 3 modellen, handmatig onderhouden, niet uitbreidbaar.

**Laag 2 (nieuw):** `fs_v2_odoo_models`, `fs_v2_model_links`, `odooModelsCache`, `MappingTable`, `getActionCfgByModel` — dynamisch, registry-gebaseerd, uitbreidbaar.

De richting is correct. Maar laag 1 is nog niet uitgeschakeld. Totdat dat gebeurt, bestaan er twee bronnen van waarheid, twee mapping-implementaties, en twee flows voor hetzelfde concept.
