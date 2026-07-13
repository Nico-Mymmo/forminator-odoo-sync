# Projectregels — forminator-odoo-sync

## Bestand-editing bij grote/gevoelige bestanden (VERPLICHTE procedure, geldt repo-breed)

**Waarom dit hier staat:** in deze repo is herhaaldelijk bestandscorruptie opgetreden bij het bewerken van grotere bestanden (`database.js`, `worker-handler.js`, `forminator-sync-v2-core.js`, `-detail.js`, `-bootstrap.js`, `validation.js`, `.html`) — niet incidenteel, maar structureel, ongeacht welk bestand. Twee onafhankelijke faalmodi zijn vastgesteld:

1. **De Edit-tool (search-replace) kapt soms de staart van een groot bestand af** buiten de bewerkte regio — zonder foutmelding ("successfully updated" terwijl het bestand kapot is). `node --check` vangt dit meestal wél (unexpected end of input), maar pas ná de schade.
2. **Python text-mode I/O (`open(path, 'r')`) vertaalt regeleindes automatisch** (universal newlines). Als een bestand al een corrupte `\r\r\n`-sequentie bevat (dubbele CR), interpreteert Python dit als TWEE regeleindes i.p.v. één — dit verdubbelt sluipend alle lege regels door het hele bestand, met 100% geldige JS-syntax (dus `node --check` mist het volledig). Dit gebeurde o.a. met `forminator-sync-v2-core.js`, waarvan zelfs de laatste git-commit deze corrupte bytes al bevatte.

**Procedure — verplicht voor élk bestand > 150 regels, in deze volgorde:**

1. **Gebruik nooit de Edit-tool op bestanden > 150 regels.** Altijd een Python-script via bash, ook voor kleine wijzigingen.
2. **Baseline vaststellen op byte-niveau, niet aannemen.** Lees zowel de working-tree-file als `git show HEAD:<pad>` in **binary mode** (`rb`) en controleer `data.count(b'\r')`. Hoort **0** te zijn (single-LF-conventie in deze repo). Is dat niet zo — in werkboom, in HEAD, of in beide — dan is dat bestand al besmet; los dat eerst op (stap 3) vóór je je eigenlijke wijziging doet. Vertrouw geen van beide bronnen blind; kies de bron met CR-count 0, of normaliseer eerst.
3. **CR/CRLF normaliseren uitsluitend op ruwe bytes**, nooit via `open(path, 'r')`:
   ```python
   fixed = data.replace(b'\r\n', b'\n').replace(b'\r', b'\n')
   ```
   Verifieer erna: `fixed.count(b'\r') == 0` en dat het regelaantal (`fixed.count(b'\n')`) plausibel is t.o.v. het origineel (geen verdubbeling/halvering).
4. **Alle file I/O met expliciete newline-controle, nooit impliciet:**
   - Lezen: `open(path, 'rb').read().decode('utf-8')` — nooit `open(path, 'r')` zonder `newline=''`.
   - Schrijven: `open(path, 'w', encoding='utf-8', newline='\n')` — forceer `\n` expliciet, gebruik nooit `newline=None`.
5. **Wijziging als exacte, geverifieerde string-replace met asserts:**
   - `assert content.count(old_block) == 1` vóór elke `.replace()`. Faalt de assert → STOP, het bestand is niet wat je denkt (mogelijk al corrupt, of onzichtbare tekens zoals em-dash/curly quotes wijken af) — geen aannames, eerst onderzoeken.
   - Bouw `old_block` bij voorkeur uit tekst die je letterlijk uit het bestand hebt gelezen/gegrept, niet uit je geheugen overgetypt.
6. **Verplichte verificatie na ELKE schrijfactie** (niet pas aan het eind van een reeks):
   - `node --check <bestand>`
   - `python3 -c "print(open(path,'rb').read().count(b'\r'))"` → moet 0 zijn
   - `diff <(git show HEAD:<pad>) <pad>` — lees de VOLLEDIGE diff, bevestig dat elke regel herleidbaar is tot een bewuste wijziging. Onverwachte toevoegingen/verwijderingen = corruptie, nooit negeren.
   - Regelaantal-sanity (`wc -l`) t.o.v. baseline.
