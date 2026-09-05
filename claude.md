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
- [ ] **Module-registratie in de database** (aparte stap, los van `registry.js`!): een rij in
      `modules` (code/name/route/icon/is_active/is_default/display_order) + auto-grant via
      `user_modules` voor de doelgroep (zie `20260710120000_mini_apps_module.sql` als patroon).
      Zonder dit blijft de module onzichtbaar in navbar/homedashboard, ook als `registry.js`
      correct is bijgewerkt — `user.modules` (session) komt uit deze tabellen, niet uit de
      registry. Ontbrak initieel bij `campaign_funnels` (2026-07-31), rechtgezet in
      `20260731170000_campaign_funnels_module_registration.sql`.

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

**REGEL 6 — Tabs altijd `tabs-boxed`, nooit `tabs-bordered`.** Referentie-patroon: `src/modules/mail-signature-designer/ui.js`:

```html
<div role="tablist" class="tabs tabs-boxed mb-5 w-fit">
  <button role="tab" class="tab tab-active" data-detail-tab="naam">Label</button>
  <button role="tab" class="tab" data-detail-tab="andere-naam">Ander label</button>
</div>
```

`tabs-active`-toggling via data-attributen + centrale listener (REGEL 3), nooit inline `onclick` (dat mag enkel in de legacy `ui.js`-bestanden). Dit is herhaaldelijk fout gegaan (`tabs-bordered` gebruikt i.p.v. `tabs-boxed`, bv. `campaign-funnels.html` 2026-07-31) — bij twijfel over tab-styling altijd eerst een bestaande `tabs-boxed`-implementatie opzoeken en 1:1 overnemen, niet een andere daisyUI-tabsvariant kiezen.

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
| Template-taal | `{{kv.x}}`, `{{#each}}`, `{{#isEmpty}}`, `{{#notEmpty}}`, `{{today}}`/`{{weekday}}`/`{{weekdayName}}`/`{{isoWeek}}`/`{{isoYear}}` (server-berekende dag-context, Europe/Brussels), `{{#eachWhere field="x" equals="y"}}` | zelfde, plus enkel hier: `{{rotation.NAAM}}` (beurtrol met interval + uitzonderingen, kv-conventie `__rotation_NAAM__`) |

`src/index.js#scheduled()` gebruikt `event.cron` om de twee takken uit elkaar te houden (leeg `event.cron` bij een lokale/handmatige trigger draait voor de zekerheid alles). **Nooit deze twee lib-bestanden samenvoegen tot één bestand/tabel/cron-tak** — dat is een expliciete architectuurbeslissing (2026-07), niet een toevallige duplicatie: fixed-time en criteria-based blijven twee aparte mentale modellen voor een mini-app-bouwer, met een eigen tabel/cron-tak/API elk. **Uitzondering (2026-07, tweede aanpassing):** de dag-context (`{{today}}`/`{{weekday}}`/`{{weekdayName}}`/`{{isoWeek}}`/`{{isoYear}}`) en `{{#eachWhere}}` zitten ONDERTUSSEN in BEIDE `renderTemplate()`-implementaties (bewust als twee losse kopieën, niet als gedeelde util — zie de doc-comment boven `renderTemplate()` in elk bestand), nadat bleek dat een vast-tijdstip-taak die "vandaag"-data wil versturen anders volledig afhankelijk is van een client-side ververste kv-waarde: die blijft stil verouderd staan als niemand de mini-app die dag opent, ook al vuurt de 15-min-cron zelf wél gewoon op tijd (zie het incident met een winkeldienst-mini-app die hierdoor de shopper van de vorige dag bleef doorsturen). `{{rotation.NAAM}}` blijft wel exclusief bij criteria-taken (geen aangetoonde nood aan bij vast-tijdstip-taken). Beide volgen hetzelfde veiligheidsprincipe: geen eval, geen Function-constructor, geen headless-uitvoering van app-code — enkel declaratieve data (recurrence resp. criteria) + een logic-less template-renderer.

### Front-end opgesplitst in meerdere bestanden (2026-07)

`public/mini-apps.js` (voorheen 1405 regels, ruim boven de 150-regel-drempel uit
"Bestand-editing bij grote/gevoelige bestanden") is opgesplitst in 6 bestanden,
zelfde aanpak als bij forminator-sync-v2 maar zonder IIFE/namespace-laag: het
origineel gebruikte al platte globale scope (`var`/`function`-declaraties, geen
`window.FSV2`-achtig patroon), dus de `<script>`-tags in `mini-apps.html` (in
deze volgorde) volstaan om dezelfde globale state te blijven delen:

```
mini-apps-core.js            — state, helpers, iframe-instrumentatie, gedeelde
                                opslag-brug, opslagquotum-indicator,
                                apiFetch/apiJson, navbar-integratie
mini-apps-list.js            — iconen-select, badges, renderAppCard/renderAppLists,
                                loadApps, collega-checkboxes, bouw-prompt
mini-apps-upload-viewer.js   — upload-modal, link kopiëren, kale fullscreen-viewer
mini-apps-edit-modal.js      — app-modal ("Bewerken": tabs, code-editor, opslaan,
                                verwijderen) + mail-abonnement per app
mini-apps-favorites-chat.js  — favorieten-sectie + chat-kanalen-modal
mini-apps-bootstrap.js       — event delegation (click/change/keydown) + init
mini-apps-admin-ai-usage.js  — AI-gebruiksrapport (admin-only, kost/gebruik
                                per app + per gebruiker, Chart.js-grafiekjes)
```

Geen functionele wijzigingen bij deze splitsing (byte-voor-byte reconstructie
geverifieerd). Bij nieuwe front-end functies: gewoon toevoegen aan het meest
logische bestand hierboven — geen nieuw bestand tenzij een sectie zelf weer
richting de 150+ regels groeit.

`mini-apps-admin-ai-usage.js` (2026-07-31) is een BEWUSTE uitzondering op die
regel (nieuw bestand i.p.v. toevoegen aan een bestaand bestand): het admin-only
AI-usagerapport (tabellen + Chart.js-grafiekjes over `/mini-apps/api/ai-usage`,
zie ai.js/ai-pricing.js) is functioneel losstaand van de rest van de module
(geen enkele andere sectie roept het aan buiten de isAdmin-gate in
`renderNavbar()` in mini-apps-core.js) en was op zichzelf al >150 regels.
Dit rapport zat eerst als tab in `public/admin-dashboard.html`, maar is
verplaatst naar hier zodat admins het rechtstreeks vanuit Mini-apps kunnen
raadplegen — de server-side route (`GET /api/ai-usage` in
`src/modules/mini-apps/routes.js`) blijft evengoed admin-gated (403 voor
niet-admins), dit is dus geen security-by-obscurity, enkel UI-plaatsing.

