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

**Elke nieuwe tabel in `public` krijgt RLS aan** (`alter table ... enable row level security;` direct na de `create table`), zonder policies. De Worker gebruikt enkel de service-role-key (BYPASSRLS), dus er breekt niets; zonder RLS is de tabel via PostgREST open voor iedereen met de anon-key. Supabase meldde dit op 2026-09-19 (`rls_disabled_in_public`); rechtgezet in `20260925100000_enable_rls_all_public_tables.sql`, die ook een event trigger `om_rls_auto_enable` als vangnet zet.

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
| booking-links | `/afspraaklinks` | `booking_links` | `public/booking-links.html` + `.js` | ✅ Correct (zie "Afspraaklinks") |
| web-story | `/webgedrag` | `web_story` | `public/webgedrag.html` + `.js` | ✅ Correct (zie "Webgedrag") |

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

## Koppelingen — formulieren in de OM zelf (Forminator uitfaseren, 2026-09)

**Regel: een koppeling kan haar eigen formulier definiëren. Dat formulier is voor
de pipeline een DERDE BRON naast `forminator` en `generic_webhook` — er komt geen
tweede uitvoeringspad bij.**

Waarom dit bestaat: bij Forminator staat het formulier in WordPress en heeft de OM
er een kopie van (`wp_form_schemas`) die stil veroudert. De veldsleutels zijn
bovendien `text-1` en `select-3`, waardoor `lookupFormValue()` in worker-handler.js
een subsequence-heuristiek nodig heeft om te raden welk veld je bedoelde. En de
typering (`fs_v2_field_transforms`) moet met de hand, omdat niemand vooraf weet dat
"ja" een boolean moest zijn. Alle drie verdwijnen zodra de OM het formulier zelf
kent. Volledige onderbouwing: `docs/ontwerp-om-formulieren.md`.

| Wat | Waar |
|---|---|
| Veldtypes, validatie, payloadvorm (puur, geen env/fetch/db) | `src/modules/forminator-sync-v2/forms/schema.js` |
| CRUD op `fs_v2_forms` + `fs_v2_form_fields` | `forms/database.js` |
| Inzending → bestaande pipeline | `forms/submit.js` |
| Publieke API (sitesleutel, rate limit, ETag) | `forms/public-api.js` + een blok in `src/router/public-routes.js` |
| Beheerroutes | `routes.js` (`/api/integrations/:id/form`, `/api/forms/meta`, `/api/forms/slugify`) |
| Bouwer (tabblad "Formulier") | `public/forminator-sync-v2-detail-form-builder.js` |
| Het formulier tekenen voor het voorbeeld | `public/forminator-sync-v2-form-preview.js` |
| Stylesheet van het formulier (ENIGE bron) | `public/mymmo-forms.css` |
| Bewerklaag in het voorbeeld-iframe | `public/form-builder-canvas.css` |
| Nieuwe koppeling starten (3 bronnen) | `public/forminator-sync-v2-new-integration.js` |
| Shortcode-bouwer in wp-admin | `wp-plugin/mymmo-forms/includes/class-settings.php` + `assets/js/mymmo-forms-admin.js` |
| Taalkeuze en vertaalde weergave (plugin) | `wp-plugin/mymmo-forms/includes/class-i18n.php` |
| Plugin bouwen (haalt de CSS op) | `bash wp-plugin/build-mymmo-forms.sh <versie>` |
| WordPress-plugin | `wp-plugin/mymmo-forms/` |
| Tests (zonder netwerk/database) | `node src/modules/forminator-sync-v2/tests/forms-test.mjs` |
| Browsertest van de bouwer | `node src/modules/forminator-sync-v2/tests/form-builder-ui-test.mjs` (vraagt `npm i -D playwright`; `PW_CHROME` als executablePath) |
| Browsertest van de nieuwe-koppeling-dialoog | `node src/modules/forminator-sync-v2/tests/new-integration-ui-test.mjs` |
| Lopen de twee renderers niet uit elkaar? | `node src/modules/forminator-sync-v2/tests/form-preview-parity-test.mjs` (heeft php nodig; slaat zichzelf over zonder) |
| Rendertest van de plugin (PHP) | `php wp-plugin/mymmo-forms-render-test.php` |
| Test van de shortcode-bouwer (PHP) | `php wp-plugin/mymmo-forms-settings-builder-test.php` |
| Krijgt een bezoeker ONZE foutmeldingen? | `node src/modules/forminator-sync-v2/tests/form-validation-ui-test.mjs` (php + playwright) |
| Komen de OM-velden in het koppelingsscherm? | `node src/modules/forminator-sync-v2/tests/om-form-fields-test.mjs` |
| Toont de indieningenlijst de waarden? | `node src/modules/forminator-sync-v2/tests/submissions-list-test.mjs` (playwright) |
| Belooft het scherm dezelfde replay als de server? | `node src/modules/forminator-sync-v2/tests/replay-status-parity-test.mjs` |
| Waarden leesbaar maken (labels, tijdstippen) | `src/modules/forminator-sync-v2/display-values.js` |

Afspraken die bewust zo zijn:

- **`source_type` wordt NIET gewijzigd als je een formulier toevoegt.** Een
  koppeling met `source_type = 'forminator'` blijft haar Forminator-webhook
  ontvangen én kan tegelijk een OM-formulier hebben. Dat is de hele reden dat
  parallel draaien veilig is: je zet de shortcode op de pagina, het Forminator-
  formulier blijft bestaan, en terugzetten is één wijziging aan één pagina.
  `submitFormEntry()` geeft het integratie-object rechtstreeks aan
  `handleGenericWebhook()`, en die kijkt nergens naar `source_type` — enkel naar
  `forminator_form_id`, voor de idempotentiesleutel. De payloadvormen verschillen,
  dus hun hashes ook: een Forminator- en een OM-inzending worden nooit voor
  elkaars duplicaat aangezien.
- **De payload is `{ form_id, form_data: {...} }`.** Geverifieerd tegen
  `worker-handler.js`: `normalizeFormValues()` neemt `form_data` (tweede kandidaat
  na `form_fields`) en `resolveFormId()` neemt `form_id` (eerste kandidaat). Er is
  dus NIETS aan die functies gewijzigd. `forms-test.mjs` klinkt dat vast; verandert
  een van beide, dan hoort die test rood te worden.
- **De bezoeker-UUID gaat ALTIJD mee.** Het tracking-script op de websites zet
  een cookie `ovme_uuid` (twee jaar, path=/), en bij een doorklik tussen de
  merken ook `ovme_ref_uuid`. De plugin leest die SERVER-SIDE in
  `Mymmo_Forms_Submit::meta()` en stuurt ze als `meta_ovme_uuid` /
  `meta_ovme_ref_uuid` mee; ze zijn dus gewoon mapbaar in het koppelingsscherm.
  Dat is de sleutel tussen een inzending en alles wat van die bezoeker geweten
  is (paginaweergaves, scrolldiepte, kliks) -- zonder die mapping staat een lead
  in Odoo los van zijn eigen voorgeschiedenis, en dat merk je niet, want er komt
  gewoon een lead.
  **Bewust geen JavaScript-injectie zoals bij Forminator**: die cookie wordt bij
  elk verzoek naar admin-post.php meegestuurd, dus server-side lezen werkt ook
  zonder JS en kan niet stukgaan op een gecachete pagina waarin de UUID van de
  VORIGE bezoeker gebakken zou zitten.
  Alleen een waarde met de vorm van een UUID wordt doorgelaten: de cookie kan
  iemand zelf zetten en de waarde gaat naar Odoo. En hij MAG leeg zijn -- het
  tracking-script zet geen cookie voor wie het als bot herkent, noch in een
  browser zonder plugins of taalinstelling, en daar zitten echte mensen tussen.
  Maak er dus nooit een verplicht veld van.
  `meta_form_slug` / `meta_form_id` zijn de opvolger van `ovme_forminator_id`;
  die komen uit het formulier-record op de server, niet uit wat de plugin
  meestuurt. Getest met `php wp-plugin/mymmo-forms-submit-meta-test.php`.
- **De publieke API heeft twee GET's, en de lijst geeft bewust minder terug.**
  `GET /forminator-v2/public/v1/forms` geeft alleen de GEPUBLICEERDE formulieren,
  en per formulier enkel `slug`, `name`, `description`, `version`, `field_count`
  en `updated_at` — geen `id`, geen `integration_id`, geen thema, geen velden.
  Die lijst voedt de shortcode-bouwer bij Instellingen → Mymmo Forms, en dat
  scherm zit achter dezelfde sitesleutel als de rest: de sleutel is niet
  persoonsgebonden, dus alles wat de lijst prijsgeeft, geeft ze prijs aan
  iedereen die de sleutel van één site heeft. `toPublicFormListItem()` in
  `schema.js` is de enige plek waar die vorm bepaald wordt, en `forms-test.mjs`
  faalt zodra er een interne sleutel in lekt.
  De lijst wordt 60 seconden bewaard en heeft — anders dan een formulierschema —
  GEEN last-known-good. Bij een storing hoort daar een melding te staan, niet een
  lijst van gisteren waaruit een beheerder een shortcode kiest voor een formulier
  dat intussen uit publicatie is. Om dezelfde reden staat onder de keuzelijst een
  tabel met van elk formulier de volledige shortcode: dat is de werkende terugval
  zonder JavaScript, en de JS voegt enkel het samenstellen met opties en een
  kopieerknop toe.
- **Eén meertalig formulier, GEEN formulier per taal.** De veldsleutels en de
  optieWAARDEN zijn in alle talen identiek; alleen wat een bezoeker leest
  verschilt. Dat is de hele reden dat één koppeling met één set mappings
  volstaat: een Franstalige bezoeker die "Appartement" aanklikt, verstuurt
  exact dezelfde waarde als een Nederlandstalige. Vertaal je die waarde wel, dan
  heb je per taal een aparte koppeling nodig en onderhoud je alles dubbel.
  De vertalingen staan in `fs_v2_forms.i18n` en `fs_v2_form_fields.i18n`, per
  taal, met de STANDAARDTAAL er bewust NIET in — die staat al in de gewone
  kolommen, en twee bronnen voor dezelfde tekst is een bug in wording.
  Optielabels hangen aan de WAARDE (`{"appartement": "Appartement"}`) en niet
  aan een index: opties herschikken in het Nederlands mag de Franse labels niet
  door elkaar gooien.
  De bouwer werkt met PROJECTIE — het formulier wordt naar de bewerkte taal
  omgezet en dan door dezelfde tekenfunctie gehaald. Zo hoeft
  `forminator-sync-v2-form-preview.js` niets van talen te weten en blijft hij
  vormgelijk aan `field.php`, wat de pariteitstest bewaakt.
  **Publiceren wordt geweigerd zolang een taal nog labels mist.** Zonder die
  eis valt een ontbrekend Frans label stil terug op het Nederlands: geen
  foutmelding, gewoon tekst, en dat merk je pas maanden later.
- **De browser toont zijn eigen foutballon NIET.** `novalidate` staat op het
  formulier en de meldingen komen uit `MESSAGES` in `forms/schema.js`, die
  meereist in de publieke payload. Reden: "Please fill out this field." volgt de
  taal van de BROWSER, niet die van de pagina, en is niet te vertalen, niet te
  stylen en niet te verplaatsen.
  **`novalidate` alleen is niet genoeg** — zolang er ergens een
  `reportValidity()` staat, roept de pagina die ballon alsnog zelf op. Dat was
  precies wat er misging. `form-validation-ui-test.mjs` zet daarom een spion op
  `reportValidity` en wordt rood zodra iemand die aanroep terugzet.
  `MESSAGES` is de ENIGE bron voor elke bezoekerstekst die niet door een
  beheerder getypt is: de Worker gebruikt hem voor haar 422-antwoorden, de
  plugin in PHP, en de browser-JS leest hem uit `data-mymmo-messages`. Zo staat
  dezelfde zin nooit op drie plekken. De enige uitzondering is
  `Mymmo_Forms_I18n::NOODTEKSTEN`, voor als het formulier zelf niet geladen kon
  worden — dan is er geen catalogus.
- **De instellingenpagina heeft twee tabbladen, en de volgorde is het punt.**
  "Shortcode maken" staat vooraan (wekelijks bezoek, niets dat stuk kan),
  "Verbinding" erachter (eenmalig). Ze stonden eerst onder elkaar met de
  sitesleutel bovenaan; wie een shortcode kwam halen, scrolde elke keer langs
  een tekstveld dat bij een verkeerde toetsaanslag elk formulier op de hele site
  tegelijk onderuithaalt.
- **De veldenlijst van het koppelingsscherm heeft DRIE bronnen.**
  `S().detailFormFields` wordt gevuld in `forminator-sync-v2-detail-lifecycle.js`,
  en welke tak er loopt hangt af van `source_type`:
  `generic_webhook` → `extractGenericWebhookFields()` (afgeleid uit de payload
  van de laatste inzending); `om_form` → `fetchOmFormFields()` (uit de
  formulierdefinitie); anders, met een `forminator_form_id` →
  `fetchDetailFormFields()` (via de WP-API).
  Die middelste tak ontbrak aanvankelijk, en dat is niet zichtbaar als een fout:
  een OM-koppeling heeft geen `forminator_form_id` en bij een nieuwe koppeling
  ook nog geen inzending, dus de keuzelijst bij Veldkoppelingen bleef gewoon
  leeg. Voeg je ooit een vierde bronsoort toe, dan hoort ze hier een tak te
  krijgen.
  `fetchOmFormFields()` zet de HERKOMSTVELDEN er ongevraagd bij (`meta_ovme_uuid`
  en co, uit `/api/forms/meta` → `META_KEYS`). Zonder dat kan je de bezoeker-UUID
  pas mappen nadat de eerste inzending binnen is — en dat is precies de inzending
  waarvan je de herkomst dan kwijt bent. De labels ervoor staan in `META_LABELS`
  in `routes.js`; de SLEUTELS blijven `META_KEYS` in `forms/schema.js`.
  Na het opslaan in de bouwer wordt die lijst meteen ververst: anders moet je de
  koppeling sluiten en heropenen voor een net toegevoegd veld verschijnt, en
  niets op het scherm vertelt je dat.
