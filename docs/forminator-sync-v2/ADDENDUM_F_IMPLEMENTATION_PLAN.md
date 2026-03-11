# Addendum F — Implementatieplan v4: UX-sanering + html_form_summary + chatter_message

> Datum: 2026-03-04  
> Versie: **v4 (definitief — implementatie mag starten)**  
> Status: **Goedgekeurd**  
> Aanvulling op: [Addendum E](./ADDENDUM_E_FORM_HTML_RECAP_AND_CHATTER.md)

---

## Leeswijzer

Dit document vervangt v3. Correcties F–J uit de vierde herzieningsopdracht zijn verwerkt. Implementatie mag starten.

### Nieuwe correcties t.o.v. v3 (v4)

| Letter | Correctie | Impact |
|---|---|---|
| F | `html-utils.js` drift-preventie: header-comment + single source of truth voor logic | Sectie 2.1, sectie 2.5 |
| G | Stap-selector gefilterd op `odoo_model` — alleen compatibele vorige stappen | Sectie 3.5 |
| H | 150ms debounce op beide preview-functies | Secties 2.4 en 3.5 |
| I | Pipeline-header formaat: `💬 Notitie (ModelLabel)` | Sectie 3.6 |
| J | Submission history toont chatter-acties | Sectie 3.9 (nieuw) |

### Correcties t.o.v. v2 (v3)

| Letter | Correctie | Impact |
|---|---|---|
| A | `html-utils.js` module-strategie: keuze **Option B** (twee bestanden, geen bundler) | Architectuuroverzicht, sectie 2.1, sectie 2.5, Fase 2 bestandentabel |
| B | Validatie-guard verbeterd: `odoo_model` aanwezig-check behouden | Sectie 3.4 |
| C | Expliciete foutmelding wanneer chatter-stap niet gekoppeld is (twee afzonderlijke fouten) | Sectie 3.3 |
| D | Preview-iframe sandbox-strictheid bevestigd: altijd `sandbox="allow-same-origin"`, nooit `allow-scripts` of `allow-forms` | Secties 2.4 en 3.5 |
| E | Wizard-verbetering: optionele stap 5 (simpele ja/nee-kaart, geen volledige composer in wizard) vervangt het alert-aanpak | Sectie 3.8 |

### Samenvatting correcties t.o.v. v1

| Nr | Correctie | Impact |
|---|---|---|
| 1 | Gebruik altijd `message_post`, nooit `mail.message.create` | `odoo-client.js` — architectuurtekst expliciet geborgd |
| 2 | Verwijder `chatter_message_type` kolom | Migratie SQL, `postChatterMessage()`, UI, validatie |
| 3 | `buildHtmlFormSummary` → eigen module `html-utils.js` | Nieuw bestand; geen duplicatie tussen resolver, chatter en preview |
| 4 | `"*"` wildcard vervangen door `NULL` | Resolver-logica, UI modal, DB commentaar |
| 5 | `previous_step_output` mapping automatisch genereren — nooit tonen in UI | Intern aangemaakt bij stap-selectie; onzichtbaar in MappingTable |
| 6 | HTML-preview via `<iframe sandbox>` | Chatter-composer preview + html_form_summary preview |
| 7 | UX-architectuur Addendum E bevestigen | Implementatietekst bijgewerkt per onderdeel |
| 8 | HTML-uitvoer Odoo-compatibel | Inline CSS, tabel-layout, geen externe classes |
| 9 | Plan-structuur: architectuur + migratie + bestanden + rollback + checklist | Dit document |

---

## Nulpuntanalyse: werkelijke staat van de codebase

| Observatie | Conclusie |
|---|---|
| `ui.js` gebruikt al `collapse collapse-arrow` voor "Formulier velden" en "Indieningen" — geen tabstructuur | Fase 1 hoeft de HTML-skelet op dit punt niet te wijzigen; de collapse-structuur is correct. |
| `MappingTable.render()` heeft 5 permanente kolommen | Fase 1: reduceer naar 3 + ⋯-accordion. |
| "Stap toevoegen" is een `<select>` + knop in `renderDetailMappings()` | Fase 1: vervang door intent-picker dialog. |
| `SOURCE_TYPES` = `['form','context','static','template','previous_step_output']` | Fase 2: voeg `'html_form_summary'` toe. |
| Geen `html-utils.js` aanwezig | Fase 2: nieuw bestand. |
| Geen `chatter_template`- of `chatter_subtype_xmlid`-kolom op `fs_v2_targets` | Fase 3: migratie vereist. |
| Geen `<dialog>`-elementen in `ui.js` | Fasen 1–3: voegen elk een dialog toe. |
| `renderDetailFormFields()` rendert al in `#detailFormFields` binnen een collapse | Fase 1: geen structuurwijziging nodig; "Bekijk formuliervelden"-knop opent collapse programmatisch. |

---

## Architectuuroverzicht

```
public/
  forminator-sync-v2-mapping-table.js   ← Fase 1: ⋯-accordion, 3 vaste kolommen
  forminator-sync-v2-detail.js          ← Fasen 1, 2, 3: detail-view logica
  forminator-sync-v2-wizard.js          ← Fase 3: post-submit chatter-aanbod
  forminator-sync-v2-bootstrap.js       ← Fasen 1, 2, 3: nieuwe action-handlers

src/modules/forminator-sync-v2/
  html-utils.js                         ← Fase 2 NIEUW: buildHtmlFormSummary (worker-runtime, ESM)
  worker-handler.js                     ← Fasen 2, 3: resolver + chatter branch
  validation.js                         ← Fase 2: SOURCE_TYPES; Fase 3: chatter_message guard
  odoo-client.js                        ← Fase 3: postChatterMessage()
  ui.js                                 ← Fasen 1, 2: <dialog> elementen

public/
  forminator-sync-v2-html-utils.js      ← Fase 2 NIEUW: buildHtmlFormSummary (browser-runtime, IIFE)

supabase/migrations/
  20260304180000_fsv2_chatter_message.sql   ← Fase 3: 2 kolommen
```

> **Module-strategie (correctie A — keuze: Option B):**  
> Er is geen bundler voor client-assets. `src/modules/` is niet toegankelijk vanuit de browser. Daarom bestaan twee afzonderlijke bestanden met identieke logica:  
> - `src/modules/forminator-sync-v2/html-utils.js` — ESM export, geïmporteerd door de Worker via `import`.  
> - `public/forminator-sync-v2-html-utils.js` — IIFE, geladen via `<script src>` in `ui.js`, zet `window.FSV2.buildHtmlFormSummary`.  
> De twee bestanden worden **synchroon gehouden** — wijzigingen aan de logica worden in beide doorgevoerd.

---

## Fase 1 — UX-sanering (geen feature-logica)