## Blueprint: Odoo copy-wizard met interactieve veld-selectie

## mini-apps — Google Drive-koppeling (GEBOUWD, maar UITGESCHAKELD sinds 2026-07-24)

Er bestaat een volledig werkende `window.platform.drive`-koppeling (lijst/lees/
maak-aan van Google Drive-bestanden namens de ingelogde gebruiker, via domain-
wide delegation met het bestaande service-account — `src/modules/mini-apps/
lib/google-drive-client.js`, routes in `mini-apps/routes.js`, admin-only
e-mail-override in `admin/routes.js` + `admin-dashboard.html/js`). Getest en
bevestigd functioneel (lijst/lees werken, domain-wide delegation is
gewhitelist in de Admin Console).

**Bewust terug volledig dichtgezet**, op verzoek: het risico is dat een
mini-app Drive-inhoud (contracten, notulen, klantgegevens, ...) ophaalt via
`drive.read()` en die vervolgens doorgeeft aan `window.platform.ai.ask()` —
wat op de huidige GRATIS Gemini-laag betekent dat die inhoud door Google
gebruikt mag worden om hun modellen te trainen. Zolang er geen veilige
AI-koppeling is (betaalde laag zonder training-gebruik, of een andere
provider met een data-processing-agreement), mag deze combinatie niet
mogelijk zijn — en gebruikers/de BUILD_PROMPT mogen zelfs niet weten dat
Drive-toegang bestaat, om te vermijden dat iemand er toch de vraag naar stelt.

**Hoe het dichtgezet is (niet verwijderd — enkel onbereikbaar/onvindbaar):**
- `DRIVE_INTEGRATION_ENABLED = false` in `mini-apps/lib/google-drive-client.js`
  — de drie Drive-routes in `mini-apps/routes.js` en de twee admin-routes in
  `admin/routes.js` geven hierdoor altijd 404, ongeacht wie het aanroept.
