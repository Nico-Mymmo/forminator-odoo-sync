# Addendum D — Definitieve Model- en Flow-Architectuur

**Status:** Architectuurbeslissing — geen implementatie  
**Datum:** 2026-03-03  
**Verwijzing:** Addendum C (analyse)

---

## 1. Definitieve Bron van Waarheid

**`fs_v2_odoo_models` is de enige model registry.**

Een model bestaat in dit systeem als en alleen als het een rij heeft in `fs_v2_odoo_models`. Geen model in de registry betekent: niet beschikbaar in de wizard, niet bruikbaar als nieuw target, niet toonbaar in de UI.

**`fs_v2_targets.odoo_model` blijft een tekstveld — geen foreign key.**

Reden: bestaande integraties mogen niet breken door een constraint-violation als een model uit de registry verwijderd wordt. De registry valideert bij aanmaken en bewerken via de UI. Historische targets blijven werken. De worker valideert niet op registratie, alleen op of het model bereikbaar is in Odoo zelf.

**`fs_v2_model_defaults` wordt gefuseerd in `fs_v2_odoo_models`.**

De kolom `fields` (jsonb) uit `fs_v2_model_defaults` wordt als kolom `default_fields` (jsonb) toegevoegd aan `fs_v2_odoo_models`. De aparte tabel verdwijnt. Één rij per model, alles op één plek.

**Het `ACTIONS`-object wordt volledig verwijderd uit de frontend.**

`ACTIONS` bevat drie hardcoded modelprofielen die het registry-systeem dupliceren. Het wordt vervangen door profieldata op de registry-entry. Elke rij in `fs_v2_odoo_models` kan optioneel bevatten: `identifier_type`, `update_policy`, `resolver_type`, `default_fields`. Geen van deze velden is verplicht. Als ze ontbreken, geldt de applicatiedefault.

**Profieldata zit in `fs_v2_odoo_models`, niet in code.**

| Profielgegeven | Kolom in `fs_v2_odoo_models` | Verplicht |
|---|---|---|
| Technische naam | `name` | Ja |
| Weergavenaam | `label` | Ja |
| Icoon | `icon` | Nee, default: `box` |
| Aanbevolen veldkoppelingen | `default_fields` (jsonb) | Nee |
| Standaard identifier-type | `identifier_type` | Nee, default: `mapped_fields` |
| Standaard update-policy | `update_policy` | Nee, default: `always_overwrite` |
| Resolver-type (indien van toepassing) | `resolver_type` | Nee |

De 3 bestaande modellen (res.partner, crm.lead, x_webinarregistrations) krijgen hun huidige `ACTIONS`-data als profieldata gemigreerd.

---

## 2. Definitieve Wizard-Architectuur

**De wizard is een versimpelde eerste stap van de pipeline. Niet meer.**

De wizard vraagt minimaal:
1. Site (WordPress-verbinding)
2. Formulier (Forminator form ID)
3. Naam van de integratie
4. Model voor stap 1 (keuze uit `fs_v2_odoo_models`)

Dit zijn de vier velden die nodig zijn om een integratie met één lege target aan te maken. Dat is alles wat de wizard doet.

**Veldkoppeling wordt niet meer in de wizard gedaan.**

Wizard stap 4 (de huidige mapping-sectie) vervalt. Na aanmaken belandt de gebruiker direct in de detail view. Veldkoppelingen worden altijd in de detail view gedaan, via de MappingTable.

Als een model `default_fields` heeft, worden die automatisch als startmappings aangemaakt op het moment dat de integratie aangemaakt wordt. De gebruiker hoeft daar in de wizard niets voor te doen.

**De wizard heeft drie stappen — geen vier:**
1. Site kiezen
2. Formulier kiezen
3. Model kiezen + naam invoeren → aanmaken

Na aanmaken: directe navigatie naar de detail view van de nieuwe integratie, met de eerste stap al open.

---

## 3. Mapping-UI Unificatie

**Er bestaat één mapping-implementatie: `MappingTable`.**

De huidige wizard stap 4 (`renderWizardMapping`, `wizard.extraMappings`, `renderStaticInput` in wizard context) verdwijnt volledig.

`MappingTable` wordt de enige plek waar veldkoppelingen aangemaakt, bewerkt en verwijderd worden.

**State-management:**

| Huidig | Definitief |
|---|---|
| `S.wizard.extraMappings` | Verdwijnt |
| `S.detail._extraRowsByTarget[tid]` | Blijft — dit is de enige extra-rows state |
| `S.detail.mappingsByTarget[tid]` | Blijft — opgeslagen mappings uit DB |

**Wat wordt gedeeld:**

- `MappingTable`-component: gebruikt door detail view én potentieel door wizard als die ooit eigen mapping-UI nodig heeft (maar dat doet hij niet meer in deze architectuur).
- `FieldPicker`-component: gedeeld, geen wijziging.
- `getActionCfgByModel` → wordt vervangen door directe lookup op `odooModelsCache`. Geen aparte helper meer nodig als `ACTIONS` weg is.

---

## 4. Model Defaults — Toekomst

**Defaults bestaan nog — als profieldata per model in de registry.**

Ze worden opgeslagen als `default_fields` (jsonb array) in `fs_v2_odoo_models`. Format: `[{ name, label, required }]`.

Ze zijn optioneel. Een model zonder `default_fields` werkt gewoon — de gebruiker begint met een lege MappingTable.

Ze zijn suggesties, geen afdwinging. Bij aanmaken van een integratie worden ze als startkoppelingen aangeboden. De gebruiker kan ze weggooien, aanpassen of negeren. Ze worden niet opnieuw toegepast bij latere bewerkingen.

Ze worden automatisch toegepast op het moment van aanmaken van de integratie (via de wizard), niet bij elke open van de detail view.

