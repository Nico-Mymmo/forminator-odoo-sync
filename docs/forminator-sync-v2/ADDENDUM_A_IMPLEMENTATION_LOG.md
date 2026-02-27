# Addendum A — Asset Delivery Refactor & Field Picker Component

**Datum:** 27 februari 2026
**Revisie:** v3 — definitief plan (laatste plan-iteratie voor implementatie)
**Status:** Plan definitief, implementatie gepland (Fase 0 volgt)

---

## Findings

- `client.js` is 2354 regels embedded als `String.raw`. Backticks, `${}` en regex in de string breken de omhullende template literal onmiddellijk — `Unexpected token` op runtime, geen stacktrace, niet debugbaar.
- Inline scripts zijn niet cacheable, niet zichtbaar in DevTools Sources, en hercombileren de volledige Worker-bundle bij elke HTML-wijziging. `client.old.js` en `ui.old.js` bewijzen dat dit al eerder misging.
- Eén `views.js` van 500+ regels is een groeirisico: wizard-uitbreidingen en nieuwe detail-secties stapelen zich altijd in dat ene bestand. Opsplitsing naar `wizard.js` en `detail.js` maakt grenzen expliciet en afdwingbaar.
- `bootstrap.js` mag enkel event delegation + init bevatten en moet defensief starten: als `FSV2` niet beschikbaar is bij aanvang moet het expliciet aborteren, niet crashen met een cryptische `ReferenceError`.
- `max-age=immutable` zonder versioning in de bestandsnaam is onveilig in productie: Cloudflare cached het bestand permanent tot handmatige purge. Bij een deploy met dezelfde bestandsnaam krijgen bezoekers de oude versie zolang de cache niet gebust is.
- Query-string versioning (`?v=20260227`) is de veiligste keuze voor onze Cloudflare Worker-context: geen bestandsnaamwijziging nodig, geen wrangler-configuratie aanpassing, en Cloudflare respecteert de query-string als cache-key onderscheid.
- De field picker is volledig state-onafhankelijk van `FSV2.S` en blijft als `OpenVME.FieldPicker` volledig geïsoleerd. Geen enkele andere module hoeft `FSV2` te laden om de picker te gebruiken.
- Circulaire afhankelijkheden zijn het grootste structuurrisico bij opsplitsing: `wizard.js` en `detail.js` mogen state lezen van `FSV2.S` maar nooit definiëren of muteren buiten hun eigen render-context.

---

## Aangescherpt Plan

### Fase 0 — Branch en rollback

- Branch `feature/fsv2-public-assets` van `master`.
- **Geen toggle.** Atomische cutover: deploy = live. Rollback = `git revert HEAD` + `wrangler deploy` in < 90 seconden. Geen database-, KV- of side-effect-afhankelijkheid.
- **Go/no-go na deploy:** open `/forminator-sync` in incognito, Network-tab toont 5 `.js` requests + 0 console errors. Maximale verificatietijd: 3 minuten.

---

### Fase 1 — Asset delivery: 5 public files

**Bestandssplitsing:**

| Bestand | Verantwoordelijkheid | Namespace | Max regels |
|---|---|---|---|
| `field-picker-component.js` | Volledig losstaande picker-widget, geen FSV2-afhankelijkheid | `window.OpenVME.FieldPicker` | 150 |
| `forminator-sync-v2-core.js` | `ACTIONS`, `S` state, utils, `api`, auto-suggest, alle loaders | `window.FSV2` | 350 |
| `forminator-sync-v2-wizard.js` | `renderWizard*` (steps, sites, forms, actions, mapping) | `window.FSV2` | 380 |
| `forminator-sync-v2-detail.js` | `renderDetail*`, `renderDetailMappings`, `renderDetailSubmissions`, `renderDetailFormFields`, `openDetail` | `window.FSV2` | 400 |
| `forminator-sync-v2-bootstrap.js` | Event delegation (click, change, input) + defensieve `bootstrap()` | `window.FSV2` | 200 |

**Waarom 5 bestanden groeiresistenter zijn dan één grote `views.js`:**  
Een gecombineerde `views.js` heeft geen afdwingbare grens: elke nieuwe wizard-stap of detail-sectie wordt erin gestapeld tot de 500r-ceiling overschreden is en de discussie opnieuw begint. Door `wizard.js` en `detail.js` als aparte grenzen te definiëren dwing je af dat uitbreidingen op de juiste plek landen. Een PR die `wizard.js` boven 380r duwt is aantoonbaar te groot zonder subjectieve code-review discussie.