7. **Bij corruptie: herbouwen vanaf schone bron, nooit doorpatchen.** Nooit een kapot bestand "repareren" met een tweede patch bovenop de schade — dat stapelt fouten op. Terug naar de laatst geverifieerde schone bron (stap 2/3) en alle bedoelde wijzigingen in één keer opnieuw toepassen.
8. **Eén script per bestand per bewerkronde.** Verzamel alle geplande wijzigingen voor hetzelfde bestand en voer ze in één Python-script uit — niet meerdere losse edits na elkaar zonder tussentijdse verificatie.

---

## Odoo-aanpassingen — geen code, alles via Studio

**Regel:** Alle Odoo-aanpassingen gebeuren via Odoo Studio of de Technische UI (automations, server actions, views). Geen Python-modules, geen custom XML buiten Studio, geen `mymmo_fixes`-aanpassingen. Als iets niet via Studio kan, gaat het naar Dynapps (externe partij, kost geld) — dit is een last resort. Stel altijd een Studio-first oplossing voor, ook als die een compromis is qua UX.

---

## Navbar — één gedeelde navbar, geen per-module navbars

**Regel:** Het is verboden om een eigen navbar per module aan te maken. `src/lib/components/navbar.js` is de enige bron van navbar-HTML — zowel voor legacy als voor moderne modules.

**Hoe het werkt:**
- De server rendert de navbar via `navbar(user)` in `navbar.js`
- `/api/auth/me` stuurt het resultaat mee als `navbarHtml` in de response
- `public/shared-navbar.js` injecteert die HTML (geen eigen logica, alleen doorsturen)

**Gebruik in moderne modules (`public/*.html`):**
1. Voeg toe aan de HTML: `<script src="/shared-navbar.js"></script>`
2. Zorg voor `<div id="navbar"></div>` in de HTML.
3. Roep aan na `/api/auth/me`: `window.renderSharedNavbar(data.navbarHtml);`

**Aanpassingen aan de navbar:** uitsluitend in `src/lib/components/navbar.js` — wijzigingen gelden automatisch overal.

Legacy modules (`ui.js`) gebruiken `navbar(user)` direct server-side — niet aanraken.

---

## Wat is dit project?

De **Operations Manager** — intern platform voor mymmo.com, draait als Cloudflare Worker. De repo heet `forminator-odoo-sync` (historische naam); de v1-sync-pipeline is volledig verwijderd. De enige forminator-module is **forminator-sync-v2** (`/forminator-v2`, code: `forminator_sync_v2`). "Odoo" = het CRM/ERP waar data naartoe gesynchroniseerd wordt.

## Stack

Cloudflare Worker (`src/`) met enkel API-routes en server-logica; statische frontend in `public/` (HTML + JS, daisyUI 4 + Tailwind + Lucide via CDN); Supabase (PostgreSQL) via `src/lib/database.js`; Odoo via `src/lib/odoo.js`; auth via sessie-cookie (`session=`) en `src/lib/auth/session.js`.

## Architectuur — request pipeline

`src/index.js` is een dunne entry. Volgorde per request:

1. `src/router/cors.js` — OPTIONS preflight + `addCorsHeaders()`
2. `src/router/public-routes.js` — auth-vrije routes: `/favicon.ico`, R2-assets (`/assets/*`), `/api/auth/login|logout|me`, forminator-v2 webhooks (token-auth)
3. `src/router/module-router.js` — `getModuleByRoute()` → `authGate()` → handler → `trackEndpoint()` (fire-and-forget)
4. `src/router/auth-gate.js` — token-extractie → `validateSession()` → requiresAuth/requiresAdmin/user_modules check

`scheduled()` in index.js draait de cx-powerboard cron.

**Verboden:** debug-/fix-routes zonder auth in index.js of routers (geen `/test-db`, `/fix-admin-now`, `/run-migrations` e.d.). Geen secrets/service-account keys in de repo — altijd via Worker secrets.

## Database — altijd via getSupabaseClient(env)