- **Er zijn TWEE vormen van de formulierwaarden, en ze blijven gescheiden.**
  `normalizedForm` (ruw: `lift,water_verwarming`, `2026-09-27T11:39:39+00:00`)
  gaat naar Odoo-velden, voorwaarden, zoekdomeinen en de Calendly-fase.
  `displayForm` (`buildDisplayForm()` in `display-values.js`: labels i.p.v.
  optiesleutels, `, ` als scheiding, tijdstippen als "27 september 2026 om
  13:39" in Europe/Brussels) is ALLEEN voor tekst: chatter, activiteit, mail,
  pdf, de HTML-samenvatting. Zet nooit een label in een Odoo-veld: de sleutel
  ligt vast, het label mag morgen anders geformuleerd zijn.
  De labels reizen als `value_labels` (`{veld: {waarde: label}}`) op het
  hoogste niveau van de payload, NIET in `form_data` -- anders wordt elk label
  een mapbaar veld. Twee bronnen: de opties van een OM-keuzeveld (vult
  `forms/submit.js` zelf, en die winnen) en de HTML-stappen in WordPress
  (`Mymmo_Forms_Steps::waarde_labels()`, per `data-waarde` de tekst van het
  `-label`/`-titel`-kind). Een inzending zonder `value_labels` (van vóór plugin
  1.18.4) krijgt een terugval: `teveel_fouten` wordt "teveel fouten".
  De indieningenlijst en het chatter-voorbeeld krijgen dezelfde omzetting van
  de server mee (`display_values` op `GET /api/integrations/:id/submissions`),
  zodat er geen tweede kopie in de browser bestaat. Gebruik ze enkel voor
  WEERGAVE (`leesbarePayload()`), nooit voor de ketens of de afspraakstand.
- **De indieningenlijst SLAAT DE PAYLOAD PLAT voor ze erin zoekt.** Een
  Forminator-inzending heeft haar velden bovenaan in `source_payload`; een
  inzending van een OM-formulier heeft ze een niveau dieper, onder `form_data`.
  `parsePayload()` in `forminator-sync-v2-detail-submissions-tab.js` voegt de
  omhulsels (`form_fields`, `form_data`, `data`, `submission`, `raw` — dezelfde
  lijst die `normalizeFormValues()` accepteert) samen met het bovenste niveau,
  waarbij bovenliggende sleutels winnen. Zonder die platslag toonde elke kolom
  een streepje terwijl alle waarden gewoon in de payload zaten, en zei de
  samenvattingsregel letterlijk `form_data: [object Object]`.
- **Status `received` betekent: bewaard, pipeline overgeslagen.** Dat gebeurt
  als de koppeling UIT staat (`skipPipeline: !integration.is_active` in
  `submitFormEntry`/`handleGenericWebhook`) — de bewuste veiligheidsklep waarmee
  je een formulier op een testpagina kan zetten zonder dat er iets in Odoo
  verandert. Ze hoort in `statusMeta` te staan met een leesbaar label, en de
  uitklaprij hoort te zeggen dat de koppeling uit staat en dat Replay de weg
  terug is. Zonder dat is het een naamloos grijs bolletje met een lege `{}`
  eronder, en dat leest als een storing terwijl er niets stuk is.
  `received` staat daarom OOK in de lijst statussen die replay toestaan: replay
  is de enige manier om zo'n inzending alsnog te verwerken. Staat de koppeling
  op dat moment nog uit, dan is de knop zichtbaar maar uitgeschakeld met de
  reden in de tooltip — drukken zou opnieuw op `received` uitkomen.
- **De replaybare statussen staan op TWEE plekken en dat is bewust.**
  `REPLAYABLE_STATUSES` in `worker-handler.js` beslist; `REPLAYBARE_STATUSSEN`
  in `forminator-sync-v2-detail-submissions-tab.js` bepaalt of de knop er staat.
  Eén bron kan niet: het ene is Worker-code, het andere browsercode zonder
  modules. Lopen ze uit elkaar, dan zie je dat niet in de code maar wel op het
  scherm — een knop die antwoordt met `Replay not allowed for status: ...`.
  `replay-status-parity-test.mjs` leest beide lijsten en vergelijkt ze, in
  beide richtingen: een knop zonder recht én een recht zonder knop zijn allebei
  fout. Voeg je een status toe, doe dat op beide plekken.
- **Bij een Calendly-koppeling toont de lijst één rij per AFSPRAAK, niet per
  webhook.** Calendly stuurt per boeking meerdere gebeurtenissen, en een
  verplaatsing is bij hen geen wijziging maar een annulatie plus een nieuwe
  afspraak met een nieuw `event_uuid` — waardoor dezelfde afspraak drie keer in
  de lijst stond als drie losse rijen die niets van elkaar wisten.
  `bouwKetens()` in `forminator-sync-v2-detail-submissions-tab.js` legt de
  verbindingen: hetzelfde `event_uuid` is dezelfde boeking, en
  `old_invitee_uuid`/`new_invitee_uuid` knopen de boekingen van een verplaatsing
  aan elkaar. Dat gebeurt als samenhangende verzameling (union-find) en niet met
  een lus over paren, want de webhooks kunnen in elke volgorde binnenkomen en
  een keten kan meer dan twee schakels tellen. De NIEUWSTE inzending voert de
  rij aan; de oudere staan ingeklapt eronder achter een `+N`-knop, met hun eigen
  spoor en hun eigen replay-knop — ze verdwijnen dus niet.
- **De kolom "Afspraak" zegt iets anders dan het statusbolletje, en dat is het
  punt.** Het bolletje links gaat over de PIPELINE (is de indiening verwerkt);
  de kolom Afspraak gaat over de AFSPRAAK zelf: aankomend / voorbij / verplaatst
  / geannuleerd (`afspraakStand()`). Een annulatie is voor de pipeline een
  geslaagde indiening — groen bolletje — terwijl de afspraak niet meer bestaat.
  `canceled` + `rescheduled` samen is Calendly's manier om te zeggen "opgeheven
  ten voordele van een nieuwe" en mag er nooit als een annulatie uitzien; het
  aantal verplaatsingen staat als klein cijfer naast het icoon, zodat je het
  ziet zonder de keten open te klappen.
- **De indieningentabel is `table-fixed w-full`, niet auto-layout.** Bij
  auto-layout bepaalt de langste waarde de kolombreedte, en dan duwt één
  e-mailadres of een kolomkop als "Waar kunnen we je mee helpen?" de tabel
  voorbij de rand — met een horizontale scrollbalk tussen jou en de
  actieknoppen. De vaste kolommen (status, ID, mail, datum, actie) krijgen een
  expliciete breedte in rem (bij `table-fixed` doet `w-px` niets meer), de
  gekozen velden delen wat overblijft, en waarden worden afgekapt met `truncate`
  plus de volledige tekst in `title`. De breedte van de actiekolom volgt het
  aantal knoppen dat er maximaal in staat.
  Kolomkoppen krijgen `truncate`, geen `break-words`: een kop als "Waar kunnen we
  je mee helpen?" wikkelt niet netjes in een smalle kolom maar loopt over de
  buurkolom heen. Afkappen houdt de koprij op één regelhoogte; de volledige kop
  staat in `title`.
  `submissions-list-test.mjs` meet `scrollWidth` tegen `clientWidth` op twee
  schermbreedtes, en vergelijkt de randen van de koppen onderling om overlap te
  vangen. Die test draagt een eigen mini-stylesheet met de handvol
  Tailwind-klassen waarop de indeling steunt: zonder CSS zou `table-fixed` niets
  doen en zou de meting groen zijn om de verkeerde reden.
- **UTM's vallen terug op de cookie.** Staat er geen `utm_*` in de URL van de
  pagina, dan gebruikt de plugin de cookie die het tracking-script dertig dagen
  bewaart. Zo houdt iemand die vorige week via een campagne binnenkwam en
  vandaag pas invult, toch zijn herkomst. De URL wint, want die is recenter.
- **Herkomst gaat als `meta_<naam>` IN `form_data`**, niet als een los meta-object:
  `normalizeFormValues()` kijkt nergens anders, dus buiten `form_data` zou
  `meta_utm_source` onbereikbaar zijn in het koppelingsscherm. Bewust een
  underscore en geen punt — die vorm gebruikt `normalizeFormValues()` al voor
  samengestelde velden (`name-1.first-name`).
- **De site komt uit de SLEUTEL, niet uit de body.** `FORMS_PUBLIC_SITE_KEYS` is
  komma-gescheiden met een optionele naam ervoor (`openvme:abc123`); die naam wordt
  `meta_site`. Zou de site het zelf mogen meesturen, dan kan ze liegen over haar
  herkomst.
- **`field_key` ligt VAST zodra het formulier een inzending heeft.** Die sleutel
  staat in `fs_v2_mappings.source_value` van elke stap en in elke bewaarde
  `source_payload`; hernoemen of verwijderen laat een stap zonder foutmelding een
  leeg veld naar Odoo schrijven. `getUsedFieldKeys()` leest de laatste 500
  inzendingen, `validateFormDefinition({lockedKeys})` weigert het, en de bouwer zet
  het veld op slot MET de reden erbij. Het LABEL mag altijd wijzigen.
- **De ETag komt uit `fs_v2_forms.version`, nooit uit een tijdstip.** Zelfde les als
  `meta.generated_at` in de events-API: een timestamp in de ETag betekent dat
  `If-None-Match` nooit matcht en elke verversing de volledige body ophaalt.
- **Een concept geeft 404, niet 403.** Dat iets bestaat is zelf informatie, en zo
  kan een half afgewerkt formulier nooit per ongeluk op een pagina staan.
- **`odoo_field_type` vult `fs_v2_field_transforms` AAN, overschrijft nooit.**
  Iemand kan er bewust een many2one met een eigen `value_map` van gemaakt hebben;
  dat stil terugzetten breekt een werkende koppeling zonder zichtbare wijziging.
  Mislukt het aanvullen, dan is het formulier wél bewaard (best-effort).
- **De bouwer is een CANVAS-editor, geen lijst met invoervelden.** Links het echte
  formulier in een iframe, rechts een inspecteur. Je klikt een veld aan in het
  voorbeeld en typt erin; label, hulptekst, titel, introtekst, knoptekst en de
  labels van keuzerondjes zijn `contenteditable` IN het voorbeeld. De inspecteur
  bevat alleen wat je niet kan typen: veldtype, veldnaam, verplicht, breedte,
  Odoo-type, keuzes en de stijl. **Zet label of hulptekst daar nooit óók als
  invoerveld bij** — dat is precies het tweede bewerkscherm waar de regel van de
  maileditor over gaat ("Je bewerkt IN het voorbeeld, niet in een blokkenlijst
  ernaast"). De eerste versie van dit bestand was wél zo'n lijst en was
  onbruikbaar.
- **Typen hertekent het canvas NIET.** Tekst wijzigen werkt de toestand bij en
  verandert hoogstens één tekstknoop of één attribuut; `tekenCanvas()` (die de
  `srcdoc` opnieuw zet) draait alleen bij STRUCTURELE wijzigingen: veld erbij,
  weg, verplaatst, ander type, keuze erbij/weg, breedte, verplicht. De
  browsertest zet een merkteken in het iframe dat een hertekening zou wissen.
  Een stijlwijziging vervangt enkel de CSS-variabelen, ook geen hertekening.
- **De plaatsaanduiding voor lege tekst is een CSS-`::before` op een LEEG
  element** (`[data-om-leeg]:empty::before`), nooit een `<span>` met tekst erin.
  Stond ze als echte tekst in de contenteditable, dan typ je ertussen en krijg
  je "latbel" in plaats van "label". Een leeg inline-element heeft bovendien
  geen afmetingen, dus het krijgt `display:inline-block` met een `min-width` —
  anders kan je een net toegevoegd veld letterlijk niet aanklikken.
- **De veldnaam VOLGT het label** tot je hem zelf aanpast (`_autoKey`), en de
  waarde van een keuze volgt haar label (`_autoValue`). Alleen bij de eerste
  toetsaanslag afleiden gaf "T" voor "Type gebouw". Die interne vlaggen worden
  bij het opslaan uit de payload gestript.
- **De opties van een KEUZELIJST zijn native `<option>`-elementen** en dus niet
  in het voorbeeld te bewerken; dat gaat via de inspecteur. De waarde moet daar
  evengoed afgeleid worden, anders gooit `validateFormDefinition` de optie weg
  en weigert de server het formulier met "minstens een optie".
- **Een veld op slot is `disabled` en levert geen waarde**; de bouwer houdt de
  toestand aan in plaats van de DOM uit te lezen, dus de sleutel blijft staan.
- **`public/mymmo-forms.css` is de ENIGE bron van de formulier-stylesheet.** De
  OM serveert hem voor het voorbeeld-iframe (dat draait op precies die CSS, zodat
  het niet kan liegen over hoe het formulier eruitziet) en
  `wp-plugin/build-mymmo-forms.sh` kopieert hem bij het bouwen in de plugin.
  Bewerk `wp-plugin/mymmo-forms/assets/css/mymmo-forms.css` nooit rechtstreeks.
- **Er zijn TWEE renderers, en dat is bewust.** `templates/partials/field.php`
  maakt wat een bezoeker krijgt; `public/forminator-sync-v2-form-preview.js`
  maakt het aanklikbare voorbeeld. `form-preview-parity-test.mjs` haalt dezelfde
  velden door beide en vergelijkt elementsoort, `mymmo-form-*`-klassen en
  invoertypes. Voeg je een veldtype toe, dan krijgt het op BEIDE plekken een tak.
  Die test vond meteen echte drift (heading en paragraph misten hun
  `mymmo-form-field--<type>`-klasse in PHP).
- **"Nieuwe koppeling" is een keuze uit drie bronnen** — Formulier, Webhook,
  Trackbare link — in een dialoog die de koppeling meteen aanmaakt en je op het
  juiste tabblad van het detailscherm zet. De oude driestappenwizard bestaat nog
  en is bereikbaar via `goto-wizard-legacy` onderaan die dialoog; ze is nodig
  zolang er Forminator-formulieren gekoppeld moeten kunnen worden, en haalt haar
  formulierlijst via `WP_API_TOKEN` bij WordPress.
- **De plugin bewaart niets.** Geen custom post type, geen tabellen, geen
  inzendingen — enkel een cache in twee lagen (transient + last-known-good option),
  zoals `mymmo-events`. De browser post naar `admin-post.php` en PHP praat
  server-naar-server met de Worker: zo blijft de sitesleutel serverside.
- **De plugin stuurt GEEN mail.** Dat doet de `send_mail`-stap van de koppeling —
  daar staat de editor en daar staat de Postmark-opvolging.
- **Antispam zonder captcha:** honeypot, minimale invultijd (tijdstempel ondertekend
  met `wp_hash()`), WordPress-nonce, en rate limit per sitesleutel in de Worker.
  Turnstile is de volgende stap als dit niet volstaat — een captcha kost inzendingen.
- **Het `theme`-veld gaat door een GESLOTEN lijst.** `mymmo_forms_theme_style()`
  laat enkel bekende variabelen door, en enkel waarden die eruitzien als een kleur
  of een lengte. Vrije CSS vanuit de OM zou een injectiepad zijn naar elke site die
  het formulier toont.

**Uitrolvolgorde (niets aan Forminator aanraken):** migratie + bouwer → publieke API
met `curl` testen (een submit op een INACTIEVE koppeling bewaart de payload en slaat
Odoo over, `skipPipeline`) → plugin op één testpagina → één formulier met laag volume
parallel → per formulier uitrollen, minstens twee weken tussen "shortcode gewisseld"
en "Forminator-formulier gedeactiveerd". Pas als alles over is:
`wp_form_schemas`/`wp_sites`, de `openvme/v1`-endpoint, `FORMINATOR_WEBHOOK_SECRET`
en de subsequence-heuristiek opruimen.

**Nieuwe secrets:** `FORMS_PUBLIC_SITE_KEYS` (verplicht — zonder is de publieke API
dicht, niet open) en optioneel `FORMS_PUBLIC_ORIGINS` voor CORS.

**Nog niet gebouwd, bewust:** bestandsupload, betalingen, meerstaps-formulieren,
berekeningen en voorwaardelijke velden. Voorwaardelijke velden zijn de meest
waarschijnlijke eerste uitbreiding; het schema laat er ruimte voor.

---

## Koppelingen — meerstapsformulieren in WordPress (2026-09)

**Regel: een formulier kan in WordPress voorafgegaan worden door eigen
HTML-stappen. Die HTML woont in WORDPRESS, nooit in de OM. Een stap levert
waarden af in de VERBORGEN VELDEN van het formulier; het formulier is de laatste
stap en er is maar één POST.**

Dit was uitdrukkelijk als "bewust nog niet gebouwd" opgeschreven bij de
OM-formulieren. Het is er nu, maar aan de kant waar de vrijheid al bestond.

| Wat | Waar |
|---|---|
| Opslag + rechten + vorige versie | `wp-plugin/mymmo-forms/includes/class-steps.php` (option `mymmo_forms_steps`) |
| Copy van een stap (`origineel => nieuw`) + de scanner | `Mymmo_Forms_Steps::render_html()` / `save_tekst()` in datzelfde bestand |
| Die copy typen in het voorbeeld | `maakStapTekstBewerkbaar()` in `assets/js/mymmo-forms-preview.js` |
| De reeks tekenen (+ noscript-terugval) | `wp-plugin/mymmo-forms/templates/steps.php` |
| Kiezen tussen formulier en reeks | `mymmo_forms_render_body()` in `includes/helpers.php` |
| De gedeelde stijlcascade | `mymmo_forms_wrap_style()` in `includes/helpers.php` |
| De reeks in de browser | `assets/js/mymmo-forms-steps.js` |
| Omlijsting (bolletjes, knoppen) | `assets/css/mymmo-forms-steps.css` |
| Tabblad "Stappen" + de uitleg erbij | `includes/class-settings.php` (`render_stappen()`) |
| Code-editor + voorbeeld invoegen | `assets/js/mymmo-forms-steps-admin.js` |
| Meegeleverde voorbeeldstappen | `voorbeelden/gebouwgrootte.html` (schuifbalk), `voorbeelden/gebouwkenmerken.html` (meerkeuze-keien, zelf aan te vullen) en `voorbeelden/huidig-beheer.html` (enkelvoudige keuze) en `voorbeelden/algemene-vergadering.html` (jaarwiel met speld en een marge van twee weken). Registreren in `Mymmo_Forms_Steps::examples()`, anders staat een nieuw bestand niet in de keuzelijst van wp-admin. Verzin hier geen extra "demo"-stappen bij: er stond er een (`aantal-gebouwen.html`) die niemand gevraagd had, en die is geschrapt. |
| Een stap uitproberen zonder WordPress | `php wp-plugin/mymmo-forms-stap-preview.php <naam> > proef.html` (voeg `flash` als tweede argument toe voor de mislukte-inzending-stand) |
| De drie nieuwe opschriften | `MESSAGES` in `forms/schema.js` (`back`, `next`, `step_of`) |

Afspraken die bewust zo zijn:

- **De HTML/JS komt NIET uit de OM.** Die serveert hetzelfde formulier aan
  meerdere sites; dat is precies waarom `theme` daar door een gesloten lijst
  gaat. Vrije JavaScript vanuit de OM zou datzelfde injectiepad zijn, maar dan
  zonder grens. In WordPress bestaat het recht om dat te mogen al —
  `unfiltered_html`, hetzelfde als voor een Custom HTML-blok — en `may_edit()`
  vraagt er expliciet naar, niet naar `manage_options`. Op een multisite heeft
  een gewone sitebeheerder het daardoor bewust niet.
- **De waarde staat METEEN in het verborgen veld, niet pas bij het versturen.**
  Eén bron van waarheid, en dat is de DOM. Een JS-object dat op het einde
  weggeschreven wordt, heeft een moment waarop de twee kunnen verschillen — en
  dat zie je niet op het scherm, alleen in Odoo, als een leeg veld. Gevolg dat
  je gratis krijgt: na een mislukte inzending komen de waarden via `oude_waarden`
  gewoon terug uit de POST, dus er is geen tussenopslag en geen sessionStorage.
- **Bestaat het verborgen veld niet, dan wordt de BEZOEKER niet geblokkeerd.**
  `zet()` bewaart zo'n waarde alsnog in `this.los` en `lees()` haalt ze daar op.
  Zonder dat blijft `lees()` eeuwig leeg, blijft de stap eeuwig "niet klaar" en
  staat een bezoeker vast op een scherm waarvan "Volgende" nooit aangaat — voor
  een fout die hij niet kan zien en die niet de zijne is. Het is een
  beheerdersprobleem, en het staat dus in de console én als melding boven het
  formulier (`$zwevend` in steps.php). Zelfde principe als `reminderTooLate()`:
  falen naar "laat door".
- **Zonder JavaScript vallen de HTML-stappen WEG en staat het formulier er
  meteen.** Niet "toon stap 1" — daar kom je nooit voorbij. Dat gebeurt met een
  `<noscript><style>` en niet met een klasse die JS moet zetten, want dan
  flikkert het voor iedereen die JS wél heeft. De `!important` daarin is de
  enige in deze stylesheets en moet er zijn: hij overrult het
  `hidden`-attribuut van de browser.
- **De stappen worden SERVER-SIDE uitgeschreven, nooit met innerHTML
  ingevoegd.** Een `<script>` dat via innerHTML in de pagina komt, wordt door de
  browser niet uitgevoerd — dan doet een interactieve stap gewoon niets, zonder
  foutmelding. Om dezelfde reden werkt het voorbeeld in de shortcode-bouwer wél:
  dat iframe krijgt zijn inhoud via `srcdoc`.
- **Er staat een inline bootstrap-script VÓÓR de eerste stap.** Het script van
  een stap draait tijdens het PARSEN, en `mymmo-forms-steps.js` staat in de
  voettekst — dus `window.MymmoStappen` moet al bestaan. Dat stukje bewaart de
  aanmeldingen in een rij die het echte script daarna afwerkt. Het wordt één
  keer per pagina geschreven (`MYMMO_FORMS_STAPPEN_BRUG`).
- **Een stap meldt zich aan met `document.currentScript`, niet met een id.**
  Dezelfde stap kan twee keer op een pagina staan (in de tekst én in een
  pop-up), en dan mogen de twee elkaars waarden niet overschrijven. Om dezelfde
  reden staat er in `voorbeelden/gebouwgrootte.html` geen enkele `id=""` en
  loopt alles via `api.el.querySelector()`.
- **Het zoeken naar het verborgen veld gaat binnen `.mymmo-form-grid`**, niet
  binnen het hele `<form>`. Daar staan ook de verborgen velden van WordPress
  zelf (`action`, `_wpnonce`, de redirect); een stap met de sleutel `action` zou
  anders de POST onbruikbaar maken.
- **`--mf-pad-x/y` en `--mf-panel-pad-x/y` bestaan niet meer** (weg in 1.15.4).
  Ze waren de twee pogingen om dezelfde vraag op twee plekken te beantwoorden:
  `--mf-pad-*` werd door drie dingen gelezen (`.mymmo-form-wrap`,
  `.mymmo-stappen` en `.mymmo-modal-paneel`), dus `padding_x` op de shortcode
  verzette ook het hele paneel; `--mf-panel-pad-*` gaf het paneel daarna een
  eigen paar, waarna de OPTELLING in een stappenreeks bleef staan. De opvulling
  staat nu vast, zie de regel hierboven. Heeft een nieuw element opvulling nodig,
  geef het een eigen waarde en maak ze niet instelbaar tenzij iemand er echt aan
  moet kunnen draaien.
- **Een tabkop zonder regeltje krijgt `mymmo-modal-tab--kaal`** (gezet in
  modal.php) en wordt daarmee verticaal gecentreerd. In de zijkolom staat
  `align-items: flex-start`, want met een regeltje eronder hoort het icoon bij de
  EERSTE regel te staan; zonder regeltje bleef er ruimte onder de titel open.
  Bewust een klasse en geen `:has()`: dat zou op een oudere browser stil
  wegvallen, en dan is het verschil onzichtbaar tot iemand het meldt.
- **Er is geen voortgangsbalk meer, alleen de teller** ("Stap 1 van 3", weg sinds
  1.15.10 op vraag). Zet hem niet terug zonder dat het gevraagd wordt. Komt hij
  ooit terug: het is een `<ol>`, en een blokthema zet `ol { flex-direction:
  column }` en `ol:not(...) { padding-left }` -- noem dus zelf de richting en
  zet twee klassen op elke regel, anders staan er onzichtbare streepjes van 0px.
- **Een stap brengt GEEN eigen omlijsting mee.** Geen kop, geen kaartje, geen
  randen, geen eigen Vorige/Volgende. Dat levert de plugin al: `steps.php`
  schrijft de titel van de stap uit (`mymmo-stap-titel`), het paneel van de
  pop-up is het witte vlak, en de knoppenrij hoort bij de reeks. Bracht de stap
  het zelf mee, dan stond alles twee keer -- en de tweede kop was voor de
  gebruiker niet uit te zetten zonder de HTML te bewerken. Een stap gaat over de
  VRAAG en het BEDIENINGSELEMENT; de omlijsting en het opvangen van de antwoorden
  zijn van de plugin. Randen op de bediening zelf (het vinkje, de schuifknop)
  zijn geen omlijsting en horen er wel.
- **EEN opvulling, en die is van de PLUGIN. Een stap zet er nooit zelf een bij.**
  De ruimte tot de rand van het venster staat op één plek -- `.mymmo-modal-paneel`
  in `mymmo-forms-modal.css` -- met een vaste waarde per schermbreedte: **40px**
  vanaf 900px, **32px** daaronder, **24px** op een telefoon. Niet instelbaar, en
  bewust geen CSS-variabele: een ontsnappingsluik dat niemand zet, is een
  ontsnappingsluik dat niemand test.
  Tot 1.15.4 waren het er twee. De wikkel eronder (`.mymmo-form-wrap` en
  `.mymmo-stappen`) had zijn eigen `--mf-pad-x/y` uit `padding_x`/`padding_y` op
  de shortcode of uit het thema van de OM. Voor het FORMULIER haalde het venster
  die er weer af, voor een STAPPENREEKS niet -- dus stond dezelfde inhoud op het
  ene tabblad 28px van de rand en op het andere 44px. Dat is niet te zien zolang
  je één tabblad tegelijk bekijkt, en daarom bleef het maanden staan.
  Wat je in een nieuwe stap dus NIET doet: `padding` op de buitenste wikkel van
  je stap, `margin` om "wat lucht" te maken aan de zijkanten, of een breedte die
  van de rand wegblijft. Je stap begint op de rand van het vlak dat je krijgt.
  Opvulling BINNEN de bediening (een knop, een kaartje dat je bewust toont) is
  iets anders en mag.
  Wat wel instelbaar blijft is `gap` (`--mf-gap`): de ruimte TUSSEN de velden.
  Die telt nergens dubbel.
- **De stap vult de hoogte; de knoppenrij hoort tegen de onderrand.** De ketting
  paneel → `.mymmo-stappen` → `.mymmo-stap` → `.mymmo-stap-inhoud` is een
  flexkolom waarin elk niveau `flex: 1 0 auto` heeft (`mymmo-forms-steps.css`).
  De plugin bepaalt alleen DÁT er ruimte te verdelen is; wat ermee gebeurt,
  bepaalt je stap: maak je buitenste wikkel `display: flex; flex-direction:
  column` en zet `margin-top: auto` op het blok dat naar beneden moet. De vraag
  blijft dan bovenaan bij de titel staan en de bediening zakt naar de knop toe,
  zoals in `voorbeelden/gebouwgrootte.html`.
  `flex-shrink` staat overal op 0: past de stap niet, dan SCROLT het paneel. Reken
  er dus niet op dat iets meekrimpt.
  `margin-top: auto` wordt 0 zodra er niets te verdelen is (een laag venster, of
  de stap in een pagina). Wil je daar toch een minimumafstand, zet die als
  `padding`, niet als `margin` -- de margin is dan al opgebruikt.
  **Een stap die al in WordPress bewaard staat, is een kopie** en krijgt een
  wijziging aan `voorbeelden/*.html` niet vanzelf. Zeg dat erbij.
- **Een REEKS is geordend; een keuzelijst is dat niet.** `steps="a,b"` en
  `steps="b,a"` zijn twee verschillende formulieren, dus een `<select multiple>`
  kan dit niet: die geeft de volgorde van de OPTIES terug, niet die van je
  keuzes. De bouwer gebruikt daarom `render_stap_kiezer()` (class-settings.php):
  een lijst met ↑ ↓ ×, gevoed vanuit één VERBORGEN VELD met de komma-gescheiden
  waarde. Dat veld houdt hetzelfde id als de oude keuzelijst, zodat
  `waardeVan()`, `zetVeld()` en de luisteraars in mymmo-forms-admin.js
  ongewijzigd blijven werken; de `<ul>` is enkel weergave.
  Twee dingen die daarbij horen en makkelijk vergeten worden: na `zetVeld()` moet
  `tekenStapKiezers()` draaien (anders verandert de waarde wel en de lijst niet),
  en `schrijfStappen()` moet zelf een `input`-event afvuren (anders verandert de
  lijst wel en de shortcode niet). Allebei onzichtbaar tot je plakt.
- **EEN MERKKLEUR REKEN JE NIET UIT. Je vraagt ze, of je leest ze.** Dit is
  tweemaal na elkaar misgegaan met de kleur voor Calendly, en de tweede keer was
  erger dan de eerste.
  De feiten, GEMETEN op hun eigen boekingspagina met `primary_color=99f6e4`
  (niet aangenomen -- de pagina rechtstreeks openen is same-origin, dus de
  computed styles zijn gewoon te lezen):

  | wat | waarde |
  |---|---|
  | beschikbare dag, achtergrond | `rgb(240,247,245)` -- tint die Calendly zelf afleidt |
  | beschikbare dag, cijfer | `rgb(153,246,228)` -- EXACT `primary_color` |

  `text_color` raakt dat cijfer niet (getest met `000000`). "Fel vlak met zwarte
  cijfers" bestaat daar dus niet: het cijfer IS de kleur die je meegeeft.
  Wat er toen fout ging: ik heb die kleur in HSL donkerder gerekend tot ze 4,5:1
  haalde. Resultaat `#0c846d` -- leesbaar, zelfde tint, en in GEEN ENKEL palet
  van de klant te vinden. Een afgeleide kleur is geen merkkleur, hoe net de
  berekening ook is.
  De regel die daaruit volgt, en die breder geldt dan Calendly:
  1. **Lees het palet** voor je een kleur kiest. Op een WordPress-site staat het
     als `--wp--preset--color--*` op `:root` en is het met een paar regels JS uit
     te lezen; in de OM staat het in het `theme`-blok van het formulier.
  2. **KIEZEN uit het palet mag, OMREKENEN niet.** `mymmo_forms_leesbaarste_hex6()`
     krijgt kandidaten en geeft er letterlijk een van terug: de leesbaarste op
     wit. Voor Calendly zijn dat de accentkleur en de tekst die erop staat (het
     PAAR van het merk, elk uit de cascade shortcode > site > formulier); bij
     Syndicoach wint `#0369a1`. `calendly_color` op de shortcode wint van alles.
  3. **Twee inkten, twee betekenissen.** `--mf-accent-text` is de kleur OP de
     accentkleur (tekst op een mint knop). `--mf-accent-ink` is de leesbare
     merkkleur OP WIT (een getal, een schuifknop, een tijdstip). Verwissel je ze,
     dan staat er mint op wit of donkerblauw op donkerblauw.
  4. **Wat er in de agenda NIET kan**, gemeten: `primary_color` IS het dagcijfer
     en de tijdstippen, het vlak is een tint die Calendly er zelf van maakt, en
     `text_color` raakt het cijfer niet. Het blok bovenaan gaat weg met
     `hide_event_type_details=1`. Alles binnen `.booking-kit_*` is een iframe van
     calendly.com: geen `flex-wrap`, geen bredere tijdstippen, geen zwart cijfer
     op een fel vlak. Beloof dat niet -- de enige weg is een eigen kiezer tegen
     de API.
- **De COPY van een stap staat naast de HTML, niet erin.** In het voorbeeld van
  de bouwer klik je een titel, een regel uitleg of een label aan en typ je erin;
  dat wordt meteen bewaard in `fs_v2`-stijl als `origineel => nieuw` op het
  STAP-record (`teksten` in `Mymmo_Forms_Steps`), en bij het renderen worden de
  TEKSTKNOPEN van de HTML vervangen (`render_html()`). Nooit de HTML zelf
  herschrijven: dan ben je het origineel kwijt en overleeft je copy het opnieuw
  inladen van het bestand niet -- wat de hele reden van dit ontwerp is.
  De scanner in `vervang_tekstknopen()` is met de hand geschreven en niet
  DOMDocument: dit is een FRAGMENT met `<style>` en `<script>` erin, en
  DOMDocument maakt daar een heel document van en herschrijft wat een beheerder
  zelf typte. Hij raakt alleen wat TUSSEN twee tags staat -- attributen blijven
  dus met rust, en `<script>`/`<style>`/`<textarea>` worden overgeslagen.
  De sleutel is de TEKST zelf (gedecodeerd, witruimte samengetrokken). Gevolg:
  dezelfde zin die twee keer in een stap staat, verandert twee keer. Bedoeld.
  Bij het bewaren wordt de KETTING gevolgd: is de meegestuurde "originele" tekst
  de WAARDE van een bestaande regel, dan wordt die regel bijgewerkt in plaats van
  dat er een tweede naast komt die nooit meer grijpt. Terugtypen naar de
  oorspronkelijke zin wist de regel.
  **Een tekstaanpassing hoort bij de STAP en geldt dus in elk formulier waar die
  stap in staat.** Dat is gevraagd gedrag, geen bijwerking: zeg het erbij in de
  UI (de bouwer meldt het na elke bewaaractie), want het reikt verder dan het
  scherm waar je op staat.
- **De kop van de LAATSTE stap komt van de shortcode, en anders uit de OM; die van
  een HTML-stap van het stap-record.** `form_title`/`form_sub` horen bij de
  PLAATSING (dezelfde velden verdienen in een ander venster een andere aanhef);
  staan ze leeg, dan toont `steps.php` de naam en de inleiding van het formulier
  zoals ze in de OM staan (in de taal van de pagina), en zet het formulier zijn
  eigen titel en inleiding uit -- anders staan ze er twee keer. `title`/`sub` horen
  bij de stap.
  Diezelfde kop staat ook boven een formulier ZONDER stappen in de pop-up ("Stuur
  een bericht"), tenzij `form_heading="no"`. Er is EEN functie voor beide:
  `mymmo_forms_form_kop()` in helpers.php. Een [mymmo_form] in een pagina geeft
  `form_heading` niet mee en houdt zijn eigen `.mymmo-form-title`. Allebei renderen ze met exact dezelfde klassen
  (`.mymmo-stap-titel` + `.mymmo-stap-tekst`), zodat stap 1 en stap 2 er
  hetzelfde uitzien en er geen tweede stijl bestaat die uit de pas kan lopen.
- **Het script van een stap bevat uitsluitend ASCII, en geen `&`, `<`, `>` of `</`.**
  Aangescherpt in 1.15.12: live werd `&&` daarna ook `&#038;&#038;` en elke letter
  met een accent een hex-entiteit, waarop het script niet meer parste (console:
  `SyntaxError: Invalid or unexpected token`) en geen enkele kei reageerde. Alleen
  de stap met `loading="lazy"`-afbeeldingen werd geraakt, op een site met een
  lazyload-plugin die `src` naar `data-src` herschreef. Schrijf dus twee geneste
  `if`s in plaats van `&&`, `forEach`/`filter` in plaats van een lus met `<`, en
  commentaar zonder accenten. Afbeeldingen in een stap: `loading="eager"` plus
  `class="skip-lazy no-lazyload" data-no-lazy="1" data-skip-lazy="1"`.
  CONTROLEER het door de verminking na te bootsen (sluit-tags weg, `&` naar
  `&#038;`, niet-ASCII naar `&#x..;`) en `node --check` te draaien: de versie van
  1.15.11 ging daar kapot, de nieuwe niet -- zo weet je dat de proef echt iets
  meet.
  Wat hieronder over sluit-tags staat, blijft gelden:
- **(1.15.11) Het script van een stap bevat GEEN ENKELE sluit-tag (`</`).** Op syndicoach.be
  kwamen sluit-tags die als STRING in het `<script>` van een stap stonden
  (`'</span>'`) niet aan -- ze ontbraken al in de ruwe serveruitvoer -- terwijl de
  markup buiten het script ongeschonden bleef. Alles wat zo'n script met
  `innerHTML` bouwde, nestte daardoor in elkaar; de labels belandden onzichtbaar
  in een vinkje met `opacity: 0`. Waar het in die installatie gebeurt, is van
  buitenaf niet vast te stellen; `vervang_tekstknopen()` is uitgesloten (getest).
  Daarom, voor elke stap:
  1. **Zet wat de bezoeker ziet als MARKUP in het bestand** (knoppen, labels,
     `<img src>`), en laat het script enkel toestanden wisselen. Dat maakt de
     labels meteen ook bewerkbaar in de bouwer -- tekst die een script opbouwt,
     kan `render_html()` niet vinden.
  2. **Moet het script toch iets maken** (een eigen kei van de bezoeker): met
     `createElement` en `textContent`, nooit met een HTML-string.
  3. **Kleine glyphs (vinkje, plus) met CSS**, niet met een SVG in een string.
  Controleer het bij het bouwen: het `<script>`-blok van een voorbeeld mag geen
  `</` bevatten.
- **Geen inline SVG en geen lege elementen in de markup van een stap** (1.15.14, stap 3).
  Op syndicoach.be kwam na een inline SVG met een use-element de sluit-tag van de
  omliggende span niet aan, verdween een leeg vinkje-element en alle witruimte
  tussen de knoppen; de tekst belandde in een rondje van 50px. Afbeeldingen via
  `<img>` kwamen op dezelfde pagina wel door. Teken glyphs met CSS op een element
  dat tekst heeft (`::before`/`::after`), en controleer live met de DOM
  (`outerHTML`), niet met de preview -- daar gebeurt die verminking niet.
- **Een stap tekent zijn illustraties niet zelf.** De merktekeningen staan op
  `https://link.openvme.be/assets/brand/` (gebouwen onder
  `syndicoach-calculator/`, kleine dingen onder `thingies/`). Controleer een
  bestandsnaam met een HTTP-aanvraag voor je hem gebruikt:
  `thingies_vuilniishok.svg` heeft een dubbel i, en de "logische" spelling geeft
  een 404 die je pas op de site ziet.
- **Een stap brengt geen eigen LETTERTYPE mee.** `.mymmo-stappen
  .mymmo-stap-inhoud > *` staat op `font-family: inherit` (twee klassen, dus het
  wint van de `<style>` van de stap). Een stap die uit een losstaande module
  geplukt is, sleept anders zijn eigen systeemstack mee en staat dan zichtbaar
  naast het formulier, dat de letter van de site erft.
- **Een blokthema wint van een losse klassenaam. Reken erop.** WordPress drukt de
  stijlen van het thema INLINE in de `<head>` af, dus ná elke plugin-stylesheet --
  bij gelijk gewicht wint het thema altijd. En `:not()` telt mee voor de
  specificiteit, dus `input:not([type=checkbox], ...)` is (0,1,1) en
  `ol:not(.wp-block-comment-template)` ook: allebei zwaarder dan
  `.mymmo-form-input` (0,1,0). Op syndicoach.be kostte dat vier dingen tegelijk
  (1.15.5): de streepjes van de voortgangsbalk, de schuifbalk, de verzendknop en
  de lettergrootte van de velden.
  Twee regels die daaruit volgen:
  1. **Zet een eigen wikkelklasse voor elke regel die een `<input>`, `<button>`,
     `<ol>`, `<ul>`, `<li>` of `<legend>` van ons raakt** -- `.mymmo-form-wrap
     .mymmo-form-input`, `.mymmo-stappen .mymmo-stappen-bol`. Dat is (0,2,0) en
     wint zonder `!important`, zodat iemand die het écht anders wil nog kan
     winnen.
  2. **Noem wat je bedoelt.** `display:flex` zonder `flex-direction` is een gat
     waar een thema in stapt; de balk stond in kolom omdat wij de richting nooit
     hadden gezet. Hetzelfde voor `padding`, `border` en `height` op een veld:
     een thema zet ze, dus laat ze niet impliciet.
  En test dit NIET in `mymmo-forms-stap-preview.php` of
  `mymmo-forms-venster-preview.php` -- daar is geen thema, dus daar is alles altijd
  goed. De echte controle is de pagina op de site zelf.
- **Een vaste hoogte in een stap geeft een schuifbalk in de pop-up.** Het paneel
  is `overflow-y:auto` binnen een venster van `88vh`. De tekening van
  `gebouwgrootte.html` neemt daarom de VRIJE ruimte in (`flex: 1 1 0` met een
  ondergrens `clamp(110px, 18vh, 180px)`), in een vierkante doos: alle tien de
  tekeningen delen een canvas van 2048x2048, dus zo schalen ze samen en past de
  grootste per definitie. Meet een nieuwe grootte in de pop-up op 900 EN 720 px
  hoog (`scrollHeight` tegen `clientHeight` van het paneel): 24vh als ondergrens
  scrolde bij 720 nog 27px. Gebruik in een nieuwe stap geen vaste pixelhoogte
  voor iets groots.
- **Het bovenste tabblad is ook het tabblad dat openstaat.** `tab` heeft geen
  vaste standaard meer; leeg betekent "de eerste uit `tab_order`". Stond daar
  'form', dan zette je de agenda vooraan en ging het venster alsnog open op het
  formulier -- een knoprij waarvan de tweede knop actief is, leest als een fout.
  Een expliciete `tab="..."` wint nog steeds.
- **De shortcode-bouwer is VAST per tabblad (plugin 1.19).** Eén blok per
  tabblad (wat erin staat + conversiepad), dan Uitzicht (EEN tekening, EEN
  watermerk, elk met schaal/verschuiving/draaien) en Knop. Bewust NIET meer in
  het scherm: tabvolgorde, "welk tabblad opent", regeltjes onder de tabknoppen,
  "+ geruststelling", een tekening per tabblad. Volgorde en actief tabblad van
  een bestaande opstelling staan als VERBORGEN veld, zodat opnieuw bewaren niets
  aan het venster op de site verandert. Zet die bediening niet terug zonder dat
  het gevraagd wordt. Een formulier OP DE PAGINA gaat met het blok "Mymmo
  formulier" (`slug`/`lang`/`title`, met ServerSideRender), niet via de bouwer.
- **Het venster heeft GEEN vaste tabbladen meer.** Tot 1.14 stonden formulier
  en agenda als twee vaste blokken HTML in `templates/modal.php`, en de volgorde
  was de volgorde waarin ze toevallig in het bestand stonden. Sinds 1.15 is er
  EEN lijst (`$tabbladen`) en EEN lus, voor zowel de knoppen als de panelen.
  Een derde tabblad (`extra`) kan een eigen formulier (`extra_slug`) en een
  eigen stappenreeks (`extra_steps`) hebben; het bestaat zodra een van die twee
  ingevuld is. De volgorde komt uit `tab_order` via
  `Mymmo_Forms_Shortcodes::tab_order()`, die ALLEEN bestaande tabbladen
  teruggeeft en wat niet genoemd is achteraan aanschuift -- een typefout kan dus
  nooit een venster zonder tabbladen opleveren. Voeg je een vierde soort toe,
  dan krijgt die een tak in `$tab_bron` en een icoon in `$tab_iconen`; aan de
  lussen verandert niets. `mymmo-forms-modal.js` hoefde niet mee: dat werkte al
  generiek op `data-mymmo-tab` / `data-mymmo-paneel`.
- **Elk paneel krijgt een EIGEN `instance_id`, ook bij hetzelfde formulier.**
  Twee panelen met hetzelfde formulier leveren anders twee keer dezelfde
  veld-id's in een document, en dan wijst elk `<label>` naar het invoerveld in
  het tabblad dat je NIET open hebt staan. Dat is niet te zien en breekt zowel
  het aanklikken van een label als de schermlezer. De rendertest telt daarom
  alle `id="..."` in een venster met drie tabbladen en faalt op elke dubbele.
- **In de bouwer staat de tekening VOORAAN, op een pagina achteraan.** Dat is
  geen bug maar een noodzaak: met `z-index:-1` kan je ze niet aanwijzen om ze te
  verplaatsen. Het verschil was alleen onzichtbaar tot je op de site keek. De
  knop "Tekening achteraan" (`data-mymmo-figuur-laag`) zet de klasse
  `mf-figuur-achter` op het documentelement IN het canvas-iframe; de regel
  `html.mf-figuur-achter .mymmo-modal-figuur{z-index:-1}` wint op specificiteit
  van de bouwer-standaard. De stand leeft BUITEN het iframe (`figuurAchter` in
  `mymmo-forms-preview.js`) en wordt na elke render opnieuw toegepast -- het
  iframe wordt bij elke structurele wijziging opnieuw opgebouwd, en anders
  springt de stand terug midden in het werk. Omzetten hertekent niet: enkel een
  klasse, zelfde regel als bij het typen.
- **Een stap herstelt na een MISLUKTE inzending zijn eigen bediening.** De
  waarden komen terug in de verborgen velden (`oude_waarden` uit de POST), maar
  de HTML van de stap is statisch en staat weer op haar beginstand. Zonder
  herstel ziet een bezoeker de schuifbalk op 8 terwijl hij 42 koos -- en de
  twee spreken elkaar niet zichtbaar tegen, want wat hij ziet klopt met wat er
  dan verstuurd wordt. Alleen niet met wat hij bedoelde. Een stap leest daarvoor
  bij het opstarten `api.lees(sleutel)`; `oogstStap()` draait bij een mislukte
  inzending alleen op het FORMULIER, dus de waarde staat er op dat moment nog.
  Beide meegeleverde voorbeelden doen dit.
- **Een `steps=` die naar niets verwijst laat het formulier gewoon staan**, met
  een melding voor beheerders. Stil de reeks laten verdwijnen betekent dat een
  typefout in de shortcode een leeg verborgen veld naar Odoo stuurt, en daar is
  geen enkel signaal van.
- **Het dankjewelscherm is per TABBLAD, en het is de plek waar de conversie
  gemeld wordt** (1.16). Afbeelding + titel + tekst, `mymmo_forms_render_dank()`
  in helpers.php. Het staat als verborgen sjabloon in elk paneel (voor Calendly,
  dat geen nieuwe pagina laadt, en voor het voorbeeld in de bouwer) en zichtbaar
  in de plaats van het formulier na een geslaagde inzending
  (`mymmo_forms_render_dank_geslaagd()`). Die laatste staat in een wikkel met
  `data-mymmo-slug`, `data-mymmo-doel` en `data-mymmo-tabblad`: mymmo-forms.js
  leest daar `mymmo_formulier_verstuurd` uit (`[data-mymmo-geslaagd]`). Haal je
  die wikkel weg, dan toont het scherm en meldt niemand iets aan GA -- en dat zie
  je nergens.
  Welk tabblad verstuurde, gaat mee als `mymmo_tab` in de POST (gesloten lijst
  `form`/`extra`) en als `tab` in de melding na de redirect. Zonder dat kan een
  venster met twee tabbladen voor hetzelfde formulier niet weten welk scherm het
  moet tonen. Een melding zonder `tab` (van voor 1.16) hoort bij elk tabblad met
  dat formulier.
  In de pop-up wordt NIET meer herladen na versturen (1.16.1): mymmo-forms.js
  post met `fetch()` en `mymmo_ajax=1`, de server antwoordt dan met JSON in
  `Mymmo_Forms_Submit::finish()` in plaats van een redirect. De klassieke weg gaf
  een flits (venster dicht, pagina laden, venster weer open). Zonder JavaScript
  en voor een [mymmo_form] in een pagina blijft de redirect de weg. Krijgt de
  browser GEEN JSON terug maar een gevolgde redirect, dan is de inzending al
  gebeurd: volg die URL, verstuur nooit opnieuw.
  In de bouwer zet "Dankjewelscherm" de klasse `mf-toon-dank` in het canvas; dat
  is enkel CSS in `CANVAS_CSS`, geen hertekening -- zelfde regel als "Tekening
  achteraan".
- **De "Vorige" van de laatste stap gaat IN de knoppenrij van het formulier**
  (`step_back` in form.php), niet in een eigen rij eronder: twee rijen knoppen
  waarvan de onderste niet de belangrijkste is, leest als een fout.
- **"Volgende" wordt niet `disabled` maar `aria-disabled` + een klasse.** Een
  echt uitgeschakelde knop is voor een schermlezer niet aan te wijzen en kan dus
  nooit vertellen waarom je niet verder kan; deze blijft klikbaar en de klik
  wijst naar het veld dat nog leeg is.
- **`mymmo_forms_wrap_style()` is de ENIGE plek waar de stijlcascade staat.**
  Er zijn nu twee wikkels die dezelfde variabelen nodig hebben
  (`.mymmo-form-wrap` en `.mymmo-stappen`), want de knoppen van de reeks staan
  buiten het formulier en erven anders niets. De volgorde is ongewijzigd: thema
  van het formulier → thema van de site → wat er op de shortcode staat.
- **`back`/`next`/`step_of` staan in `MESSAGES` (de OM), met een terugval in
  `Mymmo_Forms_I18n::NOODTEKSTEN`.** MESSAGES blijft de bron — anders staat
  dezelfde zin op drie plekken — maar een plugin die vóór de Worker-deploy
  uitgerold wordt, mag geen naamloze knoppen tonen. `step_messages()` vult aan,
  `messages()` niet.
- **De stijl van de reeks staat NIET in `public/mymmo-forms.css`.** Dat bestand
  is de gedeelde bron van de formulier-stijl en het voorbeeld in de bouwer van
  de OM draait erop; daar bestaat geen stappenreeks. Zelfde afweging als bij
  `mymmo-forms-modal.css`.
- **Nog niet gebouwd, bewust:** het formulier zelf over meerdere stappen
  verdelen (de zichtbare velden zitten in één laatste stap), voorwaardelijke
  sprongen tussen stappen, en een voorbeeld van een reeks in de
  shortcode-bouwer waar je de stappen ook kan doorklikken.

---

## Koppelingen — ingangen naar een venster (2026-09)

**Regel: een OPSTELLING is het venster. Hoe het opengaat is een INGANG, en die
staan in een eigen lijst. Er zijn er zoveel als je wil, van drie soorten: een
knop, een klasse op een bestaand element, en een callout.**

Waarom dit apart staat: zolang "hoe toon je het" een keuze IN de opstelling was,
had je per manier een kopie van het hele venster nodig -- en dan moet je bij elke
wijziging raden welke kopie waar staat. Nu is er één venster en een lijst
ingangen ernaast; een callout voor een nieuwe stap is één rij erbij.

| Wat | Waar |
|---|---|
| Opslag, soorten, CRUD, `[mymmo_form_entry]` | `wp-plugin/mymmo-forms/includes/class-entrypoints.php` (option `mymmo_forms_entrypoints`) |
| Een ingang renderen | `Mymmo_Forms_Shortcodes::render_ingang()` |
| Het kaartje tekenen | `templates/callout.php` + `assets/css/mymmo-forms-callout.css` |
| De gedokte sectie (stap of formulier) | `mymmo_forms_gedokte_sectie()` / `mymmo_forms_stap_sectie()` / `mymmo_forms_formulier_sectie()` in `includes/helpers.php` |
| De brug naar de reeks | `mymmo_forms_stappen_brug()`, idem |
| Verhuizen bij openen/sluiten | `Reeks.plaats()` in `assets/js/mymmo-forms-steps.js` |
| Het sein daarvoor | `meldVenster()` in `assets/js/mymmo-forms-modal.js` (`mymmo:venster`) |
| Een agenda buiten een venster | `laadAgendaVlak()` / `losseAgendas()` in modal.js |
| Beheerscherm | tabblad "Ingangen" in `includes/class-settings.php` (`render_ingangen()`) |
| Zonder WordPress bekijken | `php wp-plugin/mymmo-forms-callout-preview.php <stap\|form\|calendly> <kolommen\|breed>` |

Afspraken die bewust zo zijn:

- **Een callout licht EEN onderdeel uit: een stap, het formulier of de agenda.**
  Bij een stap wordt die ook de EERSTE van het venster (`steps_met_eerst()`) --
  de bezoeker heeft hem in de pagina al beantwoord, dus hij hoort daar vooraan.
  Staat de genoemde stap niet in `steps`, dan komt hij er alsnog voor: hem
  noemen betekent dat hij erbij hoort.
- **TWEE INDELINGEN, en er is geen derde.** `kolommen` (onderdeel naast titel,
  tekst en afbeelding) en `breed` (titel en tekst boven, onderdeel op volle
  breedte, knop rechtsonder). Voer geen derde in.
- **Er wordt NIETS weggelaten uit een stap.** De tekening van het gebouw bij de
  schuifbalk is precies de ervaring waarvoor een callout bestaat. Er was even een
  `callout_hide` om iets uit het kaartje te knippen; die is er bewust weer uit.
- **Een stap of het formulier VERHUIST.** Een kopie kan de WAARDE overdragen maar
  niet de STAND van de bediening: een schuifbalk nog wel, een vinkje dat een stap
  in zijn eigen script bijhoudt (`commerciele_kavels`) niet. Dan staat er in het
  venster iets anders dan wat de bezoeker aanklikte -- zelfde faalmodus als de
  `is_company`-bug. Daarom ligt de `data-mymmo-stappen`-wikkel bij een callout OM
  het kaartje EN het venster heen (`.mymmo-modal-launch`, `display:contents`), en
  rendert de reeks in het venster NAAKT: zonder eigen wikkel, met een anker
  (`data-mymmo-thuis`) op de plek waar het onderdeel hoort.
- **`this.stappen` sorteert op `data-mymmo-stap`, niet op DOM-volgorde.** Het
  kaartje staat vóór het venster; licht je het FORMULIER uit (de laatste stap),
  dan staat dat als eerste in de DOM. Zonder die sortering schuift elke index een
  plaats op en dokt de reeks de verkeerde sectie -- je ziet dan het formulier met
  de laatste vraag eronder, en dat leest als een fout in het formulier zelf.
- **Een callout hangt aan het tabblad waar haar stap staat, niet altijd aan
  `form`.** Een venster kan TWEE reeksen hebben: `steps` op het formulier-tabblad
  en `extra_steps` op het derde. `tabblad_van_stap()` zoekt op in welke lijst de
  uitgelichte stap staat. Stond dit vast op `form`, dan werd de reeks bij het
  verkeerde formulier gerenderd -- dat de verborgen velden van die stappen niet
  heeft. Zichtbaar als: het tabblad "Stuur een bericht" toont de stappenreeks, plus
  een beheerdersmelding dat `aantal_kavels` nergens heen kan.
- **`this.formulier` zoekt binnen `[data-mymmo-stappen-inhoud]`.** Bij een callout
  ligt de wikkel om het HELE venster heen, en dat kan meerdere formulieren
  bevatten. Het eerste pakken betekende dat een stap zijn waarde in het formulier
  van een ander tabblad schreef, waar die verborgen velden niet bestaan: geen
  foutmelding, gewoon niets in Odoo. De naakte reeks zet dat merkteken zelf.
- **De callout breekt uit de inhoudskolom** (`margin-left:50%` +
  `translateX(-50%)`, breedte `min(--mf-callout-max, calc(100vw - 40px))`). Geen
  `100vw`: die telt de schuifbalk mee en geeft dan een horizontale schuifbalk over
  de hele pagina. De transform raakt het venster niet -- dat is een SIBLING van de
  callout, geen kind.
- **Breedte, verdeling en ruimte staan bij de INGANG, niet in de code.** De
  verdeling gaat door `Mymmo_Forms_Entrypoints::VERDELINGEN`, een gesloten lijst:
  die waarde belandt in een style-attribuut op de pagina van een bezoeker.
- **De AGENDA verhuist niet.** Een iframe dat je verplaatst laadt opnieuw, en dan
  staat de bezoeker terug op de maandweergave. Er is ook niets over te dragen
  zolang er geen uur gekozen is. Het kaartje krijgt dus een eigen kalender;
  `losseAgendas()` in modal.js bouwt elke agenda die niet in een venster staat.
- **Het kaartje wordt in `templates/modal.php` gemaakt, niet in de shortcode.**
  Het uitgelichte onderdeel is hetzelfde element als in het venster -- zelfde
  `instance_id`, zelfde anker, zelfde verborgen velden -- en die argumenten
  worden per tabblad daar samengesteld. Het venster gaat daarom in een
  `ob_start()`-buffer: het kaartje wordt onderweg opgebouwd maar hoort op het
  scherm ervóór.
- **`window.MymmoStappen` hangt aan de stap-SECTIE, niet aan de reeks.** Een
  callout schrijft zijn onderdeel eerder uit dan het venster eromheen. Stond de
  brug nog in `templates/steps.php`, dan draaide het script van die stap op een
  moment dat `MymmoStappen` nog niet bestond -- en dan doet dat script niets,
  zonder dat er zichtbaar iets stukgaat: de schuifbalk werkt nog, want die leest
  de reeks rechtstreeks uit (`data-mymmo-waarde`). Dit is echt misgegaan.
- **`eigenLijst()` filtert op `closest('[data-mymmo-stappen]') === wikkel`.** Bij
  een callout ligt de wikkel om het hele venster heen; zonder die filter zou een
  derde tabblad met eigen stappen zijn stappen aan de verkeerde reeks geven. Het
  FORMULIER wordt binnen `[data-mymmo-stappen-inhoud]` gezocht, want een tabblad
  zonder stappen zit niet in een geneste reeks en zou anders eerst gevonden worden.
- **De kolommen reageren op de breedte van het BLOK (container query), niet op
  die van het scherm.** Een callout staat in de inhoudskolom van een pagina, en
  die is vaak smaller dan het venster; met een media query op 860px kreeg je één
  kolom op een plek waar er twee pasten -- en dat zie je pas op de site. Daarvoor
  staat het grid op een eigen `.mymmo-callout-raster`: een element kan niet
  reageren op zijn eigen container. Verhouding 1:2.
- **`mymmo-forms-steps.js` staat in de KOP, zonder afhankelijkheid.** Het script
  van een stap draait tijdens het parsen en verwacht `window.MymmoStappen`. Dat
  kwam uit een inline stukje -- en dat is precies wat een cache- of
  optimalisatieplugin naar de voettekst verplaatst. Dan gooit het script van de
  stap en hangt er geen enkele luisteraar: de schuifbalk schuift wel (die leest
  de reeks rechtstreeks uit via `data-mymmo-waarde`), maar het getal en de
  tekening bewegen niet mee. Dat is precies hoe het zich op de site voordeed.
  De inline brug blijft als vangnet, en modal.php zet hem bij een callout als
  eerste in de wikkel -- anders kan een ander tabblad hem in het venster
  uitschrijven, en dat staat door de buffer NA het kaartje.
- **GEEN SCHUIFBALKEN.** In `mymmo-forms-callout.css` staat geen enkele
  `overflow` en geen enkele vaste hoogte. Past een stap niet in twee kolommen,
  dan is dat een reden voor `breed`; past hij in het VENSTER niet, dan voor
  `panel="breed"` (`.mymmo-modal-panel--ruim`, 940px). Dat laatste staat bewust
  los van `--breed` (de agenda): die legt ook een vaste hoogte op, en dat zou van
  een korte stap een half leeg vlak maken.
- **Op MOBIEL toont het venster alleen het tabblad dat de ingang koos.** Kop,
  inleiding en de rij tabbladen vallen weg -- die stonden alle drie bovenaan en
  duwden samen het eigenlijke scherm een halve telefoonhoogte naar beneden,
  terwijl de bezoeker net geklikt had en dus al gezegd had wat hij wou. De
  tabbladen die hij NIET koos staan onderaan op de tint van het venster (`order`
  op `.mymmo-modal-main`/`-aside`), zodat ze lezen als extra acties. Het actieve
  tabblad staat er niet bij.
  Die regels staan ACHTERAAN `mymmo-forms-modal.css`, in een tweede
  `@media (max-width: 640px)`: de bestaande mobiele regels zetten o.a.
  `.mymmo-modal-lead { display: -webkit-box }`, en bij gelijke specificiteit wint
  de laatste. Ervoor zetten werkte dus niet -- de inleiding bleef staan.
- **`bg`, `radius` en `tab` mogen op de SHORTCODE staan**
  (`Mymmo_Forms_Entrypoints::SHORTCODE_ATTS`), en winnen dan van wat er bij de
  ingang staat. Bewust een korte lijst: alles overschrijfbaar maken haalt de
  reden weg waarom ingangen bestaan. `bg="transparent"` is een geldige keuze en
  geen kleur -- `mymmo_forms_color()` laat dat sleutelwoord terecht niet door
  (die functie voedt ook het thema van het formulier), dus het staat apart in
  `callout_stijl()`.
- **`tab` geldt alleen voor een KNOP of een KLASSE.** Bij een callout volgt het
  tabblad uit wat ze uitlicht; een ander tabblad zou het uitgelichte onderdeel
  nergens heen laten gaan.
- **Een KLASSE-ingang heeft evengoed een shortcode.** Het venster moet ergens op
  de pagina staan voor er iets te openen valt; die shortcode toont zelf niets
  (`button="no"`) en zet enkel `trigger=".jouw-klasse"`. Het beheerscherm zegt dat
  er expliciet bij -- anders zet iemand de klasse op zijn knop en gebeurt er niets.
- **Elke ingang rendert het venster van haar opstelling.** Twee ingangen op één
  pagina betekent dus twee exemplaren van dat venster in de DOM. Dat werkt (er
  staat er altijd maar één open) en de CONFIGURATIE staat nog steeds op één plek,
  wat het punt is. Delen kan niet zomaar: een callout herordent de stappen, dus
  haar venster is niet hetzelfde als dat van een knop ernaast.
- **Een OPEN venster hangt onder `<body>`** (`naarBoven()`/`terugZetten()` in
  mymmo-forms-modal.js, sinds 1.17.25). Een voorouder met transform/filter/
  contain of een eigen z-index ving het anders in dat blok, achter de footer.
  Gevolg: wat in het venster gebeurt, borrelt NIET meer op tot de wikkel rond
  kaartje + venster. De reeks luistert daarom via `Reeks.luister()` ook op de
  vensters in haar wikkel, en test met `bevat()` in plaats van
  `wikkel.contains()`. Voeg je een luisteraar toe aan de reeks, gebruik
  `luister()`.
- **Nog niet gebouwd, bewust:** een voorbeeld van een ingang in het beheerscherm.
  Je ziet hem pas op een (concept)pagina. De bouwer toont wel het venster zelf.

---

## Componenten — mymmo-cards (2026-09)

**Regel: elk component in deze plugin bezit geometrie en gedrag — nooit
typografie. De inhoud komt uit gewone core-blokken, dus kop, tekst en kleur
komen uit het thema; kleur die het component zelf zet, komt uit het palet van
het thema.**

Sinds 1.5.0 zit er meer in dan de kaartenstapel: het is een bibliotheek waaruit
een marketeer een pagina zet. De componenten horen in één plugin omdat ze
dezelfde uitgangspunten delen; een tweede plugin zou betekenen dat iemand er een
moet activeren die hij niet kent.

**De MAPNAAM blijft `mymmo-cards`, ook al heet de plugin "Mymmo Componenten".**
WordPress herkent een plugin aan haar pad: hernoemen levert op de site een
TWEEDE plugin op naast de bestaande, en dan draait dezelfde code twee keer tot
iemand het merkt. Om dezelfde reden blijven `MYMMO_CARDS_VERSION`, het
build-script en de zipnaam zoals ze zijn.

Waarom dit bestaat: de stapel op syndicoach.be was met de hand gebouwd uit
core-Groepen met per kaart een eigen inline-opvulling, plus CSS in "Extra CSS"
van één site, plus een los script voor de beweging. Daartussen stond één kaart
die uit Mymmo Forms kwam (de callout) met haar eigen titel, opvulling en
achtergrond. Die gelijk krijgen betekende: eigenschap per eigenschap overtypen
via een instellingenscherm, met een plugin-release per eigenschap. Dat
convergeert niet — de kaarten waarmee je vergelijkt zijn zelf niet gelijk
(gemeten: kaart 1 `padding-right:0` met een kolom op `sm/xl/sm/sm`, kaart 2 `sm`
rondom; thema-`h3` 30px/400 in `neutral-950` tegenover de callout-`h2` op
22,4px/700 in `#1f2430`).

| Wat | Waar |
|---|---|
| Blokken, registratie, render (index tellen) | `wp-plugin/mymmo-cards/includes/class-blocks.php` |
| Vormcontrole + gesloten lijsten | `wp-plugin/mymmo-cards/includes/helpers.php` |
| Geometrie, mobiel, kleefwiskunde | `assets/css/mymmo-cards.css` |
| Meten + krimpen | `assets/js/mymmo-cards.js` |
| De editor (geen bouwstap, `wp.element.createElement`) | `assets/js/mymmo-cards-editor.js` |
| Enkel wat in de editor anders is | `assets/css/mymmo-cards-editor.css` |
| Zonder WordPress bekijken | `php wp-plugin/mymmo-cards-preview.php > proef.html` |
| Bouwen | `bash wp-plugin/build-mymmo-cards.sh <versie>` |
| De ingang van Mymmo Forms erin | blok "Mymmo ingang" met **Kaal tonen** aan (`chrome="no"`) |
| **Markeerstift**: vormen, palet, gegenereerde regels | `includes/class-markering.php` |
| De streep zelf (voorkant én canvas) | `assets/css/mymmo-markering.css` |
| De opmaakknop en de kiezer | `assets/js/mymmo-markering.js` |
| De lengte kiezen per woord | `assets/js/mymmo-markering-front.js` |
| Alleen de kiezer (popover, buiten het canvas) | `assets/css/mymmo-markering-editor.css` |
| De tekeningen | `assets/vormen/markering-*.svg` |
| Zonder WordPress bekijken | `php wp-plugin/mymmo-markering-preview.php > proef.html` |
| **Knop die een venster opent**: attribuut, brug, tabblad | `includes/class-knop.php` |
| Het paneeltje + de variant in de inserter | `assets/js/mymmo-knop-editor.js` |

Afspraken die bewust zo zijn:

- **GEEN typografie in `mymmo-cards.css`.** Geen `font-family`, `font-size`,
  `font-weight` of tekstkleur. Zet je er ooit één bij, dan is het probleem terug
  waarvoor deze plugin gemaakt is.
- **De OPVULLING staat op de STAPEL**, in drie maten, als KLASSE. Niet als
  inline variabele: een inline waarde wint van élke selector, ook van een media
  query op datzelfde element, en dan kan een telefoon de desktopmaat nooit
  verkleinen. Om diezelfde reden zetten de blokken alleen `--mk-stap` /
  `--mk-gap` inline en rekent de CSS daaruit per breekpunt `--mk-stap-nu` /
  `--mk-gap-nu`.
- **De gelijke hoogte wordt GEMETEN**, niet ingetypt (`--mk-hoogte`). Het
  vorige `--card: 560px` moest met de hand gelijk blijven aan de hoogste kaart.
  Er staat bewust GEEN plafond meer op (tot 1.2.2 was dat 88vh): met een plafond
  werden de kaarten onderling ongelijk zodra er een hoge kaart bij zat, en dan
  gaapte er op een telefoon een kier tussen twee kaarten. Elke kaart is minstens
  zo hoog als haar voorgangers (een lopend maximum), dus de stapel sluit. Meten gebeurt met de klasse `--meten`, die de kaarten even op
  hun natuurlijke hoogte zet: zonder dat meet het script zijn eigen vorige
  antwoord, want de kaarten dragen dan al `min-height`.
- **De INDEX van een kaart wordt in PHP geteld**, niet in CSS. `nth-child`
  levert geen getal voor `calc()`, en met de hand uitschrijven is precies wat er
  stond (`.stack-1 {} .stack-2 {}` tot het toevallige aantal). Daarom rendert
  `render_stapel()` haar kinderen zelf.
- **NOOIT `container-type`, `contain` OF EEN TRANSFORM OP EEN KAART MET EEN
  VENSTER ERIN.** Alle drie maken ze van de kaart het referentiekader voor
  `position: fixed` van alles wat erin staat -- en dat is precies wat het
  venster van Mymmo Forms is. Dat venster zou dan niet meer over de pagina
  liggen maar in de kaart gevangen zitten, en je ziet het pas als iemand op de
  knop drukt. Gevolgen: de kolommen slaan om met een gewone MEDIA query op
  640px (geen container query), en het script slaat elke kaart met een
  `.mymmo-modal` erin over -- ook voor `scale(1)`, want ook dat telt.
  In de editor klopt die media query ook: het canvas staat daar sinds WordPress
  6.3 in een iframe, dus ze meet de breedte van het canvas.
- **De KRIMP TELT OP.** Een kaart wordt kleiner voor élke kaart die er nog
  overheen komt (`STAP` per kaart), niet alleen voor de eerstvolgende; de
  voortgang wordt gemeten aan de KLEEFPOSITIE (de laatste `AANLOOP` pixels voor
  ze aankomt), niet aan de overlap. Zo lopen de zichtbare randen als een waaier
  uit elkaar. Met alleen de volgende kaart zijn alle randen even breed en ziet
  de stapel er plat uit -- dat was de eerste versie, en het verschil is meteen
  te zien.
- **De editor gebruikt `useInnerBlocksProps`, niet `<InnerBlocks>`.** Dat laatste
  zet twee eigen wikkels tussen het element en de blokken erin
  (`.block-editor-inner-blocks` + `.block-editor-block-list__layout`), waardoor
  `.mymmo-kaart-raster` als grid nog maar ÉÉN kind heeft: twee kolommen stonden
  in de editor onder elkaar en op de pagina naast elkaar.
- **De sierafbeelding is een `<span>` met een `background-image`, geen `<img>`.**
  Ze moet GROTER dan de kaart kunnen zijn (de kaart snijdt ze af, dat is het
  effect) en onbeperkt schaalbaar. Met een `<img>` ging dat twee keer mis: een
  SVG die alleen een `viewBox` heeft, heeft geen eigen afmetingen, en elke
  `img`-regel van het thema (`max-width: 100%`) is specifieker dan een klasse
  van ons. Een doos met een achtergrond heeft die twee problemen geen van beide:
  de maat is EEN getal (een percentage van de kaartbreedte) en de hoogte volgt
  uit een `padding-top` in procenten -- dat rekent altijd tegen de BREEDTE, dus
  de verhouding blijft staan.
- **Geen `ResizeObserver` in het script.** Die ziet onze eigen `min-height`
  veranderen en meet zichzelf in een kringetje. In de plaats: `load` van de
  afbeeldingen, `fonts.ready`, `resize`, en `mymmo:venster` (Mymmo Forms haalt
  een stap uit een kaart en zet hem er weer in).
- **Eén kolom is een brede kaart.** Er is geen `indeling`-attribuut: het AANTAL
  kolommen bepaalt de indeling, en een lege kolom wordt niet gerenderd. Twee
  velden die hetzelfde zeggen lopen ooit uiteen.
- **De KAARTENSTAPEL kent Mymmo Forms niet.** De enige verwijzing is de
  CSS-regel op `html.mymmo-modal-actief` (een klassenaam, geen code) zodat de
  kleefkop niet over een open venster valt. Sinds 1.6.0 heeft de KNOP wél een
  koppeling, maar optioneel en éénrichting -- zie hieronder.
- **`chrome="no"` in Mymmo Forms (1.17.23)** rendert een ingang KAAL: enkel het
  dok en de knop, in `.mymmo-ingang-kaal`. Dat attribuut hoort bij de PLAATSING
  (`SHORTCODE_ATTS`), niet bij de ingang — dezelfde ingang kan elders wél haar
  eigen kaartje meebrengen. Het dok en de knop worden in `templates/callout.php`
  één keer in een buffer opgebouwd en door beide standen gebruikt; twee kopieën
  zouden uit elkaar lopen zodra iemand er een attribuut bij zet.
**De markeerstift (1.5.0)** — een woord in een kop uitlichten, zoals *anders* in
"Hoe wij het anders aanpakken". Wat het vervangt: een afbeelding die met de hand
achter dat ene woord geduwd stond, per woord opnieuw, niet te herkleuren, scheef
zodra de tekst wijzigde.

- **Het is een OPMAAK (`registerFormatType`), geen blok.** Een blok zou betekenen
  dat een marketeer zijn kop in stukken knipt om er één woord uit te lichten.
- **De streep is een SVG als MASKER, met de kleur eronder.** Een gekleurde SVG
  zou een bestand per vorm ÉN per kleur betekenen, en een nieuwe merkkleur een
  nieuwe set bestanden. Het masker staat op een `::before` ACHTER de tekst: op
  het element zelf zou het ook de letters wegmaskeren. `isolation: isolate` hoort
  bij die `z-index: -1` — zonder die isolatie valt de streep achter de
  ACHTERGROND van de kaart of sectie eromheen, en dat is precies waar dit voor
  bedoeld is.
- **De keuzes staan als KLASSEN op de `<mark>`, nooit als inline stijl.** Wie
  geen `unfiltered_html` heeft (een auteur, een redacteur op een multisite) ziet
  zijn `style`-attribuut bij het bewaren gefilterd worden. `className` bepaalt
  wanneer de editor de opmaak HERKENT (`mymmo-mark`), het `class`-attribuut
  draagt de keuzes — exact het patroon van core's eigen `core/text-color`.
- **De VALREGEL (`.mymmo-mark`) staat VOORAAN in de gegenereerde CSS.** Zij en
  `.mymmo-mark--stift` zijn even zwaar (0,1,0), dus wie achteraan staat wint.
  Stond ze achteraan, dan kreeg elke markering de eerste streep, ongeacht de
  keuze — en dat ziet er niet uit als een fout.
- **De stylesheet hangt aan `enqueue_block_assets` en NIET ook aan
  `wp_enqueue_scripts`.** Die eerste vuurt op de voorkant én in het canvas van de
  editor; allebei zou het gegenereerde blok op de voorkant verdubbelen. De
  KIEZER is een popover en leeft BUITEN het canvas-iframe: die stylesheet gaat
  daarom via `enqueue_block_editor_assets`.
- **Het palet komt uit `theme.json`** (`wp_get_global_settings`), niet uit een
  eigen lijstje dat stil veroudert. De standaardkleuren van WordPress blijven
  eruit: dat zijn er tientallen en ze horen niet bij de huisstijl. Geen kleur
  gekozen = `currentColor`. Hetzelfde geldt voor de LETTERTYPES
  (`typography.fontFamilies`): de plugin kent geen enkele lettertypenaam en zet
  enkel een klasse die naar `var(--wp--preset--font-family--<slug>)` wijst. Dat
  is de reden dat dit de regel "geen typografie in deze plugin" niet breekt --
  er wordt niets bepaald, er wordt aangeboden wat het thema al heeft.
- **DE DIKTE IS EEN ABSOLUTE WAARDE, en daarom bestaat die keuze.** `<strong>`
  is `font-weight: bolder`, en dat is RELATIEF: in een kop die al op 700 staat
  betekent bolder 900, en heeft het lettertype geen 900, dan verandert er niets.
  Zo leek de knop "vet" op een kop stuk terwijl er niets stuk was. `GEWICHTEN`
  in class-markering.php is een gesloten lijst (400-800); een vrij getal zou
  stil terugvallen op de dichtstbijzijnde die het lettertype wel heeft.
- **De regels voor lettertype en dikte gebruiken TWEE klassen**
  (`.mymmo-mark.mymmo-mark--font-x`). Een blokthema drukt zijn stijlen inline in
  de `<head>` af, dus ná onze stylesheet; `.wp-block-heading { font-family }` is
  (0,1,0) en zou bij gelijk gewicht gewonnen hebben. Zelfde les als mymmo-forms
  1.15.5.
- **Elk voorvoegsel naast de vorm hoort in `ANDERE_PREFIXEN`**
  (mymmo-markering.js): `--kleur-`, `--font-`, `--gewicht-`. `isVormklasse()`
  beschouwt anders zo'n klasse als een VORM, en dan gooit `bouwKlasse()` haar bij
  de eerstvolgende wijziging weg -- zichtbaar als een instelling die zichzelf
  terugzet.
- **DE VORMEN ZIJN DE BESTANDEN in `assets/vormen/`.** Er is geen array die je
  ernaast moet bijhouden: een tekening toevoegen is een bestand neerzetten.
  `LABELS` in class-markering.php bepaalt enkel de volgorde en een nette naam;
  wat daar niet in staat komt achteraan met een naam uit de bestandsnaam. Geen
  URL-veld in de editor: die waarde zou in de pagina van een bezoeker belanden,
  en een streep hoort bij de huisstijl, niet bij het bericht.
- **Een eigen streep:** zwarte vulling op transparant, één `<path>` met een
  `fill` (geen `stroke`, geen `<use>`), `preserveAspectRatio="none"`, en een
  viewBox die STRAK om de tekening zit. Lege ruimte in de viewBox duwt de streep
  opzij: de vier tekeningen van de huisstijl stonden alle vier rechts uitgelijnd
  in één canvas van 500×100, en zonder bijsnijden liep de streep enkel over het
  laatste stuk van het woord. De maten kwamen uit `getBBox()` in een echte
  browser -- een schatting op de CONTROLEPUNTEN van de bezierkrommen is te ruim,
  want die liggen buiten de kromme.
- **EEN STREEP HEEFT LENGTES, en dat is wat het eindcijfer in de bestandsnaam
  betekent.** `markering-stift-1.svg` tot `-4.svg` zijn vier tekeningen van
  DEZELFDE stift; alles wat enkel in dat cijfer verschilt, wordt één keuze in de
  kiezer. Reden: `preserveAspectRatio="none"` rekt ook de TEXTUUR uit, dus een
  tekening voor drie letters wordt over een lange woordgroep een uitgesmeerde
  balk waarin de trapjes aan het einde even breed worden als een letter.
  `mymmo-markering-front.js` meet elk woord en zet de dichtstbijzijnde erop, met
  een LOGARITMISCHE vergelijking: lineair meten laat de langste tekening altijd
  winnen zodra een woord lang wordt, ook als ze dan dubbel zo ver mis zit als de
  op een na langste. De verhouding komt uit de `viewBox` van het bestand, niet
  uit de naam -- zo kan een tekening nooit een andere lengte blijken te hebben
  dan waarvoor ze wordt ingezet. Zonder JavaScript staat de MIDDELSTE lengte er
  (gezet in de gegenereerde CSS), dus er is altijd een streep.
- **Het keuzescript zet een INLINE CSS-variabele, geen klasse.** Een klasse per
  lengte zou in de opgeslagen inhoud belanden, en dan staat er in de database een
  lengte die hoorde bij de schermbreedte van de redacteur op het moment van
  typen. De MutationObserver in dat script luistert bewust NIET op `attributes`:
  het script zet zelf een style-attribuut en zou zichzelf aan de gang houden.
- **De maat van de streep staat in twee variabelen** (`--mk-mark-hoogte` 1,15em,
  `--mk-mark-uitloop` 0,15em) en is GEMETEN, niet gekozen: bij 1em blijft de
  laatste letter onbedekt (het rechteruiteinde van de tekening loopt omhoog en
  breekt in dunne treden, dus daar zit minder inkt dan links), bij 1,2em wordt
  het een vlek. De hoogte hangt bewust aan de LETTERGROOTTE en niet aan het
  inline-element: dat laatste is zo hoog als het lettertype toestaat (van boven-
  tot onderlengte, ruim 1,2em), ook bij een woord zonder staartletters -- een
  streep die daarop steunt is bij het ene woord te hoog en bij het andere net
  niet, zonder dat je ziet waarom. Het keuzescript meet daarom het
  PSEUDO-ELEMENT (`getComputedStyle(el, '::before')`) en niet het woord plus een
  kopie van die marges; twee plekken met dezelfde getallen lopen ooit uiteen.
- **Een markering die over TWEE REGELS breekt krijgt geen streep** (klasse
  `mymmo-mark--gebroken`). Het pseudo-element staat absoluut en zou dan de ruimte
  beslaan van het begin van de eerste regel tot het einde van de laatste: een
  smalle, hoge doos, zichtbaar als een verticaal streepje dwars door twee regels.
  Met CSS is dat niet te repareren -- één pseudo-element kan geen twee regels
  beslaan en de fragmenten van een gesplitst inline-element zijn niet apart aan
  te wijzen. Geen streep leest als een keuze, een verkeerde streep als een fout.

**De knop die een venster opent (1.6.0, herzien in 1.7.0)** — een gewone
WordPress-knop met één keuze erbij: welk TABBLAD van welke opstelling van Mymmo
Forms hij opent.

- **DE KEUZE KOMT UIT DE OPSTELLING, NIET UIT DE INGANGEN.** Dat was 1.6.0, en
  het klopte niet: een ingang zegt HOE een venster opengaat (knop, klasse,
  callout), niet WAT de bezoeker te zien krijgt. De keuzelijst stond daardoor vol
  ingangen die enkel bestonden om ergens een knop te kunnen zetten, en het
  tabblad dat je wilde openen stond er niet eens in. `Mymmo_Forms_Presets::all()`
  levert nu de opstellingen en `tabbladen_van()` leidt per opstelling af welke
  tabbladen ze écht heeft (form altijd; extra zodra `extra_slug` of
  `extra_steps` gevuld is; calendly zodra er een boekingslink staat -- exact de
  voorwaarden die Mymmo Forms zelf gebruikt). De ingangen blijven waarvoor ze
  bedoeld zijn: callouts.
- **De waarde is ÉÉN attribuut `mymmoVenster` met de vorm `<opstelling>|<tab>`.**
  Twee attributen zouden ongeldige tussenstanden mogelijk maken -- een opstelling
  zonder tabblad opent niets voorspelbaars, een tabblad zonder opstelling bestaat
  niet -- en dan moet elke lezer die afvangen.
- **Het attribuut van 1.6.0 (`mymmoIngang`) blijft geregistreerd en levert een
  MELDING.** Registreer je het niet meer, dan gooit de editor het bij de eerste
  bewaaractie weg en kan niemand nog zeggen dat die knop opnieuw ingesteld moet
  worden. Stil laten vallen zou een knop opleveren die niets doet en er goed
  uitziet -- de ergste uitkomst.

- **Het is GEEN eigen knopblok, maar een uitbreiding van `core/button`.** Een
  eigen blok zou zijn eigen vorm meebrengen (kleuren, randen, opvulling) en dan
  staat er een knop die nét niet is zoals de rest -- precies het probleem
  waarvoor deze plugin bestaat. Door de kern-knop uit te breiden krijg je elke
  eigenschap die WordPress kent en stijlt het thema hem. Er komt één attribuut
  bij (`mymmoIngang`), meer niet.
- **De variant staat op `core/BUTTONS`, niet op `core/button`.** Dat laatste blok
  heeft `parent: ['core/buttons']` en verschijnt dus alleen in de inserter als je
  al in een knoppenrij staat. De variant zet zelf niets in -- ze is een
  wegwijzer, want zonder haar bestaat de mogelijkheid alleen voor wie toevallig
  in de zijbalk van een knop kijkt.
- **DE KOPPELING MET MYMMO FORMS IS OPTIONEEL EN ÉÉNRICHTING.** Dit is een
  bewuste herziening van "de twee plugins zijn niet gekoppeld": mymmo-cards
  importeert nog steeds niets, maar gebruikt achter een `class_exists()` twee
  publieke klassen. Staat Mymmo Forms niet aan, dan is het gewoon een knop en
  zegt het paneel dat -- een lege keuzelijst zonder uitleg leest als een storing.
- **De brug is de KLASSE-INGANG, en er wordt geen venster-logica overgeschreven.**
  Een klasse-ingang tekent zelf niets: ze rendert het venster met `button="no"`
  en een trigger-selector, waarna elk element met die klasse het opent
  (`bindTriggers()` in mymmo-forms-modal.js zoekt in het HELE document).
  `class-knop.php` stelt zo'n klasse-ingang TER PLEKKE samen (opstelling +
  tabblad + eigen trigger) en geeft die aan
  `Mymmo_Forms_Shortcodes::render_ingang()`. Welk formulier, welke agenda, welke
  stappen, welke teksten: allemaal onveranderd van die plugin. Er wordt NIETS
  bewaard -- dat object leeft alleen tijdens dat ene verzoek, en de
  ingangenlijst in wp-admin blijft onaangeroerd.
- **De trigger-klasse is uit de KEUZE afgeleid**
  (`mymmo-opent-<opstelling>-<tab>`), niet willekeurig: twee knoppen met dezelfde
  keuze delen dan één venster. Een tweede exemplaar zou hetzelfde formulier nog
  eens in de DOM zetten, met zijn veld-id's en verborgen velden erbij. Twee
  VERSCHILLENDE tabbladen krijgen wél elk hun venster -- een venster opent op het
  tabblad dat bij het renderen is meegegeven, dus dat kan niet gedeeld worden.
  `modal_id()` telt per pagina door, dus die twee botsen niet op hun id.
  **Dat delen gebeurt in de BROWSER, niet in PHP** (`ontdubbel()` in
  mymmo-forms-modal.js, sinds cards 1.7.1 / forms 1.17.26). Tot dan hield
  `class-knop.php` een statische vlag per verzoek bij en schreef het venster
  maar één keer uit. Dat liet knoppen niets doen: WordPress rendert dezelfde
  inhoud vaak meer dan eens per verzoek en gooit de eerste uitvoer weg (SEO-
  plugin, excerpt, menu), en dan stond de vlag al op "gedaan" bij de render die
  wel op de pagina kwam. Zet zo'n vlag nooit terug: de server kan niet weten
  welke render op de pagina belandt.
- **Het venster wordt INLINE achter de knop geschreven**, niet in `wp_footer`.
  Dat is wat de shortcode van Mymmo Forms ook doet, op hetzelfde moment in de
  paginaopbouw, dus de stylesheets en scripts komen op dezelfde manier mee. In de
  indeling kost het niets: de wikkel staat bij `button="no"` op
  `display:contents` en het venster zelf op `display:none; position:fixed`.
- **De opschriften komen uit de opstelling, niet uit een eigen lijstje.**
  `tab_form` / `tab_calendly` / `tab_extra`, met de standaardteksten van Mymmo
  Forms als terugval. Voor het derde tabblad bestaat die terugval daar niet (de
  plugin neemt dan de naam van het formulier, en dat kan hier niet zonder de
  formulier-API): dan wordt het "Derde tabblad (<slug>)". Liever de slug erbij
  dan een naam verzinnen -- een verzonnen naam doet een marketeer twijfelen of
  hij wel het juiste kiest.
- **`tab_order` wordt gelezen zodat de keuzelijst dezelfde volgorde heeft als het
  venster.** Het BESLIST hier niets; dat blijft van Mymmo Forms.
- **De knop opent op een TABBLAD, niet op een stap.** Een stap vooraan zetten kan
  alleen een callout, want die haalt de stap uit het venster en zet hem in de
  pagina (`steps_met_eerst()` + `dok_index`). Dat is bewust niet nagebouwd voor
  een knop.
- **Een knop zonder link krijgt er bij het renderen een** (`href="#"`): zonder
  `href` is een `<a>` niet met het toetsenbord te bereiken en zou de knop alleen
  met de muis werken. Dat de klik niet naar boven springt, regelt
  mymmo-forms-modal.js met `preventDefault()`. De klasse gaat erop met
  `WP_HTML_Tag_Processor` (de parser van WordPress zelf), nooit met een reguliere
  expressie.
- **Het attribuut heeft bewust GEEN `source`**, dus WordPress bewaart het in het
  blok-commentaar en niet in de markup. De trigger-klasse komt pas bij het
  RENDEREN op de knop; stond ze in de opgeslagen inhoud, dan bleef ze staan op
  elke pagina waar iemand de ingang later loskoppelde.

**De keienwolk (1.8.0)** — grote zwevende keien met eigen inhoud, omringd door
kleine keitjes die parallax voorbijschuiven. Voor alles wat vanuit de KLANT
spreekt: organisch, overlappend, bewegend. Code: `includes/class-keien.php`,
`assets/css/mymmo-keien.css`, `assets/js/mymmo-keien.js` (enkel `view_script`)
en `assets/js/mymmo-keien-editor.js`. Proef: `php wp-plugin/mymmo-keien-preview.php`.

- **Drie bewegingen, drie eigenschappen.** `rotate` = scheef (vast), `translate`
  = zweven (animatie op `.mymmo-kei-vorm`), `transform` = parallax (op de
  WIKKEL, via `--mk-p` dat het script zet). Het script schrijft nooit zelf een
  transform: twee plekken die dat doen overschrijven elkaar.
- **Een kei met een `.mymmo-modal` erin krijgt `mymmo-kei--stil`**: geen
  zweven, geen parallax, geen rotate. Zelfde regel als bij de kaartenstapel --
  een translate maakt de kei het referentiekader van `position: fixed`.
- **In de editor beweegt niets** (view_script, en de animaties staan uit in
  mymmo-keien-editor.css). Wat je ziet, is de stand als de wolk midden op het
  scherm staat; daar is de parallax-verschuiving 0.
- **x/y van een keitje is zijn MIDDEN, in % van de wolk.** Daarom
  `translate(-50%, -50%)` in de CSS, en daarom rekent het slepen in de editor
  vanaf het middelpunt.
- **x/y rekent tegen `.mymmo-keien-kern`** (de keien samen, max `--mk-max`
  = 1200px), niet tegen de volle breedte: anders ligt een keitje op een breed
  scherm ver van de keien. "Rondom schikken" meet de omtrek van de keien in het
  canvas en is bewust willekeurig -- een formule gaf een regelmatige ring.
- **Alle keitjes schuiven dezelfde kant op**, en hun tempo is AFGELEID uit
  maat en laag in `render_keitje()` (groot + vooraan = sneller) -- niet
  instelbaar, zodat de diepte altijd klopt met wat je ziet. De uitslag is
  begrensd (`MAX_PX`, tanh) met een rustzone rond het midden van het scherm
  (`RUST` in mymmo-keien.js): daar liggen de keitjes op hun plek. Geen schaduw, en GEEN
  z-index bij hover: een kei die naar voren springt knipt door zijn buur heen.
- **`overflow-x: clip`, niet `hidden`**: keitjes mogen over de rand hangen
  zonder horizontale schuifbalk, en een afbeelding die bovenaan uit een kei
  steekt wordt niet afgesneden.
- **Een grote kei is een SVG-pad, geen border-radius** (1.8.3): border-radius
  kan geen hoeken van 85 of 95 graden maken. De paden staan EENMAAL in
  `Mymmo_Cards_Keien::kei_paden()` en gaan via `wp_localize_script` naar de
  editor. Twee standen per vorm met identieke commando's (M + 4x C/Q), anders
  springt het ademen. Geen `<use>`/`<defs>` in dat SVG (zie de beschadigde
  markup bij de stappen van Mymmo Forms); SMIL wordt bij reduced-motion door
  mymmo-keien.js weggehaald.
- **De telefoonstand (1.8.4) zijn attributen ZONDER standaard** (`schaalM`,
  `xM`, `yM`, `maatM`, `draaiM`, `hoogteM`): niet ingevuld = volgt de computer
  via `var(--mk-...-m, <computer>)` in de media query. Geef ze nooit een
  default -- dan neemt een wijziging aan de computerstand de telefoon stil niet
  meer mee. De editor schrijft ze wanneer het voorbeeld op Mobiel staat
  (`useTelefoon()`); rotatie loopt via `--mk-d`, omdat een variabele zichzelf
  niet kan overschrijven.
- **Keitjes laden meteen** (`skip-lazy`, `no-lazyload`, `data-no-lazy`): Smush
  op syndicoach.be herschrijft `src` anders naar `data-src`.
- De tekeningenlijst staat in `Mymmo_Cards_Keien::tekeningen()`; dezelfde
  bestandsnamen als de stappen van Mymmo Forms (let op `vuilniishok`).

- **Nog niet gebouwd, bewust:** een voorbeeld van een stapel in het
  beheerscherm, en het migreren van de bestaande handgemaakte stapel — die
  blijft werken op haar eigen "Extra CSS" tot de pagina opnieuw opgebouwd is.

---

## Koppelingen — Calendly als vierde bron (2026-09)

**Regel: een Calendly-koppeling heeft een VASTE eerste stap die de afspraak naar
`x_calendlymeeting` synchroniseert. Die is niet instelbaar en niet te verwijderen.
Alles wat je er daarna aan hangt (contact, lead, notitie, mail) is wel gewoon
instelbaar.** Vervangt de Zapier-koppeling, die sinds 2026-07-24 stil lag —
laatste meeting in Odoo was id 891.

| Wat | Waar |
|---|---|
| Payload plat slaan + handtekening (puur, geen env/fetch/db) | `src/modules/forminator-sync-v2/calendly/payload.js` |
| Calendly REST-API (users/me, event_types, webhook_subscriptions) | `calendly/client.js` |
| `fs_v2_calendly_subscriptions` + koppeling zoeken op eventtype | `calendly/database.js` |
| De vaste stap bouwen (resolver + host-zoekstap + upsert) | `calendly/system-step.js` |
| Boeking ontvangen → bestaande pipeline | `calendly/webhook.js` + een blok in `src/router/public-routes.js` |
| Beheerroutes | `calendly/routes.js`, gespreid in `routes.js` |
| Tabblad "Calendly" in het detailscherm | `public/forminator-sync-v2-detail-calendly-tab.js` |
| Veldenlijst zonder eerste boeking | `fetchCalendlyFields()` in `-detail-form-fields-tab.js` |
| Migratie | `supabase/migrations/20260914150000_fsv2_calendly.sql` |

**Nieuwe secret:** `CALENDLY_ACCESS_TOKEN` (persoonlijk toegangstoken met
`users:read`, `webhooks:read`, `webhooks:write`, `event_types:read`,
`scheduled_events:read`, `organizations:read`).
Zonder dat token werkt de module gewoon door; je kan alleen niets aanmelden.
`organizations:read` is enkel nodig om GEDEELDE/team-eventtypes te tonen bij
het instellen van een koppeling (zie "listEventTypes() geeft ook
gedeelde/team-eventtypes" hieronder) -- zonder die scope, of zonder
org-adminrechten voor het token, zie je enkel je eigen eventtypes, geen
harde fout.

Afspraken die bewust zo zijn:

- **ÉÉN webhook-subscription voor de hele module, niet één per koppeling.** Een
  Calendly-subscription kan NIET op eventtype filteren — `scope` is enkel
  `organization`, `user` of `group` (geverifieerd in hun OpenAPI-spec). Eén
  subscription per koppeling zou betekenen dat elke koppeling élke boeking van de
  hele organisatie binnenkrijgt en dat elke boeking N keer verwerkt wordt. De
  routering gebeurt daarom bij ons, op `scheduled_event.event_type` →
  `fs_v2_integrations.calendly_event_type_uri`. Een koppeling met een lege
  `calendly_event_type_uri` is het VANGNET voor alles zonder eigen koppeling.
  Twee koppelingen op hetzelfde eventtype wordt geweigerd met een 409: anders
  wint er stil één en doet de andere nooit meer iets.
- **`listEventTypes()` geeft ook gedeelde/team-eventtypes.** Calendly's eigen
  `/event_types`-endpoint met enkel `organization` geeft NOOIT de "Shared event
  types" terug die je in de Calendly-UI onder een lid ziet staan -- bevestigd
  door Calendly-support, geen instelling die je kan aanzetten. `listEventTypes()`
  haalt daarom ook `listOrganizationMemberships()` op (`organizations:read`) en
  vraagt `/event_types?user=<uri>` per lid op, samengevoegd op `uri`. Heeft het
  token geen org-adminrechten, dan faalt de ledenlijst en blijft gewoon staan wat
  de organisatie-brede aanroep al gaf -- geen harde fout, enkel minder volledig.
- **De vaste stap bestaat als echte RIJEN, niet als code.** Een
  `if (source_type === 'calendly')` in worker-handler.js zou korter zijn, maar dat
  is precies de twee-motoren-fout die de Sales Insight Explorer eerder maakte. Als
  rijen in `fs_v2_resolvers`/`fs_v2_targets`/`fs_v2_mappings` draait de bestaande
  pipeline er ongewijzigd op (idempotentie, retries, replay), staat de stap in het
  spoor van elke indiening, en kan een VOLGENDE stap via `previous_step_output` aan
  het meeting-id. `ensureCalendlySystemSteps()` is idempotent: bestaande rijen
  worden bijgewerkt, niet weggegooid-en-opnieuw-gemaakt — hun id's staan in het
  spoor van eerdere indieningen.
- **`is_system` op `fs_v2_targets` en `fs_v2_resolvers` beschermt die rijen.** De
  PUT/DELETE-routes voor targets, mappings en resolvers weigeren ze
  (`assertNotSystemTarget`/`-Mapping`/`-Resolver` in `routes.js`). Zonder die vlag
  is een vaste stap niet van een gewone te onderscheiden en haalt de eerste
  opruimactie hem weg — waarna er niets meer in Odoo belandt terwijl het scherm
  nog "koppeling actief" zegt.
- **De bestaande `generic_webhook` kan dit NIET.** `normalizeFormValues()` in
  worker-handler.js slaat exact één niveau plat. Calendly zet het belangrijkste
  twee niveaus diep (`payload.scheduled_event.start_time`) en die tak bestaat enkel
  uit objecten en arrays, dus hij valt volledig weg; `questions_and_answers` wordt
  letterlijk `[object Object]`. Vandaar `flattenCalendlyPayload()`, die naar VASTE
  platte tekstsleutels gaat. Aan `normalizeFormValues()`/`resolveFormId()` is
  NIETS gewijzigd — de payload is `{ form_id, form_data: {...} }`, dezelfde vorm
  als bij de OM-formulieren.
- **De sleutels in `CALENDLY_FIELDS` liggen VAST.** Ze staan in
  `fs_v2_mappings.source_value` van elke stap; hernoemen laat een stap zonder
  foutmelding een leeg veld naar Odoo schrijven. Zelfde regel als `field_key` bij
  de OM-formulieren.
- **De upsert-sleutel is `x_studio_cm_event_id`** (de UUID van `scheduled_event`).
  Die staat in ELKE webhook, ook die van een annulatie, dus aanmaken en bijwerken
  zijn dezelfde stap en een herbezorging kan geen tweede rij maken.
- **VERPLAATSEN geeft TWEE records, en dat is Calendly's model.** Een reschedule
  vuurt `invitee.canceled` (met `rescheduled: true`) op de OUDE afspraak en
  `invitee.created` op een NIEUWE met een nieuw `event_uuid`. De oude rij komt dus
  op geannuleerd te staan en er komt een nieuwe bij. De Zapier-koppeling deed
  hetzelfde. Probeer dat niet "op te lossen" door op `invitee_uuid` te matchen —
  dan verlies je de historiek van de verplaatsing.
- **`booking_action` is het veld waarop je een stap conditioneert — NIET `event`.**
  Calendly's eigen `event` kent maar twee waarden en is te grof om een pipeline op
  te sturen: een verplaatsing komt binnen als een `invitee.canceled` plus een
  `invitee.created`, allebei met een `event` dat iets anders suggereert dan wat er
  gebeurt. Zonder dit veld maakt een stap "lead aanmaken" bij élke verplaatsing een
  TWEEDE lead, en bij een annulatie een lead voor een afspraak die niet doorgaat.
  `bepaalBookingAction()` in `calendly/payload.js` leidt vier standen af
  (`BOOKING_ACTIONS`):

  | waarde | wanneer |
  |---|---|
  | `new` | `invitee.created` zonder `old_invitee` — een echt nieuwe boeking |
  | `rescheduled` | `invitee.created` mét `old_invitee` — de NIEUWE afspraak van een verplaatsing, met de nieuwe datum |
  | `rescheduled_old` | `invitee.canceled` met `rescheduled` — de oude afspraak die daarbij vervalt |
  | `canceled` | `invitee.canceled` zonder `rescheduled` — geannuleerd, zonder vervanging |

  **Een verplaatsing krijgt bewust TWEE standen en niet één.** Zouden beide
  webhooks `rescheduled` heten, dan vuurt een chatter-stap die daarop staat twee
  keer en staan er twee identieke notities in Odoo. `rescheduled` is de bruikbare
  van de twee; `rescheduled_old` bestaat zodat de vaste stap de oude meeting nog op
  geannuleerd kan zetten en je er desgewenst apart op kan reageren.
  **Je stuurt de fases NIET met een voorwaarde aan, maar met GEDRAG PER FASE**
  (`fs_v2_targets.calendly_behavior`, migratie `20260915120000_fsv2_calendly_behavior.sql`).
  Dat onderscheid is het hele punt: een voorwaarde is een UITZONDERING — "start een
  andere flow op basis van een antwoord" — terwijl deze vier fases bij élke
  Calendly-koppeling bestaan. Met voorwaarden alleen moest je per fase een KOPIE van
  de stap maken, dus vier keer dezelfde veldkoppelingen onderhouden voor iets dat
  altijd bestaat. Nu is het één stap met per fase een ander gedrag:

  ```json
  {"new":"upsert","rescheduled":"update_only","rescheduled_old":"search","canceled":"skip"}
  ```

  Toegestane waarden: `default` (= doe wat `operation_type` zegt) · `upsert` ·
  `update_only` · `create` · `search` · `skip`. Een stap die een HANDELING doet
  (notitie, mail, activiteit, mailinglijst) krijgt in de UI alleen `default`/`skip`
  aangeboden — "alleen bijwerken" betekent daar niets.
  **Een lege/ontbrekende waarde en `default` zijn hetzelfde en worden nooit bewaard**:
  twee vormen voor dezelfde betekenis lopen ooit uiteen. Een NULL-kolom (alle
  bestaande rijen) betekent dus exact het huidige gedrag — de migratie op zich
  verandert niets aan een draaiende koppeling.
  In `worker-handler.js` is dit GEEN tweede uitvoeringspad: het enige wat gebeurt is
  dat `opType` voor die ene indiening een andere waarde krijgt, waarna dezelfde takken
  draaien. `skip` levert een `skipped`-resultaat met reden `calendly_phase_skipped` —
  bewust niet `condition_not_met`, want dit is geen voorwaarde die niet klopte maar een
  bewuste keuze op de stap; stond het als "conditie niet voldaan" in het spoor, dan ga
  je een voorwaarde zoeken die er niet is.
  De vaste stappen (host + meeting-upsert) krijgen het blok NIET te zien
  (`isCalendlyKoppeling() && !target.is_system` in `-detail-mapping-tab.js`): die moeten
  in alle vier de fases draaien, anders blijft een geannuleerde afspraak in Odoo op
  actief staan — en de PUT erop wordt sowieso geweigerd door `assertNotSystemTarget`.
  De SLEUTELS liggen vast zodra er koppelingen op draaien: ze staan in
  `calendly_behavior` en in `fs_v2_targets.condition_values`, zelfde regel als
  `CALENDLY_FIELDS`.
  **Inzendingen van vóór deze wijziging hebben `booking_action` niet**: bij een replay
  daarvan vindt `faseGedragMap` geen fase en draait de stap zoals `operation_type`
  zegt. Een geconditioneerde stap (wie tóch een voorwaarde op `booking_action` zette)
  wordt dan overgeslagen — de veilige kant, geen dubbele leads.
- **De hostlijst van een eventtype is AFGELEID, niet opgevraagd.** Calendly's API v2
  heeft geen endpoint dat de hosts van een round-robin- of collectief eventtype
  teruggeeft; `profile` noemt enkel de eigenaar, en dat is bij een team-eventtype
  het team en niet de mensen. `verzamelEventTypes()` houdt daarom bij wélke
  organisatieleden een eventtype terugkregen via `/event_types?user=<lid>`:
  verschijnt een round robin onder drie collega's, dan zijn dat zijn hosts. Het
  scherm zegt dat er expliciet bij — een lege lijst betekent "wij konden het niet
  opvragen" (geen `organizations:read` of geen org-adminrechten), niet "er zijn
  geen hosts". De oude code deed `if (opgehaald.has(uri)) continue;`, waardoor de
  tweede vindplaats van een gedeeld eventtype volledig wegviel; dat is precies de
  informatie die je bij een round robin wil.
- **De eventtype-keuzelijst is GEGROEPEERD, niet plat.** Round robin → collectief →
  team → per collega (`groepeerEventTypes()` in
  `public/forminator-sync-v2-detail-calendly-tab.js`). Met dertig eventtypes waarin
  "Kennismaking" drie keer voorkomt is een platte lijst niet te gebruiken; de
  volgorde volgt de vraag die je bij het instellen stelt (eerst het gedeelde spul,
  want daar hangt een poel van mensen aan). Het kadertje eronder toont van het
  gekozen type de poelsoort, de eigenaar, de taal, de boekingspagina en de hosts.
  Dat kadertje wordt bij een wijziging APART hertekend
  (`handleCalendlyEventTypeChanged`, via `data-change-action="calendly-event-type"`
  in bootstrap.js) — de hele kaart hertekenen zou de keuze terugzetten op wat er
  opgeslagen staat.
- **Veldtypes staan in `VELDTYPES` (system-step.js) en worden AANGEVULD, nooit
  overschreven.** Zonder die omzetting gaat het stil mis: `resolveMappingValue()`
  past `coerceFieldValue()` alleen toe als er een `fs_v2_field_transforms`-rij is,
  dus zonder rij krijgt een boolean-veld de string `"false"` en leest Python
  `bool("false")` als True — een geannuleerde afspraak zou als niet-geannuleerd in
  Odoo staan. Dezelfde faalmodus als de `is_company`-bug van 2026-09-10.
- **`odoo_event_type_id`, `is_round_robin` en `form_language` worden in
  `webhook.js` aan de platte payload TOEGEVOEGD** uit de koppeling, en zijn geen
  `static`-mapping. Twee redenen: een `static`-waarde gaat als string naar Odoo en
  een many2one wil een getal, en wie het eventtype op de koppeling wijzigt zou
  anders ook de mapping moeten laten herschrijven.
- **De host is een `search`-stap op `hr.employee.name` — op NAAM, niet op
  e-mailadres** (`condition_field: 'host_name'` + `condition_values: ['__exists__']`).
  Onze medewerkers staan in Odoo met `work_email` op `@mymmo.com`, terwijl een
  Calendly-boekingspagina onder het MERK draait: dezelfde Thomas komt binnen als
  `thomas@openvme.be`. Zoeken op `work_email` vond daardoor NOOIT iemand, en dat
  is niet zichtbaar als fout — de stap staat op `continue_empty`, dus de meeting
  belandt gewoon zonder host in Odoo en het spoor zegt enkel "geen record
  gevonden". Calendly's `host_name` komt uit hetzelfde profiel als de Odoo-naam
  en is wél aan beide kanten dezelfde waarde. De conditie is niet cosmetisch:
  `event_memberships` kan leeg zijn, en een leeg zoekcriterium is in
  `buildIdentifierDomainForTarget()` een HARDE fout — zonder de conditie zou een
  ontbrekende hostnaam de hele indiening laten falen. `search_on_not_found:
  'continue_empty'`: een host die niet als medewerker in Odoo staat is geen reden
  om de afspraak niet te bewaren. **Na deze wijziging moeten bestaande
  koppelingen hun vaste stappen opnieuw laten bouwen** (knop "Vaste stappen
  herbouwen" → `POST /api/integrations/:id/calendly/rebuild`); `ensureCalendlySystemSteps()`
  draait niet vanzelf bij een deploy.
- **De leesbare datumvelden (`start_text` en co) zijn EIGEN velden, geen opmaak
  per stap.** Calendly levert uitsluitend ISO-tijdstippen in UTC
  (`2026-09-30T06:30:00.000000Z`). Die vorm hoort thuis in een datumveld van
  Odoo en nergens anders: zodra ze in een TEKST belandt — de naam van een lead,
  een chatter-notitie, een mail — leest een mens er de verkeerde dag en het
  verkeerde uur in (06:30 UTC is hier 08:30). `flattenCalendlyPayload()` zet
  daarom `start_text`, `start_range_text`, `start_date_text`, `start_day_text`,
  `start_hour_text`, `end_hour_text`, `start_short_text`, `start_text_invitee`,
  `booked_at_text` en `canceled_at_text` klaar, in **Europe/Brussels** —
  behalve `start_text_invitee`, dat in de tijdzone van de aanvrager staat en
  bedoeld is voor tekst die naar de aanvrager zelf gaat. Een onbekende tijdzone
  valt terug op Brussel in plaats van de indiening te laten falen; een
  onleesbaar tijdstip geeft een lege string, want een half ingevulde datum
  ("om 08:30" zonder dag) lees je niet als ontbrekend maar als fout.
- **De handtekening gaat over de RUWE body.** `Calendly-Webhook-Signature:
  t=<unix>,v1=<hex>`, waarbij v1 de HMAC-SHA256 is over `"<t>.<ruwe body>"` met de
  signing key die WIJ bij het aanmelden meegaven (Calendly geeft die nooit meer
  terug). `JSON.stringify(geparste body)` verschilt in sleutelvolgorde en
  witruimte en zou de handtekening altijd doen mislukken. Bij het verifiëren
  worden de laatste vijf sleutels geprobeerd, niet enkel de actieve: bij opnieuw
  aanmelden kunnen er bezorgingen onderweg zijn met de VORIGE sleutel, en die
  zouden anders stil achter een 401 verdwijnen.
- **Een genegeerde gebeurtenis geeft 200, geen 4xx.** Geldt voor een eventtype
  zonder koppeling en voor gebeurtenissen buiten `HANDLED_EVENTS`. Calendly ziet
  een 4xx als mislukt, blijft herbezorgen, en zet de subscription uiteindelijk op
  `disabled` — waarna ÁLLE Calendly-koppelingen stilvallen. Om dezelfde reden
  geeft een bewaarde boeking waarvan de pipeline stukliep een **202** en geen 500:
  herbezorgen lost een ontbrekend Odoo-veld niet op, en de OM heeft zijn eigen
  retry plus de Replay-knop.
- **`/api/calendly/status` vergelijkt onze rij met wat Calendly zélf zegt.** De
  stand `missing_at_calendly` betekent: de OM denkt dat er een aanmelding is, maar
  Calendly kent ze niet — er komt op dat moment niets binnen. Dat is exact de
  stille toestand waarin de Zapier-koppeling maandenlang verkeerde, dus dit scherm
  hoort het te zien.
- **`x_calendlymeeting` staat in `fs_v2_odoo_models`** (geseed in de migratie).
  Zonder die rij weigert `validateTargetPayload()` het model en kan de vaste stap
  niet aangemaakt worden.
- **De veldenlijst van het koppelingsscherm heeft nu VIER bronnen.** In
  `-detail-lifecycle.js`: `generic_webhook` → `extractGenericWebhookFields()`,
  `calendly` → `fetchCalendlyFields()`, `om_form` → `fetchOmFormFields()`, anders
  met een `forminator_form_id` → `fetchDetailFormFields()`. Roep voor Calendly
  NIET ook `extractGenericWebhookFields()` aan: die overschrijft de lijst en leest
  enkel het bovenste niveau van `source_payload`, waar bij Calendly
  `{form_id, form_data}` staat. `fetchCalendlyFields()` voegt de vaste lijst en de
  `q_<vraag>`-velden uit de laatste inzending zelf samen.

- **De BOEKINGSPAGINA wordt bij de koppeling bewaard (`calendly_scheduling_url`,
  `calendly_duration`), en dat is de bron van de keuzelijst in WordPress.** De
  shortcode-bouwer van mymmo-forms liet je de agenda-link overtypen; een typfout
  of een in Calendly hernoemd eventtype gaf dan een leeg tweede tabblad zonder
  foutmelding, en niets garandeerde dat die pagina hoorde bij een afspraak die de
  OM ook echt opvangt. `GET /forminator-v2/public/v1/forms` geeft daarom naast
  `forms` ook `calendly` terug (naam, link, duur, taal, `active`) — zelfde
  antwoord, zelfde cache van 60s, zelfde knop “Lijst opnieuw ophalen”.
  `listPublicCalendlyAppointments()` in `calendly/database.js` is de ENIGE plek
  die die vorm bepaalt (zelfde regel als `toPublicFormListItem()`): geen id, geen
  koppeling-id, geen eventtype-URI, want de sitesleutel is niet persoonsgebonden.
  Een kopie en GEEN live-bevraging van Calendly: de publieke API mag niet afhangen
  van een externe dienst of van een token dat er niet hoeft te zijn. Gevolg: een
  koppeling verschijnt pas in die lijst nadat haar Calendly-tabblad één keer
  opgeslagen is. Koppelingen die UITSTAAN blijven er wel in staan (`active: false`,
  de plugin zet er een waarschuwing bij) — boeken werkt dan gewoon, er komt
  alleen niets in Odoo, en verbergen zou een net ingestelde afspraak onvindbaar
  maken.

**Wat er in Odoo al stond (niet door de OM gemaakt, niet aanraken zonder reden):**
`x_calendlymeeting` (model 827) met 19 Studio-velden; `x_calendlyeventtypes` met
vier rijen (Partnership / Ondersteuning / Demo / Anders);
`crm.lead.x_studio_cm_calendlymeeting_ids`, een one2many met
`relation_field = x_studio_cm_invitee`, waardoor de meetings verschijnen bij élke
lead van diezelfde partner. Automation 12 "New CalendlyMeeting Demo > Check and
Create Lead" (server actions 835 + 836) vuurt ALLEEN bij `x_studio_cm_event_type = 3`
(Demo) en `x_studio_cm_isleadcreated != True`; `last_run` staat op 2025-09-26. Alle
meetings van juli 2026 kregen type "Anders" (4), dus die automation liep toen al
niet meer — dat is los van het stilvallen van Zapier. Zet het Odoo-eventtype per
koppeling dus bewust; staat het op "Anders", dan gebeurt er in Odoo niets extra.

**Nog niet gebouwd, bewust:** de INHAALSLAG voor 24 juli 2026 → nu. Calendly's
`/scheduled_events` kan die periode ophalen en de upsert op `x_studio_cm_event_id`
maakt het idempotent, dus dubbel draaien kan geen dubbele records geven. Eerst
bewijzen dat de koppeling vooruit werkt. Ook niet gebouwd: `invitee_no_show.*` en
`routing_form_submission.created`.

**Uitrolvolgorde (Zapier niet aanraken):** migratie → `CALENDLY_ACCESS_TOKEN`
zetten en deployen → koppeling aanmaken en op INACTIEF laten staan → aanmelden bij
Calendly → een testboeking doen (die wordt bewaard, Odoo wordt overgeslagen —
`skipPipeline`) → velden controleren op het tabblad Formuliervelden → koppeling
activeren → pas als het klopt de Zap uitzetten.

---

## Koppelingen — het vrije chatter-bericht (2026-09)

**Regel: de chatter-stap bewaart haar instelling ALTIJD als
`__COMBINED__:{json}`, ook zonder formuliersamenvatting.** De vlag `summary`
zegt of de samenvatting mee moet; de VORM van het opgeslagen veld mag dat nooit
impliciet doen.

Waarom dit hier staat: tot 2026-09-15 bewaarde `handleSaveChatterComposer()` de
kale Quill-HTML zodra de samenvatting uit stond. De server herkende dat niet als
HTML en haalde het door de escape-tak, waarna er letterlijk `<p>` en `<strong>`
als TEKST in de Odoo-chatter stond. Niet te zien in de editor (die toont het
voorbeeld correct), enkel in Odoo. `worker-handler.js` heeft daarvoor nu ook een
tak die een template herkent die met `<` begint — anders blijft elke al
opgeslagen stap kapot tot iemand ze opnieuw bewaart.

| Wat | Waar |
|---|---|
| Opgeslagen vorm | `fs_v2_targets.chatter_template` = `__COMBINED__:{message, summary, ids, labels, widths, buttons}` |
| Bericht → HTML, knoppen, samenvatting | `worker-handler.js`, blok `opType === 'chatter_message'` |
| Knopstijlen + `buildChatterButtonsHtml()` | `worker-handler.js` (`CHATTER_KNOP_STIJLEN`) |
| Editor + voorbeeld | `public/forminator-sync-v2-detail-chatter-composer.js` |
| Klik-/typ-acties van de knoprijen | `public/forminator-sync-v2-bootstrap.js` (`chatter-button-add/-remove`, `data-action-input="chatter-button-changed"`) |

- **Knoppen zijn een aparte lijst, geen HTML in het bericht.** Quill normaliseert
  alles wat je erin plakt naar zijn eigen formats, dus een `<a>` met inline
  stijlen overleeft de editor niet. De knoppen staan daarom als data
  (`{label, url, style}`) naast het bericht en worden server-side gerenderd.
  `url` mag een placeholder zijn (`{location_join_url}`).
- **Een knop met een lege of ongeldige link VALT WEG** bij het versturen — bij
  Calendly is dat de normale gang van zaken (een annulatie heeft geen join-link
  meer), en een knop "Deelnemen" die nergens heen gaat is erger dan geen knop.
  Het voorbeeld in de editor zegt er expliciet bij hoeveel knoppen wegvallen en
  waarom; stil niets tonen leest als een fout in de editor.
- **De knopstijlen zijn een GESLOTEN lijstje** en staan TWEE keer: als
  `CHATTER_KNOP_STIJLEN` in `worker-handler.js` en als `KNOP_STIJLEN` in de
  composer. De Worker kan niets uit `public/` importeren. Wijzig je een kleur,
  wijzig ze op beide plekken — anders belooft het voorbeeld iets anders dan wat
  er in Odoo komt te staan. Zelfde afweging als `KNOP_STIJLEN` in de mailstudio:
  aan een notitie die al in de chatter staat kan je een onleesbare kleur niet
  meer bijstellen.
- **Odoo's `html_sanitize` FILTERT de inline stijl per eigenschap.** `style` en
  `href` blijven op een `<a>` staan, maar niet elke property overleeft: de
  shorthand **`background` wordt stil weggeknipt, `background-color` niet**.
  Dat kostte een ronde: de knoppen kwamen in de chatter als lege dozen met een
  gekleurde rand, want de vulling was weg terwijl `color:#ffffff` bleef staan —
  witte tekst op wit. Geverifieerd op de opgeslagen `mail.message`-body (12571991
  miste `background`; 12571980, de handtekeningmail, had zijn `background-color`
  nog). Schrijf dus altijd de volledige property-naam, en controleer een nieuwe
  eigenschap door na te kijken wat er ECHT in `mail.message.body` staat — niet
  door aan te nemen dat het doorkomt, want de sanitizer meldt niets. Ga hier ook
  niet op improviseren met `class`: die hangt af van Odoo's eigen stylesheets.

---

## Koppelingen — bijlagen bij de `send_mail`-stap (2026-09)

**Regel: een stap bewaart een VERWIJZING naar een bestand in de Asset Manager,
nooit de inhoud en nooit een Odoo-attachment-id.** Daardoor draagt het
vervangen van dat bestand vanzelf door naar de volgende mails; er is niets in
de koppeling dat dan bijgewerkt moet worden, en dus ook niets dat vergeten kan
worden.

| Wat | Waar |
|---|---|
| Vorm, grenzen, R2 → Odoo `ir.attachment` | `src/modules/forminator-sync-v2/mail-attachments.js` |
| Opgeslagen keuze | `fs_v2_targets.mail_attachments` = `[{key, name}]` |
| Cache R2-inhoud → Odoo-attachment | tabel `fs_v2_mail_attachment_cache`, sleutel `(r2_key, etag)` |
| Aansluiting op de stap | `mail-step.js`, blok "6. Bijlagen" → `values.attachment_ids` |
| Bladeren door de Asset Manager | `GET /forminator-v2/api/mail-assets?prefix=` in `routes.js` |
| Gedeelde prefix- en rechtenregels | `src/modules/asset-manager/lib/namespace.js` |
| Kiezer + bijlagelijst in de composer | `public/forminator-sync-v2-mail-attachments.js` |
| Migratie | `supabase/migrations/20260914120000_fsv2_mail_attachments.sql` |

Afspraken die bewust zo zijn:

- **De cachesleutel is `(r2_key, etag)`, niet `r2_key` alleen.** R2's etag
  verandert zodra de bytes veranderen, dus een vervangen bestand krijgt
  automatisch een nieuw `ir.attachment` en de volgende mails dragen de nieuwe
  versie. De oude rij blijft staan: al verzonden mails wijzen ernaar en die
  geschiedenis moet kloppen. Ware de sleutel alleen `r2_key`, dan bleef er stil
  een verouderde PDF vertrekken — zonder fout, zonder melding, en pas op te
  merken door een ontvanger.
- **Zonder cache maakt elke indiening een volledige kopie van dezelfde PDF in
  Odoo.** Bij een paar honderd leads zijn dat honderden megabytes voor één
  bestand. Het gedeelde attachment krijgt daarom bewust GÉÉN `res_model`/
  `res_id`: zou het aan het eerste lead hangen, dan verdwijnt het bij het
  opruimen van dat lead en breken alle andere mails mee.
- **Een ontbrekende bijlage GOOIT; er wordt dan geen mail klaargezet.** De stap
  komt als `mail_failed` in het indieningsspoor en is replaybaar zodra het
  bestand terugstaat. Doorsturen zonder bijlage is de slechtere uitkomst: een
  mail die "in bijlage vind je..." zegt en niets meestuurt, merkt niemand aan
  onze kant op.
- **Grenzen: 5 bijlagen, samen 7 MB ruw.** Postmark weigert boven 10 MB, en dat
  is NÁ base64 (≈ +33%) en inclusief de tekst. De grens wordt server-side
  afgedwongen en niet alleen in de UI, want een bestand kan ná het instellen
  van de stap nog groeien.
- **Er is GEEN uploadveld in de bijlagekiezer.** Uploaden en vervangen gebeurt
  in de Asset Manager; de kiezer leest alleen. Uploaden op twee plekken
  betekent onvermijdelijk twee bestanden waarvan er één veroudert — precies wat
  dit ontwerp moet vermijden.
- **De rechten zijn die van de Asset Manager, niet een soepelere kopie.**
  `canReadAssetPrefix` en `isWithinAssetNamespace` staan sinds deze wijziging in
  `asset-manager/lib/namespace.js` en worden door beide modules geïmporteerd;
  `asset-manager/routes.js` heeft er geen eigen kopie meer van. De route leeft
  wél in Koppelingen, omdat `/assets/api/assets/list` achter de module-toegang
  van de asset-manager zit en wie koppelingen beheert die niet noodzakelijk
  heeft. Een gebruiker zonder de rol `asset_manager` ziet alleen zijn eigen
  `users/{id}/`-map — de kiezer zegt dat er dan ook bij in plaats van leeg te
  zijn.
- **Een al KLAARGEZETTE mail volgt een vervangen bestand NIET.** Met een
  vertraging plus verzendvenster kan een mail uren in Odoo's wachtrij staan; die
  wijst dan nog naar het oude attachment. Bewust niet opgelost: dat vraagt een
  cron die `outgoing` mails herschrijft, en het venster is klein.
- **Het voorbeeld ("Verversen") meldt terug of elk bestand er nog staat**
  (`describeMailAttachments` → `data.attachments[].missing`). Zo zie je het in de
  editor, niet pas bij een mislukte indiening.

## Koppelingen — pdf-stap (2026-09)

**Regel: een koppeling kan een `generate_pdf`-stap toevoegen die een
module-breed sjabloon (`fs_v2_pdf_templates`, dezelfde vorm als
`window.OFFERTE_DATA`/`window.OFFERTE_VELDEN` uit `public/offerte-data.js`)
vult, rendert en als `ir.attachment` uploadt.** De renderer is `public/
offerte-render.js` zelf, gedraaid in een echte headless browser (Cloudflare
Browser Rendering) -- er bestaat GEEN tweede, server-side kopie van de
offerte-layout. Zie `docs/plan-offerte-pdf-stap.md` voor de volledige
onderbouwing en de afwegingen die hieronder terugkomen.

| Wat | Waar |
|---|---|
| Sjabloon (module-breed, seed = `offerte-data.js`) | tabel `fs_v2_pdf_templates`, migratie `20260918120000_fsv2_pdf_templates.sql` |
| Zes nieuwe kolommen op de stap | `fs_v2_targets`, migratie `20260918120100_fsv2_pdf_step.sql` |
| Gegevens vullen, contactpersoon, renderen, uploaden, idempotentie | `src/modules/forminator-sync-v2/pdf-step.js` |
| Aansluiting in de pipeline | `worker-handler.js`, blok `opType === 'generate_pdf'` (voor het `send_mail`-blok) |
| Sjabloon-CRUD + testgeneratie | `GET/POST/PUT/DELETE /api/pdf-templates(/:id)`, `POST /api/targets/:id/pdf-test` in `routes.js` |
| Bijlage bij een `send_mail`-stap | `mail-attachments.js` (`splitMailAttachments`), `mail-step.js` |
| Composer in het detailscherm | `public/forminator-sync-v2-detail-pdf-composer.js` |
| Instellingen -> PDF-ontwerpen (lijst, niet de editor zelf) | `public/forminator-sync-v2-settings.js` |
| De editor zelf | `public/offerte.html?template=<id>` (laadt/bewaart via de sjabloon-CRUD-routes, i.p.v. enkel `localStorage`) |

Afspraken die bewust zo zijn:

- **Een renderer.** `renderPdf()` in `pdf-step.js` navigeert Browser Rendering
  naar `/offerte.html?server=1` en roept `window.OFFERTE.zet({gegevens, copy})`
  aan -- die functie bestond al in `offerte-render.js`. Er is bewust GEEN
  tweede, lichte previewmotor gebouwd (ook niet voor de testroute): dat zou
  het twee-renderers-probleem zijn dat elders in deze module telkens vermeden
  wordt (zie `form-preview-parity-test.mjs`).
- **De invulvelden zijn gewone `fs_v2_mappings`-rijen.** `odoo_field` is hier
  geen echt Odoo-veld maar het PAD in de `gegevens` van het sjabloon (bv.
  `gebouw.adres`). Zo hergebruikt de stap dezelfde bronnen (formulierveld /
  vorige stap / vaste tekst) als de rest van de pipeline, in plaats van een
  vierde mapping-mechanisme te verzinnen. Een ongemapt veld houdt gewoon de
  standaardwaarde van het sjabloon -- `buildPdfGegevens()` schrijft alleen
  paden die in `template.data.velden` voorkomen; een verdwenen of hernoemd pad
  wordt genegeerd (met een waarschuwing), niet fataal.
- **De contactpersoon is GEEN gegevens-veld.** `pdf_contact_source` (`fixed` |
  `dynamic` | leeg) bepaalt of naam/e-mail/foto uit een vast gekozen
  `hr.employee`-id komen, uit het record-id dat een vorige stap opleverde, of
  gewoon uit het sjabloon blijven staan. De foto gaat als `data:image/...;
  base64,...` het `<img>`-element in -- `image_512` (niet `image_1920`, die
  kan te groot zijn voor `page.evaluate`).
- **Idempotentie zit op een marker in het attachment, niet op `action_result`.**
  `pdf_generated`/`pdf_reused` staan niet in de lijst die `shouldSkipOnRetry()`
  in `worker-handler.js` overslaat, dus de stap draait bij elke retry gewoon
  opnieuw. Om dan geen tweede pdf te maken, zoekt `runGeneratePdfStep()` eerst
  op de omschrijving `"OM pdf-stap target:<id> submission:<id>"` op
  `ir.attachment` en hergebruikt die als ze bestaat. Een REPLAY is sinds
  2026-10 een handmatige retry van DEZELFDE indiening (zie hieronder) en
  hergebruikt de pdf dus ook.
- **Replay = handmatige retry van dezelfde indiening, geen nieuwe indiening**
  (`replaySubmission()` in `worker-handler.js`). Eerst maakte een replay een
  nieuwe rij en liet ze alles opnieuw lopen; omdat de bescherming tegen een
  dubbele mail aan het indieningsnummer hangt, vertrok een mail die al weg was
  dan nog eens, en stonden notitie en activiteit er dubbel. Nu loopt dezelfde
  indiening in retry-modus: wat in `RETRY_DONE_ACTIONS` staat (ook `posted` en
  `activity_created`, die eerst ontbraken en dus bij elke retry opnieuw kwamen)
  wordt overgeslagen, met zijn resultaat terug in de context. Mail en pdf staan
  er bewust niet in: die zijn zelf idempotent op het indieningsnummer en moeten
  hun uitvoer opnieuw in de context zetten. `full: true` (de oranje knop
  "forceren") laat alles opnieuw lopen, op dezelfde indiening. De oude
  replay-rijen (`replay_of_submission_id`) blijven leesbaar.
- **`pdf_failed` is net als `mail_failed` NIET automatisch replaybaar.**
  `classifyFinalSubmissionStatus()` telt enkel `failed`/`pipeline_abort` mee;
  een indiening met een mislukte pdf-stap maar verder geslaagde stappen komt
  op `success` te staan. Bewust niet aangepast: dat zou alle koppelingen
  raken. Zie `docs/plan-offerte-pdf-stap.md` open punt O2 als dat ooit anders
  moet.
- **Een gegenereerde offerte HANGT AAN HET RECORD van de mail** (`res_model`/
  `res_id`, via `hangAan` in `resolveMailAttachments()`); een Asset
  Manager-bestand (brochure) blijft bewust los. Een `ir.attachment` zonder
  record kan enkel de maker (de Worker = Administrator) openen: elke collega
  kreeg in de chatter een foutpagina (`18875.htm`), en dat las als "de klant
  kreeg een lege offerte" (2026-09-28, Liliane Bosmans).
- **De offerte gebruikt zelf gehoste, STATISCHE lettertypes**
  (`public/fonts/offerte-fonts.css`), nooit de Google Fonts-link. Google geeft
  Chrome een variabel lettertype, en headless Chrome sluit dat in de pdf in als
  Type3 -- in Chrome/Acrobat oké, in sommige pdf-voorbeelden (webmail,
  telefoon) zonder tekst. Een extra dikte = een extra TTF + `@font-face`.
- **De mailbijlage kent twee vormen.** `fs_v2_targets.mail_attachments` blijft
  `[{key, name}]` voor een statisch Asset Manager-bestand; `{type: 'pdf_step',
  targetId, name}` verwijst naar het `ir.attachment` dat een `generate_pdf`-stap
  MET DIE TARGET-ID zonet in dezelfde inzending maakte -- bewust het target-id
  en geen stapnummer, want `execution_order` verandert bij het verplaatsen van
  stappen. `splitMailAttachments()` in `mail-attachments.js` scheidt de twee
  vormen voor de bestaande R2-code, die verder ongewijzigd blijft.
  `resolveMailAttachments()` leest voor een `pdf_step`-item rechtstreeks
  `contextObject['pdf.<targetId>.attachment_id']` -- geen R2, geen cache nodig,
  het bestaat al. Ontbreekt die sleutel (pdf-stap mislukt, overgeslagen, of
  staat NA de mailstap), dan gooit dat dezelfde `MailAttachmentError` als een
  verdwenen R2-bestand: de mail wordt dan niet klaargezet in plaats van zonder
  offerte te vertrekken.
- **De volgordebewaking (`_linkedOrders()` in `-detail-mapping-tab.js`) kent
  drie nieuwe afhankelijkheden**: `pdf_res_id_source`, `pdf_contact_source_value`
  (beide zelfde vorm als `activity_res_id_source`) en, voor een mailstap, elke
  `pdf_step`-bijlage die naar een vroegere stap wijst. Een stap verplaatsen die
  dit zou breken wordt geweigerd, in beide richtingen.
- **De pipeline draait synchroon binnen het verzoek; de WP-plugin wacht
  maximaal 15 s.** `renderPdf()` heeft daarom een tijdsbudget van 9 s
  (`RENDER_TIMEOUT_MS`) -- bij overschrijding faalt de stap netjes
  (`pdf_failed`, met dezelfde beperking op replay als hierboven) in plaats van
  de hele indiening te laten vastlopen. Of dit op termijn naar een asynchroon
  pad moet (Queue/Workflow), staat als open punt O1 in het plan-document --
  eerst meten bij een echte inzending.
- **Browser Rendering vereist een aparte Cloudflare-binding** (`"browser": {
  "binding": "BROWSER" }` in `wrangler.jsonc`) **en de `@cloudflare/puppeteer`
  -dependency**, plus dat Browser Rendering effectief aanstaat op het account
  (Workers Paid, eigen quotum) -- controleren voor de eerste deploy na deze
  wijziging.
- **"Pdf maken" in de editor maakt de pdf op de SERVER en bewaart ze**
  (`POST /api/offerte-pdf` → `createManualPdf()`, zelfde `renderPdf()` als de
  stap). Ze komt in `fs_v2_generated_documents` met `source = 'manual'`,
  `created_by` en zonder `integration_id` (migratie
  `20260929120000_fsv2_generated_documents_manual.sql`). "Afdrukken"
  (`window.print`) bewaart niets. **"Recente pdf's"** in de werkbalk
  (`GET /api/generated-documents`) toont alles van de laatste 30 dagen,
  handmatig én uit elke koppeling -- het tabblad "Documenten" per koppeling
  blijft daarnaast bestaan. Er wordt NIETS automatisch verwijderd: de
  chatter-notitie in Odoo linkt naar de downloadroute, en die link moet blijven
  werken.
- **De contactpersoon in de editor is standaard de AANGEMELDE medewerker**
  (`GET /api/pdf-contacten/mij`, op werkadres / login / hetzelfde adres op
  @mymmo.com), maar dat gaat NIET mee naar het sjabloon zolang niemand zelf
  een contactpersoon koos (`contactAuto` + `gegevensVoorSjabloon()` in
  offerte-render.js). Anders zet elke collega die de editor opent zichzelf in
  het sjabloon, en daarmee in elke koppeling zonder `pdf_contact_source`. Het
  adres volgt het merk van het bedrijf (zelfde regel als
  `emailOpBedrijfsdomein()`), met een domeinkiezer om dat bij te sturen.
- **De editor (`offerte.html`) is bewust NIET verplaatst.** Ze blijft een
  volwaardige, zelfstandige pagina met eigen toolbar/dialogen; Instellingen ->
  PDF-ontwerpen beheert enkel de LIJST (naam, gebruikt-in-hoeveel-stappen,
  aanmaken/hernoemen/verwijderen) en "Bewerken" opent de editor in een nieuw
  tabblad -- geen iframe-inbedding, geen tweede bewerklaag naast het echte
  voorbeeld, zelfde afweging als bij de mailstudio.
- **`offerte.html` staat, zoals elk bestand in `public/`, zonder auth-gate
  rechtstreeks bloot** (Cloudflare's `assets`-binding serveert het voor
  `index.js`, geen `run_worker_first` in `wrangler.jsonc`) -- bestaand gedrag,
  niet iets dat deze wijziging introduceert. Onschadelijk hier: het sjabloon
  bevat enkel standaardwaarden (bedrijfsnaam, demo-klant), nooit klantdata van
  een echte inzending; de `/api/pdf-templates*`-routes die het sjabloon
  LEZEN/BEWAREN zitten wel achter de normale auth-gate.

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

**Regel 7 — een module zonder mini-app logt evengoed. Gebruik `askAI()`, bouw geen tweede pad.**

`askAI(env, app, user, options)` aanvaardt sinds 2026-09-20 een aanroeper ZONDER
mini-app: `{ id: null, source: '<module>' }`. Alleen de PER-APP daglimiet valt
dan weg (die telt op `mini_app_id`, en er is er geen); de platform-brede limiet,
`MODEL_ALLOWLIST`, het foutcontract, de stall-timeout en de audit-regel blijven
allemaal gelden.

`mini_app_ai_calls.mini_app_id` mag daarvoor NULL zijn en er is een
`source`-kolom bij gekomen (migratie `20260920140000_ai_calls_source.sql`,
DEFAULT `'mini_app'` zodat de historiek meteen klopt). Het label in het rapport
komt uit `SOURCE_LABELS` in `mini-apps/routes.js`; een source die daar nog niet
in staat toont zijn eigen naam in plaats van te verdwijnen, zodat een nieuwe
module meteen zichtbaar is.

Er staat bewust GEEN CHECK-constraint op `source`: dan zou elke nieuwe module
een migratie nodig hebben om zichzelf te mogen loggen, en de kans is reëel dat
iemand dan het loggen overslaat in plaats van de migratie te schrijven.

**Schrijf dus nooit een eigen aanroep rechtstreeks naar
`ai-providers/*.js`.** Dat was de eerste versie van de artikel-analyse in
content-feed, en het gevolg was AI-kosten die in geen enkel rapport stonden --
precies de stille faalmodus waar deze repo al twee keer last van had.

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
| Editor | `public/events-v2-mail-studio.js` + de dialogen in `events-v2.html` |
| Vimeo-videokiezer | `lib/vimeo.js` + `GET /api/vimeo/videos` (secret `VIMEO_ACCESS_TOKEN`) |
| Tests (zonder Odoo/netwerk) | `node src/modules/event-operations-v2/tests/mail-test.mjs` |

Afspraken die bewust zo zijn:

- **Odoo blijft de enige database.** De blokken staan in twee Studio-velden, niet in
  Supabase en niet in KV. Dat is dezelfde regel als in `lib/blocks.js` ("er komt GEEN apart
  blokkenschema: dat zou een tweede waarheid naast Odoo zijn").
- **De HEADER is bedrijfsgebonden, de INHOUD niet.** Het model kent precies twee plekken
  waar de site iets doet: (1) `section.header` met een slot per site plus `fallback` voor wie
  via een andere weg inschreef — dit vervangt de QWeb `t-if`/`t-elif`/`t-else` op
  `x_studio_registration_site`; en (2) `section.variants`, dat er alleen is als iemand
  uitdrukkelijk kiest voor aparte inhoud per bedrijf, met `catchAll` als de versie voor
  onbekende sites. **Zichtbaarheid per blok bestaat niet** — een eerdere opzet gaf elk blok
  een `sites`-lijst, en dat dwong de gebruiker per alinea na te denken over iets dat in 95%
  van de mail identiek is. Voer dat niet opnieuw in.
- **Documenten in de oude vorm (v1) migreren automatisch** bij elke lees-actie
  (`migrateV1Section`): `hero`-blokken worden headerslots, `sites` op de overige blokken
  vervalt, `other` heet nu `fallback`. Een document dat nog in de oude vorm in Odoo staat
  blijft dus gewoon werken en wordt bij de eerstvolgende save omgezet.
- **Een override op het event vervangt de sectie VOLLEDIG**, nooit half. Half overnemen zou
  betekenen dat je bij het lezen van een event niet meer kan zien wat er verstuurd wordt.
- **De vlag is niet de waarheid; het `mail.mail`-record is dat.** Vlag en mail leven op twee
  modellen, dus "in één schrijfactie" bestaat niet. De idempotentie draait op een afgeleide
  `message_id` (`<evt{id}-{soort}-reg{id}@om.mymmo.com>`): zoeken → `create` → dán de
  boolean. Mislukt die laatste write, dan kan er nog steeds geen dubbele mail ontstaan.
  `auto_delete` staat daarom expliciet op `false` (de oude templates zetten hem op `true`,
  waardoor er na verzending niets bewijsbaars overbleef). Dit is bewust het omgekeerde van
  de v1-bug waar een `catch` de vlag kon overslaan.
- **De reminder-timing staat op de SECTIE, niet in code**: `section.timing =
  { enabled, leadHours, minLeadHours }` (`DEFAULT_TIMING` in mail-blocks.js). `enabled: false`
  zet de reminder helemaal uit voor dat event-type; `minLeadHours > 0` slaat hem over voor wie
  te laat inschrijft om er nog iets aan te hebben. **`minLeadHours` staat bewust standaard op
  0**: een late inschrijver zonder reminder is precies het gat dat de oude Odoo-cron had.
  `lib/mail-cron.js` leest die timing per event op — zonder dat zou de herstelronde alles
  terugzetten op 24 uur en een bewuste instelling stil overschrijven.
- **Een recap zonder opname wordt GEWEIGERD** (`MAIL_RECAP_NO_VIDEO`) zodra de mail een
  opnameblok bevat. Het blok zou stil wegvallen en dan vertrekt er een mail die naar een
  opname verwijst die er niet is.
- **`include_sent` negeert de `_sent`-vlag** bij het klaarzetten. Nodig voor HISTORISCHE
  events: de oude Odoo-serveractie 1099 zette `x_studio_recap_email_sent` op true voor álle
  registraties, ook waar de verzending faalde en ook voor de duplicaten die ze net had
  weggefilterd. Die vlag is voor oudere events dus geen betrouwbaar antwoord op "heeft deze
  persoon de mail gehad". Dubbele mails kan het niet geven — de bewaking zit op de
  `message_id`. De studio biedt dit aan zodra een inhaalactie 0 ontvangers oplevert.
- **"Bekijk zoals verstuurd"** (`#mailProofDialog`) rendert met `editable: false` en een
  echte of voorbeeld-inschrijving: placeholders ingevuld, knoppen in hun echte stijl, lege
  blokken weggevallen. Dat is het enige scherm waarop je kan controleren wat er écht vertrekt
  — de editor toont chips en lege blokken en is daarvoor per definitie ongeschikt.
- **Knopstijlen zijn een GESLOTEN lijstje** (`KNOP_STIJLEN` in mail-render.js): een vrije
  kleurkiezer levert onleesbare combinaties op, en in een mail kan je dat achteraf niet meer
  bijstellen. De link van een knop staat in de editor onder de knop (`→ https://…`) en niet in
  de verzonden mail.
- **Het `map`-blok is geen echte kaart**: iframes worden door mailclients gestript. Het toont
  het adres met een routeknop naar `google.com/maps/search/?api=1&query=…` — de vorm die
  Google zelf voorschrijft voor alle platformen, dus die opent de Maps-app op mobiel en de
  browser op desktop. Een `geo:`- of `maps://`-link doet dat maar op één platform. Een
  statische kaartafbeelding is optioneel: die URL plak je in de instellingen, zodat er geen
  extra API-sleutel nodig is om het blok te kunnen gebruiken.
- **De knop "Alsnog klaarzetten" is een INHAALACTIE, geen "nu versturen".** Bevestiging en
  reminder vertrekken vanzelf bij het inschrijven; die knop is er voor de recap en voor wie
  er doorheen geglipt is. Voor één persoon: het mail-menu per rij in het
  inschrijvingenoverzicht (`queue-one-mail`), dat dezelfde route gebruikt met
  `registration_ids`. Dubbel klikken kan geen dubbele mail geven — de bewaking zit op de
  `message_id`, niet op de `_sent`-vlag.
- **`scheduled_date` wordt bij het INSCHRIJVEN gezet**, niet dagelijks herberekend. Odoo-cron
  84 (server action 1102) deed dat wel en liet daardoor iedereen die inschreef ná zijn
  dagelijkse run én binnen 24u vóór het event zonder reminder achter (registratie 1080,
  2026-09-05, is daar een live voorbeeld van). `lib/mail-cron.js` corrigeert alleen nog wat
  al klaarstond wanneer een event nadien verplaatst of geannuleerd wordt.
- **Dag en uur worden afgeleid uit `starts_at` in Europe/Brussels**, niet uit
  `x_studio_starting_day`/`x_studio_starting_time`. Server action 1109 (cron 85) schrijft
  `starting_day` uit `x_studio_event_datetime` ZONDER tijdzone-conversie terwijl Odoo in UTC
  bewaart: een event na 22:00 UTC komt daar op de verkeerde dag te staan. Beide velden worden
  bovendien maar dagelijks bijgewerkt, dus een event dat vandaag verplaatst wordt heeft tot de
  volgende run een verkeerde dag in de mail. (`starting_time` is wél correct gevuld en wordt
  door geen van beide crons geschreven — herkomst onbekend; nog een reden om er niet op te
  bouwen.) De afgeleide waarde houdt de vorm "dinsdag, 8 september" aan, met komma, zoals de
  bestaande mails het tonen — `nl-BE` laat die komma zelf weg.
- **De mailopmaak is overgenomen van template 50/55** (lichtblauw #f0f9ff, full-bleed hero,
  witte kaarten van 720px met radius 16 en 48px padding, grijs detailkader, afzenderkaart met
  ronde foto, kleine grijze voettekst). De layout loopt nu via TABELLEN met een `width`-attribuut
  in plaats van `div` + `max-width` + `border-radius`: Outlook op Windows rendert met de
  Word-engine, die geen van beide kent, waardoor de oude mail daar over de volle vensterbreedte
  liep. `object-fit:cover` op de hero is weggelaten — vrijwel elke mailclient negeert het.
- **Placeholders zijn logic-loos**: `{{pad.naar.waarde}}` en niets anders. Geen eval, geen
  Function-constructor, geen conditionals in de tekst (zelfde principe als de
  mini-apps-templates). Een onbekende placeholder wordt leeg, niet zijn eigen naam.
- **`EVENTS_V2_MAIL_OWNER` bepaalt wie verstuurt.** Kommagescheiden event-type-id's, of `*`.
  Leeg/afwezig = de OM stuurt niets — een deploy op zich kan dus nooit een mail veroorzaken.
  Zolang de oude rules aan staan is dat geen dubbele verzending: hun filter is exact
  `x_studio_confirmation_email_sent = False` resp. `..._reminder_... = False`, en de OM zet
  die vlag.
- **`{{event.url}}` volgt de site van de inschrijving.** `resolvePublicOrigin()` zoekt
  `x_studio_registration_site` op in de bestaande `EVENTS_PUBLIC_ORIGINS` en valt terug op
  `EVENTS_SHARED_CANONICAL_ORIGIN`. Voer hier **geen** aparte basis-URL-variabele voor in:
  één vaste waarde zou iemand die op syndicoach.be inschreef een openvme-link sturen.
- **Placeholders staan in de editor als CHIP, niet ingevuld.** `tokenizeToChips()` in
  mail-render.js draait alleen bij `editable: true`; bij het versturen wordt normaal
  ingevuld. Dit is geen cosmetiek: het voorbeeld toont anders de ingevulde waarde, en de
  editor schrijft bij het verlaten van een veld terug wat er staat — één klik op een titel
  zou `{{event.type}}` dan vervangen door "Q&A" en het sjabloon stilletjes vernielen.
  Chips gaan terug naar `{{pad}}` via `fromChips()` in de studio, die de DOM aflooopt (niet
  een regex op innerHTML, want dan sneuvelt de omliggende opmaak).
- **Typen hertekent het voorbeeld NIET.** `markDirty(false)` bij tekstwijzigingen,
  `markDirty()` (met hertekenen) alleen bij structurele wijzigingen: blok erbij, weg,
  verplaatst, of een instelling gewijzigd. Het voorbeeld ÍS de editor — dat opnieuw opbouwen
  tijdens het typen gooit de cursor weg, sluit de "/"-kiezer en laat het scherm flikkeren.
- **De ondergrens van de reminder (`minLeadHours`) gaat over het INSCHRIJFMOMENT, niet over
  "nu".** Zat als bug in `computeScheduledDate()`: die mat de grens tegen het moment waarop
  de functie draaide. Gevolg bij event 76: `minLeadHours` stond op 48, het event begon over
  29 uur, en het handmatig klaarzetten van reminders voor twintig bestaande inschrijvingen
  leverde NUL mails op -- allemaal stil overgeslagen, en in de logs zag je alleen dat er na
  het lezen van de blokken niets meer gebeurde. De regel zit nu in `reminderTooLate(event,
  timing, registeredAt)` en wordt PER INSCHRIJVING toegepast met `registration.created_at`.
  Zonder bekend inschrijfmoment slaat hij niemand over -- falen naar "wel sturen", want de
  andere kant betekent dat een echte deelnemer stil niets krijgt.
- **Een overgeslagen mail moet ZIJN REDEN tonen.** De studio zet de redenen nu in de
  melding en toont een alert als er niets is klaargezet. "0 klaargezet, 20 overgeslagen"
  zonder reden kostte een halve dag zoeken.
- **KV-verbruik: drie lagen, en KV is de laatste.** Dit was uit de hand gelopen omdat elk
  publiek verzoek KV raakte:
    1. `caches.default` (public-api.js) — gratis, per datacenter, zit vóór alles. Een
       treffer kost geen KV-read, geen Odoo-call en geen rekenwerk. De sleutel bevat de
       versienummers van `events` én `event_types` plus de sitesleutel (nooit de echte URL:
       dan zou een respons van site A aan site B geserveerd kunnen worden), en CORS-headers
       gaan NIET mee in de opslag maar worden per verzoek gezet.
    2. het geheugen van de isolate (cache.js) — `valueMemo` en `versionMemo`. Een isolate
       leeft minuten tot uren; wat daar staat hoeft niet uit KV te komen.
    3. KV zelf.
  Wat er weg is: `checkRateLimit` deed een read EN EEN WRITE bij elk publiek leesverzoek —
  een write per pageview, terwijl KV per sleutel maar één write per seconde aanneemt en de
  rest stil weggooit (duur én onbetrouwbaar). Het leespad gebruikt nu
  `checkRateLimitLocal()`, een teller in het geheugen; de grens geldt daardoor per isolate
  in plaats van globaal, wat voor het doel (iemand die de API platlegt) volstaat. Het
  SCHRIJFPAD (inschrijven) houdt bewust de KV-variant: daar moet de grens echt globaal zijn
  en het volume is laag. En elke `readThrough` deed eerst een read voor het versienummer en
  dan de echte read: twee reads per cachetreffer. Het versienummer staat nu 5 seconden in
  het geheugen (`VERSION_MEMO_MS`). Dat is de enige concessie: maakt een ANDERE isolate iets
  ongeldig, dan ziet deze dat pas na 5s — op data die toch al 60s gecached wordt.
  `cache-test.mjs` TELT de KV-operaties; een verandering die er weer meer van maakt, faalt.
- **`meta.generated_at` mag NOOIT in de ETag zitten.** Het staat in elke publieke respons en
  veranderde bij elk verzoek, waardoor de ETag ook elke keer anders was en het
  `If-None-Match` van de WordPress-plugin nooit matchte. Elke verversing haalde dus de
  volledige body op en liet de hele molen draaien (KV + Odoo) terwijl er niets gewijzigd
  was. `etagForPayload()` slaat het veld over bij het hashen; het veld zelf blijft staan,
  want het hoort bij de vorm die de plugin kent.
- **De knopkleur is een vrije kleur met een berekende tekstkleur.** `block.color` is
  `'category'` (een VERWIJZING naar de kleur van de eventcategorie, blijft dus meeschuiven)
  of een hex uit de kleurkiezer; `block.outline` maakt daar de omlijnde versie van. De oude
  gesloten `variant`-lijst blijft werken -- er staan mails in Odoo met `variant: "subtle"`.
  De TEKSTKLEUR kiest de gebruiker niet: `leesbareTekstkleur()` rekent zwart of wit uit
  (WCAG-helderheid, drempel 0,6). Een vrije kleurkiezer zonder die berekening levert witte
  tekst op een gele knop, en in een verstuurde mail kan je dat niet meer bijstellen. De
  voorgestelde stalen zijn de kleuren van de eventcategorieën uit Odoo (via
  `/api/mail/announcement-options`), zodat het lijstje meegroeit en niemand hex-codes moet
  opzoeken. Een onbruikbare kleur wordt bij het normaliseren WEGGEGOOID, niet bewaard --
  anders belandt er `color:undefined` in de HTML.
- **Klaarstaande mails worden BIJGEWERKT, niet overgeslagen.** `queueMails()` heeft
  `refresh` (standaard `true`): staat er voor deze (event, soort, inschrijving) al een
  `mail.mail` met `state = 'outgoing'`, dan wordt die HERSCHREVEN met de huidige inhoud
  (`subject`, `body_html`, `email_from`, `reply_to`, `email_to`, `scheduled_date`) in
  plaats van dat de inschrijving wordt overgeslagen. `message_id` en `state` blijven af --
  de sleutel is de idempotentie. `state = 'sent'` wordt NOOIT aangeraakt: die mail staat in
  iemands inbox, herschrijven zou een archief vervalsen zonder dat de ontvanger het merkt.
  `state = 'cancel'` (gearchiveerde inschrijving) blijft ook staan; die weer tot leven
  wekken is de taak van `revivePendingMails()`. Daarvoor is `findAlreadyQueued()` vervangen
  door `findExistingMails()`, dat de TOESTAND per inschrijving teruggeeft; de oude naam
  blijft als wrapper bestaan. Het antwoord van de send-route heeft nu `queued`, `updated` én
  `skipped` -- wie alleen naar `queued` kijkt, meldt onterecht "er is niets gebeurd".
  Herschrijven gebeurt met één write per mail (onderwerp en body verschillen per ontvanger),
  in groepen van tien parallel: tweehonderd opeenvolgende JSON-RPC-rondes passen niet in
  één worker-aanroep.
- **Het aankondigingsblok (`announcement`) kiest zijn event met een GESLOTEN keuze**, niet
  met een domein of filtertaal: `next`, `next_of_type` (+ `eventTypeId`), `highlighted`
  (= `x_studio_priority`, hetzelfde vinkje als de site gebruikt) of `fixed` (+ `eventId`).
  Een vrij domein zou betekenen dat de inhoud van een mail pas te begrijpen is door een
  query te lezen. Drie zaken staan hard: alleen GEPUBLICEERDE events (een concept
  aankondigen is een lek), alleen events die nog moeten komen, en nooit het event waar de
  mail zelf over gaat. De site van de inschrijving filtert op merk, zodat een
  syndicoach-inschrijver geen openvme-only event aangekondigd krijgt.
- **Het opzoeken van die events gebeurt in `resolveAnnouncements()` (mail-service), niet in
  de renderer.** mail-render.js is puur -- geen env, geen fetch. Het gevonden event komt per
  BLOK-ID in de context (`context.announcements[block.id]`), niet als placeholder: er kunnen
  meerdere aankondigingen in één mail staan, dus `{{announcement.title}}` zou dubbelzinnig
  zijn. Zowel `queueMails()` als de preview-route zoeken op; vergeet je dat in één van de
  twee, dan zie je in de editor iets anders dan in de inbox (dezelfde fout als eerder met
  `editable`). Per SITE één ronde, niet per ontvanger.
- **Vindt een aankondiging geen event, dan valt het blok WEG bij het versturen** en blijft
  het in de EDITOR staan met de reden erbij (`leegBlok()`, zoals video en knop). Een lege
  kaart met "geen event gevonden" in duizend mails is erger dan geen kaart.
- **`/api/mail/announcement-options` staat los van `/api/mail/schema`**: het schema is
  statisch en mag lang gecached worden, de lijst met komende events verandert bij elk nieuw
  event. Een event-id laten intypen was het alternatief -- dan typt iemand 76 in plaats van
  78 en staat de verkeerde aankondiging in duizend mails.
- **Een `<dialog>` met `showModal()` rendert in de TOP LAYER van de browser.** Alles wat
  daarbuiten in de DOM staat valt eronder -- ook met `position:fixed` en `z-index:100`.
  Daarom MOET `#mailTokenMenu` (de "/"-kiezer voor het onderwerp en de voorbeeldtekst)
  binnen `#mailStudioDialog` staan. Toen het menu erbuiten stond, werkte "/" wel in de
  mailbody (dat menu wordt in het `srcdoc`-iframe gebouwd, dus binnen de dialoog) en niet
  in de onderwerpvelden: het menu kreeg wel de juiste klassen en positie, maar werd achter
  de modal getekend. Een browsertest bewaakt dit nu structureel
  (`mail-studio-ui-test.mjs`, assertie "de \"/\"-kiezer staat BUITEN de studiodialoog").
  Let op bij het opsplitsen van de markup: zet nooit een los `<div id="mailTokenMenu">` in
  een testpagina, dan wordt de assertie hol.
- **De knoptekst zit in een `<span>` BINNEN de `<a>`.** `contenteditable` op een `<a>` geeft
  in Chrome geen caret, dus was de copy van de knop onbewerkbaar. `data-om-edit` hoort op
  de span, niet op de link.
- **Chips staan tussen zero-width spaties** (`ensureCaretSpace()`, en `tokenizeToChips()` zet
  ze er al bij). Zonder tekstknooppunt naast een `contenteditable="false"`-element kan je de
  cursor er niet naast zetten en dus niet achter een chip verder typen. `fromChips()` strookt
  ze weer weg, zodat ze nooit in Odoo belanden. Let op bij het invoegen: `firstChild` van de
  chip-HTML is die spatie, niet de chip — voeg het hele fragment in.
- **Het praktisch kader heeft vrije regels**, geen vaste lijst: `block.rows` van
  `{id, icon, label, value}`, waarbij `value` vrije tekst met placeholders is. Zo kan iemand
  zelf "Parking" of "Meebrengen" toevoegen zonder code. `normalizeDetailRows()` migreert de
  oude vormen (geen rows → standaardset; `show: [...]` → die regels als echte rijen) en gooit
  `show` weg, want twee waarheden. Regels beheren gebeurt in Instellingen; de TEKST typ je in
  de mail zelf — niet allebei.
- **Eén selectiekader, niet twee.** Het geselecteerde blok krijgt de blauwe rand; het stukje
  tekst waarin je typt krijgt alleen een zachte achtergrond. Twee geneste blauwe randen zien
  er kapot uit.
- **De bewerklaag is GEDEELD met Koppelingen** (`public/mail-token-editor.js`, sinds
  2026-09-08). Chips, `fromChips()`, `ensureCaretSpace()`, de "/"-kiezer en de
  cursorafhandeling stonden in `events-v2-mail-studio.js` (regels 181-557) en zijn daar
  weggehaald: de maileditor van Koppelingen heeft precies dezelfde laag nodig, en de zes
  bugs die `mail-studio-ui-test.mjs` vangt zaten állemaal in dit soort cursor- en
  chipdetails -- een tweede kopie krijgt die bugs opnieuw, een voor een. De studio maakt
  een instantie via `window.OMTokenEditor.create({ getTokens, parentMenuId, esc })` en
  houdt dunne aliassen (`toChips`, `fromChips`, ...) zodat de rest van dat bestand
  ongewijzigd bleef. Wat event-specifiek IS en dus achterbleef: welke placeholders er
  bestaan (uit `state.schema.placeholders`). De `<script>`-tag van
  `mail-token-editor.js` moet VÓÓR het studio-script staan, en ook vóór
  `forminator-sync-v2-detail-mail-composer.js` -- beide maken bij het laden een instantie.
- **De "/"-kiezer werkt in twee documenten**: de ouderpagina (onderwerp, voorbeeldtekst) en
  het voorbeeld-iframe. Elk document krijgt zijn eigen menu-node — een menu uit de
  ouderpagina kan niet over een iframe heen liggen. Het menu opent ná de toetsaanslag, dus
  `openTokenMenu()` gaat één positie terug om de "/" zelf mee te kunnen wissen.
- **Onderwerp en voorbeeldtekst zijn `contenteditable`, geen `<input>`** — een invoerveld kan
  geen chips tonen. Lees ze dus met `fromChips()`, nooit met `.value`, en herteken ze niet
  terwijl ze focus hebben (anders springt de cursor naar het begin).
- **De browsertest is verplicht bij elke wijziging aan de studio**:
  `node src/modules/event-operations-v2/tests/mail-studio-ui-test.mjs` (vraagt
  `npm i -D playwright`).

  **Werkt de lokale installatie niet, dan kan je hem elders draaien.** In de Windows-omgeving
  van deze repo is `playwright.azureedge.net` (de browser-CDN) dichtgezet, terwijl
  `registry.npmjs.org` wél bereikbaar is: `npm i -D playwright` slaagt dus, maar
  `npx playwright install chromium` niet, en er staat ook geen Chrome/Chromium in de lokale
  Linux-VM. De test heeft daarvoor een uitgang: `PW_CHROME` wordt als `executablePath`
  doorgegeven (`chromium.launch(process.env.PW_CHROME ? { executablePath: ... } : {})`).
  Werkwijze die op 2026-09-08 gewerkt heeft, vanuit een omgeving mét Chromium:

  ```bash
  git clone --depth 1 https://github.com/Nico-Mymmo/forminator-odoo-sync.git
  # de gewijzigde bestanden erover kopieren (de kloon is HEAD, niet je werkboom!)
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i -D playwright
  PW_CHROME=/pad/naar/chrome node src/modules/event-operations-v2/tests/mail-studio-ui-test.mjs
  ```

  Let op: een kloon van HEAD ziet je ONGECOMMITTE wijzigingen niet. Kopieer elke ronde de
  bestanden die je aanpaste er opnieuw over, anders test je iets anders dan wat je schreef.
  En volg de regel bovenaan dit blok: saboteer je fix tijdelijk en kijk of de test écht
  rood wordt -- bij de verhuizing van de bewerklaag gaf een sabotage in `vindSlash()`
  precies 3 rode tests, en dat is het bewijs dat de test het nieuwe bestand uitoefent. Drie bugs raakten in productie die geen enkele unit-test kon zien,
  omdat ze in de KOPPELING zaten en niet in een functie: een clientcontrole op `<t` terwijl
  de mail met `<table` begint; `editable` dat de route wel meegaf maar
  `renderMailForRegistration` niet aannam; en een "beide sites"-stand die `null` doorgaf,
  wat voor de renderer "site onbekend" betekent. Unit-tests op de renderer alleen zijn hier
  niet genoeg.
- **Je bewerkt IN het voorbeeld, niet in een blokkenlijst ernaast.** De eerste versie zette
  een lijst met ruwe velden (URL, alt, `level`, een HTML-textarea, chips per site) naast de
  preview. Dat is bruikbaar voor wie het gebouwd heeft en voor niemand anders, terwijl de
  doelgroep de organisator van het event is. Nu klik je op een titel of alinea in de mail en
  typ je erin; alles wat je niet kan typen zit achter één knop "Instellingen" op het
  geselecteerde onderdeel. **Voer geen tweede bewerkscherm in naast dit ene.**
- **De editor-laag leeft IN het `srcdoc`-iframe** (same-origin), niet in de ouderpagina: de
  omlijning en de werkbalk bewegen dan vanzelf mee met de layout. Het iframe scrollt niet
  zelf — het groeit mee met de mail en de ouderpagina scrollt, anders staat de werkbalk na
  een scroll op de verkeerde plek.
- **De markers `data-om-block` / `data-om-edit` worden alleen gerenderd bij
  `editable: true`** (de preview-route). `queueMails()` rendert zonder, dus de verzonden mail
  bevat ze niet. De test "editable: true zet data-om-attributen, de standaard niet" bewaakt dat.
- **Een blok dat niets kan renderen valt weg bij het VERSTUREN, maar blijft staan in de
  EDITOR** (`leegBlok()` in mail-render.js). Een opname zonder video, een knop zonder link,
  een lege titel: gaf eerst een lege string terug, en dus ook geen `data-om-block`-marker —
  het blok was dan onzichtbaar én niet meer te selecteren of weg te halen. Voeg je een
  bloktype toe dat vroeg kan terugkeren, geef het dan een `leegBlok()`-tak.
- **De videokiezer staat op TWEE plekken en is één implementatie**: op het eventpaneel
  (`renderRecordingRow()` in events-v2-client.js, actie `open-video-picker`) en in de studio.
  De opname hoort bij het event, dus de knop hoort primair op het eventpaneel; de studio
  toont de balk op het recap-tabblad en zodra er ergens een opnameblok in de mail staat.
- **De opname hoort bij het EVENT, niet bij de mail.** Het `video`-blok leest standaard
  `{{event.video_url}}` / `{{event.video_thumbnail}}` uit `x_studio_vimeo_url` en
  `x_studio_vimeo_thumbnail_url`. Zo staat de link op één plek en klopt hij ook op de website.
  Zet hem via `POST /api/events/:id/video` (Vimeo-kiezer of een geplakte link). Zonder opname
  valt het blok weg in plaats van een gebroken afbeelding te tonen.
- **De Vimeo-kiezer is optioneel.** Zonder `VIMEO_ACCESS_TOKEN` (een SECRET, nooit in
  wrangler.jsonc) geeft `listVimeoVideos()` `configured: false` en valt de UI terug op een
  URL plakken via de publieke oEmbed — dezelfde weg die `recap-service.js` in v1 al gebruikt.
  De publieke oEmbed kan alleen een BEKENDE video opzoeken; een lijst "onze video's" vraagt
  het account-token.
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

## event-operations-v2 — verwijderen is archiveren, nooit unlink (2026-09)

**Regel: een inschrijving wordt in de OM nooit echt verwijderd. "Verwijderen" zet
`x_active = false` in Odoo.** Een inschrijving is het spoor van een echt persoon:
aanwezigheid, verzonden mails, en de chatter met herkomst en toestemming. Dat weggooien is
onomkeerbaar en er is geen situatie waarin het nodig is. Gearchiveerd verdwijnt de rij uit
alle lijsten en uit élke mailselectie (die filteren op `x_active = true`), maar blijft ze
terug te halen.

| Wat | Waar |
|---|---|
| Archiveren/terughalen van één inschrijving | `setRegistrationActive()` in `lib/registrations-service.js` |
| Alle inschrijvingen van een event archiveren | `archiveRegistrationsForEvent()`, idem |
| Routes | `DELETE /api/registrations/:id`, `POST /api/registrations/:id/restore` |
| Gearchiveerde tonen | `GET /api/events/:id/registrations?include_archived=1` (zet `active_test: false`) |

- **Archiveren annuleert ook de KLAARSTAANDE MAILS** (`cancelPendingMails()` in
  mail-service.js). Odoo's mailcron kijkt niet naar `x_active` op de registratie, dus zonder
  die stap krijgt een verwijderde deelnemer alsnog zijn reminder — de mail staat immers al in
  de wachtrij met een `scheduled_date` in de toekomst. Alleen `state = 'outgoing'` wordt
  geraakt en het wordt `'cancel'`, geen unlink: het spoor blijft. Terughalen uit het archief
  zet ze weer op `'outgoing'` via `revivePendingMails()`, maar **alleen als het verzendmoment
  nog niet voorbij is** — een mail zonder `scheduled_date` betekende "meteen" en dat moment
  is geweest.
- **Tests met een gestubde `fetch`**: `node src/modules/event-operations-v2/tests/mail-queue-test.mjs`.
  Het DOMEIN is hier het gevoelige deel — een verkeerde filter annuleert stil de verkeerde
  mails, of geen enkele. Die test is geverifieerd door het `state`-filter opzettelijk te
  breken.
- **`deleteEvent()` met `cascade` ARCHIVEERT de inschrijvingen** en verwijdert daarna het
  event. Tot 2026-09 deed die een `unlink` op de inschrijvingen — dat was echt dataverlies.
  Zonder `cascade` blijft het een 409 met het aantal erbij, zodat de gebruiker bewust kiest.
- **Het archiveren gebeurt vóór het verwijderen van het event**, anders staan de rijen even
  zonder event (`x_studio_linked_webinar` staat op `set null`).
- **`events-service.js` en `registrations-service.js` importeren elkaar** sinds deze
  wijziging. Die cirkel is veilig omdat beide kanten functiedeclaraties zijn (gehoist, pas
  bij aanroep opgezocht). Zet daar nooit een import bij die op modulniveau al draait.
- `toRegistrationDto` geeft `active` mee en `REGISTRATION_LIST_FIELDS` bevat `x_active`;
  zonder dat veld kan de UI een gearchiveerde rij niet als zodanig tonen of terughalen.

## Gmail → chatter — concept-mails, meerdere leads en verloren leads (2026-09)

Bij het testen van `gmail-chatter` (Gmail → Odoo-chatter, zie `src/modules/gmail-chatter/`)
bleken drie dingen niet te kloppen. Alle drie zijn gefixt in `lib/sync.js`,
`lib/matching.js` en `lib/store.js`; onderstaand de afspraken die daaruit volgen.

- **Een concept telt niet mee.** Gmail's `history.list` met `historyTypes: messageAdded`
  vuurt ook bij elke autosave van een NOG NIET verzonden concept — en dat gebeurt meerdere
  keren per concept, telkens met een nieuw message-id. Zonder filter belandde zo'n concept
  als "verstuurd bericht" in de chatter, wat het zeker niet is. `syncUser()` in `sync.js`
  controleert nu `meta.labelIds.includes('DRAFT')` vlak na het ophalen van de headers en
  slaat het bericht over met reden `concept (nog niet verstuurd)`, vóór er ook maar aan
  matching begonnen wordt. `listRecentMessageIds()` (de bootstrap-zoekopdracht in
  `gmail-read-client.js`) heeft `-in:drafts` in haar standaardquery erbij gekregen — puur
  om te besparen op API-calls, de labelIds-controle blijft de eigenlijke bewaking.
  Als Gmail bij het versturen van een concept een NIEUW message-id aanmaakt (wat het doet —
  het conceptbericht en het uiteindelijk verzonden bericht zijn twee aparte Gmail-berichten),
  blokkeert het overslaan van het concept de latere, echte verzendmail niet.
- **Eén e-mailadres kan bij MEERDERE leads horen, en die krijgen dan ALLEMAAL het bericht.**
  De oude opzoeking nam met `limit: 1, order: write_date desc` telkens maar één (de meest
  recent bijgewerkte) lead. Bij een dubbele inschrijving, of een verloren lead naast een
  actieve op hetzelfde adres, kreeg dus maar één van de twee de mail — en meestal niet de
  verloren lead, want die is per definitie minder recent bijgewerkt. `alleLeadsOpAdres()` in
  `matching.js` vervangt die opzoeking en geeft de VOLLEDIGE, gededupliceerde lijst terug
  (rechtstreeks op de lead, én via een gekoppeld contact). `zoekLeadOpAdres()` blijft bestaan
  als dunne wrapper (`alleLeadsOpAdres()[0]`) voor de Gmail-add-on-kaart
  (`addon-routes.js`), die maar één lead per keer toont.
- **Verloren leads krijgen dus ook mail — dat was al voor de helft in orde.** De
  `crm.lead`-opzoeking gebruikte al `context: { active_test: false }`, dus een verloren lead
  (`active = false`) kwam al uit de zoekopdracht. Het echte gat zat in de `limit: 1`
  hierboven: stond er een actieve lead met hetzelfde adres naast, dan won die en bleef de
  verloren lead — precies degene die na een heractivatie het bericht nodig heeft — zonder
  spoor. Met `alleLeadsOpAdres()` (geen limiet op één, wel een praktisch plafond van 20)
  krijgen beide het bericht.
- **Eén Gmail-bericht kan dus bij meerdere Odoo-records terechtkomen**, en de bestaande tabel
  `gmail_captured_messages` had maar plaats voor één `odoo_model`/`odoo_res_id`-paar. Die
  kolommen blijven de EERSTE/primaire match (voor het beheerscherm en de bestaande
  draadherkenning); de volledige lijst gaat naar de nieuwe tabel
  `gmail_captured_message_targets` (migratie
  `20260915090000_gmail_chatter_multi_target.sql`), één rij per
  (gmail_message_id, odoo_model, odoo_res_id).
- **Een antwoord in dezelfde draad volgt ALLE eerdere doelen, niet enkel het primaire.**
  `zoekDraadMatch()` in `store.js` zocht voorheen één `odoo_res_id` op het origineel; ze zoekt
  nu via `gmail_captured_message_targets` de VOLLEDIGE, gededupliceerde doellijst van elk
  eerder bericht in die draad op. Zonder die aanpassing zou een antwoord op een mail die
  destijds naar twee leads ging, alsnog maar bij één van de twee terechtkomen.

## Nieuws & updates — content-feed (2026-09)

**Regel: `x_content_snippet` wordt beheerd in de OM en de WordPress-plugin HAALT
op. Er wordt nergens meer naar WordPress geduwd.** Dat is geen betere sync -- het
is er geen: een bericht dat in Odoo staat, staat daarmee per definitie op de site.
Volledige onderbouwing en de meetcijfers: `docs/ontwerp-om-nieuws.md`.

Wat de oude duw-keten kostte, gemeten op 2026-09-17: 43 gepubliceerde records in
Odoo tegenover 46 posts op embed.openvme.be, waarvan er **4 geen Odoo-record meer
hadden** (1684, 1682, 807, 509 -- de eerste twee zijn hetzelfde bericht, twee keer
aangemaakt) en **2 records om dezelfde post vochten** (57 en 67 wijzen allebei naar
WP-post 1245; de laatste schrijver won, de andere is stil weg).

| Wat | Waar |
|---|---|
| Veldnamen, DTO's, verboden velden (puur, geen env/fetch/db) | `src/modules/content-feed/odoo-contract.js` |
| Odoo-toegang (lezen, schrijven, beeld, taxonomie) | `lib/content-service.js` |
| Wegwerpcache (eigen kopie, bewust) | `lib/cache.js` |
| Publieke API (sitesleutel, ETag, edge-cache) | `public-api.js` + een blok in `src/router/public-routes.js` |
| Beheerroutes | `routes.js` |
| Beheerscherm | `public/content-feed.html` + `public/content-feed.js` |
| Moduleregistratie | `supabase/migrations/20260920120000_content_feed_module.sql` |

**Nieuwe secrets:** `CONTENT_FEED_PUBLIC_SITE_KEYS` (verplicht -- zonder is de
publieke API dicht, niet open) en optioneel `CONTENT_FEED_PUBLIC_ORIGINS` voor CORS.

De vorm is `naam:sleutel`, komma-gescheiden:
`openvme:aaa,syndicoach:bbb,embed:ccc`. Het voorvoegsel is de NAAM van de site
en FILTERT NIET -- het komt in `meta.site` en in de logs, zodat je kan zien wie
er bevraagt. Elke site heeft wel een EIGEN sleutel, zodat je er één kan
intrekken zonder de andere te raken.

Afspraken die bewust zo zijn:

- **Odoo is de enige database. Er komt GEEN tabel bij.** De migratie doet alleen
  de moduleregistratie. KV is wegwerpbaar en altijd herbouwbaar uit Odoo.
- **WAAR een bericht heen gaat, staat NIET op het bericht. De SHORTCODE
  bepaalt wat een site ophaalt.** Er is geen merk- of kanaalveld in Odoo, en
  dat is een bewuste keuze na twee verworpen alternatieven:
  `x_studio_brand` (openvme/syndicoach/both) kon het niet, want
  embed.openvme.be is een eigen SITE en geen merk, en met één waarde kan een
  bericht niet tegelijk "openvme én embed, niet syndicoach" zijn. Een
  many2many kon het wel, maar vraagt een eigen Odoo-model voor drie waarden
  terwijl de TYPES en LABELS die selectie al kunnen maken.
  `x_studio_brand` stond op NUL records ingevuld en is daarom gewoon geschrapt
  -- dat veld mag in Studio weg.
  **Gevolg dat je moet kennen: elke geldige sitesleutel kan elk GEPUBLICEERD
  bericht ophalen.** De sleutel is AUTHENTICATIE ("mag deze site ons
  bevragen"), geen autorisatie per bericht. De scheiding tussen sites zit
  volledig in de shortcode (`categories=`/`tags=`). Moet een bericht toch echt
  maar op één site staan, dan is een LABEL daarvoor het bestaande gereedschap.
  Zet hier dus nooit een filter op de sitesleutel terug zonder er een veld bij
  te bouwen -- dan zou een site stil minder tonen dan haar shortcode vraagt.
- **De publicatiedatum is de ENIGE sorteersleutel** (`SORT_ORDER`, met `id desc`
  puur als tiebreak). `x_studio_sequence` staat op 10 bij álle 49 records en doet
  dus niets; een tijdlijn met twee sorteervelden is een tijdlijn waarvan niemand
  de volgorde kan voorspellen. Publiceren zonder datum wordt geweigerd, en het
  beheerscherm toont een waarschuwingsbalk voor de zes bestaande records die
  gepubliceerd zijn zonder datum.
- **Het beeldveld is `x_studio_content_image` (23 records), niet
  `x_studio_image` (1 record).** Het is BINAIR en mag daarom NOOIT in een
  lijstquery mee -- dan gaat elke afbeelding als base64 door de JSON-RPC-respons.
  De lijst vraagt met `IMAGE_ID_DOMAIN` enkel WELKE id's een beeld hebben; de
  bytes komen pas bij `GET .../items/:id/image`. De URL draagt een versiedeel uit
  `write_date`, dus een gewijzigd beeld krijgt een andere URL en mag de cache een
  jaar staan.
- **`toPublicSnippetDto()` is de enige vorm die de plugin ooit ziet.** De
  verantwoordelijke, de status en het merk zitten er bewust niet in: de
  sitesleutel is niet persoonsgebonden, dus alles wat eruit komt geeft het aan
  iedereen die de sleutel van één site heeft. Zelfde regel als
  `toPublicEventDto()` en `toPublicFormListItem()`.
- **Een onbekende tag- of type-slug geeft een LEGE lijst, geen volledige lijst.**
  Stil alles tonen bij een typefout is hoe een pagina er goed uitziet terwijl ze
  het verkeerde toont.
- **`meta.generated_at` telt niet mee voor de ETag.** Zelfde les als bij
  events-v2: een tijdstip in de ETag betekent dat `If-None-Match` nooit matcht en
  elke verversing de volledige body ophaalt.
- **Verwijderen is ARCHIVEREN** (`x_active = false`), zelfde regel als bij de
  inschrijvingen van events-v2. Een bericht stond op de site en zat mogelijk in
  een nieuwsbrief; er is geen situatie waarin het echt weg moet.
- **`lib/cache.js` is een EIGEN kopie en geen import uit event-operations-v2.**
  Die versie hangt aan de constants van díé module (`CACHE_PREFIX 'evtv2'`,
  `invalidateEvents`). Zelfde afweging als de twee `renderTemplate()`-kopieën bij
  mini-apps: een gedeelde util zou van beide modules één ding maken dat niemand
  meer los kan wijzigen.
- **De AI-samenvatting is bewust NIET meegenomen** (beslist 2026-09-20).
  Automation 27 vuurde naar een Zapier-hook. Gemeten over alle 49 records:
  34 hebben `x_studio_ai_last_generated` gevuld (nieuwste 2026-07-14) en 10
  staan met `x_studio_generate_ai_content = true` te wachten op een
  samenvatting die nooit kwam (57, 67, 68, 81, 82, 92, 94, 95, 96, 97). De
  generatie is dus rond half juli 2026 gestopt -- dezelfde periode als de
  Calendly-Zap (24-07-2026). Komt dit terug, dan binnen de OM, op `lib/ai.js`
  met zijn foutcontract -- niet op Zapier.

**Opruimen mag pas ná de cutover, en in deze volgorde:** publieke API met `curl`
testen → plugin op één testpagina NAAST de bestaande feed → de shortcode op
`/content-feed/` wisselen → minstens twee weken wachten → pas dan de serveracties
1010/1011/1014/952 archiveren, de twee Zaps uitzetten, de `odoo-proxy`-Worker
opruimen en Cool Timeline Pro deactiveren. Het `news_article`-CPT en de
ACF-velden gaan als ALLERLAATSTE -- dat is de enige onomkeerbare stap.

### Een artikel toevoegen met AI (2026-09-20)

**Regel: "+ Nieuw bericht" vraagt EERST wat je toevoegt. Bij "Artikel" geef je
alleen een link; de AI stelt de rest voor en een mens keurt het goed. Er wordt
nooit automatisch gepubliceerd.**

| Wat | Waar |
|---|---|
| Pagina ophalen + metagegevens en tekst eruit halen | `lib/article-fetch.js` |
| Schema, prompt, providerkeuze | `lib/article-ai.js` |
| Route | `POST /content-feed/api/analyze` |
| Beeld van de bron naar het binaire Odoo-veld | `importImageFromUrl()` in `lib/content-service.js` |
| Keuzedialoog + artikelstap | `public/content-feed.html` + `.js` |

- **Parsen gebeurt met `HTMLRewriter`, nooit met een regex op HTML.** Dat is de
  parser van het platform zelf: hij streamt en gaat niet onderuit op een
  attribuut met een `>` erin of een niet-gesloten tag. Een regex doet dat wel,
  en dan krijg je een half artikel zonder dat iets zegt dat er iets mist.
- **`validateArticleUrl()` is een SSRF-grens, geen netheidscontrole.** Deze
  functie haalt server-side op wat een gebruiker intypt. Alleen http(s), en
  geen localhost, `.internal` of kale IPv4-adressen. Haal die controle nooit
  weg "omdat de gebruiker toch ingelogd is".
- **Een pagina zonder leesbare tekst geeft een FOUT, geen analyse.** Bij een
  betaalmuur of een pagina die haar inhoud pas met JavaScript opbouwt, zou de
  AI anders een samenvatting verzinnen uit niets. `NO_CONTENT` zegt dat er geen
  tekst stond en waarom dat waarschijnlijk zo is.
- **De aanroep gaat via `askAI()` uit mini-apps**, met
  `{ id: null, source: 'content_feed' }` als aanroeper. Niet omdat een bericht
  een mini-app is, maar omdat alles wat askAI() doet -- platform-daglimiet,
  MODEL_ALLOWLIST, foutcontract, stall-timeout, audit-regel -- voor élke
  AI-aanroep moet gelden. Een eigen kopie ernaast is de twee-motoren-fout.
  De aanroep staat daardoor gewoon in het AI-gebruiksrapport van Beheer, onder
  "Nieuws & updates". Zie "AI-aanroepen van buiten mini-apps" hieronder.
- **De `system`-prompt is een CONSTANTE onder de 2000 tekens; de taakregels
  staan in de prompt.** `askAI()` weigert een system-prompt boven
  `MAX_SYSTEM_LENGTH` (2000) met "system is optioneel maar max 2000 tekens." --
  de eerste versie zat daar met 2600 tekens ruim over en elke analyse faalde.
  Wat in `SYSTEM` hoort: wie we zijn en hoe we klinken. Wat in `bouwPrompt()`
  hoort: wat er in elk veld moet komen, bij het artikel waarop dat slaat (grens
  25000).
  De DOELGROEP staat daarom ook in de prompt en niet in `SYSTEM`: dat is een
  LABEL uit Odoo Studio, en iemand kan daar morgen drie regels van maken. Stond
  het in de system-prompt, dan kon een wijziging in Studio de analyse breken met
  een foutmelding die niets met Studio te maken lijkt te hebben.
  Een ONTBREKEND optioneel gegeven in `bouwPrompt()` is `null`, geen lege
  string: `filter(Boolean)` gooide anders ook de bewuste witregels weg en dan
  plakken de secties van de prompt aan elkaar.
- **Het schema bevat geen `maxLength`/`maxItems`.** Anthropic's constrained
  decoding ondersteunt die niet (harde 400). Grenzen staan als richtlijn in de
  `description` en worden in JS afgeklemd met `knip()`; gesloten keuzes
  (kleur, relevantie) staan als `enum`. Labels gaan als INDEX in de
  aangeleverde lijst, niet als tekst -- die zou wegdrijven qua spelling.
- **De afbeelding wordt pas bij het BEWAREN opgehaald**, niet bij de analyse.
  Anders betaal je de download van elk artikel dat iemand toch niet plaatst.
  `importImageFromUrl()` is best-effort: mislukt het, dan komt het bericht er
  gewoon zonder beeld -- een ontbrekende illustratie is geen reden om niet te
  kunnen bewaren. De base64-omzetting gaat in blokken van 8192; `String.
  fromCharCode(...bytes)` in één keer blaast de call-stack op.
- **`relevance: 'laag'` toont een waarschuwing, het blokkeert niets.** De
  redacteur beslist. Let op bij het bewerken van die code: dat vak is hetzelfde
  `#dialogError` dat ook opslagfouten toont, dus de kleur moet bij het openen
  teruggezet worden -- anders leest een echte fout daarna als een tip.
- **Er zijn DRIE optionele Studio-velden**, alle drie volgens het
  BRAND-patroon: ze staan in `OPTIONELE_VELDEN` (content-service.js), NIET in
  `SNIPPET_LIST_FIELDS` (een onbekend veld in `fields` laat een searchRead
  volledig falen), en `stripOnbekendeVelden()` haalt ze uit een schrijfactie
  als Odoo ze niet kent -- met in de log welk veldtype je moet aanmaken.

  | Veld | Type | Waarvoor | Stand 2026-09-20 |
  |---|---|---|---|
  | `x_studio_quote` | Char of Text | Het citaat | bestaat (Char -- prima, `knip()` kapt op 400 tekens) |
  | `x_studio_audience` | Selection | De doelgroep | bestaat, 5 waarden |
  | `x_studio_curator_note` | Text | Waarom wij dit delen (subkop) | **bestaat nog niet** |

- **De DOELGROEP stuurt de samenvatting én het citaat, en wordt gekozen VÓÓR
  de analyse.** Daarom staat die keuze in het link-scherm en niet pas in de
  editor: achteraf kiezen zou betekenen dat de tekst al geschreven is voor
  iemand anders. Het LABEL gaat naar de AI, niet de technische waarde --
  "Syndici en vastgoedbeheerders" stuurt een samenvatting, `syndicus_pro` niet.
  De WAARDEN komen uit Odoo via `fields_get` (`listAudiences()`), dus wat een
  marketeer in Studio toevoegt verschijnt vanzelf in het menu en in de prompt.
  Zet die lijst nooit als kopie in de Worker: die loopt achter op Studio en dat
  zie je niet -- je ziet enkel een doelgroep die ontbreekt in het menu.
  Bestaat het veld nog niet, dan blijft de keuze VERBORGEN in plaats van leeg:
  een leeg keuzemenu suggereert dat er iets stuk is.

  **Het LABEL in Studio is wat de AI stuurt, dus dat label doet er echt toe.**
  Gemeten op 2026-09-20 staan de vijf waarden er met een label dat gelijk is
  aan de technische waarde (`geen-formeel-beheer`, `eigenaar-syndicus`, ...).
  `leesbaarDoelgroepLabel()` maakt daar "Geen formeel beheer" van -- puur
  cosmetisch, er wordt geen betekenis verzonnen en er komt geen doelgroep bij.
  Staat er in Studio een ECHT label ("Mede-eigenaars zonder formeel beheer"),
  dan wint dat altijd en doet die functie niets. Een beschrijvend label in
  Studio is dus de beste plek om de samenvatting bij te sturen: één bron, en
  het werkt meteen in het keuzemenu én in de prompt.
- **Het CITAAT wordt nagerekend tegen de opgehaalde tekst** (`citaatKomtVoor()`
  in article-ai.js). "Verzin geen citaat" in de prompt zetten is een verzoek,
  geen garantie, en een verzonnen citaat is hier de ergste fout die dit scherm
  kan maken: het komt tussen aanhalingstekens op een publieke pagina te staan,
  toegeschreven aan een bron, en de lezer kan het niet narekenen. Klopt het
  niet, dan VALT het weg en zegt het scherm waarom (`quoteRejected`) -- stil
  niets tonen zou lezen als "de AI vond geen citaat", terwijl ze er wel een
  gaf, alleen geen echt. Cosmetische verschillen (krulletjes, witruimte,
  hoofdletters, soorten streepjes) worden gelijkgeschakeld; andere woorden
  niet. Een citaat korter dan 25 tekens wordt geweigerd: drie woorden staan
  bijna altijd wel ergens, en dan is de controle waardeloos zonder dat iemand
  het merkt.
- **Een duidelijke KOP van het artikel wordt letterlijk overgenomen.** Alleen
  herschrijven als er geen kop is, als hij enkel de sitenaam bevat, of als hij
  niets over de inhoud zegt. Een eigen kop verzinnen naast een goede kop maakt
  de kaart minder betrouwbaar, niet aantrekkelijker.
- **De CURATORSNOOT is onze stem, de samenvatting is die van het artikel.**
  Houd die twee gescheiden: `summary` zegt wat er staat, `curatorNote` zegt
  waarom wij het de moeite vonden. Dat onderscheid is het hele verschil tussen
  een lijst links en een gecureerd overzicht. De samenvatting mag vlot en
  wervend klinken, maar blijft eerlijk -- geen superlatieven, geen "must read",
  geen uitroeptekens, en nooit iets achterhouden om een klik af te dwingen: de
  lezer klikt door uit interesse, niet uit onduidelijkheid.

### De WordPress-plugin: mymmo-news (2026-09-20)

**Regel: de plugin bewaart niets en rendert de EERSTE PAGINA server-side. Nieuwe
soorten inhoud haken in op het renderer-register, nooit met een `if` in een
template.**

| Wat | Waar |
|---|---|
| Bootstrap, versieconstante | `wp-plugin/mymmo-news/mymmo-news.php` |
| HTTP naar de OM (timeout, ETag, terugval) | `includes/class-api-client.php` |
| Cache: transient + last-known-good | `includes/class-cache.php` |
| **Renderer-register (hier haakt nieuwe inhoud in)** | `includes/class-renderers.php` |
| Shortcode `[mymmo_news]` | `includes/class-shortcodes.php` |
| REST-proxy voor filteren/bijladen | `includes/class-rest.php` |
| Verbinding + shortcode-hulp in wp-admin | `includes/class-settings.php` |
| De kaart | `templates/partials/card.php` |
| Stijl | `assets/css/mymmo-news.css` |
| Gedrag | `assets/js/mymmo-news.js` |
| Zonder WordPress bekijken | `php wp-plugin/mymmo-news-preview.php [grid] > feed.html` |
| Bouwen | `bash wp-plugin/build-mymmo-news.sh <versie>` |

Afspraken die bewust zo zijn:

- **`kind` is niet `type`.** `type` (Artikel, Release Notes, Podcast, ...) is
  waarop je FILTERT en komt uit Odoo; `kind` is WAARMEE de plugin tekent.
  `kindForTypeSlug()` in `odoo-contract.js` legt de brug, en een ONBEKEND type
  wordt een artikel -- de vorm die altijd werkt. Zonder dat onderscheid moet de
  plugin raden hoe ze een podcast toont, en kan er later geen poll of video bij.
  Komt er een Odoo-categorie bij die eruitziet als een artikel, dan hoeft er in
  de plugin niets te gebeuren.
- **De eerste pagina wordt SERVER-SIDE gerenderd.** Zoekmachines zien inhoud en
  een bezoeker zonder werkende JS krijgt een volwaardige lijst. Cool Timeline
  Pro zette een leeg vlak neer en vulde dat achteraf; dat is het grootste
  verschil, en het is de reden dat de shortcode zelf rendert.
- **De REST-route geeft KLAARGEMAAKTE HTML terug, geen ruwe items.** Anders
  bestaat er een tweede renderer in JavaScript naast die in PHP, en die lopen
  uit elkaar zodra er een soort bijkomt -- precies wat het register voorkomt.
- **De sitesleutel blijft serverside.** Browser -> WordPress REST -> PHP -> OM.
  Zelfde opzet als mymmo-forms.
- **De BEELDROUTE is de enige publieke route ZONDER sitesleutel**, en dat moet
  zo. `items/:id/image` staat in een `<img src>` op een publieke pagina, en een
  browser stuurt daar geen `X-Mymmo-Site-Key`-header bij mee: met de sleutel
  erop gaf elke afbeelding 401, en een beeld dat niet laadt ziet er in een feed
  uit als een bericht zonder foto -- niet als een fout. Prijsgeven doet het
  niets: `publiekZichtbaar()` blijft ervoor staan, dus enkel het beeld van een
  GEPUBLICEERD bericht komt eruit, en dat staat per definitie al op een
  publieke pagina; een concept geeft 404. De grens per seconde telt daar op het
  IP in plaats van op de sitesleutel. Zet hier nooit de sleutelcontrole terug
  zonder de URL's tegelijk door WordPress te laten proxyen.
- **`[hidden]` verliest van onze eigen klassen.** `[hidden]` is (0,0,1) en elke
  regel in de stylesheet is (0,2,0), dus `.mymmo-news [hidden]{display:none
  !important}` staat bovenaan `mymmo-news.css`. Zonder die regel bleef de knop
  "Meer berichten" staan bij een lege feed. Dezelfde specificiteitsles als
  hieronder, maar dan tegen onszelf in plaats van tegen een blokthema -- kijk
  er dus naar zodra iets `hidden` krijgt en toch zichtbaar blijft.
- **De knop "Meer berichten" is de echte besturing**, autoload zit er alleen
  bovenop. Een lijst die enkel met scrollen groeit is niet bedienbaar met een
  toetsenbord en niet bereikbaar als de observer niet afgaat. Bijladen dat
  mislukt wist NOOIT wat er al staat; de knop wordt "Opnieuw proberen".
- **Specificiteit: elke regel die een `ul`, `li`, `button`, `blockquote`, `img`
  of `h3` raakt, krijgt een eigen wikkelklasse** (`.mymmo-news .mymmo-news-list`
  = (0,2,0)). Een blokthema drukt zijn stijlen inline in de `<head>` af, dus NA
  onze stylesheet, en `ul:not(.wp-block-list)` is (0,1,1). Dezelfde les als
  mymmo-forms 1.15.5. En: noem wat je bedoelt -- `display:flex` zonder
  `flex-direction`, of een `padding` die je niet zet, is een gat waar een thema
  in stapt.
- **Geen `mbstring` VEREISEN.** WordPress polyfilt `mb_substr` en `mb_strlen`
  (wp-includes/compat.php) maar NIET `mb_strtolower`/`mb_strtoupper`. Die gaan
  door `mymmo_news_upper()`/`-_lower()` met een terugval; zonder dat geeft een
  host zonder de extensie een witte pagina voor een letter in een avatar.
- **De afbeelding linkt naar het ARTIKEL, geen lightbox.** Cool Timeline
  vergrootte de foto bij een klik, en dat is niet waarvoor iemand op een
  nieuwskaart klikt.
- **De avatarkleur is afgeleid van de bronnaam** (`mymmo_news_bron_hue()`), niet
  willekeurig: anders krijgt dezelfde bron bij elke paginaweergave een andere
  tint en oogt de feed onrustig.
- **Een onbekende slug in een shortcode geeft een MELDING aan redacteuren**
  (`current_user_can('edit_posts')`), geen stille volledige lijst. Is de API
  onbereikbaar, dan melden we niets -- anders krijgt iemand een foutmelding over
  zijn shortcode terwijl de verbinding het probleem is.
- **De shape-versie wordt gecontroleerd, maar stopt niets.** Stuurt de OM een
  hogere `meta.shape_version` dan de plugin kent, dan staat dat als waarschuwing
  in wp-admin. De vorm is additief, dus stilvallen zou erger zijn dan een
  verouderde weergave.
- **Nog niet gebouwd, bewust:** reacties, polls, video's en events in dezelfde
  feed. Het register, `mymmo_news_card_actions` en `mymmo_news_kind_meta` zijn
  de plekken waar die inhaken; er is bewust nog geen half werkende aanzet.

**Nog niet gebouwd, bewust:** reacties en polls, en beeld uploaden vanuit de OM
(dat kan voorlopig alleen in Odoo zelf).

### Events in de feed, en in de handtekeningen (2026-09-21)

**Regel: wat een event buiten Eventbeheer doet, staat OP het event in Odoo.
Zes optionele Studio-velden op `x_webinar`, gezet in een scherm: het
eventpaneel. Niet in de nieuwsfeed-module, niet in de signature designer.**

| Veld | Type | Waarvoor |
|---|---|---|
| `x_studio_in_news_feed` | Boolean | staat dit event in de nieuwsfeed |
| `x_studio_news_from` / `_until` | Date | het venster; leeg = geen grens aan die kant |
| `x_studio_news_cta` | Char | knoptekst; leeg = afgeleid (zie hieronder) |
| `x_studio_in_signature` | Boolean | mag dit event in de e-mailhandtekeningen |
| `x_studio_signature_until_days` | Integer | hoeveel dagen VOOR de start het uit de handtekening valt; leeg/0 = tot de start |

Alle zes volgen het patroon van `x_studio_priority`: ze staan in
`optionalFieldMap()` (events-service.js) en de modules werken door zolang ze
niet bestaan. Ontbreekt het vinkje-veld, dan komt er GEEN enkel event in de
feed of de handtekening -- de veilige kant, want de uitkomst is publiek.

| Wat | Waar |
|---|---|
| Event -> feed-item, het synthetische type, het venster | `src/modules/content-feed/lib/events-in-feed.js` |
| Samenvoegen en pagineren over twee bronnen | `handleList()` + `vergelijkFeedItems()` in `content-feed/public-api.js` |
| `news_window` / `signature`-filter op het domein | `buildEventDomain()` in `event-operations-v2/lib/events-service.js` |
| Het paneel | sectie "Website" in `public/events-v2-client.js` |
| Doorschuiven van het handtekening-event | `mail-signature-designer/lib/event-rotation.js`, `*/15`-tak in `index.js` |
| Chatbericht zonder mini-app | `sendSystemChannelMessage()` in `mini-apps/lib/chat.js` |
| Kaart met wanneer/waar/plaatsen | `kind: 'event'` in het renderer-register van mymmo-news |

Afspraken die bewust zo zijn:

- **De VELDENLIJST zit in de cachesleutel van `optionalFieldMap()`, en de TTL
  is een minuut.** Dat is geen afronding maar een bug die echt gebeurd is
  (2026-09-21): `IN_SIGNATURE` werd aan `wanted` toegevoegd terwijl de sleutel
  gelijk bleef, dus de OUDE map bleef geserveerd -- zonder dat veld. Het werd
  daardoor niet opgevraagd, het vinkje kwam leeg terug, de save schreef `true`,
  het scherm las opnieuw en toonde weer leeg, en de volgende save schreef
  `false` terug. **Een vinkje dat zichzelf uitzet, zonder foutmelding.**
  De lange TTL (een uur) hoorde er ook niet: deze map beslist welke velden
  gelezen EN bewaard worden, en het moment waarop ze fout staat is precies het
  moment waarop iemand net een Studio-veld heeft aangemaakt en het uitprobeert.
  De aanroep is een `fields_get` op een handvol namen, achter het geheugen van
  de isolate -- hoogstens een verzoekje per minuut.
- **`listEvents()` is de enige motor.** De content-feed schrijft GEEN eigen
  Odoo-query voor events: die module kent haar eigen eigenaardigheden (de
  stage IS de publicatiestatus, welke velden optioneel zijn, hoe
  inschrijvingen geteld worden). Zelfde regel als de cascade-motor.
- **`evenement` is een SYNTHETISCH type**, geen rij in `x_content_snippet_type`.
  Zo kiest de shortcode of events meetellen (`categories="artikel,evenement"`,
  leeg = alles) zonder dat iemand dat type kan hernoemen of weghalen. Het mag
  daarom nooit als snippet-slug opgezocht worden -- dan zou het als onbekend
  gelden en de hele lijst leegmaken.
- **Een LABELfilter sluit events uit.** Een event draagt de labels van de
  nieuwsberichten niet en kan er dus nooit aan voldoen; ze toch tonen zou
  betekenen dat een filter meer teruggeeft dan het label belooft.
- **Twee bronnen samenvoegen vraagt OVER-ophalen.** Elke bron levert
  `offset + limit` rijen, want in het slechtste geval komt de hele pagina uit
  een bron. Minder ophalen laat pagina 2 items overslaan die pagina 1 al
  voorbij was. `has_more` kan daardoor een keer een lege volgende pagina
  beloven -- dat is de goede kant om op te falen.
- **De sorteersleutel van een event is "vanaf", en anders zijn startdatum.**
  Dat is het moment waarop het bericht verschijnt, net als de publicatiedatum
  bij een snippet. Gevolg dat je moet willen: een aankomend event zonder
  vanaf-datum staat bovenaan tot het geweest is.
- **`done` mag in de feed, `draft` en `cancelled` nooit.** Of een afgelopen
  event nog zichtbaar is, hoort het VENSTER te beslissen en niet de stage --
  anders verdwijnt het op de dag zelf terwijl iemand het bewust tot volgende
  week wou tonen. In de HANDTEKENING geldt het omgekeerde: daar enkel
  `published` en enkel wat nog moet komen.
- **De knoptekst wordt afgeleid als er niets staat**: "Schrijf je in" zolang
  inschrijven openstaat, anders "Bekijk het event". Een inschrijfknop op een
  gesloten event belooft iets wat de volgende pagina niet waarmaakt.
- **Vandaag is Europe/Brussels, niet UTC.** `vandaagInBrussel()` -- met
  `toISOString()` gaat een venster dat "vanaf vandaag" heet tussen middernacht
  en 02:00 een dag te laat open, precies op de dag dat iemand het instelt.
- **Het handtekening-event is AFGELEID, niet gekozen.** Er mogen er meerdere
  aangevinkt zijn; `resolveSignatureEvent()` neemt het eerstvolgende dat nog
  AAN DE BEURT is, en `syncSignatureEvent()` schuift door zodra dat verandert.
- **"Aan de beurt" is niet "moet nog komen": `x_studio_signature_until_days`
  haalt het event X dagen VOOR de start weg.** Bedoeld voor een event waarvoor
  inschrijven eerder sluit dan het begint -- zonder die grens blijft iedereens
  handtekening dagenlang naar een gesloten pagina verwijzen, en dat is niet
  zichtbaar als fout. Bewust een AANTAL DAGEN en geen tweede datumveld: het
  moment hangt vast aan de startdatum, dus een losse datum ernaast zou stil
  verkeerd komen te staan zodra het event verplaatst wordt -- twee waarheden
  over hetzelfde moment.
  Die grens verschilt per event en kan dus NIET in het Odoo-domein. Het domein
  (`from: nu`) levert een superset -- elke grens ligt op of vóór de start --
  en `resolveSignatureEvent()` haalt `KANDIDATEN_LIMIET` (25) events op
  volgorde op en neemt de eerste die zijn grens nog niet gepasseerd is. Haal
  die limiet nooit terug naar 1: dan valt de rotatie stil zodra het
  eerstvolgende event zijn eigen grens voorbij is -- er staat dan geen event
  meer in de handtekening terwijl er wel degelijk een klaarstaat.
  Een event waarvan de startdatum onleesbaar is, wordt WEL doorgelaten
  (`signatureCutoff()` geeft `null`): tegenhouden op een datum die we niet
  konden lezen, is een lege handtekening om een reden die niemand ziet.
  Zelfde keuze als `reminderTooLate()`.
- **De rotatie schrijft GEEN eigen push.** `triggerPushAllBackground()` doet
  dat al, inclusief uitsluitingen en de voorkeur per gebruiker. Een tweede pad
  zou betekenen dat een handtekening langs deze weg anders is dan een die
  marketing zelf pusht.
- **MARKETING bepaalt WELK event; de EIGENAAR bepaalt OF er events in zijn
  handtekening staan.** Die tweede keuze is blijvend en wordt NOOIT
  automatisch teruggezet: `show_event_promo` op `user_signature_settings`
  (migratie `20260921140000`), standaard aan.
  Tot dan stond er `hidden_event_id`: je verborg EEN event, en zodra marketing
  een ander klaarzette kwam het blok vanzelf terug -- en de rotatie wiste bij
  elke wissel ook nog alle opt-outs. Dat is een wijziging aan de handtekening
  van iemand anders. Wie het vinkje uitzet zegt "ik wil hier geen events", niet
  "ik wil dit ene event niet". De kolom `hidden_event_id` blijft bestaan maar
  wordt niet meer gelezen of geschreven.
- **De config wordt vergeleken op het HELE blok, niet op het event-id.** Anders
  blijft een verkeerde waarde eeuwig staan zodra het event niet meer wisselt --
  een hernoemd event, een nieuw hero-beeld, of een datum die een oudere versie
  als ruwe ISO-tekst had weggeschreven. De config is een afgeleide kopie, dus
  elke afwijking hoort weggewerkt te worden.
- **De datum in de handtekening is `22 oktober 2026 om 19.00u`, in
  Europe/Brussels.** Odoo bewaart in UTC: dat event staat er als 17:00 maar
  begint hier om 19:00. Niet omrekenen laat elke lezer twee uur te vroeg komen,
  en dat meldt niemand -- het ziet eruit als een gewone datum. Opgebouwd met
  `formatToParts`, want de scheidingstekens van een locale zijn niet wat we
  hier willen.
- **Zonder opvolger wordt er ook gepusht.** Dan moet het oude event juist uit
  iedereens handtekening verdwijnen.
- **ELKE wissel gaat naar de chat, niet alleen "er staat niets meer klaar".**
  `meldWissel()` stuurt naar `SIGNATURE_EVENT_WARNING_CHANNEL` (de NAAM of het
  id van een kanaal uit Mini-apps -> Chat-kanalen; de webhook-URL hoort daar
  en nergens anders, want die is de facto een bearer-secret). Een handtekening
  vertrekt namens iedereen; dat die stilzwijgend van inhoud verandert, hoort
  marketing niet pas achteraf uit een verstuurde mail af te leiden.
  Drie gevallen, met bewust verschillende tekst: doorgeschoven naar een ander
  event (met de grens erbij -- dat is het enige wat je niet zonder rekenen uit
  Eventbeheer afleest), ZELFDE event met gewijzigde gegevens (titel, datum,
  beeld of link aangepast -- dat als doorschuif melden zou betekenen dat
  niemand nog gelooft wat er staat), en geen opvolger meer.
  Het bericht gaat pas NA de push en na het bijwerken van de config: een
  mislukte melding draait de rotatie niet terug, want de handtekeningen
  kloppen op dat moment al.
- **In de signature designer beheert de marketeer GEEN events meer.** Het hele
  blok is weg: geen keuzelijst, geen aan/uit, geen beeld-URL, geen opschrift,
  geen registratielink, geen maximale hoogte. Wat overblijft is een
  alleen-lezen kaartje dat toont wat er nu in de handtekening staat, met een
  link naar Eventbeheer en de testknop.
  Een tussenstadium met een melding boven de oude bediening was ERGER dan het
  oude gedrag: het scherm zei dat de keuze elders gemaakt werd terwijl het blok
  nog alles bepaalde, en de rotatie overschreef het een kwartier later. Half
  verplaatsen is geen verplaatsen.
- **De marketingconfig is voor deze acht sleutels een KOPIE, geen invoer.**
  `eventPromoEnabled`, `eventId`, `eventTitle`, `eventDate`, `eventImageUrl`,
  `eventImageMaxHeight`, `eventEyebrow` en `eventRegUrl` worden uitsluitend
  door `syncSignatureEvent()` geschreven, afgeleid uit het event. Dat is
  bewust: de merge-engine en de compiler lezen nog precies dezelfde sleutels,
  dus aan het BOUWEN van een handtekening verandert niets -- alleen bepaalt
  niemand ze nog met de hand.
  Elke route die een config van een client aanneemt, neemt die acht over uit de
  BESTAANDE config (`MARKETING_EVENT_SLEUTELS` in routes.js, ook op de
  deprecated `PUT /api/config`). Zonder dat zou het opslaan van een bannerkleur
  het event uit ieders handtekening wissen -- stil, en pas zichtbaar in de
  volgende mail die iemand verstuurt.
- **Er staat GEEN BEELD in de handtekening**, ook niet als het event een
  hero-beeld heeft: `eventBlok()` zet `eventImageUrl` altijd leeg. Zet het niet
  terug. Het opschrift ligt VAST (`EYEBROW` in event-rotation.js). Dat zijn geen eventgegevens maar de
  VORM van het blok, en die hoort voor elk event gelijk te zijn; per event
  instelbaar betekende dat een handtekening er anders uitzag naargelang wie het
  event had aangemaakt. Titel, datum en registratielink komen wel van
  het event -- de link als `<site>/event/<slug>/?owid=<id>`, met de site uit
  het MERK van het event, zodat een syndicoach-event geen openvme-link krijgt.
- **`sendSystemChannelMessage()` telt de grens per mini-app NIET**, want er is
  geen app. De aanroeper is een cron die hoogstens elk kwartier draait. Zelfde
  afweging als `askAI()` met `{ id: null, source }` (Regel 7).
- **Payloadvorm 3.** Er is een `kind: 'event'` bijgekomen met een eigen
  `event`-blok. Additief, dus een oudere plugin tekent een event als gewoon
  artikel (zonder datum, zonder knop) in plaats van stuk te gaan -- maar meldt
  het wel in wp-admin.
- **Nog niet gebouwd, bewust:** een event in de feed een eigen tijdlijnkleur
  geven (er is geen veld voor), en de event-kiezer echt uit de signature
  designer halen.

---

## Afspraaklinks — persoonlijke Calendly-links die op ONZE site openen (2026-09)

**Regel: een link naar iemands agenda is `<site>/?afspraak=<sleutel>`, nooit de
Calendly-link zelf. De sleutel wordt server-side opgezocht; de plugin opent dan
op elke pagina het venster van één vaste opstelling, op "Plan een gesprek", met
die agenda.**

| Wat | Waar |
|---|---|
| Tabel + moduleregistratie | `supabase/migrations/20260924130000_booking_links.sql` (`booking_links`) |
| Opslag, validatie, URL, opzoeken per eigenaar | `src/modules/booking-links/lib/links.js` |
| De placeholder in de koppelingen | `src/modules/booking-links/lib/placeholders.js` |
| Aansluiting in de pipeline | `worker-handler.js`, blok vóór `opType === 'send_mail'` |
| `{{afspraak.*}}` in de mail-context | `buildKoppelingContext()` in `mail-step.js` |
| Beheerscherm (elke collega eigen links, admin alles) | `public/booking-links.html` + `.js`, routes in `booking-links/routes.js` |
| Publieke opzoeking (sitesleutel) | `GET /forminator-v2/public/v1/booking-links/:slug` in `forms/public-api.js` |
| WordPress-kant | `wp-plugin/mymmo-forms/includes/class-booking.php` (+ instelling op het tabblad Verbinding) |

Afspraken die bewust zo zijn:

- **Placeholder: `{{afspraak.<stap>.<soort>}}` (mail) / `{afspraak.<stap>.<soort>}`
  (notitie).** De EIGENAAR (`user_id`) van het record uit die stap bepaalt wiens
  agenda het wordt. `enrichAfspraakContext()` leest die eigenaar ZELF uit Odoo en
  zet de URL in `contextObject` onder `afspraak.<stap>.<soort>`, vóór de stap zijn
  placeholders invult -- zo werken beide bestaande placeholder-motoren zonder een
  derde. Niet steunen op `step.N.user_id`: dat bestaat alleen als een
  veldkoppeling erom vraagt (`collectRequestedStepFields`).
- **Terugval, in deze volgorde:** die soort → de standaardlink van die persoon →
  zijn enige link → `<eerste site>/?afspraak=algemeen` (de agenda van de
  opstelling). Nooit fataal en nooit een lege href: een mail zonder persoonlijke
  agenda is beter dan een mail die niet vertrekt of een knop die nergens heen gaat.
- **`lookupChatterPlaceholder()` kijkt voor `afspraak.*` NIET eerst naar het
  formulier**: de subsequence-heuristiek van `lookupFormValue()` zou er anders een
  veld in kunnen zien.
- **De Odoo-gebruiker van een collega** komt uit `users.odoo_uid`, anders uit
  `res.users` op login/e-mail. Zonder match kan een collega geen eigen link maken
  (een admin wel voor hem) -- de placeholder zoekt op `odoo_user_id`, dus een link
  zonder die id zou nooit gevonden worden.
- **De afspraaktypes komen uit de Calendly-API**, niet overgetypt: Calendly en
  Odoo delen geen id, dus het scherm zet de eigen types bovenaan op NAAM
  (eigenaar/hosts), maar alles blijft kiesbaar (round robin, team).
- **`algemeen` is gereserveerd** (CHECK-constraint + beide kanten van de API) en
  hoogstens één standaardlink per eigenaar (unieke index); een nieuwe standaard
  zet de vorige eerst uit.
- **Geen lijst-route in de publieke API.** Met de sitesleutel alle collega's en
  agenda's kunnen oplijsten is meer dan een site nodig heeft. Wat eruit gaat:
  `toPublicBookingLink()` -- geen Odoo-id, geen OM-id, geen eventtype-URI.
- **Sites:** `BOOKING_LINK_SITES` (`openvme:https://openvme.be,...`), anders de
  origins van `FORMS_PUBLIC_ORIGINS`. De eerste is de standaard én de terugval.
- **In WordPress hangt de HTML NIET af van `?afspraak=`** (sinds 1.18.1): de site
  heeft een paginacache die moet blijven, en een cache die de query negeert zou
  anders Robs agenda op ieders homepage zetten. `Mymmo_Forms_Booking::render()`
  zet op ELKE pagina hetzelfde dichte venster van de opstelling (via
  `render_button()`, met de algemene agenda); `assets/js/mymmo-forms-booking.js`
  leest de parameter, haalt de agenda op via `/wp-json/mymmo-forms/v1/afspraak/<sleutel>`
  (sleutel in het PAD, dus cachebaar), zet `data-mymmo-calendly` en opent het
  venster. Nooit terug naar server-side invullen. Wat terugkomt moet met
  `https://calendly.com/` beginnen, aan beide kanten.
- **Aanmaken kan op twee plekken, met dezelfde tabel en validatie:** het scherm
  Afspraaklinks (elke collega zijn eigen) en de Calendly-kaart van een koppeling
  (`afspraaklinksHtml()` in `forminator-sync-v2-detail-calendly-tab.js`, routes
  `/api/integrations/:id/calendly/booking-links` in `calendly/routes.js`). Daar
  komt de boekingspagina uit de BEWAARDE koppeling, nooit uit de body.
- **Een boeking op iemands EIGEN afspraaktype komt alleen in Odoo** als er een
  Calendly-koppeling op dat type staat of het vangnet (koppeling zonder
  eventtype) het opvangt. Anders wordt er geboekt en weet de OM van niets.
- **Het venster van een afspraaklink heeft ENKEL de agenda** (sinds plugin
  1.18.2): `Mymmo_Forms_Shortcodes::render_agenda()`, geen shortcode en geen
  attribuut op `[mymmo_form_button]`. De copy staat PER LINK in de OM
  (`booking_links.tab_title` = titel, `intro`, `points` (jsonb-lijst, max 6),
  `show_photo`; migratie `20260924150000_booking_links_copy.sql`) en komt via
  `toPublicBookingLink()` mee. Een lege `intro` wordt `calendly_description` --
  een KOPIE van `description_plain` van het afspraaktype, gezet bij het bewaren
  in het scherm Afspraaklinks (niet live opgevraagd, zelfde regel als
  `scheduling_url`). Is ook die leeg, dan blijft de copy van de opstelling.
  Een link die vóór deze wijziging bewaard is, heeft die kopie pas na één keer
  opnieuw bewaren.
- **De foto is `res.users.avatar_256` van de eigenaar, als data-URI in dezelfde
  JSON** (`fetchOwnerAvatar()`), niet via een eigen beeldroute: een `<img src>`
  kan geen sitesleutel meesturen, en zo komt er geen publieke route zonder
  sleutel bij. `avatar_256` en niet `image_256`: die laatste is leeg voor wie
  nooit een foto zette. Met een foto valt de tekening van de opstelling weg
  (`is-persoon`). De server schrijft de plekken voor titel/foto/subtekst/vinkjes
  LEEG en `hidden` uit (`data-mymmo-afspraak`); `mymmo-forms-booking.js` vult ze
  -- de pagina mag niet van `?afspraak=` afhangen (paginacache).
- **"Gecreëerd door Calendly" in de agenda** komt van het Calendly-ACCOUNT van
  de eigenaar van het afspraaktype, niet van ons: uit te zetten in Calendly
  (Branding), alleen op een betaald abonnement. Geen URL-parameter voor.
- **`{{afspraak.sender.<soort>}}` is de agenda van de AFZENDER van een mail**,
  ingevuld in `resolveSenderAfspraak()` (mail-step.js) met de `userId` uit
  `resolveSender()` -- niet in `enrichAfspraakContext()`, dat `sender` overslaat,
  want pas de mailstap kent de afzender. Op een KOPIE van contextObject: een
  volgende mailstap kan een andere afzender hebben. Vast adres = geen persoon =
  de algemene agenda.
- **De mailstap heeft EEN afzenderkeuze** (stap / vaste medewerker / vast adres),
  en daaruit komen afzender, handtekening, `{{sender.*}}` en die afspraaklink.
  Opgeslagen blijft het in twee velden: stap = `mail_from_source 'record_user'` +
  `mail_signature_source 'dynamic'`; vaste medewerker = `'record_user'` +
  `'fixed'`; vast adres = `mail_from_source 'fixed'` zonder handtekening
  (`afzenderStand()` in de composer). `step.N.owner` (de verantwoordelijke van
  het record uit stap N) is alleen voor de mailstap toegestaan
  (`MAIL_SENDER_STEP_REF_RE` in validation.js, opgelost in mail-signature.js).
  Het vaste adres is bij een persoon enkel nog de ingeklapte TERUGVAL: stond het
  open, dan dacht iedereen dat die naam de afzender werd.
- **In het beheerscherm heten de twee dingen die allebei "standaard" leken
  anders:** de soort (`soort: standaard`, grijs) en het vinkje `is_default`
  (`terugvallink`, blauw). De waarde `standaard` in de database is ongewijzigd.
- **Nog niet gebouwd, bewust:** klikken tellen via `link.openvme.be`, en de
  `meeting_link_url` van de handtekeningdesigner hierop laten aansluiten.

---

## Dashboards — tab "Website-bezoeken" (2026-09)

**Regel: bezoekersgedrag komt uit de D1-database van de website-tracker, en de
OM LEEST er alleen uit.** De tracker (repo `website-tracker`) bezit die database
en haar schema; zie `website-tracker/docs/ontwerp-web-visitor-events.md`. Een
tweede schrijver maakt de belofte "elk event staat er zoals het binnenkwam" stuk.

| Wat | Waar |
|---|---|
| Binding | `WEB_EVENTS` in `wrangler.jsonc` (database `website-tracker-events`) |
| Enige toegang (weigert alles behalve SELECT/WITH) | `src/lib/web-events.js` |
| Sessies afleiden + kanaalindeling + compacte vorm | `src/modules/dashboards/lib/web-visits.js` |
| Route | `GET /dashboards/api/web-visits?period=7d\|30d\|90d\|12m` |
| Tab + filteren/doorklikken in de browser | `public/dashboards.html` (`data-dash-tab`) + `public/dashboards-web.js` |
| Conversies (formulier, Calendly) naar de tracker | `src/lib/web-conversions.js`, aangeroepen in `worker-handler.js` na het bewaren van een inzending |
| De tracker first-party op `link.<site>/t/_o/` (snippet `s.js`, events `e`) | blok bovenaan `src/router/public-routes.js` + service binding `TRACKER` |

- **`/t/_o/` hoort bij de tracker, niet bij de trackbare links.** Het staat onder
  `/t/` omdat de redirect-regel op `link.*` (ander Cloudflare-account) `/t/` al
  doorlaat; zo hoeft daar niets te veranderen. Een slug bevat nooit een
  underscore, dus `_o` botst niet. Het eigen adres van de tracker
  (`website-tracker...workers.dev`) werd door adblockers geblokkeerd: bezoeker-UUID
  wel, events niet.

- **Niets afgeleids staat in D1.** Sessie, duur, engagement en kanaal worden in
  `web-visits.js` berekend met dezelfde regels als de tracker (§5 van het
  ontwerp). Wijzig je daar een drempel, wijzig hem aan beide kanten.
- **De server stuurt compacte SESSIES, de browser telt.** Zo kost een klik op een
  kanaal of landingspagina geen nieuwe query. De vorige, even lange periode komt
  mee voor de vergelijking. Het antwoord wordt 10 minuten in `caches.default`
  bewaard (D1 rekent per gelezen rij).
- **Kanaal:** touchpoint van de sessie > UTM op de eerste pagina > UTM op de
  bezoeker (enkel voor zijn eerste sessie) > verwijzer. De oude historiek uit
  Odoo heeft geen verwijzer en geen toestel; het dashboard zegt dat erbij in
  plaats van die sessies stil als "direct" te tellen.

---

## Webgedrag — het verhaal op lead en actieblad (2026-10)

**Regel: Odoo krijgt geen bezoekers en geen touchpoints meer, enkel het VERHAAL
als HTML op de lead en het actieblad. D1 bezit de gegevens (tracker = enige
schrijver), de OM is de enige die met Odoo praat.** Volledige onderbouwing:
`website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md`. `x_web_visitor` en
`x_ad_touchpoint` worden opgeruimd zodra dit loopt.

| Wat | Waar |
|---|---|
| Koppeling meteen na een inzending (records uit de stappen) | `reportWebLinks()` in `src/lib/web-conversions.js`, aangeroepen in `worker-handler.js` na `classifyFinalSubmissionStatus` |
| Matching op e-mail, elk uur (vervangt Odoo-serveractie 1147) | `src/modules/web-story/lib/matching.js` |
| Eerste / laatste niet-directe aanraking / pad | `src/modules/web-story/lib/journey.js` |
| Sessies + kanaal per sessie (dezelfde als het dashboard) | `readVisitorSessions()` + `channelOf()` in `src/modules/dashboards/lib/web-visits.js` |
| Uurlijkse push naar Odoo | `src/modules/web-story/lib/push.js`, `*/15`-tak in `index.js` (enkel het eerste kwartier, of zolang er werk ligt) |
| Tabblad Gedrag: trends en flows over ALLE bezoeken (ook anoniem), segment in de browser | `src/modules/web-story/lib/behaviour.js` (compacte sessies via `readSessionRows()` van web-visits.js) + `public/webgedrag-behaviour.js` |
| Scherm per lead / actieblad / bezoeker, bevestigen, twijfelgevallen | `src/modules/web-story/routes.js` + `lib/story-data.js`, `public/webgedrag.html` + `.js` (`/webgedrag?lead=<id>`) |
| Moduleregistratie | `supabase/migrations/20261001120000_web_story_module.sql` |
| Dashboard: wat leidde tot de conversie (eerste / laatste / assist / positie, paden) | `src/modules/dashboards/lib/web-attribution.js` (server, per persoon over de hele historiek), kaart in `dashboards.html` + `loadAttribution()` in `dashboards-web.js` |
| Koppelingen bewaren, tijdlijn renderen | tracker: `POST /internal/links`, `POST /internal/timeline` (`lib/story.js`), via de binding `TRACKER` |

Afspraken die bewust zo zijn:

- **`WEB_STORY_MODE` is de schakelaar** (Worker-variabele): leeg = niets,
  `match` = enkel koppelingen (D1), `dry` = ook berekenen en loggen, `on` = ook
  naar Odoo schrijven. Een deploy op zich verandert dus niets in Odoo.
- **Nooit `on` zolang de tracker zelf leadtijdlijnen schrijft.** Zet eerst in de
  tracker `LEAD_TIMELINE_BY_OM=1`; anders overschrijven twee schrijvers elkaar.
- **De OM schrijft niet in D1.** `src/lib/web-events.js` laat enkel lezen toe;
  koppelingen gaan via de tracker. Eén schrijver per database.
- **Er is EEN kanaalindeling**: `channelOf()` in web-visits.js. Het verhaal
  gebruikt ze ook; voeg er geen tweede aan toe. Mailapps (Gmail-app, Outlook)
  tellen als E-mail.
- **Een koppeling heeft een bron en een sterkte** (`zeker` = inzending,
  `sterk` = e-mailadres op de lead of de klant, `middel` = collega bij dezelfde
  VME). Een ronde verzwakt of verwijdert nooit; wat een mens bevestigde of afwees
  (`status`) laat de tracker staan. Een "firma" met meer dan 10 leads is een
  organisatie, geen VME: daar telt "collega" niet.
- **Vóór 29-09-2026 is de bron onbekend, niet direct**: de oude historiek bewaarde
  geen verwijzer. Het verhaal zegt "Zonder campagne (oude historiek)".
- **Schrijven alleen als het veranderde** (hash in `MAPPINGS_KV`, `webstory:hash:*`).
  `push_since` schuift pas op als een volledige ronde af is.
- **Actieblad**: de velden `x_studio_web_timeline_html` / `x_studio_web_kpi_html`
  maakt Nico in Studio; zolang ze ontbreken wordt het actieblad overgeslagen
  (staat in de log). Zet `sanitize` uit, zoals bij de lead.
- **Beoordelen** (bevestigen/afwijzen) mag de verantwoordelijke van de lead in
  Odoo (`resolveOdooUser`) en een beheerder; het bulkscherm "Twijfelgevallen" is
  voor beheerders. Lezen mag iedereen met de module.
- **Attributie in het dashboard gebeurt op de SERVER**, anders dan de rest van dat
  tabblad: een eerste aanraking ligt vaak voor de gekozen periode, en die sessies
  heeft de browser niet. Per PERSOON (zelfde e-mailadres), de eerste conversie in
  de periode, met `buildJourney()` -- dezelfde lezing als op de lead. De filters
  van het tabblad werken daar bewust niet; de kaart zegt dat.
- **Kanaalkleuren**: `KLEUR` in journey.js = `CHANNEL_COLORS` in dashboards-web.js
  (de Worker kan niets uit public/ importeren). Wijzig ze samen.
- **Webgedrag is in de eerste plaats het GEMIDDELDE bezoek, niet het individu.**
  Het tabblad Gedrag segmenteert alle bezoeken (bron, campagne, instappagina,
  toestel, anoniem/gekend/lead, aanvraag, nieuw/terug) en toont kerncijfers, een
  trend, de padverkenner en een tabel per pagina. Individuele trajecten staan in
  Odoo; het tabblad Traject is enkel het doorklikpunt. Het dashboard blijft de
  marketinganalyse -- voeg daar geen tweede padverkenner aan toe.
- **Inloggers zijn klanten, geen prospecten -- EEN definitie in web-visits.js.**
  Gemeten (sept 2026): 23% van de bezoeken is van klanten, 13% is enkel inloggen
  (homepage -> "Inloggen" -> weg); zonder hen gaat de mediane duur van 9 naar 15 s.
  `isLoginOnly()` = een inlogklik en verder niets; `isCustomerSession()` = op of na
  de EERSTE login van die bezoeker (`readFirstLogins()`), zodat de bezoeken van
  voor iemand klant werd prospectgedrag blijven -- dat is de weg naar ons toe.
  Dashboard en Webgedrag tonen standaard "Prospecten" en zeggen hoeveel er buiten
  valt; het verhaal en de attributie slaan inlogbezoeken over (`buildJourney`).
  De inlogklik en klikken op de cookiebanner (`NOISE_TEXTS`) tellen niet als
  betrokkenheid. Nieuwe knoptekst voor inloggen? Zet ze in `LOGIN_TEXTS`.
- **Padverkenner = stappen naast elkaar, geen Sankey.** Een pagina op een stap
  "vastzetten" filtert op wie daar langskwam; herladen van dezelfde pagina telt
  niet als stap. Tijd op een pagina = tot de volgende pagina (de gemeten dwell zit
  niet in de sessie-SQL), dus de laatste pagina van een bezoek heeft geen tijd.
- **Eén chatter-notitie per record**, bij de eerste schrijfactie, met de link
  naar `/webgedrag` (`webstory:noted:*` in KV). Nooit bij elke update.
- **Inline stijl: altijd `background-color`, nooit `background`** -- Odoo's
  sanitizer knipt de shorthand stil weg (zie het vrije chatter-bericht).

---

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