**Laadvolgorde vóór `</body>` in `ui.js`:**
```
<script src="/field-picker-component.js?v=20260227"></script>
<script src="/forminator-sync-v2-core.js?v=20260227"></script>
<script src="/forminator-sync-v2-wizard.js?v=20260227"></script>
<script src="/forminator-sync-v2-detail.js?v=20260227"></script>
<script src="/forminator-sync-v2-bootstrap.js?v=20260227"></script>
```
Alle tags zonder `async` of `defer`, direct vóór `</body>`.

**Cache-strategie: Optie B — query-string versioning**  
Gekozen boven Optie A (bestandsnaam-suffix) en Optie C (geen immutable):
- Optie A vereist dat `ui.js` bestandsnamen kent → koppeling tussen server en client die breekt bij elke deploy.
- Optie C geeft geen cache-garantie: bezoekers houden willekeurig oude versies afhankelijk van hun ISP of browser-cache.
- **Optie B:** de `?v=` query-string is de cache-discriminerende sleutel in Cloudflare. Bij deploy wordt enkel de versiedatum verhoogd in `ui.js`. Geen bestandsnaamwijzigingen, geen wrangler-config aanpassingen. Cloudflare slaat de nieuwe versie op als nieuw cache-object. De `immutable` header blijft geldig omdat dezelfde `?v=`-waarde nooit een ander bestand serveert. Bij rollback wordt de `?v=` waarde teruggezet naar de vorige datum.

**Wijziging `src/modules/forminator-sync-v2/ui.js`:**
- Verwijder de `import { forminatorSyncV2ClientScript }` regel.
- Vervang `<script>${forminatorSyncV2ClientScript}</script>` door bovenstaand script-blok met `?v=`.
- Lucide `DOMContentLoaded` handler en thema-init blijven ongewijzigd.

**Cleanup embedded files (in Fase 3):**
- `src/modules/forminator-sync-v2/public/client.js` → verwijderd.
- `src/modules/forminator-sync-v2/public/client.old.js` → verwijderd.
- `src/modules/forminator-sync-v2/ui.old.js` → verwijderd.

---

### Fase 2 — Defensieve bootstrap en namespace-discipline

**Defensieve bootstrap:**  
`forminator-sync-v2-bootstrap.js` opent met een guard vóór elke andere instructie:
```
// guard — moet eerste statement zijn
if (!window.FSV2 || !window.FSV2.S || !window.FSV2.bootstrap) {
  console.error('[FSV2] Core niet geladen. bootstrap.js aborts.');
  // stop — geen event binding, geen bootstrap()
}
// pas hierna: event delegation en bootstrap()
```
Dit geeft een leesbare foutmelding in de console in plaats van een `ReferenceError` diep in een event handler. Geen enkel event wordt gebonden als de guard faalt.

**Filestructuur-regels:**
- Elke file start met een header-comment: `FILE`, `RESPONSIBILITY`, `NAMESPACE`, `DEPENDENCIES`.
- `wizard.js` en `detail.js` definiëren geen state, muteren `FSV2.S` alleen via door `core.js` geëxporteerde setters of direct (plain objects zijn toegestaan, geen proxy-abstractie nodig).
- Dependency-richting: `bootstrap → core + wizard + detail`, `wizard → core`, `detail → core`. Geen omgekeerde afhankelijkheden.

---

### Fase 3 — Cleanup

- Verwijder de drie embedded-era bestanden.
- Update `?v=` datum in `ui.js` naar deploy-datum bij elke release die een van de 5 bestanden wijzigt.
- Dit bestand is de definitieve referentie; geen aanvullende doc vereist.

---

## Namespace Structuur

```
window.OpenVME
└── .FieldPicker
    ├── .render(id, inputName, allFields, selectedName) → HTMLString
    ├── .bindEvents(containerEl)       // delegated, idempotent
    ├── .getValue(id) → string
    ├── .setValue(id, name, label)     // dispatcht 'change' op hidden input
    └── .closeAll()

window.FSV2
├── .S                                 // enige state-store
│   ├── .view / .sites / .integrations
│   ├── .wizard (step, site, form, action, forms, extraMappings)
│   ├── .activeId / .detail / .testStatus / .submissions
│   ├── .detailFormFields / .webhookConfig
│   └── .odooFieldsCache / .modelDefaultsCache / .modelDefaultsEditors
├── .ACTIONS                           // const config, nooit gemuteerd
├── .esc / .api / .showAlert / .showView / .fmt / .shortId / .resetWizard
├── .suggestFormField / .suggestOdooField
├── .loadOdooFieldsForModel / .loadModelDefaultsForModel
├── .loadSites / .loadIntegrations
├── .renderList / .renderConnections / .renderDefaults  ← core.js
├── .renderWizard* (steps, sites, forms, actions, mapping) ← wizard.js
├── .renderDetail / .renderDetailMappings / .renderDetailSubmissions
│   .renderDetailFormFields / .openDetail               ← detail.js
└── .bootstrap                                          ← bootstrap.js
```

