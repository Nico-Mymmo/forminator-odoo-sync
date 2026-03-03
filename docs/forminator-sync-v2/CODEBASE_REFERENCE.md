# Forminator Sync V2 — Codebase Reference

> Datum: 2026-03-03  
> Basis voor nieuwe gesprekken. Beschrijft elk bronbestand, zijn verantwoordelijkheid, sleutelexports en aandachtspunten.

---

## Overzicht bestandsstructuur

```
src/modules/forminator-sync-v2/
├── routes.js             API-router (alle /forminator-v2/api/* endpoints)
├── ui.js                 HTML-template + FSV2_ASSET_VERSION
├── database.js           Supabase databank-laag (alle CRUD-functies)
├── worker-handler.js     Webhookverwerking, retry, replay
├── validation.js         Payload-validatie (resolver/target/mapping)
├── odoo-client.js        Odoo JSON-RPC client (executeKw wrapper)
├── idempotency.js        Idempotency helpers
├── retry.js              Retry-schedulelogica
└── services/
    └── integration-service.js  Hogere-orde integratie-operaties (bundel-queries)

public/
├── field-picker-component.js           window.OpenVME.FieldPicker
├── forminator-sync-v2-core.js          window.FSV2 (state, utils, loaders, renders)
├── forminator-sync-v2-flow-builder.js  window.FSV2.renderFlowPreview
├── forminator-sync-v2-mapping-table.js window.MappingTable
├── forminator-sync-v2-wizard.js        window.FSV2 (wizard-uitbreiding)
├── forminator-sync-v2-detail.js        window.FSV2 (detail-uitbreiding)
├── forminator-sync-v2-settings.js      window.FSV2 (settings-uitbreiding)
└── forminator-sync-v2-bootstrap.js     (geen exports) event delegation
```

---

## Server-side bestanden

### `src/modules/forminator-sync-v2/routes.js`

**Verantwoordelijkheid:** Centrale API-router. Koppelt HTTP-methode+pad aan handler-functie. Geen business-logica — delegeert naar `database.js`, `worker-handler.js` en `validation.js`.

**Sleutelfuncties:**
- `routes` — object met alle route-handlers als `'METHOD /pad': async (context) => {...}`
- `parseErrorStatus(error)` — vertaalt error codes naar HTTP-statuscodes
- `enforceChainReferenceOrder(env, targetId, sourceValue)` — valideert `previous_step_output` referenties
- `enforceMvpLimitsOnResolvers(env, integrationId)` — max 2 resolvers per integratie
- `enforceNoDuplicateResolverType(env, integrationId, type, currentId)` — geen dubbele resolvertypen

**Alle routes:** zie [API_CONTRACT.md](./API_CONTRACT.md)

---

### `src/modules/forminator-sync-v2/database.js`

**Verantwoordelijkheid:** Alle Supabase-interacties. Elke functie is `export async function`.

**Sleutelfuncties:**

| Functie | Beschrijving |
|---|---|
| `getOdooModels(env)` | Alle modellen uit `fs_v2_odoo_models` (met `default_fields`) |
| `upsertOdooModels(env, models)` | Volledige vervanging van de model-registry. Bewaart `name`, `label`, `icon`, `sort_order`, **`default_fields`** |
| `getModelLinks(env)` | Model-link registry |
| `upsertModelLinks(env, links)` | Volledige vervanging van model-links |
| `listIntegrationSummaries(env)` | Compacte lijst voor de list-view |
| `createIntegrationRecord(env, payload)` | — |
| `getIntegrationDetails(env, id)` | Bundel: integratie + resolvers + targets + mappings |
| `updateIntegrationRecord(env, id, payload)` | — |
| `deleteIntegrationRecord(env, id)` | Cascadeert naar resolvers/targets/mappings |
| `createResolver / updateResolver / deleteResolver` | — |
| `createTarget / updateTarget / deleteTarget` | — |
| `createMapping / updateMapping / deleteMapping` | — |
| `deleteMappingsByTarget(env, targetId)` | — |
| `listMappingsByTarget(env, targetId)` | — |
| `createSubmission(env, data)` | — |
| `hasSuccessfulTestSubmission(env, integrationId)` | Boolean |
| `listSubmissionsByIntegration(env, id, limit)` | Max 50 |
| `getSubmissionById(env, id)` | — |
| `listSubmissionTargetResults(env, submissionId)` | — |
| `listWpConnections / createWpConnection / deleteWpConnection` | Legacy DB-backed WP verbindingen |
| `updateModelDefaultFields(env, model, fields)` | Legacy: schrijft `default_fields` voor één model |
| `getModelDefaults(env, model)` | Legacy compat-shim |