De aparte defaults-editor in de settings-pagina (huidige `renderDefaults()`) blijft bestaan, maar werkt via de registry — niet via `Object.keys(ACTIONS)`.

---

## 5. UX-Principes

**Vijf regels:**

1. **Een model bestaat alleen als het in `fs_v2_odoo_models` staat.** Niet in code, niet in een hardcoded lijst — in de database.

2. **Veldkoppelingen worden altijd in de detail view gedaan.** De wizard koppelt geen velden. De detail view is de enige plek.

3. **Aanmaken en beheren gebruiken dezelfde componenten.** De wizard maakt een integratie aan en opent daarna de detail view. Er is geen aparte aanmaak-UI voor veldkoppelingen.

4. **Een stap in de pipeline heeft één model.** Dat model komt uit de registry. De worker voert het uit. De detail view beheert het.

5. **Elke metadata over een model zit op één plek.** Label, icoon, defaults, identifier-advies — alles in de registry. Niet verspreid over code-objecten, dictionaries en tabellen.

---

## 6. Decommission-Lijst

| Component | Actie | Prioriteit |
|---|---|---|
| `ACTIONS`-object (`core.js`) | **Volledig verwijderd** | Hoog |
| `MODEL_LABELS` dictionary (`detail.js`) | **Volledig verwijderd** — vervangen door registry-lookup | Hoog |
| Wizard stap 4 (mapping-sectie) | **Volledig verwijderd** | Hoog |
| `S.wizard.extraMappings` state | **Volledig verwijderd** | Hoog |
| `renderWizardMapping()` | **Volledig verwijderd** | Hoog |
| `wizard.extraMappings`-handlers in bootstrap | **Volledig verwijderd** | Hoog |
| `fs_v2_model_defaults` (tabel) | **Gefuseerd** in `fs_v2_odoo_models` als `default_fields` kolom | Middel |
| `renderDefaults()` in `core.js` | **Gemigreerd** — zelfde functie, werkt op `odooModelsCache` i.p.v. `Object.keys(ACTIONS)` | Middel |
| `getActionCfgByModel()` | **Gemigreerd** → vereenvoudigd tot directe registry-lookup, daarna verwijderd | Middel |
| `odooFields`-arrays in `ACTIONS` | **Gefuseerd** als `default_fields` per model in registry | Middel |
| `resolver_type` in `ACTIONS.webinar` | **Gemigreerd** als `resolver_type` kolom op model-registry-entry voor x_webinarregistrations | Middel |
| `renderStaticInput` in wizard-context | **Hergebruikt** in MappingTable indien nodig, anders verwijderd | Laag |
| `fs_v2_odoo_models` | **Hergebruikt** — uitgebreid met profielkolommen | — |
| `fs_v2_model_links` | **Onaangeroerd** | — |
| `MappingTable`-component | **Onaangeroerd** — wordt gezaghebbend | — |
| `FieldPicker`-component | **Onaangeroerd** | — |
| `fs_v2_targets`, `fs_v2_mappings` | **Onaangeroerd** | — |

---

## 7. Migratiestrategie (Conceptueel)

**Principe:** Nooit twee dingen tegelijk breken. Elke stap laat de applicatie in een werkende staat.

### Fase 1 — Database uitbreiden (niet-breaking)
Voeg kolommen toe aan `fs_v2_odoo_models`: `default_fields`, `identifier_type`, `update_policy`, `resolver_type`. Alle nullable. Bestaande code werkt ongewijzigd.

Migreer data uit `fs_v2_model_defaults` naar de nieuwe kolommen in `fs_v2_odoo_models`. Verwijder daarna `fs_v2_model_defaults`.

### Fase 2 — Frontend: `ACTIONS` ontkoppelen
Vervang alle `ACTIONS`-referenties door `odooModelsCache`-lookups. `getActionCfgByModel()` leest voortaan alleen uit de cache. Dit is transparant zolang de cache identieke data bevat als `ACTIONS`.

Verwijder `ACTIONS` pas als alle referenties vervangen zijn.

### Fase 3 — Wizard vereenvoudigen
Verwijder stap 4 (mapping). Pas `submitWizard()` aan: maakt integratie + lege target aan, leest `default_fields` uit registry om startkoppelingen aan te maken, navigeert naar detail view. Verwijder `wizard.extraMappings` state en alle bijbehorende handlers.

Dit is de eerste breaking change voor gebruikers: veldkoppeling tijdens aanmaken is niet meer mogelijk. Dat is de bedoeling.

### Fase 4 — `renderDefaults()` herverbinden
Pas de defaults-editor aan zodat hij op `odooModelsCache` werkt en schrijft naar de `default_fields`-kolom via de registry API. `Object.keys(ACTIONS)` verdwijnt hier.

### Fase 5 — Opruimen
Verwijder `MODEL_LABELS`, `getActionCfgByModel()`, `renderStaticInput` in wizard-context. Verwijder overbodige bootstrap-handlers. Markeer wat verwijderd is in git-commit.

### Wat tijdelijk compatibel moet blijven
- `fs_v2_targets.odoo_model` als free text: permanent. Geen breaking change nodig.
- Bestaande integraties met modellen die niet in de registry staan: blijven werken in de worker. De UI toont het model als onbekend maar blokkeert niet.

### Wat breaking is
- Veldkoppeling in de wizard: verdwijnt in Fase 3. Wie gewend was daar velden te koppelen, moet naar de detail view.
- `fs_v2_model_defaults` tabel: verdwijnt in Fase 1. Alleen breaking voor eventuele directe SQL-queries op die tabel.
- `ACTIONS` als exportobject: verdwijnt in Fase 2. Alleen breaking voor eventuele externe scripts die `window.FSV2.ACTIONS` direct aanspreken.