- `window.platform.drive` bestaat niet meer in de iframe-shim
  (`mini-apps-core.js`'s `MINI_APP_SHIM`) — een mini-app kan het dus niet
  eens proberen aanroepen, en `window.platform` toont het niet bij inspectie.
- De "Bouw-prompt"-knop (`mini-apps-list.js`, `BUILD_PROMPT`) vermeldt Drive
  niet — Claude (of een andere AI) die een nieuwe mini-app bouwt via die
  prompt weet dus niet dat de mogelijkheid bestaat.
- De admin-only "Google-instellingen"-tab in Beheer blijft technisch
  aanwezig (enkel zichtbaar voor `admin@mymmo.com`) maar elke aanroep ernaar
  geeft 404 zolang de vlag op `false` staat.

**Om terug te activeren, zodra er een veilige AI-koppeling is:**
1. `DRIVE_INTEGRATION_ENABLED = true` zetten in `google-drive-client.js`.
2. De `drive:{...}`-sectie + bijhorende `driveList`/`driveRead`/`driveCreate`-
   dispatcher-branches terugzetten in `mini-apps-core.js` (zie git-historie
   van dat bestand rond 2026-07-24 voor de exacte, al geteste code).
3. De Drive-paragraaf terugzetten in `BUILD_PROMPT` (`mini-apps-list.js`,
   zelfde git-historie) — en er dan ALSNOG een expliciete waarschuwing aan
   toevoegen over de combinatie met `window.platform.ai.ask()`, ongeacht
   welke AI-provider op dat moment gebruikt wordt.
4. Domain-wide delegation staat al gewhitelist in de Admin Console (Client ID
   van het service-account, scopes `drive.readonly` + `drive.file`) — die
   stap hoeft niet opnieuw.

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

## Schema-cache (Sales Insight Explorer) — nooit een doodlopende "Schema not available"

De volledige module draait op één KV-sleutel: `sales_insights:schema:current`
(`src/modules/sales-insight-explorer/lib/schema-service.js`). Die stond op een TTL van
**1 uur**. Gevolg: precies één uur na de laatste handmatige "Schema verversen" gaf élke
route die het schema nodig heeft — valideren, opslaan, uitvoeren, exporteren, delen met
mini-apps — een 503 `SCHEMA_NOT_AVAILABLE` met de tekst "Please refresh schema first".
Voor de gebruiker onverklaarbaar: hij weet niet dat er een cache bestaat, en de enige
uitweg was een knop in een beheer-tabblad.

**Regel:** gebruik in nieuwe code altijd `ensureSchema(env)`, nooit `getCachedSchema(env)`
gevolgd door een foutmelding. `ensureSchema()` geeft de cache terug als die er is, en bouwt
ze anders zelf op (introspectie + capabilities + terugschrijven), met een single-flight-guard
per isolate zodat gelijktijdige requests niet allemaal naar Odoo gaan. Ze gooit enkel bij een
ECHTE fout (Odoo onbereikbaar) — dat is dan ook de enige situatie waarin een gebruiker nog
een schema-foutmelding hoort te zien.

Overige afspraken:

- TTL staat op één plek: `SCHEMA_CACHE_TTL_SECONDS` (30 dagen). Niet opnieuw hardcoden.
- Schrijf de cache altijd via `cacheSchema(env, schema, capabilities)` — niet met een eigen
  `MAPPINGS_KV.put()`. Dat ging eerder mis: `cacheSchema()` schreef `capabilities` helemaal
  niet mee, terwijl alle consumers `cached.capabilities` lezen; enkel de refresh-route deed
  het correct met een losse put. `ensureSchema()` repareert zo'n oude rij nu zelf.
- `getCachedSchema()` blijft bestaan voor de drie plekken die bewust willen weten óf er een
  cache is (cache-hit-respons van `GET /schema`, de oude-vs-nieuwe vergelijking in
  `POST /schema/refresh`, de phase0-test).
- "Schema verversen" (`POST /schema/refresh`) blijft de manier om na een Studio-wijziging
  verse veldinformatie op te halen — dat is nu een bewuste actie, geen noodzakelijk ritueel.

---

## Odoo-data in mini-apps — één zoekopdracht, één vinkje (2026-08)

**Regel:** er bestaat GEEN apart concept "mini-app-query" en geen apart beheerscherm om te
delen. Een gebruiker bewaart in de Sales Insight Explorer-wizard een zoekopdracht
("Mijn zoekopdrachten", tabel `saved_searches`) en vinkt in DIEZELFDE opslaan-actie
eventueel "Ook beschikbaar voor mini-apps" aan (admin-only, `renderMiniAppShareCheckbox()`
in `public/semantic-wizard.js`).

| Wat | Waar |
|---|---|
| Gebruikersgericht object (bewaren/bijwerken/verwijderen/delen) | `saved_searches` |
| Afgeleid uitvoerartefact dat mini-apps draaien | `sales_insight_queries` (rij waarnaar `saved_searches.mini_app_query_id` verwijst) |
| Enige plek die dat artefact aanmaakt/bijwerkt/verwijdert | `src/modules/sales-insight-explorer/lib/saved-search-sharing.js` |
| Enige poort die een mini-app door laat | `lib/mini-app-bridge.js` (`is_shared_mini_apps = true`) |
| Schema-verkenning voor een AI-gesprek (token-auth, read-only) | `lib/mini-app-discovery.js` + `GET /insights/api/sales-insights/mini-app-discovery/queries[/:id]` |

Gevolgen die bewust zo zijn:

- **Wijzigen volgt automatisch mee.** Bij elke save van een gedeelde zoekopdracht wordt de
  afgeleide `query_definition` volledig herschreven vanuit de payload die de wizard net
  uitvoerde. Mini-apps verwijzen naar een query via haar id (`window.platform.odoo.runQuery(id, ...)`),
  dus er hoeft niets in een mini-app aangepast te worden. Er is nergens een tweede kopie
  van de query.
- **Verwijderen/uitvinken haalt de toegang weg.** `DELETE /api/sales-insights/saved-searches/:id`
  en `share_with_mini_apps: false` verwijderen de afgeleide rij. De FK staat op
  `ON DELETE SET NULL`, dus een zoekopdracht blijft bestaan als het artefact langs een
  andere weg verdwijnt.
- **`{{param.NAAM}}`-placeholders zijn deterministisch afgeleid** (`autoDetectMiniAppParameters()`),
  niet handmatig instelbaar. Snelle periodes worden bij het delen omgezet naar een relatieve
  `time_scope` (`buildShareablePayload()` in `semantic-wizard.js`), anders bevriest een gedeelde
  query op de datum van vandaag.
- **Prompts bevatten geen momentopname van data meer.** "Kopieer bouw-prompt" en
  "Prompt: bijwerken met query" vragen een discovery-token aan
  (`POST /mini-apps/api/apps/odoo-discovery-token`) en zetten de URL's in de prompt
  (`odooDiscoveryPromptSection()` in `public/mini-apps-core.js`), inclusief de twee
  VERPLICHTE fallbacks die de gegenereerde app moet bevatten ("Deze query is niet meer
  beschikbaar" / "Onbekende/ontbrekende velden in het resultaat").
- **Discovery-tokens** (`mini_app_discovery_tokens`) volgen dezelfde aanpak als de sessies in
  deze repo: random token in de database, 7 dagen geldig, alleen lezen, geen HMAC/JWT-secret.
  Ze zijn bereikbaar buiten de auth-gate via `src/router/public-routes.js` en ontsluiten enkel
  STRUCTUUR + max 5 voorbeeldrijen van queries die op dat moment gedeeld zijn — nooit een
  schrijfpad, nooit niet-gedeelde queries.

**Vervallen (niet opnieuw invoeren):** de knop "Bewaar als mini-app-query" en
`saveAsMiniAppQuery()` in de wizard, `PATCH /api/sales-insights/query/:id/mini-apps-sharing`,
de deel-toggle + het `naam|label`-tekstvak in het Beheer-tabblad (dat tabblad is nu een
read-only overzicht met enkel een verwijder-actie voor oude losse rijen),
`GET /api/apps/odoo-queries` en `POST /api/apps/odoo-queries/:queryId/preview` (module-brede
varianten zonder appId) plus de query-select in de upload-modal.

---

## Sales Insight Explorer — één graaf, één cascade-motor (2026-08)

**Regel:** er is exact ÉÉN plek die weet welke modellen bestaan en hoe ze aan elkaar hangen
(`src/modules/sales-insight-explorer/lib/graph/graph-nodes.js` + `graph-edges.js`), en exact ÉÉN
plek die data ophaalt (`lib/graph/cascade-executor.js`). Zowel de wizard
(`POST /insights/api/sales-insights/semantic/run`) als mini-apps
(`lib/mini-app-bridge.js#runSharedQuery` → `window.platform.odoo.runQuery()`) roepen diezelfde
`executeCascade()` aan. **Nooit een tweede uitvoeringspad naast dit ene bouwen** — dat is precies
wat hiervoor fout ging: de wizard liep op 13 hand-geschreven enrichment-bestanden en mini-apps op
`query-executor.js`, met twee verschillende resultaatvormen.

| Wat | Waar |
|---|---|
| Welke modellen bestaan + hun gedrag (label, icoon, naamveld, datumvelden, `baseDomain`, `heavyFields`, `maxRecords`, `canBeRoot`) | `lib/graph/graph-nodes.js` |
| Hoe modellen koppelen (één declaratie per koppeling, tegenrichting automatisch afgeleid) | `lib/graph/graph-edges.js` |
| Vorm + validatie van een query | `lib/graph/cascade-models.js` (`version: 2`, `root` + recursieve `cascade`) |
| Uitvoering (de enige traversal-code) | `lib/graph/cascade-executor.js` |
| Serialisatie naar de client | `lib/graph/graph-service.js` + `GET /insights/api/sales-insights/graph` |

Afspraken die bewust zo zijn:

- **Een node ≠ een Odoo-model.** Hetzelfde model kan twee rollen hebben: `res.partner` =
  gebouwen/VME's (`is_company = true`) en `res.partner:contact` = contactpersonen
  (`is_company = false`). Node-keys zijn gelijk aan de modelnaam behalve bij zo'n rol-splitsing
  (`<model>:<rol>`); gebruik `odooModelOf()` (server) / `odooModelOfNode()` (client) zodra je met
  Odoo of met de Supabase-config praat. Hetzelfde model mag dus meerdere keren in één pad staan;
  wat verboden is, is dezelfde EDGE twee keer in één pad (lus).
- **Model-quirks zijn declaratief, geen code.** `crm.lead` toont ook gearchiveerde leads,
  `mail.message` beperkt zich tot echte berichten, `res.partner` splitst op `is_company`: dat
  staat in `node.baseDomain`. Zet zulke regels nooit opnieuw als `if (model === '...')` in een
  route.
- **`field` van een edge leeft ALTIJD op het `from`-model.** De tegenrichting (`fk_reverse`) wordt
  daaruit afgeleid. Dit is de kern van de bug die de oude motor had: bij een many2one werd gezocht
  op `id in <bron-id's>` i.p.v. op de FK-waarden ÚIT de bronrecords.
- **Vier koppelingstypes, geen vijfde zonder noodzaak:** `relation` (echte Odoo-relatie),
  `value_match` (join op veldwaarde — `x_web_visitor.x_studio_email` ↔ `res.partner.email`, want
  daar bestaat geen FK), `mail` (het `model`/`res_model` + `res_id`-patroon, automatisch voor elke
  data-node) en `composite` (een edge die uit bestaande hops bestaat). Composite wordt ALLEEN
  gebruikt waar Odoo geen directe koppeling heeft én de weg ondubbelzinnig is: vandaag enkel
  `crm.lead → res.partner` (gebouw), want `crm.lead.partner_id` wijst naar de contactpersoon en
  het gebouw hangt aan diens `commercial_partner_id`. **Bewust GEEN composite
  touchpoint → contactpersoon:** die verbinding loopt over de visitor, en een touchpoint is geen
  vertrekpunt — een gebruiker start bij de web visitor en haalt daar twee losse takken op.
- **`canBeRoot` bepaalt de vertrekpunten** (leads, contactpersonen, gebouwen, web visitors,
  actiebladen). Touchpoints, chatter en activiteiten zijn cascade-doelen maar geen startpunt. Elk
  nieuw model dat in de graaf komt, krijgt die vlag expliciet mee.
- **Guards zijn node-metadata, geen per-geval code:** `heavyFields` (zware HTML/JSON-velden
  vereisen een filter), `maxRecords` (cap per stap, met een nette `STEP_TOO_LARGE`-melding) en
  id-batching in blokken van `ID_BATCH_SIZE` (500). Nooit meer `limit: false` met alle bron-id's
  in één domain.
- **Filters en periodes werken op ELKE stap**, niet enkel op het basismodel. De periode van het
  basismodel gaat als `root.time_scope` mee (niet als twee losse `>=`/`<=`-filters), want dat is
  wat een mini-app kan overrulen via het bestaande `period_override`-parametertype.
- **`query-executor.js` doet enkel nog het basismodel + aggregaties.** Een `QueryDefinition` met
  `relations` wordt daar expliciet geweigerd (`RELATIONS_NOT_SUPPORTED`). Voeg daar nooit opnieuw
  traversal-code toe.
- **De client heeft geen eigen kopie van de graaf.** `public/semantic-wizard.js` vult
  `MODEL_CONFIG`/`GRAPH` via `loadGraph()`. De vroegere hardcoded `MODEL_CONFIG`, `GRAPH_EDGES` en
  `RELATION_META` mogen niet terugkomen. `buildPayload()` wandelt de wizard-toestand generiek
  langs de graaf; een nieuwe node/edge werkt automatisch zonder wijziging in de front-end.
- **Resultaatvorm:** rijen van het basismodel, met per cascade-stap een geneste `__alias`-sleutel
  (array, of één object/`null` bij een many2one). Aliassen komen uit `edge.as` en zijn met opzet
  dezelfde namen als vroeger (`__leads`, `__touchpoints`, `__chatter`, ...).

**Vervallen (niet opnieuw invoeren):** de 13 enrichment-bestanden (`lead-enrichment.js`,
`chatter-enrichment.js`, `activity-enrichment.js` en de 10 paar-specifieke),
`semantic-query-executor.js`, de twaalf `if`-blokken in de oude `runSemanticQuery()`, de blokkade
op relaties naar `crm.lead` (die verwees naar `x_sales_action_sheet.lead_id`, een veld dat nooit
heeft bestaan — de echte koppeling is `x_studio_as_opportunity_ids`, een many2many), en
`enrichWithRelations`/`executeRelationTraversal`/`buildTraversalDomain` in `query-executor.js`.
Die bestanden zijn nergens meer geïmporteerd; ze mogen met één `git rm` weg.

**Tests (draaien zonder Odoo-verbinding, via een fake-Odoo op echte record-vormen):**
`node src/modules/sales-insight-explorer/tests/cascade-executor-test.mjs` en
`node src/modules/sales-insight-explorer/tests/wizard-payload-test.mjs`. Breid deze uit bij elke
nieuwe edge of node.

---

## Gedeelde R2-bucket (env.R2_ASSETS) — elke module moet zichzelf scopen

**Regel:** `env.R2_ASSETS` is ÉÉN bucket (`openvme-assets`) die door meerdere modules gebruikt wordt, elk met een eigen key-prefix: asset-manager (`public/`, `banners/`, `events/`, `logos/`, `uploads/`, `users/{id}/`), mini-apps app-inhoud (`mini-apps/{appId}.html`), mini-apps gedeelde opslag (`mini-apps-storage/{appId}/...`). **Elke module die deze bucket gebruikt moet zijn eigen `.list()`-aanroepen altijd scopen tot zijn eigen prefix(en) — nooit een leeg/onbegrensd prefix rechtstreeks doorgeven aan `R2_ASSETS.list()`.**

Waarom dit hier staat: op 2026-07-13 bleek dat de asset-manager (`GET /api/assets/list`, "Alles"-tab) bij een leeg prefix de HELE bucket ongefilterd terugaf, inclusief mini-apps' eigen app-inhoud en gedeelde-opslag-objecten — die verschenen dan als nep-"bestanden" (bv. `todayShoppersText`, willekeurige UUID's) in de Asset Library. De rechtencontrole zelf werd bovendien enkel uitgevoerd `if (prefix && ...)`, dus een leeg prefix sloeg ook die controle over. Gefixt in `src/modules/asset-manager/routes.js` met een gesloten `ASSET_CATEGORY_PREFIXES`-lijst (nooit een blinde bucket-brede list) + een `FOREIGN_MODULE_PREFIXES`-denylist die `canReadPrefix`/`canWritePrefix` altijd blokkeert, ook voor admin — zie het uitgebreide doc-blok in `src/modules/asset-manager/module.js`.

**Voeg je een nieuwe module toe die `env.R2_ASSETS` gebruikt?** Kies een eigen, unieke prefix, en als de asset-manager ooit iets van jouw prefix zou kunnen tegenkomen bij een bucket-brede list: voeg je prefix toe aan `FOREIGN_MODULE_PREFIXES` in `src/modules/asset-manager/routes.js`.

## wp-plugin/mymmo-events — verplichte procedure bij ELKE wijziging

**Waarom dit hier staat:** meerdere Claude-gesprekken werken na elkaar (soms zelfs
overlappend) aan dezelfde WordPress-plugin. Zonder een vaste procedure ontstaat precies
wat er op 2026-09-04 gebeurde: een gesprek bouwde een release (1.6.30) die zowel een
echte bugfix als een half-werkende feature bevatte, de gebruiker moest de hele site
terugzetten naar de vorige versie (1.6.29) om van BEIDE af te zijn, en al het werk van
die sessie ging verloren. Deze procedure bestaat om dat te voorkomen.

### 0. Voor je begint: check of er al iets in bewerking is

- `git status --porcelain wp-plugin/mymmo-events` en `find wp-plugin/mymmo-events -iname "edit_*.py*"`.
  Modified files of stray `edit_*.py`-scripts die niet van jou zijn = een andere sessie
  is (of was) hier al bezig. Vraag de gebruiker naar de status voor je zelf iets bouwt
  bovenop werk dat je niet kent — vooral bij grote/structurele wijzigingen (niet nodig
  voor een triviale, geïsoleerde CSS-tweak).
- `wp-plugin/mymmo-events-{versie}.zip` (het hoogste versienummer dat er staat) is de
  laatst DOOR JOU (of een vorige sessie) gebouwde release — niet per se wat er nu live
  staat op de site. Vraag bij twijfel welke versie de gebruiker effectief heeft
  geïnstalleerd/getest.

### 1. Bestand-editing: dezelfde verplichte procedure als repo-breed (zie boven), ÉÉN uitzondering

Alle regels uit "Bestand-editing bij grote/gevoelige bestanden" hierboven gelden
onverkort voor élk bestand in `wp-plugin/mymmo-events/` — ook de kleinere PHP-templates
(`row.php`, `announcement.php`, ...) die < 150 regels kunnen zijn: gebruik voor de
plugin-map ALTIJD de Python-script-procedure (base64 → device_bash-heredoc → decode →
`ast.parse`-syntaxcheck → uitvoeren → CR-count/brace-balans verifiëren), nooit de
Edit-tool rechtstreeks, ongeacht bestandsgrootte. Voor `.js`-bestanden ook altijd
`node --check` na de laatste wijziging in die sessie. Er is geen `php -l` beschikbaar in
deze omgeving (device_bash heeft geen PHP-CLI) — controleer PHP-bestanden dus extra
zorgvuldig op brace/paren-balans en lees de volledige gerenderde output terug voor je
verdergaat.

### 2. Eén feature, één samenhangende wijziging — niet los patchen bovenop halfbakken werk

Als de gebruiker feedback geeft op een net gebouwde feature ("dit klopt nog niet, pas X
en Y aan"), en de aanpassingen raken de kernstructuur (niet enkel een kleurtje of
marge): overweeg de betrokken bestanden vanaf een schone, bekende basis (de laatst
bevestigd-werkende zip) opnieuw op te bouwen in plaats van door te patchen op een versie
die de gebruiker zelf al "niet goed" noemde. Doorpatchen op iets structureel verkeerd
stapelt fouten op (zelfde principe als stap 7 van de repo-brede procedure hierboven,
maar dan op featureniveau i.p.v. byteniveau).

### 3. Versie ophogen — twee plekken, altijd samen

`wp-plugin/mymmo-events/mymmo-events.php` bevat het versienummer op TWEE plekken die
altijd gelijk moeten staan:
```
 * Version:           X.Y.Z          (regel ~5, docblock)
define('MYMMO_EVENTS_VERSION', 'X.Y.Z');   (regel ~30, constante)
```
Klopt dit niet met elkaar (zoals na de 1.6.30-episode, waar de docblock al 1.6.30 zei
maar de constante nog 1.6.29) — eerst gelijktrekken voor je verder werkt, want de
constante bepaalt de cache-busting van CSS/JS (`wp_register_style(...,
MYMMO_EVENTS_VERSION)`); een mismatch daar is een subtiele bron van "mijn wijzigingen
zijn niet zichtbaar"-rapporten.

### 4. README.md-changelog — nieuwe sectie boven de vorige, Nederlands, met "waarom"

Onder `## Versies` komt een nieuwe `**X.Y.Z**`-sectie VOOR de vorige (nieuwste eerst).
Beschrijf niet enkel wat er verandert, maar ook waarom/de oorzaak bij bugfixes (zie de
bestaande 1.6.28-1.6.30-secties als voorbeeld) — dat is wat een volgende sessie (of de
gebruiker, maanden later) nodig heeft om te begrijpen of een latere klacht hier al mee
te maken heeft.

### 5. Zip bouwen — altijd in een schone kopie, nooit in-place

```bash
rm -rf ~/build/mymmo-events   # als een vorige (mislukte) build er nog staat
mkdir -p ~/build
cp -r wp-plugin/mymmo-events ~/build/mymmo-events
find ~/build/mymmo-events -iname "edit_*.py*" | xargs -r rm -f
zip -r -q ~/build/mymmo-events-X.Y.Z.zip mymmo-events   # vanuit ~/build/ zelf uitvoeren
unzip -l ~/build/mymmo-events-X.Y.Z.zip | grep -c "edit_"   # MOET 0 zijn
cp ~/build/mymmo-events-X.Y.Z.zip wp-plugin/mymmo-events-X.Y.Z.zip   # cp, nooit mv/overschrijven
```
Oudere zips in `wp-plugin/` NOOIT verwijderen of overschrijven op eigen initiatief (zie
de bestaande regel "wp-plugin zip-artefacten" verderop) — dat historisch archief is
bewust zo, ook als een versie nadien gebroken bleek. Enkel verwijderen als de gebruiker
dat expliciet vraagt (zoals bij de 1.6.30-episode).

### 6. Na het bouwen: zeg wat WEL en NIET is meegenomen

Meld expliciet welke bestanden de zip bevat/wijzigt, of er een Worker-deploy nodig is
(Worker-wijzigingen in `src/modules/event-operations-v2/` zijn een APARTE stap die de
gebruiker zelf met `npm run deploy` moet doen — een WP-plugin-zip dekt dat nooit), en
welk deel puur WP-plugin-side is. Bij een grotere/visuele feature: vraag om die op een
echt mobiel toestel (niet enkel devtools-simulatie) te testen voor de gebruiker 'm
uitrolt.

## wp-plugin zip-artefacten — historische zips blijven staan

**Regel:** bij het (opnieuw) bouwen van `wp-plugin/mymmo-events-{versie}.zip` nooit oudere
versie-zips in `wp-plugin/` verwijderen of overschrijven. Elke versie krijgt haar eigen
bestand (`mymmo-events-1.6.12.zip`, `mymmo-events-1.6.13.zip`, ...); dat is bewust een
historisch archief. Opruimen van oude zips (of van mislukte build-restanten) is aan de
gebruiker zelf — nooit zelf initiëren, ook niet als "opruimen van rommel".

## mini-apps AI — streamend, met een canoniek foutcontract (2026-08)

**Regel 1 — de AI-providers streamen ALTIJD (`stream: true`). Voeg nooit een niet-streamend pad toe, en los een "te langzame AI-aanroep" nooit op door een timeout op te trekken.**

Waarom dit hier staat: tussen 2026-07 en 2026-08 is de clientside timeout in `public/mini-apps-core.js` drie keer opgetrokken (45s vast → 180s → 300s), elke keer op basis van wat er net misliep. Dat kon niet werken, om drie redenen die alle drie in de code zaten:

1. **De enige timeout in de keten stond clientside en annuleerde niets.** `send()` verwijderde enkel zijn `pending`-entry. De fetch in de host-pagina, de Worker, en Claude liepen door; rate-limit en kosten werden verbruikt; het antwoord kwam aan bij een promise die niemand meer vasthield en werd stil weggegooid (`if(!p)return;`).
2. **Er was geen signaal om een timeout op te baseren.** Een niet-streamende `fetch` naar `/v1/messages` levert nul bytes tot het antwoord volledig af is. "Claude werkt nog" en "de verbinding is dood" waren dus per definitie niet te onderscheiden. De formule schaalde bovendien mee met het *gevraagde* maximum aantal output-tokens, terwijl de duur van het *werkelijk gegenereerde* aantal afhangt.
3. **Alle faalmodi kwamen als dezelfde string aan**, omdat `apiJson()` de `code` uit de server-response liet vallen.

**Wat er nu geldt:**

- `lib/ai-providers/*.js` streamen SSE en breken zelf af bij **inactiviteit** (`AI_STALL_TIMEOUT_MS` in `lib/ai.js`, 60s) — niet op totaalduur. Die waarde hangt van niets af en hoeft nooit bijgesteld te worden.
- `POST /api/apps/:id/ai/ask` heeft twee transportvormen op dezelfde logica: gewone JSON, of `text/event-stream` bij `body.stream === true` (events `open`/`delta`/`done`/`error`).
- De brug in `mini-apps-core.js` leest die SSE en relayt elke delta naar het iframe als `__miniAppAiEvent`. De shim gebruikt daarop een **stall-timer** (`AI_STALL_MS`, 90s) plus een ruime noodrem (`AI_HARD_MS`, 15 min) die er alleen is om een oneindig hangende promise te voorkomen.
- **Een Cloudflare Worker heeft geen wall-clock-limiet zolang de client verbonden is.** De vaak geciteerde 30s is CPU-tijd; wachten op een externe API kost geen CPU. Er was dus nooit een platformlimiet die dit veroorzaakte.
- `ctx.waitUntil()` verlengt maar **30 seconden** na de respons. Een fire-and-forget + polling-patroon vraagt daarom een Durable Object, Queue of Workflow — voor werk dat langer dan ~10 min duurt of onbemand moet lopen is Anthropic's **Message Batches API** het juiste gereedschap (50% goedkoper, submit → poll), gehangen aan `lib/scheduler.js`. Bouw daar geen eigen job-framework voor.

**Regel 2 — foutcodes komen uit `lib/ai-errors.js` en mogen door geen enkele laag vertaald, ingeslikt of vervangen worden door tekst.**

De codes (`AI_STALLED`, `AI_TRUNCATED`, `AI_PROVIDER_RATE_LIMITED`, `AI_RATE_LIMIT_APP`, `AI_RATE_LIMIT_PLATFORM`, ...) reizen ongewijzigd van provider → `lib/ai.js` → `routes.js` → brug → `window.platform.ai.ask()`, waar ze als `err.code` / `err.retryable` / `err.retryAfterMs` beschikbaar zijn. `err.message` blijft leesbaar Nederlands voor de UI, maar is **nooit** de informatiedrager voor code.

**Verboden in mini-app-code:** reguliere expressies op foutteksten om te bepalen wat er misging (`/timeout|verliep/i`, `/limiet|limit/i`). Dat was de enige mogelijkheid vóór deze wijziging en is nu een bug. Gebruik `err.code`.

**Regel 3 — vraag gestructureerde output met een schema; parse nooit JSON uit tekst.**

`ai.ask.json(prompt, {schema})` gebruikt `output_config.format` (Anthropic) resp. `responseSchema` (Gemini): constrained decoding, dus gegarandeerd geldige JSON. Zelfgeschreven NDJSON-/regex-parsers met per-regel-foutboekhouding zijn daarmee overbodig. Zet een gesloten antwoordruimte als `enum` in het schema — of, bij een vaste lijst, als **integer-index** in die lijst (labels als output kosten tokens en drijven weg qua spelling).

**Let op welke JSON-Schema-keywords mogen.** Anthropic's constrained decoding ondersteunt de pure validatie-constraints NIET: `maxItems` gaf in productie een harde 400 ("For 'array' type, property 'maxItems' is not supported"), en hetzelfde geldt voor `maxLength`, `minLength`, `minimum`, `maximum`, `pattern`, `uniqueItems`, `min/maxProperties`, `default` en `examples`. `sanitizeSchemaForStructuredOutput()` in `ai-providers/anthropic.js` strippt die nu automatisch en zet ze als notitie achter de `description` — precies wat Anthropic's eigen SDK's doen — dus een schema mét zo'n keyword werkt nog, maar wordt niet hard afgedwongen. Gevolg voor jouw code: **klem grenzen altijd zelf af in JS** (`slice`) en gebruik `enum` waar een waarde écht begrensd moet zijn; `enum` is ondersteund en strenger dan `minimum`/`maximum`. Structurele keywords (`type`, `properties`, `required`, `items`, `enum`, `additionalProperties`, `$ref`, `oneOf`/`anyOf`/`allOf`) worden bewust NIET gestript: die stil weghalen zou de betekenis van het schema veranderen, en een leesbare `AI_PROVIDER_BAD_REQUEST` is beter dan een schema dat iets anders doet dan er staat.

**Regel 4 — kies het model per taak, uit `MODEL_ALLOWLIST` in `lib/ai.js`.**

`claude-haiku-4-5` voor classificatie (weinig output, gesloten antwoordruimte, ~5× goedkoper), `claude-sonnet-5` voor samenvatten/analyseren. De allowlist is bewust server-side: de daglimiet telt *aanroepen*, niet euro's, dus zonder allowlist kan een mini-app de kostenbeheersing omzeilen door een duur model te kiezen. Opus staat er niet in.

**Regel 5 — splits een AI-aanroep op naar outputprofiel, niet naar "kleinere batches".**

Bij een batch-taak die zowel goedkope classificatie als dure tekst produceert: aparte aanroepen. En genereer output die maar één record per keer bekeken wordt (bv. detail-uitleg in een dialoog) **op aanvraag**, niet vooruit voor de hele batch. In Actiebladen Insights was `perQuestion` ~75% van de output-tokens en werd het uitsluitend in `openDetail()` gebruikt — dat vooruit betalen voor alle records was de eigenlijke oorzaak van de trage, dure aanroepen.

**`max_tokens` is een PLAFOND, geen reservering — en leid je batch-grootte eruit af.** Je betaalt de tokens die het model werkelijk genereert, niet het plafond dat je vroeg. Een krap plafond bespaart dus niets en levert alleen `AI_TRUNCATED` op: een volledig betaalde, weggegooide aanroep. Vraag ruim.

En zet batch-grootte en tokenbudget nooit als twee losse constanten: dat ging in Actiebladen Insights meteen mis (40 records per batch naast een gevraagd budget van `40 * 90 + 400` = 4.000 tokens — die spraken elkaar tegen, dus afkapping). Leid de batch-grootte af uit het budget:

```js
batch_max = floor((PLATFORM_MAX_OUTPUT_TOKENS - overhead) / tokens_per_record)
budget    = min(PLATFORM_MAX_OUTPUT_TOKENS, aantal * tokens_per_record + overhead)
```

Dan kan het gevraagde budget per constructie niet kleiner zijn dan wat de batch nodig heeft. Meet daarna het ECHTE verbruik (`ai.ask.full()` geeft `usage.tokensOut`) en stel `tokens_per_record` bij op die cijfers — niet op wat er net misliep.

**Splitsen mag alleen op `AI_TRUNCATED`, nooit op een timeout.** Bij `AI_TRUNCATED` betekent de fout letterlijk "deze output paste niet", dus halveren van de batch halveert de output: een deterministisch antwoord op een gemeten oorzaak (zie `runSplittingOnTruncation()` in de app, met dieptegrens). Splitsen op een timeout is het tegenovergestelde — dat was de oude `digestBatchResilient()`, die gokte en het ontbreken van streaming maskeerde. Voer dat niet opnieuw in.

Prompt-caching (`cacheSystem: true`) is beschikbaar maar loont alleen bij een **grote, echt identieke** prefix: minimum 1.024 tokens voor Sonnet 5 (4.096 voor Haiku), daaronder wordt het stil overgeslagen. Voor batch-prompts waarvan de inhoud per aanroep verschilt levert het niets op — gebruik het voor een groot vast referentiedocument, niet als reflex.

**Tests (draaien zonder netwerk/Anthropic-key, met een gestubde `fetch` resp. een nagebootst iframe-window):**
`node src/modules/mini-apps/tests/ai-provider-stream-test.mjs` (SSE-parser, chunk-grenzen, stall, `stop_reason`, alle foutcodes) en
`node src/modules/mini-apps/tests/ai-bridge-shim-test.mjs` (de geïnjecteerde shim echt uitvoeren: `ask()` geeft nog een string,
`ask.json()`, het foutcontract, en dat de stall-timer op elke delta reset) en
`node src/modules/mini-apps/tests/actiebladen-digest-logic-test.mjs` (de tweefasen-digestlogica van de mini-app: thema-indices,
`mergeDigest`/`sig`-semantiek, batching, tokenbudget, splitsen bij afkapping) en
`node src/modules/mini-apps/tests/build-prompt-test.mjs` (BUILD_PROMPT vs. wat het platform werkelijk kan — zie Regel 6).
Breid deze uit bij elke wijziging aan de brug, een provider, het digest-ontwerp of de bouw-prompt.

**Regel 6 — wijzig je iets aan `window.platform.ai`, dan wijzig je `BUILD_PROMPT` mee.**

`BUILD_PROMPT` in `public/mini-apps-list.js` is wat een collega kopieert om een AI een nieuwe mini-app te laten bouwen. Alles wat daar niet in staat, wordt in élke nieuwe app fout gedaan — die prompt is dus geen documentatie achteraf maar onderdeel van de API. Bij de herziening van 2026-08 stond er nog het oude contract in (`ask()` met alleen `system`/`maxOutputTokens`), waardoor elke gegenereerde app opnieuw JSON uit tekst zou vissen en op foutteksten zou matchen.

`node src/modules/mini-apps/tests/build-prompt-test.mjs` klinkt de prompt vast aan de bron: elke `AI_*`-code die de prompt noemt moet in `lib/ai-errors.js` bestaan, de codes die een mini-app moet afhandelen moeten in de prompt staan, elke `platform.ai`-methode uit de shim moet gedocumenteerd zijn, en de genoemde grenzen (25000 / 8192 / 200) worden uit `lib/ai.js` gelezen. Voeg je een methode of code toe, dan faalt die test tot de prompt bijgewerkt is.

Volledige onderbouwing: `ONTWERP-ai-aanroep-architectuur.md`.

## event-operations-v2 — communicatie-studio: mail-opmaak in de OM, verzending via `mail.mail` (2026-09)

**Regel: mailopmaak voor events wordt in de OM samengesteld en door Odoo verstuurd via
`mail.mail`. Geen `mail.template` en geen `base.automation` meer voor bevestiging,
reminder en recap — en zeker geen gekopieerd sjabloon per variant.**

Waarom dit hier staat: de oude opzet was een kopieermachine. Elke afwijking per event-type
of onderwerp kostte een gekopieerd `mail.template` PLUS een gekopieerde `base.automation`
met een filter erop. Rule 62 filterde daarbij op `x_studio_event_type` — het rommelveld dat
volgens FORBIDDEN_FIELDS nooit gelezen mag worden.

| Waar | Wat |
|---|---|
| Bloktekst + structuur per event-type | `x_webinar_event_type.x_studio_mail_blocks` (Studio, Text, JSON) |
| Override voor één event | `x_webinar.x_studio_mail_blocks_override` (Studio, Text, JSON) |
| Vorm, validatie, site-filter | `lib/mail-blocks.js` (puur) |
| Blokken → HTML | `lib/mail-render.js` (puur) |
| Odoo-schrijfpad + idempotentie | `lib/mail-service.js` |
| Herstelronde voor verplaatste events | `lib/mail-cron.js` (`*/15`-tak in `index.js#scheduled()`) |
| Editor | `public/events-v2-mail-studio.js` + de `#mailStudioDialog` in `events-v2.html` |
| Tests (zonder Odoo/netwerk) | `node src/modules/event-operations-v2/tests/mail-test.mjs` |

Afspraken die bewust zo zijn:

- **Odoo blijft de enige database.** De blokken staan in twee Studio-velden, niet in
  Supabase en niet in KV. Dat is dezelfde regel als in `lib/blocks.js` ("er komt GEEN apart
  blokkenschema: dat zou een tweede waarheid naast Odoo zijn").
- **Variatie is een eigenschap van een blok, geen kopie van het geheel.** `sites:
  ['syndicoach']` op een blok vervangt de QWeb `t-if` op `x_studio_registration_site` die
  vandaag het hero-logo per site kiest. Een registratie zonder site krijgt géén
  site-specifiek blok — liever een blok minder dan het verkeerde logo.
- **Een override op het event vervangt de sectie VOLLEDIG**, nooit half. Half overnemen zou
  betekenen dat je bij het lezen van een event niet meer kan zien wat er verstuurd wordt.
- **De vlag is niet de waarheid; het `mail.mail`-record is dat.** Vlag en mail leven op twee
  modellen, dus "in één schrijfactie" bestaat niet. De idempotentie draait op een afgeleide
  `message_id` (`<evt{id}-{soort}-reg{id}@om.mymmo.com>`): zoeken → `create` → dán de
  boolean. Mislukt die laatste write, dan kan er nog steeds geen dubbele mail ontstaan.
  `auto_delete` staat daarom expliciet op `false` (de oude templates zetten hem op `true`,
  waardoor er na verzending niets bewijsbaars overbleef). Dit is bewust het omgekeerde van
  de v1-bug waar een `catch` de vlag kon overslaan.
- **`scheduled_date` wordt bij het INSCHRIJVEN gezet**, niet dagelijks herberekend. Odoo-cron
  84 (server action 1102) deed dat wel en liet daardoor iedereen die inschreef ná zijn
  dagelijkse run én binnen 24u vóór het event zonder reminder achter (registratie 1080,
  2026-09-05, is daar een live voorbeeld van). `lib/mail-cron.js` corrigeert alleen nog wat
  al klaarstond wanneer een event nadien verplaatst of geannuleerd wordt.
- **Dag en uur worden afgeleid uit `starts_at` in Europe/Brussels**, niet uit
  `x_studio_starting_day`/`x_studio_starting_time`. Die twee char-velden worden door
  Odoo-cron 85 uit UTC geschreven zonder tijdzone-conversie, en `starting_time` blijft er
  zelfs helemaal leeg terwijl template 52/56 het in hun onderwerp zetten.
- **Placeholders zijn logic-loos**: `{{pad.naar.waarde}}` en niets anders. Geen eval, geen
  Function-constructor, geen conditionals in de tekst (zelfde principe als de
  mini-apps-templates). Een onbekende placeholder wordt leeg, niet zijn eigen naam.
- **`EVENTS_V2_MAIL_OWNER` bepaalt wie verstuurt.** Kommagescheiden event-type-id's, of `*`.
  Leeg/afwezig = de OM stuurt niets — een deploy op zich kan dus nooit een mail veroorzaken.
  Zolang de oude rules aan staan is dat geen dubbele verzending: hun filter is exact
  `x_studio_confirmation_email_sent = False` resp. `..._reminder_... = False`, en de OM zet
  die vlag.
- **Schrijfrecht op `mail.mail` is geverifieerd, niet aangenomen** (2026-09-05): `UID=2` =
  Administrator (`invoice@mymmo.com`) zit in groep 4 (Administration / Settings), en
  `mail.mail.system` is de enige ACL op dat model. Geen Studio- of rechtenwijziging nodig.

**Cutover — pas ná bewijs op één event-type, en in deze volgorde.** Dit is méér dan de vier
automations; hang er ook de crons en de recap-knop aan:

| Odoo-object | Wat |
|---|---|
| `base.automation` 53, 58, 62, 63 | bevestiging + reminder, met hun kopieën voor live events |
| `ir.actions.server` 1084, 1096, 1103, 1104, 1153, 1154, 1155, 1156 | de mail_post/object_write-paren erachter |
| `ir.cron` 84 → actie 1102 | dagelijkse herberekening van `x_studio_reminder_email_send_dt` |
| `ir.cron` 85 → actie 1109/1110 | `x_studio_starting_day` uit UTC |
| `ir.actions.server` 1099, 1100 | recap versturen/resetten (1099 markeert ALLE registraties als verzonden, ook wanneer de verzending gooide én voor de duplicaten die het net wegfilterde — dezelfde faalmodus als de v1-aanwezigheidsbug) |
| `mail.template` 50, 51, 52, 53, 55, 56 | archiveren, niet verwijderen |

Het per-site hero-logo (QWeb `t-if` op `x_studio_registration_site` in template 50/55) blijft
werken tot het vervangen is door een hero-blok met `sites` in de nieuwe editor — niet vooruit
weghalen.

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
    sales-insight-explorer/lib/graph/  — graaf + cascade-motor (zie hierboven)
public/                     — statische UI per module
supabase/migrations/        — YYYYMMDDHHMMSS_naam.sql
```
