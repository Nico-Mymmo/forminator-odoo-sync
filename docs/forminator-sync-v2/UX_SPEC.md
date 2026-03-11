# Forminator Sync V2 — UX Spec (actueel)

> Datum laatste update: 2026-03-03  
> Status: Live. Alle views zijn operationeel.

---

## UX-doel

Marketeer-gerichte configuratie-interface voor Forminator ? Odoo synchronisatie-pipelines. Geen technische overload: de gebruiker ziet "Herkenning" en "Schrijf naar Odoo", niet "Resolver" of "Target".

---

## Views & Navigatie

De interface heeft 6 views, geschakeld door `window.FSV2.showView(name)`:

| View ID | Zichtbaar als | Trigger |
|---|---|---|
| `list` | Lijst van integraties | Startpagina; "? Terug" knoppen |
| `wizard` | Nieuwe integratie aanmaken | "Nieuwe integratie" knop |
| `detail` | Integratie beheren | "Beheren" op een kaart |
| `connections` | WordPress sites | Instellingen-dropdown ? Verbindingen |
| `defaults` | Model field defaults (legacy) | Instellingen-dropdown ? Veld-standaarden |
| `links` | Model registry + Chain links | Instellingen-dropdown ? Modellen |

De "Nieuwe integratie" knop en het instellingen-dropdown zijn enkel zichtbaar in de `list` view.

---

## View: Lijst (`list`)

- Toont alle integraties als kaarten (grid).
- Elke kaart: naam, form-ID, actief/inactief badge, stap-preview (flow builder), bijgewerkt-datum.
- Knoppen per kaart: "Beheren" (? detail) | "Verwijderen" (met bevestiging).
- Lege staat: illustratie + "Maak je eerste integratie aan".
- Instellingen-dropdown: links naar Verbindingen, Veld-standaarden, Model-instellingen.

---

## View: Wizard (`wizard`) — 3 stappen

### Stap 1: WordPress-site kiezen

- Grid van geconfigureerde sites (uit `WORDPRESS_URL_SITE_N` env vars).
- Elke site-kaart toont label, URL, token-status.
- Selectie laadt formulieren voor stap 2.

### Stap 2: Formulier kiezen

- Grid van Forminator-formulieren op de geselecteerde site.
- Elke formulier-kaart: naam, ID, aantal mappable velden.

### Stap 3: Doelmodel + naam kiezen & velden koppelen

- Grid van Odoo-modellen (uit `S.odooModelsCache` of ingebouwde `DEFAULT_ODOO_MODELS`).
- Na selectie: integratienaam-invulveld + `MappingTable` met:
  - Automatisch gesuggereerde veldkoppelingen
  - Verplichte velden pre-gevuld (rode ? badge) vanuit `default_fields`
  - Extra rijen vrij toe te voegen
- "Aanmaken" submit knop.

**Wizard state** (`S.wizard`): `step`, `site`, `form`, `action`, `forms`, `formsLoading`, `_preSeededExtras`.

---

## View: Detail (`detail`)

### Header

- Integratienaam (klikbaar ? inline edit via potloodknop + invoerveld + ?/? knoppen, opgeslagen met `PUT /integrations/:id`).
- Stap-badges: model-a ? model-b met pijlen (gegenereerd door `renderFlowPreview`).
- Actief/Inactief toggle.
- Webhook-URL copieer-sectie.

### Tabbladen

#### Veldkoppelingen (mappings)

Per target (schrijfdoel):
- Doelmodel-label + technische naam.
- `MappingTable` met alle bestaande mappings als rijen.
- Verplichte velden die nog niet gemapt zijn: automisch toegevoegd als lege rijen (rode ? "verplicht" badge).
- Extra-rij beheer: toevoegen/verwijderen van bijkomende veldkoppelingen.
- "Opslaan" knop per target.

**`_extraRowsByTarget`**: initialisatie bij eerste render; persisteert zolang detail-view open is. Bij terug-navigatie: gereset (`null`).

#### Formuliervelden

- Tabel van alle Forminator-velden op het gekoppelde formulier.
- Kolommen: veld-ID, label, type.
- Geladen via `GET /api/forminator/forms?site=...`. Gecached in `S.detailFormFields`.