### 1.1 — MappingTable: drie vaste kolommen + ⋯-accordion

#### Architectuurbeslissing (Addendum E bevestigd)

De MappingTable toont voortaan **drie vaste kolommen**:

| # | Kolomnaam | Inhoud |
|---|---|---|
| 1 | **Odoo veld** | FieldPicker + veldnaam sub-label |
| 2 | **Bron** | Type-badge (form / static / template / …) + composite toggle |
| 3 | **Waarde** | Waarde-input of form-veld-chip |

De ⋯-knop in kolom 4 (geen header) opent per rij een accordion die bevat:

- Zoekcriterium-checkbox (identifier)
- Bijwerken-checkbox (update_field)
- Waardemap-sectie (als `source_type === 'form'` en er keuzen zijn)

De waardemap verhuist van een aparte `<tr class="vmap-row">` naar het accordion-blok.

#### Exacte structuurwijzigingen in `mapping-table.js`

**Tabel-header:** 5 `<th>` → 4 `<th>`:

```
Oud:  [Odoo veld] [Bron] [Waarde] [Zoekcriterium] [Bijwerken]
Nieuw:[Odoo veld] [Bron] [Waarde] [lege th voor ⋯-kolom]
```

**`buildFormRow()` per rij — nieuwe structuur:**

```
<tr>
  [Odoo veld <td>][Bron <td>][Waarde <td>]
  [<td> <button data-action="toggle-row-details" data-fid="…">⋯</button> </td>]
</tr>
<tr class="row-details-row" id="rd-<fid>" style="display:none">
  <td colspan="4">
    <div class="flex gap-6 px-4 py-2 bg-base-200/40 rounded-lg">
      <label>[identifier checkbox] Zoekcriterium</label>
      <label>[update checkbox]     Bijwerken bij updates</label>
      [vmap-sectie indien aanwezig]
    </div>
  </td>
</tr>
```

**Toggle-logica:** `data-action="toggle-row-details"` via bootstrap.js delegatie. De knop toont `⋯` wanneer gesloten en `✕` wanneer open.

**Waardemap-sectie:** Verplaatst naar *binnen* `row-details-row`. `buildVmapSectionContent()` wordt ongewijzigd aangeroepen vanuit de accordion-cel.

**Colspan-update:** Alle `colspan="5"` → `colspan="4"` door het hele bestand.

**Extra-rijen** (statische rijen, template-rijen): Zelfde structuur — identifier/update naar accordion.

---

### 1.2 — "Formulier velden": bestaande collapse + knop

De `collapse "Formulier velden"` in `ui.js` blijft ongewijzigd. In de mappings-card-header van `detail.js` wordt een knop toegevoegd:

```
<button data-action="open-form-fields-drawer">Bekijk formuliervelden</button>
```

**Handler:** zoekt `#detailFormFieldsCollapse input[type="checkbox"]` (DaisyUI collapse-toggle) en zet `.checked = true`, dan scroll naar het element.

---

### 1.3 — Intent-picker: vervangt select + knop

**Verwijder** uit `renderDetailMappings()`:

```javascript
'<select id="addTargetModelSelect-...">' + modelOpts + '</select>'
+ '<button data-action="add-target">+ Stap toevoegen</button>'
```

**Vervang door:**

```javascript
'<button data-action="open-add-target-dialog"'
+ ' data-integration-id="' + esc(integrationId) + '">+ Stap toevoegen</button>'
```

**Nieuw `<dialog id="addTargetDialog">` in `ui.js`** (vóór `</body>`):

```html
<dialog id="addTargetDialog" class="modal">
  <div class="modal-box max-w-lg">
    <h3 class="font-bold text-lg mb-1">Stap toevoegen</h3>
    <p class="text-sm text-base-content/60 mb-5">Kies wat deze stap moet doen in Odoo.</p>
    <div id="addTargetTypeCards" class="grid gap-3">
      <!-- 4 kaarten gegenereerd door renderAddTargetDialog() -->
    </div>
    <div id="addTargetModelRow" class="mt-4" style="display:none">
      <label class="text-sm font-medium mb-1 block">Odoo model</label>
      <select id="addTargetModelPicker" class="select select-bordered w-full"></select>
    </div>
    <div class="modal-action">
      <button class="btn" data-action="close-add-target-dialog">Annuleren</button>
      <button class="btn btn-primary" id="confirmAddTargetBtn"
              data-action="confirm-add-target" disabled>Toevoegen</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>Sluiten</button></form>
</dialog>
```

**Vier intent-kaarten** (gegenereerd door `renderAddTargetDialog()`):

| Icoon | Label | Ondertitel | `data-op-type` | Model nodig? |
|---|---|---|---|---|
| 📝 | Upsert record | Zoekt eerst. Gevonden → bijwerken. Niet gevonden → aanmaken. | `upsert` | Ja |
| 📋 | Altijd nieuw aanmaken | Maakt altijd een nieuw record zonder zoekstap. | `create` | Ja |
| ✏️ | Bestaand bijwerken | Zoekt eerst. Niet gevonden → stap overgeslagen. | `update_only` | Ja |
| 💬 | Notitie in chatter | Plaatst een HTML-bericht in de Odoo-chatter van een eerder aangemaakt record. | `chatter_message` | Nee |

Na keuze type 1–3: `#addTargetModelRow` zichtbaar; `#confirmAddTargetBtn` unlocked na modelkeuze.  
Na keuze type 4: modelrow verborgen; `#confirmAddTargetBtn` direct unlocked.

---

### Fase 1 — Gewijzigde bestanden

| Bestand | Wijzigingen |
|---|---|
| `public/forminator-sync-v2-mapping-table.js` | 3-kolomtabel + ⋯-accordion per rij; vmap verhuist naar accordion |
| `public/forminator-sync-v2-detail.js` | `renderAddTargetDialog()`; "Bekijk formuliervelden"-knop handler |
| `public/forminator-sync-v2-bootstrap.js` | `toggle-row-details`, `open-add-target-dialog`, `close-add-target-dialog`, `confirm-add-target`, `open-form-fields-drawer` |
| `src/modules/forminator-sync-v2/ui.js` | `<dialog id="addTargetDialog">` vóór `</body>` |

**Niet gewijzigd:** worker-handler.js, validation.js, database.js, odoo-client.js, wizard.js.

---

## Fase 2 — Feature A: `html_form_summary`

### 2.1 — Uitiliteitsmodule: `html-utils.js` (correctie 3 + correctie A)

**Twee bestanden — zelfde logica, twee runtimes (Option B):**

| Bestand | Runtime | Formaat | Gebruik |
|---|---|---|---|
| `src/modules/forminator-sync-v2/html-utils.js` | Cloudflare Worker | ESM (`export function`) | Geïmporteerd door `worker-handler.js` |
| `public/forminator-sync-v2-html-utils.js` | Browser | IIFE (`window.FSV2.buildHtmlFormSummary = ...`) | Geladen via `<script src>` in `ui.js` |