```js
import { getSupabaseClient } from '../../lib/database.js';
const supabase = getSupabaseClient(env); // per-isolate singleton, persistSession: false
```

**NOOIT** `createClient()` uit `@supabase/supabase-js` direct aanroepen in modules. Geen module-eigen supabaseClient.js-bestanden. Migraties in `supabase/migrations/` met timestamp-prefix `YYYYMMDDHHMMSS_naam.sql`.

## Endpoint-tracking

Elke succesvolle module-route-aanroep wordt geregistreerd in de tabel `endpoint_log` (`endpoint`, `last_called_at`, `call_count`) via `src/lib/endpoint-tracker.js` → SQL-functie `upsert_endpoint_log(p_endpoint)`. De module-router doet dit automatisch (fire-and-forget, route-patroon zoals `GET /admin/api/users/:id` — nooit raw paths met IDs). Publieke en auth-routes worden niet getrackt. Nieuwe modules hoeven hier niets voor te doen.

## Nieuwe module — template

```
src/modules/{module}/
  module.js     — definitie: { code, name, route, requiresAuth, requiresAdmin?, routes }
  routes.js     — handlers, alleen JSON responses
public/{module-naam}.html   — volledige UI
public/{module-naam}.js     — optionele client-side logica
```

```js
// module.js
import { routes } from './routes.js';
export default {
  code: 'mijn_module',
  name: 'Mijn Module',
  route: '/mijn-module',
  requiresAuth: true,
  routes: {
    'GET /': async (context) =>
      context.env.ASSETS.fetch(new Request(new URL('/mijn-module.html', context.request.url))),
    'GET /api/items': async ({ env, user }) => {
      const supabase = getSupabaseClient(env);
      // ...
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
```

Registreer in `src/modules/registry.js` (import + MODULES-array).

### Checklist
- [ ] `public/{module-naam}.html` aangemaakt; `GET /` serveert via `context.env.ASSETS.fetch()`
- [ ] Geen `ui.js`, geen HTML-strings in de Worker
- [ ] Client-side JS: data-attributen + centrale listener voor events
- [ ] API-routes retourneren JSON; database via `getSupabaseClient(env)`; Odoo via `lib/odoo.js`
- [ ] Frontend fetch met `credentials: 'include'`; bij 401 → `window.location.href = '/'`

## UI-regels

**REGEL 1 — UI hoort in `/public`, niet in de Worker.** NOOIT HTML-strings genereren in de Worker, NOOIT `new Response('<html>...')` voor een pagina. Referentie: `src/modules/admin/module.js` + `public/admin-dashboard.html`.

**REGEL 2 — DOM-manipulatie of innerHTML met data-attributen.** Template literals zijn OK in `.html`-bestanden (geen build-stap). NOOIT variabelen in inline event handlers.

**REGEL 3 — Event handlers via data-attributen + één centrale listener:**

```js
// ✅
`<button data-action="deleteItem" data-id="${item.id}">Verwijder</button>`
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  if (action === 'deleteItem') deleteItem(id);
});
// ❌ NOOIT: onclick="deleteItem('${item.id}')"
```

**REGEL 4 — Worker-routes retourneren altijd JSON.** Enige uitzondering: `GET /` van een module serveert HTML via `ASSETS.fetch()`.

**REGEL 5 — Auth in frontend:** elke fetch met `credentials: 'include'`; bij 401 redirect naar `/`. De navbar zit als plain HTML in elke pagina.

## Modules — status