#### Submissions

- Tabel van de laatste 50 submissions.
- Statuspill per submission (success, partial_failed, permanent_failed, retry_*, duplicate_*).
- "Details" knop: geklapte rij met per-target resultaten (action, status, record-ID).
- "Replay" knop bij herstelbare statussen.

---

## View: Model-instellingen (`links`)

> Gerenderd door `forminator-sync-v2-settings.js` via `window.FSV2.renderLinks()`.

### Sectie 1: Odoo model registry

- Tabel met alle modellen: icoon, label, technische naam, `default_fields`-badges.
- Badges per model: gewone velden grijs | verplichtvelden rood (?).
- **Bewerken**: inline editor met:
  - Bestaande velden: naam + label + "Verplicht"-checkbox (togglebaar) + verwijder-knop.
  - Nieuw veld toevoegen: Odoo veld-picker + label + "Verplicht"-checkbox + "Voeg toe".
  - "Opslaan" / "Annuleren".
- **Toevoegen**: formulier onderaan met technische naam + label + icoon-dropdown.
- **Verwijderen**: knop naast elke rij.
- Opgeslagen via `PUT /api/settings/odoo-models`.

**Ingebouwde modellen** (fallback als DB leeg is):

| Model | Label | Veldpreset |
|---|---|---|
| `res.partner` | Contact | name?, email?, mobile, is_company |
| `crm.lead` | Lead | name?, email_from?, partner_name, phone, description |
| `x_webinarregistrations` | Webinaarinschrijving | x_name?, x_email? |

### Sectie 2: Model links (chain-suggestion)

- Tabel van many2one-verbindingen tussen modellen.
- Kolommen: Model A, Model B, Koppelveld, Label.
- Inline bewerken per rij.
- Opgeslagen via `PUT /api/settings/model-links`.
- Gebruikt door de mapping-tabel om `previous_step_output` keuzes te suggereren.

---

## View: Verbindingen (`connections`)

- Lijst van geconfigureerde WordPress-sites (uit Cloudflare env vars).
- Toont: label, URL, token-status (? Actief / ? Geen token).
- Readonly — credentials worden beheerd via Cloudflare secrets, nooit via de UI.

---

## Herbruikbare componenten

### `MappingTable` (`forminator-sync-v2-mapping-table.js`)

Herbruikbare tabelcomponent voor veldkoppelingen. Gebruikt in zowel wizard als detail.

Elke rij: Odoo veld (label + technische naam) | bron-type selector | bronwaarde-input | opties (verplicht/identifier/update).

Badge-types per rij:
- Rood ? **verplicht** — bij `isRequired: true` (uit `default_fields`)
- Paars **identifier** — bij `isIdentifier: true`
- Grijs **veld-type** — altijd zichtbaar

### `FieldPicker` (`field-picker-component.js`)

Doorzoekbare dropdown voor Odoo-velden. Gerenderd via `window.OpenVME.FieldPicker.render(id, target, fields, value)`.

---

## Terminologie (UI ? technisch)

| Zichtbaar in UI | Technische naam |
|---|---|
| Herkenning | Resolver |
| Herkende gegevens | Context |
| Schrijf naar Odoo | Target |
| Recordherkenning | `identifier_type` |
| Veldkoppeling | Mapping |
| Verplichtveld-badge (?) | `is_required: true` |
| Stap-badge (model?model) | Flow preview via `renderFlowPreview` |

---

## State-patronen

- **Instellingen opslaan**: bootstrap.js verwerkt `data-action` events ? `PUT /api/settings/odoo-models` ? update `S.odooModelsCache` ? `window.FSV2.renderLinks()`.
- **Verplichte velden injecteren**: `renderDetailMappings()` initialiseert `_extraRowsByTarget[tid]` vanuit DB-mappings, daarna injectie van ontbrekende `required`-velden uit `getModelCfg().default_fields`.
- **Wizard pre-seeding**: `renderWizardMapping()` bouwt `preSeededExtras` uit `cfg.default_fields.filter(f => f.required)` ? `S().wizard._preSeededExtras` ? `submitWizard()` leest ze als extra mappings.