De logica van `buildHtmlFormSummary` is identiek in beide bestanden.

> **Drift-preventie (correctie F):** `src/modules/forminator-sync-v2/html-utils.js` is de **single source of truth**. De browserversie (`public/forminator-sync-v2-html-utils.js`) begint altijd met het volgende header-commentaar:
>
> ```javascript
> /*
>  * Generated from src/modules/forminator-sync-v2/html-utils.js
>  * Do not edit independently.
>  * If the logic changes, update BOTH files simultaneously.
>  */
> ```
>
> Bij wijziging van de logica: **beide bestanden bijwerken in dezelfde commit**. Diffcontrole vóór elke merge.

#### Contractdefinitie (correctie 4 — geen `"*"` wildcard)

```
buildHtmlFormSummary(fieldIds, normalizedForm)

Argumenten:
  fieldIds      null | string[]
                null       → alle velden in normalizedForm opnemen (geen wildcard string meer)
                string[]   → alleen de opgegeven field-IDs opnemen

  normalizedForm  Object   → genormaliseerde sleutel-waarde-map van formuliervelden

Retourneert:
  string  →  HTML-string met inline CSS, Odoo-compatibel, of '' bij geen velden

Constraints (correctie 8):
  - Inline CSS only — geen externe klassen
  - Tabel-layout: <table> met <tbody><tr><td>
  - < en > in waarden geëscapet
  - font-family: sans-serif inline op <table>
  - Rendert correct in Odoo chatter, HTML-velden en mail
```

#### Implementatieoverzicht

```javascript
// src/modules/forminator-sync-v2/html-utils.js

export function buildHtmlFormSummary(fieldIds, normalizedForm) {
  const SYSTEM_KEYS = ['form_id', 'form_uid', 'ovme_forminator_id', 'nonce'];

  const entries = fieldIds === null
    ? Object.entries(normalizedForm).filter(
        ([k]) => !SYSTEM_KEYS.includes(k) && !k.includes('.')
      )
    : fieldIds
        .map(k => [k, normalizedForm[k] ?? null])
        .filter(([, v]) => v !== null && v !== undefined && v !== '');

  if (!entries.length) return '';

  const rows = entries.map(([key, value]) => {
    const label = key
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\s+\d+$/, '');
    const safe = String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<tr style="border-bottom:1px solid #e2e8f0">'
      + '<td style="font-weight:600;padding:5px 12px 5px 0;width:38%;'
      +   'color:#374151;vertical-align:top">' + label + '</td>'
      + '<td style="padding:5px 0;color:#111827">' + safe + '</td>'
      + '</tr>';
  }).join('');

  return '<table style="border-collapse:collapse;width:100%;font-size:14px;font-family:sans-serif">'
    + '<tbody>' + rows + '</tbody>'
    + '</table>';
}
```

---

### 2.2 — `worker-handler.js`: resolver-aanpassing

**Import uitbreiden:**

```javascript
import { buildHtmlFormSummary } from './html-utils.js';
```

**In `resolveMappingValue()`** — nieuwe case vóór `return null`:

```javascript
if (mapping.source_type === 'html_form_summary') {
  let fieldIds;
  if (!mapping.source_value) {
    fieldIds = null;                          // null = alle velden
  } else {
    try {
      const parsed = JSON.parse(mapping.source_value);
      fieldIds = Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      fieldIds = null;                        // parse-fout → alle velden
    }
  }
  return buildHtmlFormSummary(fieldIds, normalizedForm);
}
```

> `"*"` als `source_value` bestaat niet meer. `NULL` of lege string = alle velden. JSON-array = geselecteerde velden.

---

### 2.3 — `validation.js`: SOURCE_TYPES

```javascript
// Wordt:
const SOURCE_TYPES = [
  'form', 'context', 'static', 'template',
  'previous_step_output', 'html_form_summary'
];
```

---

### 2.4 — Client-side: "📋 Formuliersamenvatting toevoegen" + modal

#### Knop in `mapping-table.js`

Na de bestaande "+ Voeg toe"-knop in `addRowDiv`:

```javascript
'<button type="button" class="btn btn-ghost btn-xs gap-1.5 text-base-content/50"'
+ ' data-action="open-html-summary-modal"'
+ ' data-target-id="' + esc(String(cfg.targetId || '')) + '"'
+ ' data-odoo-model="' + esc(cfg.odooModel || '') + '">'
+ '<i data-lucide="table-2" class="w-3.5 h-3.5"></i> Formuliersamenvatting toevoegen'
+ '</button>'
```

#### Nieuwe `<dialog id="htmlSummaryModal">` in `ui.js`

```html
<dialog id="htmlSummaryModal" class="modal">
  <div class="modal-box max-w-lg">
    <h3 class="font-bold text-lg mb-1">Formuliersamenvatting</h3>
    <p class="text-sm text-base-content/60 mb-4">
      Genereert een HTML-tabel van formuliervelden en schrijft die naar een Odoo-veld.
    </p>
    <div class="form-control mb-4">
      <label class="label"><span class="label-text font-medium">Odoo-veld (type HTML of Text)</span></label>
      <div id="htmlSummaryOdooFieldPicker"></div>
    </div>
    <div class="form-control mb-4">
      <label class="label"><span class="label-text font-medium">Welke formuliervelden?</span></label>
      <label class="flex items-center gap-2 cursor-pointer mb-1">
        <input type="radio" name="htmlSummaryScope" value="all" class="radio radio-sm" checked>
        <span class="text-sm">Alle velden</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="radio" name="htmlSummaryScope" value="selected" class="radio radio-sm">
        <span class="text-sm">Selecteer velden:</span>
      </label>
      <div id="htmlSummaryFieldChecks"
           class="ml-6 mt-2 grid grid-cols-2 gap-x-4 gap-y-1"
           style="display:none"></div>
    </div>
    <!-- Preview via iframe sandbox (correctie 6) -->
    <div class="form-control mb-4">
      <label class="label"><span class="label-text font-medium">Voorvertoning</span></label>
      <iframe id="htmlSummaryPreviewFrame"
              sandbox="allow-same-origin"
              style="width:100%;min-height:80px;border:1px solid hsl(var(--b3));border-radius:0.5rem;background:#fff"
              scrolling="no"></iframe>
    </div>
    <div class="modal-action">
      <button class="btn" data-action="close-html-summary-modal">Annuleren</button>
      <button class="btn btn-primary" id="confirmHtmlSummaryBtn"
              data-action="confirm-html-summary" disabled>Toevoegen</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>Sluiten</button></form>
</dialog>
```