**Aandachtspunt `upsertOdooModels`:**  
Bouwt rijen met `name`, `label`, `icon`, `sort_order` én `default_fields`. Tot commit `f45bc31` werden `default_fields` **niet** opgeslagen (ontbrak in de `rows`-mapping). Fix: `default_fields: Array.isArray(m.default_fields) ? m.default_fields : undefined`.

---

### `src/modules/forminator-sync-v2/worker-handler.js`

**Verantwoordelijkheid:** Volledige webhookverwerking en retry/replay-logica.

**Geëxporteerde functies:**

| Functie | Beschrijving |
|---|---|
| `handleForminatorV2Webhook({ env, request, payload? })` | Volledig intake-pad: auth → idempotency → resolvers → targets → log |
| `processDueRetries(env, limit)` | Verwerkt due `retry_scheduled` submissions (atomic claim via status-transitie) |
| `replaySubmission(env, originalSubmissionId)` | Maakt nieuwe submission met eigen idempotency key |

**Sleutelfuncties intern:**

| Functie | Beschrijving |
|---|---|
| `lookupFormValue(normalizedForm, sourceValue)` | Zoekt veldwaarde via key-normalisatie (streepjes/underscores, prefix-matching). Templates: `{name-1}` → `name_1` |
| `resolveContext(env, resolvers, normalizedForm)` | Voert alle resolvers uit en bouwt context-object |
| `executeTarget(env, target, mappings, context, normalizedForm)` | Eén target uitvoeren: identifier ophalen, Odoo call, resultaat loggen |
| `canReplaySubmissionStatus(status)` | Boolean check op herstelbare statussen |

**`lookupFormValue` detail:**  
Normaliseert de sleutel (lowercase, `-` → `_`, `{...}` stripped) en zoekt prefix+exacte match in de payload. Ondersteunt ook template-strings met meerdere placeholders.

---

### `src/modules/forminator-sync-v2/ui.js`

**Verantwoordelijkheid:** Genereert de volledige HTML-pagina voor `/forminator-v2/`.

**Sleutelconstante:**
```javascript
const FSV2_ASSET_VERSION = '20260303d';
```

**Aandachtspunt:** Bij elke wijziging aan een `/public/` bestand moet `FSV2_ASSET_VERSION` worden verhoogd (formaat: `YYYYMMDD` of `YYYYMMDDx` voor meerdere deploys per dag).

---

### `src/modules/forminator-sync-v2/validation.js`

**Verantwoordelijkheid:** Payload-validatie voor resolvers, targets en mappings.

**Geëxporteerde functies:**
- `getMvpConstants()` — object met alle toegestane waarden (resolver types, update policies, source types, …)
- `validateResolverPayload(payload)` — gooit fout bij ontbrekende/ongeldige velden
- `validateTargetPayload(payload, { allowedModels })` — valideert ook of model bestaat in registry
- `validateMappingPayload(payload)` — valideert source_type, verplichte velden

---

### `src/modules/forminator-sync-v2/services/integration-service.js`

**Verantwoordelijkheid:** Hogere-orde integratie-operaties die meerdere DB-calls combineren.

**Geëxporteerde functies:**
- `listIntegrationSummaries(env)` — compacte lijst (name, id, is_active, forminator_form_id, odoo_model, updated_at)
- `createIntegrationRecord(env, payload)` — validatie + DB insert
- `getIntegrationDetails(env, id)` — bundel: integratie + resolvers + targets + mappings per target
- `updateIntegrationRecord(env, id, payload)` — validatie activatiecheck + DB update
- `deleteIntegrationRecord(env, id)` — cascade delete

---

## Client-side bestanden

### `public/forminator-sync-v2-core.js`

**Verantwoordelijkheid:** Kern van de client-side applicatie. Definieert `window.FSV2` met state, utilities en basis-renders.

**Exports (`window.FSV2`):**

