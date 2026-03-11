# Forminator Sync V2 — Architecture

> **Productie branch**: `master` (werkbranch: `forminator-sync`)  
> **Status**: Live en actief in gebruik  
> **Laatste versie**: `FSV2_ASSET_VERSION = '20260303d'`  
> **Deployed worker**: zie Cloudflare dashboard (forminator-sync)

---

## 1. Asset Delivery Model

Alle client-side JS-bestanden staan in `/public/` en worden door Cloudflare Workers Assets rechtstreeks via de CDN edge geleverd (`wrangler.jsonc → assets.directory: ./public`). Ze worden **nooit** ingesloten in de HTML-string die door `ui.js` teruggeven wordt.

```
public/
  field-picker-component.js           ← window.OpenVME.FieldPicker
  forminator-sync-v2-core.js          ← window.FSV2 (state, utilities, loaders, list/connections/defaults renders)
  forminator-sync-v2-flow-builder.js  ← window.FSV2.renderFlowPreview (stap-badges renderer)
  forminator-sync-v2-mapping-table.js ← window.MappingTable (herbruikbare mapping-tabelcomponent)
  forminator-sync-v2-wizard.js        ← extends window.FSV2 (wizard-renders + handlers)
  forminator-sync-v2-detail.js        ← extends window.FSV2 (detail-renders + handlers)
  forminator-sync-v2-settings.js      ← extends window.FSV2 (model registry + model links renders)
  forminator-sync-v2-bootstrap.js     ← guard + event delegation + bootstrap()

src/modules/forminator-sync-v2/ui.js
  └─ const FSV2_ASSET_VERSION = '20260303d'   ← serversijdig, nooit naar browser verzonden
  └─ HTML: <script src="/field-picker-component.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-core.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-flow-builder.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-mapping-table.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-wizard.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-detail.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-settings.js?v=${FSV2_ASSET_VERSION}"></script>
           <script src="/forminator-sync-v2-bootstrap.js?v=${FSV2_ASSET_VERSION}"></script>
```

De `?v=` querystring zorgt voor cache-busting zonder bestandsnamen te wijzigen.  
**Bump-regel**: bij elke aanpassing aan één of meer bestanden in `/public/` de `FSV2_ASSET_VERSION` verhogen naar `YYYYMMDD` of `YYYYMMDDx` (bij meerdere deploys op één dag).

---

## 2. Namespace Schema

| Globale variabele | Eigenaar | Inhoud |
|---|---|---|
| `window.OpenVME.FieldPicker` | `field-picker-component.js` | `render`, `closeAll`, `filterList`, `setValue` |
| `window.FSV2` | `forminator-sync-v2-core.js` | `SKIP_TYPES`, `S` (state), utilities (`esc`, `api`, `fmt`, `showAlert`, `showView`), loaders, `getModelCfg`, `DEFAULT_ODOO_MODELS`, renders (`renderList`, `renderConnections`, `renderDefaults`) |
| `window.FSV2` (uitgebreid) | `forminator-sync-v2-flow-builder.js` | `renderFlowPreview(steps)` |
| `window.MappingTable` | `forminator-sync-v2-mapping-table.js` | `MappingTable.render(containerId, opts)` |
| `window.FSV2` (uitgebreid) | `forminator-sync-v2-wizard.js` | `renderWizard`, `renderStaticInput`, wizard action handlers |
| `window.FSV2` (uitgebreid) | `forminator-sync-v2-detail.js` | `renderDetail`, `renderDetailMappings`, `renderDetailSubmissions`, handle* functies, `updateDetailTestStatus` (no-op) |
| `window.FSV2` (uitgebreid) | `forminator-sync-v2-settings.js` | `renderLinks` (model registry + model links settings) |
| *(geen exports)* | `forminator-sync-v2-bootstrap.js` | globale event delegation via `data-action`, `bootstrap()` |

Geen andere globals. Alle interne logica zit in IIFEs met `'use strict'`.

---

## 3. Load Order & Dependency Graph

```
field-picker-component.js           (geen deps — standalone)
        │
        ▼
forminator-sync-v2-core.js          (leest: OpenVME.FieldPicker bij render-time)
        │
        ▼
forminator-sync-v2-flow-builder.js  (leest: FSV2)
        │
        ▼
forminator-sync-v2-mapping-table.js (leest: FSV2, OpenVME.FieldPicker)
        │
        ▼
forminator-sync-v2-wizard.js        (leest: FSV2, OpenVME.FieldPicker, MappingTable)
        │
        ▼
forminator-sync-v2-detail.js        (leest: FSV2, OpenVME.FieldPicker, MappingTable)
        │
        ▼
forminator-sync-v2-settings.js      (leest: FSV2, OpenVME.FieldPicker)
        │
        ▼
forminator-sync-v2-bootstrap.js     (leest: FSV2.*, OpenVME.FieldPicker.* — guard bij laadtijd)
```

Scripts worden **synchroon** (geen `async`/`defer`) geladen vóór `</body>`. Daardoor is bij de uitvoering van `bootstrap.js` alles al gedefinieerd.

---

## 4. State object (`window.FSV2.S`)