> **Preview sandboxing (correctie 6 — gekozen: `iframe sandbox`):**  
> De preview gebruikt `<iframe sandbox="allow-same-origin">`. HTML wordt geschreven via `iframe.contentDocument.body.innerHTML`. `allow-same-origin` is nodig om in het iframe-document te schrijven; `allow-scripts` wordt **bewust weggelaten** zodat geen JavaScript in de preview kan draaien. Dit is veiliger dan directe `innerHTML` in het hostdocument.

#### `openHtmlSummaryModal()` in `detail.js`

1. Vult `#htmlSummaryOdooFieldPicker` via `FieldPicker.render()`.
2. Vult `#htmlSummaryFieldChecks` met checkboxes per veld uit `buildDetailFlatFields(S().detailFormFields).flatFields`.
3. Radio `selected` → `#htmlSummaryFieldChecks` visible.
4. Elke radio/checkbox-wijziging → `updateHtmlSummaryPreview()`.
5. FieldPicker change-event → unlock `#confirmHtmlSummaryBtn`.

**Preview-logica (correctie H — 150ms debounce):**

```javascript
var _htmlSummaryPreviewTimer = null;

function scheduleHtmlSummaryPreview() {
  clearTimeout(_htmlSummaryPreviewTimer);
  _htmlSummaryPreviewTimer = setTimeout(updateHtmlSummaryPreview, 150);
}

function updateHtmlSummaryPreview() {
  var iframe = document.getElementById('htmlSummaryPreviewFrame');
  if (!iframe || !iframe.contentDocument) return;

  var scope     = document.querySelector('input[name="htmlSummaryScope"]:checked');
  var isAll     = !scope || scope.value === 'all';
  var fieldIds  = null;

  if (!isAll) {
    fieldIds = Array.from(
      document.querySelectorAll('#htmlSummaryFieldChecks input:checked')
    ).map(function(cb) { return cb.value; });
  }

  // Gebruik veldlabels als sample-waarden
  var sampleForm = {};
  var flatFields = (buildDetailFlatFields(window.FSV2.S().detailFormFields || []).flatFields || []);
  flatFields.forEach(function(f) { sampleForm[f.name] = f.label || f.name; });

  var html = window.FSV2.buildHtmlFormSummary(fieldIds, sampleForm);
  iframe.contentDocument.body.style.cssText = 'margin:8px';
  iframe.contentDocument.body.innerHTML = html
    || '<p style="color:#9ca3af;font-size:13px">Geen velden geselecteerd.</p>';
  iframe.style.height = (iframe.contentDocument.body.scrollHeight + 16) + 'px';
}
```

Elke radio- of checkbox-wijziging roept `scheduleHtmlSummaryPreview()` aan (niet `updateHtmlSummaryPreview` direct).

#### Mapping-opslag bij "Toevoegen"

- Scope `all` → `source_value = null` (geen wildcard string).
- Scope `selected` → `source_value = JSON.stringify([...ids])`.
- Rij toegevoegd aan `S().detail.extraRows[targetId]` met `source_type: 'html_form_summary'`.
- Badge in Bron-kolom: **📋 Samenvatting**.

---

### 2.5 — Browser-beschikbaarheid van `buildHtmlFormSummary`

In `ui.js`, in het `<head>` gedeelte, na de bestaande asset-scripts:

```html
<script src="/forminator-sync-v2-html-utils.js"></script>
```

`public/forminator-sync-v2-html-utils.js` is een IIFE met het drift-preventie header-commentaar:

```javascript
/*
 * Generated from src/modules/forminator-sync-v2/html-utils.js
 * Do not edit independently.
 * If the logic changes, update BOTH files simultaneously.
 */
(function() {
  function buildHtmlFormSummary(fieldIds, normalizedForm) {
    // ... identieke logica als de worker-versie ...
  }
  window.FSV2 = window.FSV2 || {};
  window.FSV2.buildHtmlFormSummary = buildHtmlFormSummary;
})();
```

Geen `type="module"`, geen dynamische import, geen bundler. Past in het bestaande patroon van alle andere public JS-bestanden.

---

### Fase 2 — Gewijzigde bestanden

| Bestand | Wijzigingen |
|---|---|
| `src/modules/forminator-sync-v2/html-utils.js` | **Nieuw** — `buildHtmlFormSummary` ESM export (worker-runtime) |
| `public/forminator-sync-v2-html-utils.js` | **Nieuw** — `buildHtmlFormSummary` IIFE (browser-runtime, identieke logica) |
| `src/modules/forminator-sync-v2/worker-handler.js` | Import `buildHtmlFormSummary`; case in `resolveMappingValue()` |
| `src/modules/forminator-sync-v2/validation.js` | `'html_form_summary'` in `SOURCE_TYPES` |
| `public/forminator-sync-v2-mapping-table.js` | Summaryknop + badge voor `html_form_summary` rijen |
| `public/forminator-sync-v2-detail.js` | `openHtmlSummaryModal()`; `updateHtmlSummaryPreview()`; handlers |
| `public/forminator-sync-v2-bootstrap.js` | `open-html-summary-modal`, `close-html-summary-modal`, `confirm-html-summary` |
| `src/modules/forminator-sync-v2/ui.js` | `<dialog id="htmlSummaryModal">`; `<script src>` voor browser-html-utils |

**Geen DB-migratie.** `source_value TEXT` accepteert `NULL` en JSON-arrays.

---

## Fase 3 — Feature B: `chatter_message`

### 3.1 — DB-migratie (correctie 2 — geen `chatter_message_type` kolom)

**Nieuw bestand:** `supabase/migrations/20260304180000_fsv2_chatter_message.sql`

```sql
-- Addendum F v2: chatter_message target support
-- message_type is ALTIJD 'comment' in Odoo — wordt niet opgeslagen als DB-waarde.
-- Het verschil interne notitie vs publieke discussie wordt bepaald door subtype_xmlid.

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS chatter_template      TEXT,
  ADD COLUMN IF NOT EXISTS chatter_subtype_xmlid TEXT NOT NULL DEFAULT 'mail.mt_note';

COMMENT ON COLUMN fs_v2_targets.chatter_template
  IS 'HTML-sjabloon met {field-id} placeholders. NULL = automatische samenvatting van alle velden.';

COMMENT ON COLUMN fs_v2_targets.chatter_subtype_xmlid
  IS 'Odoo subtype: mail.mt_note (interne notitie) of mail.mt_comment (publieke discussie).';
```

**Rollback:**

```sql
ALTER TABLE fs_v2_targets
  DROP COLUMN IF EXISTS chatter_template,
  DROP COLUMN IF EXISTS chatter_subtype_xmlid;
```

---

### 3.2 — `odoo-client.js`: `postChatterMessage` (correcties 1 + 2)