| Export | Type | Beschrijving |
|---|---|---|
| `S` | object | Centrale state (zie ARCHITECTURE.md §4) |
| `SKIP_TYPES` | array | Forminator veldtypen die niet mappeerbaar zijn |
| `FIELD_KEYWORDS` | object | Keyword-map voor auto-suggest |
| `DEFAULT_ODOO_MODELS` | array | Ingebouwde modellen als fallback |
| `esc(v)` | functie | HTML-escape |
| `api(path, opts)` | async functie | Fetch helper voor `/forminator-v2/api/*` |
| `showAlert(msg, type)` | functie | Toast-melding |
| `showView(name)` | functie | Schakel tussen views |
| `fmt(v)` | functie | ISO-datum naar nl-BE formaat |
| `shortId(v)` | functie | Eerste 8 tekens van een UUID |
| `resetWizard()` | functie | Reset `S.wizard` naar beginstaat |
| `suggestFormField(odooField, formFields)` | functie | Auto-suggest form-veld op basis van keywords |
| `suggestOdooField(ffId, ffLabel, model)` | functie | Auto-suggest Odoo-veld |
| `loadOdooFieldsForModel(model)` | async | Laad + cache Odoo velden voor model |
| `getModelCfg(modelName)` | functie | Merge builtin+DB default_fields; geeft volledig model-config object |
| `loadSites()` | async | Laad `S.sites` |
| `loadIntegrations()` | async | Laad `S.integrations` |
| `loadModelLinks()` | async | Laad `S.modelLinksCache` |
| `loadOdooModels()` | async | Laad `S.odooModelsCache` |
| `renderList()` | functie | Render integratie-kaarten |
| `renderConnections()` | functie | Render verbindingen-view |
| `renderDefaults()` | functie | Render veld-standaarden (legacy defaults view) |

**`getModelCfg` mergelogica:**
```
result.default_fields = builtin.default_fields (basis)
  + DB.default_fields (overschrijft bij overeenkomstige naam; voegt toe als nieuw)
```

---

### `public/forminator-sync-v2-flow-builder.js`

**Verantwoordelijkheid:** Rendert de stap-badges preview (model-a → model-b met pijlen).

**Exports (`window.FSV2.renderFlowPreview`):**
```javascript
renderFlowPreview(steps)  // steps: [{ model: 'res.partner' }, { model: 'crm.lead' }]
// Returns: HTML string met badge-pijlen
```

---

### `public/forminator-sync-v2-mapping-table.js`

**Verantwoordelijkheid:** Herbruikbare mapping-tabelcomponent. Gebruikt in wizard én detail-view.

**Exports (`window.MappingTable`):**
```javascript
MappingTable.render(containerId, {
  model,           // string
  formFields,      // [{field_id, label, type}]
  odooFields,      // [{name, label, type, selection}]
  mappings,        // bestaande DB-mappings
  extraRows,       // ExtraRow[] (statische/template/chain/verplicht rijen)
  targetId,        // voor data-attributes in HTML
  chainSourceValues, // voor previous_step_output keuzelijst
})
```

**Badges op rijen:**
- Rood ✱ `verplicht` — bij `em.isRequired === true`
- Paars `identifier`
- Grijs `<veldtype>`

---

### `public/forminator-sync-v2-wizard.js`

**Verantwoordelijkheid:** Wizard-renders en alle wizard-gerelateerde action handlers.

**Exports (uitbreiding `window.FSV2`):**
- `renderWizard()` — orchestreert alle wizard sub-renders
- `renderStaticInput(name, meta, value, extraAttrs)` — juiste input-type op basis van Odoo veldtype

**Wizard-flow:**
1. `renderWizardSites()` — stap 1 grid
2. `renderWizardForms()` — stap 2 grid
3. `renderWizardActions()` — stap 3 model-keuze
4. `renderWizardMapping()` — stap 3 mapping-tabel: bouwt `preSeededExtras` vanuit `default_fields.filter(f => f.required)`, slaat op in `S().wizard._preSeededExtras`
5. `submitWizard()` — POST `/api/integrations` + POST mappings (inclusief pre-seeded verplichte velden)

---

### `public/forminator-sync-v2-detail.js`

**Verantwoordelijkheid:** Alle detail-view renders en handlers.

**Exports (uitbreiding `window.FSV2`):**

| Export | Beschrijving |
|---|---|
| `renderDetail()` | Header (naam + potlood + stap-badges + active toggle + webhook-URL) |
| `renderDetailMappings()` | Mapping-tabel per target + injectie ontbrekende verplichte velden |
| `renderDetailSubmissions()` | Submissie-log |
| `renderDetailFormFields()` | Formuliervelden-tabel |
| `handleRenameIntegration(name)` | PUT `/integrations/:id` met nieuwe naam; herlaadt detail |
| `updateDetailTestStatus()` | No-op (test op integratieniveau verwijderd) |

**`_extraRowsByTarget` mechanisme:**
- `S().detail._extraRowsByTarget` — geïnitialiseerd bij eerste `renderDetailMappings()`, per target-ID.
- Stap 1: vul met bestaande DB-mappings die `source_type !== 'form'` zijn.
- Stap 2: injecteer verplichtvelden uit `getModelCfg(model).default_fields` die nog niet gemapt zijn:
  ```javascript
  if (!df.required) return;
  if (allMappedFields.includes(df.name)) return;
  if (_extraRowsByTarget[tid].some(r => r.odooField === df.name)) return;
  _extraRowsByTarget[tid].push({ ..., isRequired: true });
  ```