| Module | Route | Code | UI | Status |
|---|---|---|---|---|
| home | `/` | `home` | `src/modules/home/ui.js` | ⚠️ Legacy |
| admin | `/admin` | `admin` | `public/admin-dashboard.html` | ✅ Correct |
| profile | `/profile` | `profile` | `src/modules/profile/ui.js` | ⚠️ Legacy |
| forminator-sync-v2 | `/forminator-v2` | `forminator_sync_v2` | `public/forminator-sync-v2.html` + dedicated JS | 🔄 Gerefactord (zie hieronder) |
| project-generator | `/projects` | — | `src/modules/project-generator/ui.js` | ⚠️ Legacy |
| sales-insight-explorer | `/insights` | — | `ui-*.js` | ⚠️ Legacy — migratie bezig |
| event-operations | `/events` | — | `ui.js` | ⚠️ Legacy |
| mail-signature-designer | `/mail-signatures` | — | `ui.js` | ⚠️ Legacy |
| asset-manager | `/assets` | — | `ui.js` | ⚠️ Legacy |
| cx-powerboard | `/cx-powerboard` | — | `ui.js` | ⚠️ Legacy |
| wp-form-schemas | `/wp-sites` | — | in `routes.js` | ⚠️ Legacy |
| claude-integration | `/api/claude` | — | onderdeel van `/insights` | ⚠️ Legacy |
| mini-apps | `/mini-apps` | `mini_apps` | `public/mini-apps.html` + dedicated JS | ✅ Correct (zie hieronder) |

**Legacy modules NIET aanraken tenzij expliciet gevraagd.** Bij aanpassingen aan legacy `ui.js`: string-concatenatie (+), geen geneste template literals, geen variabelen in inline event handlers. `src/lib/components/navbar.js` is de legacy server-rendered navbar voor deze ui.js-bestanden.

---

## forminator-sync-v2 — UI-refactor (2025-06)

### Wat er gedaan is

De volledige frontend van de forminator-sync-v2 module is gerefactord:

**UI/UX-wijzigingen:**
- Detail-view: header card (naam + webhook) + 3 tabs (`tabs-bordered` + JS-switching): Formuliervelden / Koppeling / Indieningen — zelfde patroon als CX Automations
- Formuliervelden-sectie boven Veldkoppelingen geplaatst
- Drie actieknoppen (Verberg / Lijst / Bulk) als gelabelde toggle-buttons in de summary row
- Meldingen: uitsluitend slide-in toasts (rechtsonder, colored left border, SVG icon, hover-pause). Geen statusbalk meer. Zelfde toast-functie ook in `claude-settings.html` doorgevoerd.

**Bestanden volledig herschreven naar ES6 template literals** (geen string-concatenatie meer):

| Bestand | Inhoud |
|---|---|
| `public/forminator-sync-v2-detail.js` | `renderDetailFormFields()`, `renderDetail()`, `renderDetailMappings()`, `renderDetailSubmissions()` |
| `public/forminator-sync-v2-mapping-table.js` | `MappingTable.render()` — complete mapping-editor component |
| `public/forminator-sync-v2-settings.js` | `renderLinks()`, `_renderModelsSection()`, `_renderLinksSection()`, `renderLinkFieldsResult()` |
| `public/forminator-sync-v2-html-utils.js` | `buildHtmlFormSummary()` |
| `public/forminator-sync-v2-core.js` | `showAlert()` — slide-in toast |
| `public/forminator-sync-v2-bootstrap.js` | Tab-switching handler toegevoegd |
| `public/forminator-sync-v2.html` | Tabs-bordered structuur, `#statusAlert` verwijderd |

### Coderegel voor de module

**REGEL: alle forminator-sync-v2 JS gebruikt ES6 template literals.** Geen string-concatenatie (`+`) voor HTML. Dit geldt ook voor toekomstige aanpassingen.