```javascript
/**
 * Plaatst een HTML-bericht in de Odoo-chatter via message_post.
 *
 * Regels (Addendum F v2):
 * - Altijd method: 'message_post' — NOOIT mail.message.create
 * - message_type is ALTIJD 'comment' — hardcoded, niet configureerbaar
 * - author_id wordt NOOIT meegegeven; Odoo wijst automatisch de ingelogde gebruiker toe
 * - subtype_xmlid bepaalt het gedrag (interne notitie vs publieke discussie)
 *
 * @param {Object} env
 * @param {Object} opts
 * @param {string} opts.model              - Odoo model (bijv. 'project.project')
 * @param {number} opts.recordId           - ID van het doelrecord
 * @param {string} opts.body               - HTML-inhoud (inline CSS, Odoo-compatibel)
 * @param {string} [opts.subtypeXmlid]     - 'mail.mt_note' (default) of 'mail.mt_comment'
 * @returns {Promise<{ action: 'created', recordId: number }>}
 */
export async function postChatterMessage(env, { model, recordId, body, subtypeXmlid }) {
  const msgId = await executeKw(env, {
    model,
    method:  'message_post',
    args:    [[recordId]],
    kwargs: {
      body:          body || '',
      message_type:  'comment',                      // altijd 'comment'
      subtype_xmlid: subtypeXmlid || 'mail.mt_note', // bepaalt interne notitie vs discussie
      // author_id: BEWUST WEGGELATEN
    }
  });
  return { action: 'created', recordId: msgId };
}
```

**Import aanpassen in `worker-handler.js`:**

```javascript
import {
  findRecordByIdentifier, upsertRecordStrict, createRecordOnly,
  updateOnlyRecord, postChatterMessage
} from './odoo-client.js';
```

---

### 3.3 — `worker-handler.js`: chatter_message branch

**Import bovenaan:**

```javascript
import { buildHtmlFormSummary } from './html-utils.js';
```

**Chatter branch in de target-loop** (vóór `buildIdentifierDomainForTarget`):

```javascript
if (opType === 'chatter_message') {
  // 1. Record-ID ophalen via automatisch aangemaakte identifier-mapping
  //    (source_type: previous_step_output, is_identifier: true — nooit zichtbaar in UI)
  const identifierMapping = mappings.find(m => m.is_identifier);

  // Correctie C: twee afzonderlijke, expliciete fouten
  if (!identifierMapping) {
    // Configuratiefout: de stap-selector is nooit ingesteld
    throw createPermanentError(
      'chatter_message target is not connected to a previous step. ' +
      'Open the chatter composer and select a preceding step to link this message to a record.'
    );
  }

  const rawRecordId = resolveMappingValue(identifierMapping, normalizedForm, contextObject);
  const recordId    = parsePositiveInteger(rawRecordId);

  if (!recordId) {
    // Runtime-fout: vorige stap heeft geen int record-ID geproduceerd
    throw createPermanentError(
      'chatter_message: de vorige stap heeft geen geldig record-ID geproduceerd ' +
      '(resolved value: "' + String(rawRecordId) + '"). ' +
      'Controleer of de vorige stap succesvol een Odoo-record heeft aangemaakt of bijgewerkt.'
    );
  }

  // 2. Body samenstellen
  //    Sjabloon aanwezig → placeholders vervangen
  //    Leeg             → volledige samenvatting (null = alle velden, correctie 4)
  const rawTemplate = (target.chatter_template || '').trim();
  const body = rawTemplate
    ? rawTemplate.replace(/\{([^}]+)\}/g, (_, key) =>
        String(lookupFormValue(normalizedForm, key) ?? '')
      )
    : buildHtmlFormSummary(null, normalizedForm);

  // 3. Verzenden via message_post (correctie 1)
  const result = await postChatterMessage(env, {
    model:        target.odoo_model,
    recordId,
    body,
    subtypeXmlid: target.chatter_subtype_xmlid || 'mail.mt_note',
  });

  // 4. Resultaat registreren
  registerTargetOutput(contextObject, target, result);
  const targetResult = {
    submission_id:   submission.id,
    target_id:       target.id,
    execution_order: executionOrder,
    action_result:   result.action,
    odoo_record_id:  String(result.recordId),
    error_detail:    null,
    processed_at:    new Date().toISOString(),
  };
  await createSubmissionTargetResult(env, targetResult);
  targetResults.push(targetResult);
  continue;  // sla de upsert-logica over
}
```

---

### 3.4 — `validation.js`: chatter_message guard (correctie B)

Voeg toe in `validateTargetPayload` vóór de model-check:

```javascript
if (payload.operation_type === 'chatter_message') {
  // chatter_message vereist geen TARGET_MODELS-whitelist-validatie —
  // elk mail.thread-model is geldig. Maar odoo_model MOET aanwezig zijn,
  // anders kan message_post niet worden aangeroepen.
  if (!payload.odoo_model || typeof payload.odoo_model !== 'string' || !payload.odoo_model.trim()) {
    throw new ValidationError(
      'chatter_message target vereist een odoo_model (bijv. "project.project").'
    );
  }
  return; // sla TARGET_MODELS en identifier-type validatie over
}
```

> `ValidationError` moet hetzelfde fouttype zijn als al gebruikt in `validateTargetPayload`. Gebruik de bestaande throw-patroon in het bestand.

---

### 3.5 — Client-side: chatter-composer UI

#### Architectuurbeslissing (Addendum E bevestigd)

`chatter_message` targets renderen **nooit** via `MappingTable`. In `renderDetailMappings()`:

```javascript
if (target.operation_type === 'chatter_message') {
  renderChatterComposer(target, tid, sortedTargets);
} else {
  window.FSV2.MappingTable.render('det-mc-' + tid, cfg); // ongewijzigd
}
```

#### `previous_step_output` mapping: volledig automatisch (correctie 5)

De identifier-mapping (`is_identifier: true`, `source_type: 'previous_step_output'`) wordt **nooit getoond** in de UI. Zij bestaat alleen in de DB. De gebruiker selecteert uitsluitend:

> "Verzend notitie voor record van stap: [Stap 1 ▾]"

`handleSaveChatterComposer()` maakt of updatet de identifier-mapping intern. De gebruiker ziet nooit de technische `previous_step_output` structuur.

**Filter in `renderDetailMappings()`** voor de zekerheid:

```javascript
// Voor chatter-targets: identifier-mappings niet doorgeven aan MappingTable
// (chatter gebruikt de composer, maar als veiligheidsnet)
var visibleMappings = target.operation_type === 'chatter_message'
  ? []
  : (dbMappings || []);
```

#### Wireframe `renderChatterComposer()`