- Reset naar `null` bij sluiten van detail-view.

---

### `public/forminator-sync-v2-settings.js`

**Verantwoordelijkheid:** Renders en handlers voor de settings-view (model registry + model links).

**Exports (uitbreiding `window.FSV2`):**
- `renderLinks()` — rendert beide secties: model registry + model-link registry

**Model registry editor (inline):**
- Leesstaat: badges per `default_fields` item (rood = verplicht, grijs = optioneel).
- Bewerkstaat (`S.editingModelIdx !== null`):
  - `S.editingDefaultFields` — in-memory kopie van `default_fields` tijdens bewerking
  - Rij per veld: `code` (naam) + label + "Verplicht"-checkbox (`data-action="toggle-default-field-required"`)
  - "Veld toevoegen"-formulier: Odoo FieldPicker + label + required checkbox
- Save: `PUT /api/settings/odoo-models` met volledig bijgewerkte `models`-array

---

### `public/forminator-sync-v2-bootstrap.js`

**Verantwoordelijkheid:** Enkel punt van event delegation + applicatie bootstrap.

**Structuur:**
1. Defensieve guard: `if (!window.FSV2 || !window.FSV2.S) { return; }`
2. Globale `click`-listener (event delegation via `closest('[data-action]')`)
3. `bootstrap()` functie: laadt data → rendert initiële view

**Afgehandelde `data-action` waarden (selectie):**

| Action | Beschrijving |
|---|---|
| `open-detail` | Laad integratie-detail |
| `delete-integration` | Bevestiging + DELETE |
| `wizard-select-site` | Site kiezen in wizard |
| `wizard-select-form` | Formulier kiezen |
| `wizard-select-action` | Odoo model kiezen |
| `wizard-back` | Vorige stap |
| `submit-wizard` | Wizard aanmaken |
| `edit-odoo-model` | Open inline editor, laad `S.editingDefaultFields` |
| `save-odoo-model` | PUT model registry |
| `cancel-edit-model` | Annuleer, wis `S.editingDefaultFields` |
| `delete-odoo-model` | Verwijder uit registry |
| `add-odoo-model` | Voeg nieuw model toe |
| `toggle-default-field-required` | Toggle `S.editingDefaultFields[idx].required = btn.checked` |
| `add-default-field` | Voeg veld toe aan `S.editingDefaultFields` |
| `remove-default-field` | Splice uit `S.editingDefaultFields` |
| `save-model-defaults` | Legacy defaults opslaan |
| `edit-model-link` / `save-model-link` / `cancel-edit-link` | Model-link bewerking |
| `add-model-link` / `delete-model-link` | — |
| `save-detail-mappings` | Alle target-mappings opslaan |
| `add-extra-row` / `remove-extra-row` | Extra rij in mapping-tabel |
| `replay-submission` | POST replay |

---

## Supabase tabellen (fs_v2_*)

| Tabel | Beschrijving |
|---|---|
| `fs_v2_integrations` | Integratie-configuratie |
| `fs_v2_resolvers` | Resolver-configuratie per integratie |
| `fs_v2_targets` | Schrijfdoelen per integratie |
| `fs_v2_mappings` | Veldkoppelingen per target |
| `fs_v2_submissions` | Webhook-submissions + status |
| `fs_v2_submission_target_results` | Resultaat per target per submission |
| `fs_v2_odoo_models` | Model-registry (name, label, icon, sort_order, default_fields JSONB, …) |
| `fs_v2_model_links` | Many2one suggestion-links |
| `fs_v2_wp_connections` | Legacy DB-backed WP-verbindingen |

---

## Bekende bugfixes (ter referentie)

| Bug | Oorzaak | Fix | Commit |
|---|---|---|---|
| `{name-1}` leeg in Odoo | Commits niet gedeployed | Deploy | `b25c58b6` |
| `default_fields` verdwijnen bij reload | `upsertOdooModels` bouwde rijen zonder `default_fields` | Voeg toe aan rows-mapping | `f45bc31` |
| Verplichte velden niet zichtbaar in detail-view | `getModelCfg` koos DB OF builtin (nooit merged) | Merge builtin+DB | `cb47df4` |
| Verplichte velden niet geïnjecteerd in detail | Injectiecode correct maar `getModelCfg` gaf lege lijst | Opgelost door merge-fix | `3443273` + `cb47df4` |
| Geen toggle voor verplicht op bestaande velden | Alleen nieuwe velden hadden checkbox | `toggle-default-field-required` action + checkbox | `a227d2c` |