Bestandsstructuur:
```
public/
  forminator-sync-v2.html           — hoofd-HTML, tabs-bordered layout
  forminator-sync-v2-core.js        — FSV2 globals, showAlert(), API helpers
  forminator-sync-v2-bootstrap.js   — event delegation (centrale click listener)
  forminator-sync-v2-mapping-table.js — MappingTable component (window.FSV2.MappingTable)
  forminator-sync-v2-settings.js    — instellingenpagina (modellen + koppelingen)
  forminator-sync-v2-html-utils.js  — buildHtmlFormSummary() (Odoo HTML-tabel)
  forminator-sync-v2-flow-builder.js — pipeline/stap builder
  forminator-sync-v2-wizard.js      — wizard flow

  # Detail-view (voorheen één 5227-regel bestand — 2026-07 opgesplitst i.v.m.
  # herhaalde bestandscorruptie bij bewerken; zie "Bestand-editing" bovenaan
  # dit document). Elk bestand exporteert zijn functies via window.FSV2.*;
  # cross-file calls gaan altijd via window.FSV2.naam(), nooit bare calls.
  forminator-sync-v2-detail.js                    — shell: renderDetail() (hub), gedeelde helpers
  forminator-sync-v2-detail-mapping-tab.js        — Koppeling-tab: renderDetailMappings() + stap-gedrag
  forminator-sync-v2-detail-submissions-tab.js    — Indieningen-tab: renderDetailSubmissions() + replay/cleanup
  forminator-sync-v2-detail-lifecycle.js          — openDetail() + toggle/run-test/add-target/delete-integration
  forminator-sync-v2-detail-add-target-wizard.js  — "Stap toevoegen"-dialoog + HTML-summary modal
  forminator-sync-v2-detail-form-fields-tab.js    — Formuliervelden-tab + veld-meta toggles
  forminator-sync-v2-detail-bulk-import-export.js — Bulk-import/export composer
  forminator-sync-v2-detail-chatter-composer.js   — Chatter-bericht stap-composer
  forminator-sync-v2-detail-activity-composer.js  — Activiteit stap-composer
  forminator-sync-v2-detail-mailing-list-composer.js — Mailinglijst stap-composer
```

**Bij nieuwe functies in een detail-*-bestand die vanuit een ANDER detail-*-bestand aangeroepen moeten worden:** exporteer via `Object.assign(window.FSV2, { naam: naam })` onderaan het bestand (bestaand patroon volgen) en roep aan als `window.FSV2.naam(...)` — nooit een bare call, want elk bestand is zijn eigen IIFE.

### Bekende valkuilen bij bewerken

- **Grote bestanden (o.a. alle `forminator-sync-v2-*.js`)**: volg de verplichte procedure bovenaan dit document ("Bestand-editing bij grote/gevoelige bestanden") — niet de Edit-tool gebruiken, altijd Python met byte-level newline-controle en verificatie na elke schrijfactie.
- **`bg-base-50` bestaat niet** in DaisyUI 4 — gebruik `bg-base-200/20`.
- **Tab-switching**: tabs gebruiken `data-detail-tab` + JS (geen radio inputs). Panelen: `detailTabFields`, `detailTabMapping`, `detailTabHistory`.

### Nog niet gerefactord (volgende sessies)

De volgende bestanden zijn nog legacy (string-concatenatie). **Niet aanraken tenzij expliciet gevraagd**, en dan volledig refactoren naar template literals:
- `public/forminator-sync-v2-flow-builder.js`
- `public/forminator-sync-v2-wizard.js`

## mini-apps — geplande vs. criteria-taken (2 aparte "onbemand versturen"-bouwblokken)

Collega's uploaden zelfgemaakte single-file HTML/JS mini-apps (`src/modules/mini-apps/`, route `/mini-apps`). Naast de basis (upload/tweak/delen, gedeelde opslag via `window.sharedStorage`, notify/chat terwijl de app open staat) heeft de module twee mechanismes om een mail/chat te versturen ZONDER dat iemand de app open heeft. Dit zijn BEWUST twee volledig gescheiden bouwblokken — geen gedeelde tabel, geen gedeelde cron, geen gedeelde lib — omdat ze een fundamenteel ander trigger-type hebben:

| | Geplande taken (4de bouwblok) | Criteria-taken (5de bouwblok) |
|---|---|---|
| Trigger | Vast tijdstip/interval (dagelijks/wekelijks/`every_n_days`) | Data-voorwaarde die overgaat van niet-waar → waar (edge-triggered) |
| Tabel | `mini_app_scheduled_tasks` + `_log` | `mini_app_condition_tasks` + `_log` |
| Lib | `src/modules/mini-apps/lib/scheduler.js` | `src/modules/mini-apps/lib/condition-scheduler.js` |
| Cron-tak | `"*/15 * * * *"` (`wrangler.jsonc` → `src/index.js#scheduled()`) | `"*/5 * * * *"` (eigen, snellere trigger — apart van de 15-min-tak) |
| API | `window.platform.schedule.*`, routes `/api/apps/:id/schedules*` | `window.platform.condition.*`, routes `/api/apps/:id/condition-tasks*` |
| Template-taal | `{{kv.x}}`, `{{#each}}`, `{{#isEmpty}}`, `{{#notEmpty}}` | zelfde + `{{today}}`/`{{weekday}}`/`{{weekdayName}}`/`{{isoWeek}}`/`{{isoYear}}` (server-berekende dag-context, Europe/Brussels), `{{#eachWhere field="x" equals="y"}}`, `{{rotation.NAAM}}` (beurtrol met interval + uitzonderingen, kv-conventie `__rotation_NAAM__`) |