```
┌────────────────────────────────────────────────────────────────────────┐
│  Verzend notitie voor record van stap:  [Stap 1 — Contactpersoon ▾]   │
│  ─────────────────────────────────────────────────────────────────── │
│  Berichtinhoud                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  (monospace textarea — chatter_template waarde of leeg)         │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  [+ Veld invoegen: chip-picker via buildDetailFlatFields]              │
│  ℹ Leeg = automatische samenvatting van alle formuliervelden            │
│                                                                         │
│  Type notitie:                                                          │
│  (•) Interne notitie    ( ) Publieke discussie                         │
│                                                                         │
│  Voorvertoning ─────────────────────────────────────────────────────   │
│  ┌─ iframe sandbox="allow-same-origin" ──────────────────────────┐    │
│  │  (sjabloon-inhoud of voorbeeld-samenvatting)                  │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                          [ Opslaan ]   │
└────────────────────────────────────────────────────────────────────────┘
```

**Stap-selector (correctie G — gefilterd op `odoo_model`):**

Alleen targets die **alle drie** van de volgende voorwaarden hebben, verschijnen in de selector:
1. `execution_order < huidig target's execution_order`
2. `operation_type !== 'chatter_message'`
3. `odoo_model === huidig target's odoo_model`

Reden: `message_post` wordt aangeroepen op `target.odoo_model`. Als het record-ID afkomstig is van een stap met een ander model, gooit Odoo een fout.

**Geen compatibele stappen (na filter):** toon een waarschuwingsblok:

```
⚠ Er is geen vorige stap die een record aanmaakt voor model "<ModelLabel>".
  Voeg eerst een upsert/create/update_only stap toe voor dit model.
```

**Implementatie in `renderChatterComposer()`:**

```javascript
var compatiblePreceding = sortedTargets.filter(function(t) {
  return getTargetOrder(t, 0) < getTargetOrder(target, 0)
    && t.operation_type !== 'chatter_message'
    && t.odoo_model === target.odoo_model;   // ← model-filter (correctie G)
});
```

**Preview (correctie 6 + correctie H — iframe sandbox + 150ms debounce):**

```javascript
var _chatterPreviewTimers = {};

function scheduleChatterPreview(tid) {
  clearTimeout(_chatterPreviewTimers[tid]);
  _chatterPreviewTimers[tid] = setTimeout(function() {
    updateChatterPreview(tid);
  }, 150);
}

function updateChatterPreview(tid) {
  var iframe = document.getElementById('chatterPreviewFrame-' + tid);
  if (!iframe || !iframe.contentDocument) return;

  var ta    = document.getElementById('chatterTemplate-' + tid);
  var tmpl  = (ta && ta.value.trim()) || null;
  var html;

  if (!tmpl) {
    var sampleForm = {};
    (window.FSV2.S().detailFormFields || []).forEach(function(f) {
      sampleForm[f.name || f.id] = f.label || f.name || f.id;
    });
    html = window.FSV2.buildHtmlFormSummary(null, sampleForm);
  } else {
    html = tmpl; // sjabloon — scripts geblokkeerd door sandbox
  }

  iframe.contentDocument.body.style.cssText = 'margin:8px;font-family:sans-serif;font-size:14px';
  iframe.contentDocument.body.innerHTML = html
    || '<p style="color:#9ca3af;font-style:italic;font-size:13px">Geen inhoud.</p>';
  iframe.style.height = (iframe.contentDocument.body.scrollHeight + 16) + 'px';
}
```

De textarea `input`-event roept `scheduleChatterPreview(tid)` aan (niet `updateChatterPreview` direct). Timer-state `_chatterPreviewTimers` is een object geïndexeerd op `tid` zodat meerdere geopende chatter-kaarten niet elkaars debounce-timer overschrijven.

`<iframe sandbox="allow-same-origin">` — `allow-scripts` en `allow-forms` bewust **weggelaten** (correctie D bevestigd).

#### `handleSaveChatterComposer(tid)` — uitvoeringstroom

```
1. Lees chatter_template (textarea-waarde, mag leeg zijn)
2. Lees chatter_subtype_xmlid (geselecteerde radio)
3. Lees stepRef (geselecteerde stap: 'step.N.record_id' of '')
4. PUT /api/targets/:tid  →  { chatter_template, chatter_subtype_xmlid }
5. Als stepRef ≠ '':
     Zoek identifier-mapping (is_identifier: true) voor dit target in DB
     Bestaat → PUT /api/mappings/:id  →  { source_value: stepRef }
     Bestaat niet → POST /api/targets/:tid/mappings  →
       { odoo_field: 'id', source_type: 'previous_step_output',
         source_value: stepRef, is_identifier: true, is_update_field: false }
     (deze mapping is NOOIT zichtbaar in de UI — correctie 5)
6. showAlert('Opgeslagen.', 'success')
7. openDetail(S().activeId)
```

---

### 3.6 — Card-header: 💬-identificatie (correctie I)

Formaat verandert van `💬 Notitie in chatter` naar `💬 Notitie (ModelLabel)`.

In `renderDetailMappings()`:

```javascript
var stepIcon  = target.operation_type === 'chatter_message' ? '\uD83D\uDCAC ' : '';
var stepModel = target.operation_type === 'chatter_message'
  ? 'Notitie (\u200B' + (modelLabel(target.odoo_model) || target.odoo_model) + ')'
  : (target.label || modelLabel(target.odoo_model));
var stepName  = stepIcon + stepModel;
```

Voorbeeldresultaat: **💬 Notitie (Contactpersoon)** of **💬 Notitie (Project)**.

> `\u200B` is een zero-width space — niet nodig; volledig weg te laten. De haakjes zijn afdoende scheiding.

---

### 3.7 — `routes.js`: allowed fields voor PUT `/api/targets/:id`



Voeg toe aan de allowed-update-fields lijst:
- `chatter_template`
- `chatter_subtype_xmlid`

Verwijder indien aanwezig: `chatter_message_type` (bestaat niet meer).

---

### 3.8 — Wizard: optionele stap 5 (correctie E)

**Keuze: optionele wizard-stap 5 — simpele ja/nee-kaart.**

De alert-aanpak (v2) werd vervangen. Wizard stap 5 is eenvoudig te implementeren en past in het bestaande wizard-patroon: `wizardStep1–4` worden uitgebreid met `wizardStep5`. De stap bevat géén volledige chatter-composer — die blijft in de detail-view. Stap 5 is alleen een aanbodskaart.

**Flow:**

```
Stap 4 (confirm/submit)
  ↓
[wizard-submit succesvol]
  ↓
Stap 5 — "Chatter-notitie toevoegen?"
  ┌─────────────────────────────────────────────────────────┐
  │  💬 Wil je ook een notitie in de Odoo-chatter plaatsen? │
  │                                                         │
  │  Wanneer dit formulier wordt ingediend, kan er auto-    │
  │  matisch een bericht worden geplaatst op het gecreëerde │
  │  record — handig voor audit trails of klantvermeldingen.│
  │                                                         │
  │  [ Overslaan — afronden ]  [ Ja, voeg chatter toe ▶ ] │
  └─────────────────────────────────────────────────────────┘
```