Het centrale state-object wordt beheerd in `core.js` en is beschikbaar via `window.FSV2.S` (of de lokale alias `S()` in elke module).

```javascript
S = {
  view: 'list',           // actieve view: 'list'|'connections'|'wizard'|'detail'|'defaults'|'links'
  sites: [],              // sites geladen via GET /api/forminator/sites
  integrations: [],       // geladen via GET /api/integrations
  wizard: {
    step: 1,              // 1=site, 2=form, 3=model+naam
    site: null,           // { key, url, label }
    form: null,           // { form_id, form_name, fields }
    action: null,         // geselecteerde odoo_model naam (string)
    forms: [],
    formsLoading: false,
    _preSeededExtras: [], // verplichtvelden pre-gevuld uit default_fields
  },
  activeId: null,         // id van de geopende integratie
  detail: null,           // geladen bundel: { integration, resolvers, targets, mappings }
                          // detail._extraRowsByTarget: { [targetId]: ExtraRow[] }
  testStatus: null,
  submissions: [],
  detailFormFields: null, // null=niet geladen | 'loading' | [{field_id, label, type}]
  webhookConfig: null,
  odooFieldsCache: {},    // { [modelName]: OdooField[] }
  modelDefaultsEditors: {},
  modelLinksCache: [],    // [{ model_a, model_b, link_field, link_label }]
  odooModelsCache: [],    // [{ name, label, icon, default_fields, ... }]
  editingModelIdx: null,  // rij-index van model in bewerking (settings)
  editingLinkIdx: null,   // rij-index van model-link in bewerking
  editingDefaultFields: null, // kopie van default_fields tijdens bewerking
}
```

---

## 5. Model Registry & `getModelCfg`

### Builtin defaults (`DEFAULT_ODOO_MODELS` in `core.js`)

Drie ingebouwde modellen met `default_fields`. Deze fungeren als **basislijn**:

| Model | Verplichtvelden |
|---|---|
| `res.partner` | `name`, `email` |
| `crm.lead` | `name`, `email_from` |
| `x_webinarregistrations` | `x_name`, `x_email` |

### DB-registry (`fs_v2_odoo_models`)

Beheerd via de instellingenpagina. Opgeslagen velden: `name`, `label`, `icon`, `sort_order`, `default_fields` (JSONB), `identifier_type`, `update_policy`, `resolver_type`.

### Mergelogica in `getModelCfg(modelName)`

```
result = builtin.default_fields  (basis)
  + DB.default_fields            (veld bestaat in builtin → overschrijven; nieuw veld → toevoegen)
```

Hierdoor worden verplichtvelden uit de builtin-lijst **nooit verwijderd** door een verouderde DB-record.

---

## 6. `MappingTable` component

`forminator-sync-v2-mapping-table.js` exporteert `window.MappingTable` met één publieke methode:

```javascript
MappingTable.render(containerId, {
  model,          // Odoo model naam
  formFields,     // [{field_id, label, type}]
  odooFields,     // [{name, label, type, selection}]
  mappings,       // bestaande DB-mappings
  extraRows,      // ExtraRow[] — statische/template/chain-rijen
  targetId,
  chainSourceValues, // waarden voor previous_step_output keuzelijst
})
```

**ExtraRow-structuur:**
```javascript
{
  odooField:   string,
  odooLabel:   string,
  staticValue: string,
  sourceType:  'form'|'template'|'context'|'previous_step_output',
  isRequired:  boolean,    // toont rode ✱ badge
  isIdentifier: boolean,
  isUpdateField: boolean,
}
```

---

## 7. Versioning-strategie (query-string)

- Één constante `FSV2_ASSET_VERSION` in `ui.js` (server-side, nooit verzonden naar browser).
- Alle `<script src>` tags dragen `?v=${FSV2_ASSET_VERSION}`.
- Cloudflare behandelt `?v=X` als aparte cache-sleutel → onmiddellijke vervalling bij deploy.
- **Bump bij elke wijziging** aan een van de 8 bestanden in `/public/`.

---

## 8. Defensieve bootstrap-guard

Bovenaan `forminator-sync-v2-bootstrap.js`, in de IIFE:

```javascript
if (!window.FSV2 || !window.FSV2.S) {
  console.error('[FSV2] Core niet geladen. bootstrap.js stopt.');
  return;
}
```

Controleert `FSV2.S` (het state-object) — het vroegst-gedefinieerde stabiele eigendom van FSV2.

---

## 9. Uitbreidingsrichtlijnen

- **Nieuw FSV2-module**: maak `/public/forminator-sync-v2-<naam>.js` met `Object.assign(window.FSV2, { ... })`, voeg een `<script src>` toe in `ui.js` vóór `bootstrap.js`, bump `FSV2_ASSET_VERSION`.
- **Gedeelde UI-component**: voeg toe aan `field-picker-component.js` of maak `/public/openvme-<naam>.js` onder `window.OpenVME.<Naam>`.
- Gebruik **nooit** `String.raw`-inbedding of inline `<script>` voor applicatielogica.
- Gebruik **altijd** `data-action` attributes + event delegation in `bootstrap.js` voor nieuwe gebruikersacties.