`src/index.js#scheduled()` gebruikt `event.cron` om de twee takken uit elkaar te houden (leeg `event.cron` bij een lokale/handmatige trigger draait voor de zekerheid alles). **Nooit deze twee lib-bestanden samenvoegen of code tussen beide laten delen** — dat is een expliciete architectuurbeslissing (2026-07), niet een toevallige duplicatie: fixed-time en criteria-based zijn twee aparte mentale modellen voor een mini-app-bouwer, en de dag-context/rotation-uitbreidingen zitten bewust enkel in condition-scheduler.js. Beide volgen hetzelfde veiligheidsprincipe: geen eval, geen Function-constructor, geen headless-uitvoering van app-code — enkel declaratieve data (recurrence resp. criteria) + een logic-less template-renderer.

## Blueprint: Odoo copy-wizard met interactieve veld-selectie

Dit patroon is volledig uitgewerkt voor `x_estate_copy_wizard` (actie 1042/1041) en `x_contact_copy_wizard` (actie 1164/1163). Gebruik dit als blueprint voor elke nieuwe copy-wizard.

### Overzicht

De gebruiker opent een wizard in Odoo, klikt "Preview", ziet een vergelijkingstabel bron ↔ doel met een checkbox per veld, vinkt af wat hij **niet** wil kopiëren, en klikt "Kopieer". De execute-actie leest de uitvinkselectie en slaat die velden over.

### Stap 1 — Odoo Studio (handmatig, eenmalig per wizard-model)

1. Open het wizard-model (bv. `x_mijn_copy_wizard`) in Studio
2. Voeg een **Char-veld** toe: `x_excluded_fields` (label: "Uitgesloten velden")
3. Voeg een **HTML-veld** toe voor de preview-output als dat er nog niet is (bv. `x_preview_html`)
4. Open de form view van de wizard, selecteer het HTML-preview-veld → zet `sanitize="false"` in de properties

### Stap 2 — Sanitisatie uitschakelen via Worker-route (eenmalig)

Odoo sanitiseert HTML-type velden op twee niveaus:
- **Client-side**: DOMPurify in de browser → uitgeschakeld via `sanitize="false"` in de form view (Stap 1)
- **Server-side**: ORM `html_sanitize()` bij `wiz.write()` → stript `<input>` en `onchange` altijd

Het server-side niveau moet via `ir.model.fields` worden uitgeschakeld:

```javascript
// In routes.js — uitbreiden van handleDisableSanitize met het nieuwe model/veld
const TARGETS = [
  // bestaande entries...
  { model: 'x_mijn_copy_wizard', field: 'x_preview_html' },
];
// Daarna: executeKw write op ir.model.fields met { sanitize: false }
```

### Stap 3 — Preview-actie patchen

De preview-actie (server action, type=code) bouwt de HTML. Het te injecteren blok:

```python
# === Veld-selectie setup ===
excluded_set = set()
if 'x_excluded_fields' in wiz._fields and wiz.x_excluded_fields:
    excluded_set = set(f.strip() for f in wiz.x_excluded_fields.split(',') if f.strip())

# _oc: onchange JS per checkbox — schrijft direct naar DB via Odoo JSON-RPC.
# Gebruik UITSLUITEND " voor strings (attribuut zit in '-delimiters).
# event.target gebruiken, NIET this (undefined in Odoo strict-mode context).
# /web/dataset/call_kw vereist geen CSRF voor type='json' routes.
_oc = '(function(){var el=event.target;if(!el)return;el.closest("tr").style.opacity=el.checked?"1":"0.4";var fex=el.closest("[data-fex]");if(!fex)return;var wid=parseInt(fex.dataset.wizId);var wm=fex.dataset.wizModel;if(!wid||!wm)return;var excl=Array.from(fex.querySelectorAll("input[data-field]:not(:checked)")).map(function(c){return c.dataset.field;}).join(",");fetch("/web/dataset/call_kw",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",method:"call",id:1,params:{model:wm,method:"write",args:[[wid],{x_excluded_fields:excl}],kwargs:{}}})});})()'

field_sections = ""
for key in active_groups:
    group = FIELD_GROUPS[key]
    field_rows = ""
    for field, label in group['fields']:
        is_excl = field in excluded_set
        row_style = "opacity:0.4;" if is_excl else ""
        chk = "" if is_excl else " checked"
        left_val = get_val(source, field)
        right_val = get_val(target, field)
        if not is_excl and highlight_diff(source, target, field, allow_empty):
            right_val = "<b style='color:#c62828;'>" + right_val + "</b>"
        field_rows += (
            "<tr data-field-row='" + field + "' style='" + row_style + "'>"
            "<td style='width:22px;padding:4px 4px 4px 0;vertical-align:middle;'>"
            "<input type='checkbox'" + chk + " data-field='" + field + "' onchange='" + _oc + "' style='cursor:pointer;'>"
            "</td>"
            "<td style='width:170px;padding:4px 6px 4px 0;color:#222;'>" + label + "</td>"
            "<td style='padding:4px 8px;text-align:right;color:#444;border-right:1px solid #e0e0e0;'>" + left_val + "</td>"
            "<td style='padding:4px 8px;text-align:right;color:#444;'>" + right_val + "</td>"
            "</tr>"
        )
    field_sections += (
        "<tr><td colspan='4' style='padding:10px 0 4px;font-weight:600;border-top:1px solid #e0e0e0;'>" + group['label'] + "</td></tr>"
        + field_rows
    )

html = f"""
<div data-fex data-wiz-id="{wiz.id}" data-wiz-model="{wiz._name}" style="font-family:var(--font-family,'Odoo Sans','Roboto',sans-serif);font-size:13px;line-height:1.5;color:#2c2c2c;">
  <h4 style="margin:0 0 6px;font-weight:600;">Vergelijking bron ↔ doel</h4>
  <p style="margin:0 0 8px;font-size:11px;color:#888;">Vink uit wat je <em>niet</em> wil overnemen en klik daarna op <strong>Kopieer</strong>.</p>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="border-bottom:2px solid #dee2e6;">
        <th style="width:22px;"></th>
        <th style="text-align:left;font-weight:600;color:#666;font-size:12px;">Veld</th>
        <th style="text-align:right;font-weight:700;border-right:1px solid #e0e0e0;">Bron: {source.display_name}</th>
        <th style="text-align:right;font-weight:700;">Doel: {target.display_name}</th>
      </tr>
    </thead>
    <tbody>{field_sections}</tbody>
  </table>
</div>"""

# Eventuele extra secties (leads, contacten) hier als html += ...
wiz.write({{'x_preview_html': html}})
```

**Ankerpunt voor code-injectie via Worker:** de regel `wiz.write({...})` — gebruik `lastIndexOf` om de finale write te vinden (vroege `continue`-branches gebruiken ook `wiz.write` maar met andere variabelenamen).

### Stap 4 — Execute-actie patchen

```python
# Aan het begin van de copy-loop
excluded_set_exec = set()
if 'x_excluded_fields' in wiz._fields and wiz.x_excluded_fields:
    excluded_set_exec = set(f.strip() for f in wiz.x_excluded_fields.split(',') if f.strip())

# In de field-loop:
for f, _ in FIELD_GROUPS[key]['fields']:
    if f in excluded_set_exec:
        continue
    if should_copy_field(source, target, f, allow_empty):
        vals[f] = source[f]
```

### Kritieke valkuilen