**"Overslaan":** sluit wizard, toont de integratielijst (huidig gedrag na submit).

**"Ja, voeg chatter toe":**
1. POST `/api/targets` met `{ operation_type: 'chatter_message', odoo_model: <model van stap 1>, execution_order: 2 }` — stille achtergrond-aanmaak.
2. Sluit wizard.
3. Opent detail-view van de nieuwe integratie direct op de chatter-stap (kaart open).

**Implementatieomvang:** ~40 regels in `wizard.js`. Geen nieuwe componenten. Geen dialog nodig. Stap 5 is een simpele HTML-kaart die in de bestaande wizard-container rendert.

**Configuratie van de chatter-stap** vindt volledig plaats in de chatter-composer in de detail-view — niet in de wizard.

---

### 3.9 — Submission history: chatter-acties (correctie J)

**Bestand: `public/forminator-sync-v2-detail.js` — `renderDetailSubmissions()`**

De bestaande `renderDetailSubmissions()` rendert per target-result een rij. Chatter-resultaten (`action_result === 'created'` voor targets van type `chatter_message`) krijgen een eigen badge en beschrijving:

```javascript
// In de resultaten-loop, bij het bepalen van het actie-label:
var isChatter = (target && target.operation_type === 'chatter_message');
var actionLabel = isChatter
  ? '\uD83D\uDCAC Chatternotitie geplaatst'
  : getActionLabel(result.action_result);  // bestaande functie ongewijzigd

var modelLabel = isChatter
  ? 'Notitie op ' + (modelLabel(target.odoo_model) || target.odoo_model)
  : (target ? modelLabel(target.odoo_model) : '—');
```

**Wat er in de history-rij staat voor chatter-acties:**

| Kolom | Waarde |
|---|---|
| Tijdstip | `processed_at` (bestaand) |
| Actie | 💬 Chatternotitie geplaatst |
| Model | Notitie op Contactpersoon |
| Record ID | `odoo_record_id` (message-ID van het aangemaakte chatbericht) |
| Status | ✅ (groen, want `error_detail = null`) |

Geen DB-wijziging nodig — `submission_target_results` bevat al `action_result` en `odoo_record_id` voor chatter-resultaten (geregistreerd in de worker-branch).

---

### Fase 3 — Gewijzigde bestanden

| Bestand | Wijzigingen |
|---|---|
| `supabase/migrations/20260304180000_fsv2_chatter_message.sql` | **Nieuw** — 2 kolommen |
| `src/modules/forminator-sync-v2/odoo-client.js` | `postChatterMessage()` |
| `src/modules/forminator-sync-v2/worker-handler.js` | Imports + chatter branch in target-loop |
| `src/modules/forminator-sync-v2/validation.js` | Guard voor `chatter_message` |
| `src/modules/forminator-sync-v2/routes.js` | PUT `/api/targets/:id` allowed fields |
| `public/forminator-sync-v2-detail.js` | `renderChatterComposer()`; `scheduleChatterPreview()`; `updateChatterPreview()`; `handleSaveChatterComposer()`; `renderDetailMappings()` branch; `renderDetailSubmissions()` chatter-rijen |
| `public/forminator-sync-v2-wizard.js` | Optionele stap 5 (`wizardStep5`): ja/nee-kaart + target-aanmaak op bevestiging |
| `public/forminator-sync-v2-bootstrap.js` | `save-chatter-composer` handler |

---

## Volledig gewijzigde bestanden (overzicht)

| Bestand | Fase 1 | Fase 2 | Fase 3 |
|---|:---:|:---:|:---:|
| `src/modules/forminator-sync-v2/html-utils.js` | — | **Nieuw** (worker, source of truth) | — |
| `public/forminator-sync-v2-html-utils.js` | — | **Nieuw** (browser IIFE, drift-preventie header) | — |
| `src/modules/forminator-sync-v2/worker-handler.js` | — | ✓ | ✓ |
| `src/modules/forminator-sync-v2/validation.js` | — | ✓ | ✓ |
| `src/modules/forminator-sync-v2/odoo-client.js` | — | — | ✓ |
| `src/modules/forminator-sync-v2/routes.js` | — | — | ✓ |
| `src/modules/forminator-sync-v2/ui.js` | ✓ | ✓ | — |
| `public/forminator-sync-v2-mapping-table.js` | ✓ | ✓ | — |
| `public/forminator-sync-v2-detail.js` | ✓ | ✓ | ✓ |
| `public/forminator-sync-v2-wizard.js` | — | — | ✓ |
| `public/forminator-sync-v2-bootstrap.js` | ✓ | ✓ | ✓ |
| `supabase/migrations/…_fsv2_chatter_message.sql` | — | — | **Nieuw** |

---

## Database-migraties samenvatting

| Feature | Migratie | Details |
|---|---|---|
| Fase 1 — UX | Nee | Alleen JS |
| Fase 2 — html_form_summary | Nee | `source_value TEXT` al aanwezig; `NULL` als "alle velden" |
| Fase 3 — chatter_message | **Ja** | `chatter_template TEXT`, `chatter_subtype_xmlid TEXT DEFAULT 'mail.mt_note'` |

---

## Rollback-strategie

| Fase | Rollback |
|---|---|
| 1 — UX-sanering | `git revert` JS. Geen DB. |
| 2 — html_form_summary | Revert `html-utils.js`, `worker-handler.js`, `validation.js`, client JS. Bestaande `html_form_summary`-mappings in DB worden genegeerd (resolver valt terug op `null`). |
| 3 — chatter_message | SQL: `DROP COLUMN chatter_template`, `DROP COLUMN chatter_subtype_xmlid`. Revert worker + client JS. Bestaande `chatter_message` targets mislukken permanent in de worker — handmatig verwijderen of laten staan tot ze verwijderd worden in de UI. |

---

## Acceptatiechecklist

### Fase 1 — UX-sanering

- [ ] MappingTable toont precies 3 vaste kolommen: Odoo veld | Bron | Waarde
- [ ] ⋯-knop per rij opent accordion met identifier, bijwerken, waardemap
- [ ] Knop toont `✕` bij open accordion; `⋯` bij gesloten
- [ ] Waardemap opent mee met accordion (niet los als aparte rij)
- [ ] Composite-toggle toont/verbergt subvelden nog correct
- [ ] Bestaande opgeslagen mappings: checkboxes hebben correcte state na heropen
- [ ] "Bekijk formuliervelden"-knop opent de "Formulier velden" collapse via checkbox-toggle
- [ ] Intent-picker toont 4 opties bij "Stap toevoegen"
- [ ] Opties 1–3: model-selector zichtbaar; "Toevoegen" disabled tot model gekozen
- [ ] Optie 4 (chatter): model-selector verborgen; "Toevoegen" direct enabled
- [ ] Bestaande integraties ongewijzigd na Fase 1 deploy