`renderList`, `renderConnections`, `renderDefaults` staan in `core.js` (klein, geen wizard/detail-afhankelijkheid).  
Niets buiten `FSV2` en `OpenVME.FieldPicker` in `window`.

---

## Definition of Done

- [ ] `grep -r "String.raw" src/` → **0 resultaten**
- [ ] `grep -r "forminatorSyncV2ClientScript" src/` → **0 resultaten**
- [ ] `src/modules/forminator-sync-v2/ui.js` bevat geen `<script>` tag met embedded app-JS (enkel Lucide-init en thema-init toegestaan)
- [ ] Network-panel bij pageload `/forminator-sync` toont precies **5 externe `.js` requests**, allen HTTP 200, allen met `?v=` query-string zichtbaar
- [ ] Browser Console bij pageload → **0 errors**
- [ ] `Object.keys(window)` bevat `FSV2` en `OpenVME`, en **niet** `renderList`, `esc`, `api`, `bootstrap`, `ACTIONS` of `S`
- [ ] Field picker werkt identiek in **wizard stap 4 (mapping)** én in **defaults editor**: selectie, zoeken, clear, change-event
- [ ] `wc -l public/forminator-sync-v2-core.js` → **≤ 350**
- [ ] `wc -l public/forminator-sync-v2-wizard.js` → **≤ 380**
- [ ] `wc -l public/forminator-sync-v2-detail.js` → **≤ 400**
- [ ] `wc -l public/forminator-sync-v2-bootstrap.js` → **≤ 200**
- [ ] `wc -l public/field-picker-component.js` → **≤ 150**
- [ ] Bij bewust 404 maken van `core.js`: console toont `[FSV2] Core niet geladen. bootstrap.js aborts.` — geen `ReferenceError`, geen stille breuk
- [ ] Bootstrap-guard aborts correct: geen events gebonden, geen `bootstrap()` uitgevoerd bij ontbrekende `FSV2`
- [ ] Cache-headers op JS-responses: `Cache-Control: public, max-age=31536000, immutable` + `?v=`-datum zichtbaar in Network-tab

---

## Testplan

- [ ] **5 script requests:** pageload Network-tab toont precies 5 `.js` files met `?v=20260227`, allen HTTP 200, geen 404.
- [ ] **404-resistentie:** hernoem `forminator-sync-v2-core.js` tijdelijk → console toont `[FSV2] Core niet geladen. bootstrap.js aborts.` — geen `ReferenceError`, geen stille UI-freeze. Herstel daarna.
- [ ] **Bootstrap guard:** verwijder tijdelijk de `core.js` scripttag uit `ui.js` lokaal → guard-boodschap verschijnt, geen enkel event reageert. Herstel daarna.
- [ ] **Cache-busting:** wijzig `?v=` naar een nieuwe datum, deploy → Network-tab toont nieuwe versie, geen `304 Not Modified` op de gewijzigde bestanden.
- [ ] **Wizard end-to-end:** stap 1 → 2 → 3 → 4, veldkoppeling aanmaken, opslaan, detail openen — 0 console errors in elke stap.
- [ ] **Defaults editor:** per model openen, Odoo-velden laden, veld toevoegen, required-toggle, opslaan, sluiten → badge zichtbaar in kaart.
- [ ] **Component isolatietest:** `OpenVME.FieldPicker.render('test','--unused--',[{name:'email',label:'E-mail'}],'')` in console → HTML-string terug, ook als `FSV2` niet bestaat.
- [ ] **Namespace-check:** `Object.keys(window).filter(k => ['renderList','esc','api','bootstrap','ACTIONS','S'].includes(k))` → **lege array**.
- [ ] **Detail view:** `FSV2.openDetail(id)` laadt mappings, submissions en form fields; field picker toont correct geselecteerde waarde voor bestaande mappings.
- [ ] **Rollback-drill:** `git checkout master` + `wrangler deploy` → embedded versie werkt correct. Bevestigt rollback in < 90 seconden.