**HTML-quoting in Python string-concatenatie**
`_oc` Python-string gebruikt enkelvoudige quotes als delimiter → JS-strings binnen `_oc` moeten dubbele quotes gebruiken. Checkbox `onchange='...'` is enkelvoudig gedeclareerd → dubbele quotes in de waarde zijn geldig HTML5.

**`_oc` bevat geen variabelen die runtime bekend zijn** — alles wat de onchange nodig heeft staat in `data-*` attributen op de `[data-fex]` container (`data-wiz-id`, `data-wiz-model`). De onchange leest deze via `fex.dataset`.

**`x_excluded_fields` updaten vanuit JS — enige werkende aanpak**
- `Object.getOwnPropertyDescriptor` React-truc: werkt niet in Odoo OWL
- `fi.value = ...; fi.dispatchEvent('input')`: OWL markeert het veld niet als dirty
- ✅ Directe DB-write via `/web/dataset/call_kw`: omzeilt OWL volledig. OWL's form-save bij "Kopieer" stuurt alleen dirty fields → onze write wordt niet overschreven.

**`this` is `undefined` in Odoo onchange-attributen**
Odoo voert inline handlers uit in strict-mode context. Gebruik `event.target` i.p.v. `this`.

**Sentinels bij code-patching**
- Gebruik `'    # Lead-preview\n'` als sentinel voor leads, NIET `'lead_rows'` — `lead_rows_only` bevat dezelfde substring
- Gebruik `lastIndexOf` voor de finale `wiz.write(...)`, niet `indexOf`
- Patch-check voor veld-selectie (rendering v2): check op aanwezigheid van `'call_kw'` in de code, niet alleen `'data-wiz-id'`

**Extra secties (leads, contacten) gaan na `html = f"""..."""`**
Ze doen `html += ...`. Zorg dat ze worden ingevoegd VÓÓR de `wiz.write(...)` en NIET binnen het rendering-blok dat vervangen wordt. Als het rendering-blok vervangen wordt, gaan de secties ertussen verloren — bewust herbouwen als aparte stap.

### Worker-route structuur

```javascript
// Constanten bovenaan (module-scope)
const _OC = '(function(){var el=event.target;...})()';  // zie Stap 3

function makeInlineCheckboxBlock(options) {
  // Geeft een Python-code-string terug die in de server action geïnjecteerd wordt
  // options: { thBron, thDoel } voor de tabel-headers
  return `    excluded_set = set()\n    ...\n    html = f"""\n    ...\n    """\n`;
}

export async function handlePatchMijnWizard({ env }) {
  // 1. Lees huidige server action code via executeKw read
  // 2. Check sentinel (idempotent) — kies een unieke string die alleen na patching aanwezig is
  // 3. Vind ankerpunt via indexOf/lastIndexOf
  // 4. Bouw nieuwe code-string
  // 5. Schrijf terug via executeKw write
  // 6. Return JSON { success, results }
}
```

Registreer de route in `module.js` en voeg een knop toe in de HTML + handler in de JS (zelfde patroon als de bestaande "Eenmalige patches" in `cx-automations`).

## Bestandsstructuur

```
src/
  index.js                  — dunne entry: try/catch + pipeline + scheduled()
  router/
    cors.js                 — preflight + addCorsHeaders
    public-routes.js        — auth-vrije routes
    auth-gate.js            — sessie + module-toegang
    module-router.js        — module resolve + handler + trackEndpoint
  api/auth.js               — login/logout/me handlers
  lib/
    database.js             — getSupabaseClient(env) (enige plek met createClient)
    endpoint-tracker.js     — trackEndpoint(env, endpoint, ctx)
    odoo.js                 — searchRead(), executeKw()
    wordpress.js            — Forminator form fetchers (v2 + wp-form-schemas)
    auth/                   — session.js, middleware.js, password.js, invite.js
    components/navbar.js    — LEGACY navbar string
  modules/
    registry.js             — MODULES + getModuleByRoute + resolveModuleRoute
    {module}/module.js      — definitie + routes
public/                     — statische UI per module
supabase/migrations/        — YYYYMMDDHHMMSS_naam.sql
```