### Fase 2 — html_form_summary

- [ ] Webhook met `source_type: 'html_form_summary'` schrijft HTML-tabel naar Odoo veld
- [ ] HTML-tabel zichtbaar en opgemaakt in Odoo record (inline CSS, geen externe classes)
- [ ] `source_value = NULL` (of leeg) → alle niet-systeemvelden opgenomen
- [ ] `source_value = '["name-1","email-1"]'` → alleen die twee velden
- [ ] "📋 Formuliersamenvatting toevoegen"-knop zichtbaar in detail-view MappingTable
- [ ] Modal: FieldPicker voor Odoo-velden beschikbaar
- [ ] Radio "Alle velden" → geen checkboxes; "Selecteer velden" → checkboxes zichtbaar
- [ ] Preview in iframe sandbox toont representatieve HTML-tabel
- [ ] Na "Toevoegen": rij met badge "📋 Samenvatting" in MappingTable
- [ ] Opslaan persisteert mapping via POST met `source_value: null` of JSON-array (nooit `"*"`)
- [ ] `buildHtmlFormSummary` beschikbaar als `window.FSV2.buildHtmlFormSummary` in browser (via IIFE in `public/`)
- [ ] Browser-versie heeft drift-preventie header-commentaar als eerste regels van het bestand
- [ ] Worker-versie en browser-versie produceren identieke output voor dezelfde input
- [ ] Preview-iframe heeft `sandbox="allow-same-origin"` — geen `allow-scripts`, geen `allow-forms`, geen andere tokens
- [ ] Preview wordt gedebounced (150ms): snelle checkbox-wijzigingen triggeren geen meerdere renders
- [ ] Bestaande source_types ongewijzigd

### Fase 3 — chatter_message

- [ ] `supabase db push` voert migratie uit (2 kolommen aangemaakt)
- [ ] Target van type `chatter_message` rendert chatter-composer, niet MappingTable
- [ ] `previous_step_output` identifier-mapping **nooit** zichtbaar in UI
- [ ] Stap-selector toont alleen vorige targets van type ≠ `chatter_message`
- [ ] Geen vorige stappen → waarschuwingsblok ipv stap-selector
- [ ] Placeholder-invoegen via chip-klik plaatst `{field-id}` op cursor-positie
- [ ] Preview (iframe sandbox) toont sjabloon of voorbeeldsamenvatting
- [ ] Preview-iframe heeft exact `sandbox="allow-same-origin"` — geen `allow-scripts`, geen `allow-forms`, geen andere tokens
- [ ] Verificatie: open DevTools → Frames → iframe heeft geen script-uitvoerrechten
- [ ] Opslaan persisteert `chatter_template` en `chatter_subtype_xmlid`
- [ ] Identifier-mapping (`previous_step_output`) automatisch aangemaakt bij opslaan
- [ ] Chatter-target zonder gekoppelde stap → worker gooit **permanente** fout met boodschap "not connected to a previous step"
- [ ] Chatter-target met gekoppelde stap maar vorige stap produceerde geen record-ID → worker gooit **permanente** fout met resolved value in boodschap
- [ ] Stap-selector toont alleen vorige stappen met **hetzelfde `odoo_model`** als het chatter-target
- [ ] Geen compatibele vorige stappen → waarschuwingsblok ipv selector (geen verborgen selectievak)
- [ ] Pipeline-card header toont `💬 Notitie (ModelLabel)` — niet `💬 Notitie in chatter`
- [ ] Submission history toont chatter-acties met 💬-badge en correct model-label
- [ ] Submission history record-ID kolom toont message-ID van het Odoo chatbericht
- [ ] Preview wordt gedebounced (150ms): snelle textarea-input triggert geen meerdere iframe-writes
- [ ] Debounce-timers zijn per composer-instantie (`_chatterPreviewTimers[tid]`) — meerdere open kaarten storen elkaar niet
- [ ] Wizard toont optionele stap 5 na succesvolle aanmaak
- [ ] "Overslaan" → wizard sluit, lijstweergave
- [ ] "Ja" → chatter-target aangemaakt, detail-view geopend op chatter-stap
- [ ] Webhook roept `message_post` aan — **nooit** `mail.message.create`
- [ ] `message_type` is altijd `'comment'` (verifieerbaar via Odoo server-log)
- [ ] `author_id` niet aanwezig in RPC (verifieerbaar via Odoo server-log)
- [ ] Lege sjabloon → chatter toont automatische veldensamenvatting (inline CSS, tabel-layout)
- [ ] Sjabloon met `{name-1}` → placeholder correct vervangen via `lookupFormValue`
- [ ] `mail.mt_note` → interne notitie (geen follower-emails)
- [ ] `mail.mt_comment` → publieke discussie (volgers ontvangen notificatie)
- [ ] 💬-icoon zichtbaar in pipeline-card header van chatter-targets
- [ ] Rollback SQL verwijdert kolommen zonder dataloss op andere targets
- [ ] Bestaande `upsert` / `update_only` / `create` targets volledig ongewijzigd

---

## Deploymentvolgorde

```
1.  git checkout -b feature/addendum-ef

2.  Fase 1 implementeren (JS-only)
3.  Fase 2 implementeren (html-utils.js + worker + client JS)
4.  Fase 3 implementeren (worker + client + migration SQL)

5.  npx supabase db push
    ↳ voert 20260304180000_fsv2_chatter_message.sql uit

6.  FSV2_ASSET_VERSION verhogen in ui.js  (bijv. '20260304a')
    ↳ inclusief forminator-sync-v2-html-utils.js toevoegen aan asset-load volgorde in ui.js

7.  wrangler deploy

8.  Acceptatiechecklist Fase 1 doorlopen
9.  Acceptatiechecklist Fase 2 doorlopen
10. Acceptatiechecklist Fase 3 doorlopen

11. git merge feature/addendum-ef → main
```

---

## Open vragen (te bevestigen vóór implementatie)

| # | Vraag | Impact |
|---|---|---|
| 1 | ~~Wordt `html-utils.js` als statisch asset geserveerd?~~ **Opgelost door Option B.** | — |
| 2 | Welke Odoo-versie draait de installatie? `message_post` met `subtype_xmlid` is beschikbaar ≥ 14.0. | Fase 3 — backwards compatibility |
| 3 | Moeten `chatter_message` targets ook verschijnen in de submissions-history? | Fase 3 — `renderDetailSubmissions` mogelijke uitbreiding |
