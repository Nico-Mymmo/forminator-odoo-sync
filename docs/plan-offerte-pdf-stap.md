# Plan — offerte-pdf als stap in Koppelingen (uitvoerbaar)

Status: nagekeken tegen de code op 2026-09-18. Regelnummers kloppen op die datum;
**zoek altijd op de genoemde functienaam/tekst, niet blind op het regelnummer.**

---

## 0. Spelregels voor wie dit uitvoert (lees eerst)

1. **Bestand-editing:** bijna elk bestand hieronder is > 150 regels
   (`worker-handler.js` 2755, `routes.js` 2783, `-mapping-tab.js` 2368,
   `offerte-render.js` 587, `mail-attachments.js` 366, `validation.js` 387,
   `-add-target-wizard.js` 595, `-settings.js` 440, `-mail-attachments.js` 342,
   `-detail.js` 796, `-submissions-tab.js`). Volg voor ELK daarvan de verplichte
   procedure uit `claude.md` ("Bestand-editing bij grote/gevoelige bestanden"):
   Python-script als BESTAND in de scratchpad (niet via heredoc), `rb`-lezen,
   CR-count 0, `assert content.count(old) == 1`, schrijven met `newline='\n'`,
   daarna `node --check`, CR-count, volledige `git diff` van dat bestand.
   Eén script per bestand per ronde. De Edit-tool alleen voor NIEUWE bestanden
   of bestanden < 150 regels.
2. **Werk in de fases van §9, in die volgorde.** Na elke fase: `node --check` op
   alles wat je aanraakte + de bestaande tests uit §8. Pas dan verder.
3. **Geen eigen testsuites en geen browser-/meetrondes.** Nico test zelf. Draai
   enkel de bestaande tests uit §8.
4. **Stijl:** nieuwe bestanden in `public/forminator-sync-v2-*` gebruiken ES6
   template literals (moduleregel). In BESTAANDE bestanden die met
   string-concatenatie werken (`-mapping-tab.js`, `-add-target-wizard.js`,
   `-settings.js`): volg de stijl van de omliggende code, refactor niets.
5. **Niets deployen, geen migratie draaien, geen `npm install` zonder het te
   melden.** De migraties schrijf je; Nico draait ze.
6. Cross-file calls tussen `detail-*`-bestanden: exporteren via
   `Object.assign(window.FSV2, {...})`, aanroepen als `window.FSV2.naam()`.

---

## 1. Wat er gebouwd wordt (samenvatting)

- Een module-breed **pdf-sjabloon** (`fs_v2_pdf_templates`) met de vorm van
  `window.OFFERTE_DATA` (`{gegevens, copy}`) + `velden` (`window.OFFERTE_VELDEN`).
- Beheer onder **Instellingen** (derde sectie in `renderLinks()`), bewerken
  gebeurt in de bestaande `offerte.html`, geopend als `/offerte.html?template=<id>`.
- Een nieuw staptype **`generate_pdf`**: vult `gegevens` via gewone
  `fs_v2_mappings`-rijen, zet de contactpersoon uit `hr.employee`, rendert
  `offerte.html` met **Cloudflare Browser Rendering** naar pdf, uploadt als
  `ir.attachment`.
- Een `send_mail`-stap kan die pdf als **bijlage** meesturen.

Motor = Browser Rendering op de ECHTE `offerte.html`/`offerte-render.js`: één
renderer, geen drift. Geen tweede renderer bouwen, ook geen "lichte preview".

---

## 2. Feiten uit de code waar het oorspronkelijke plan naast zat

Deze punten zijn de reden dat het plan hieronder afwijkt. Niet "terugfixen".

| # | Oorspronkelijk plan | Werkelijkheid | Gevolg |
|---|---|---|---|
| F1 | `resolveMappingValue()` exporteren en in `pdf-step.js` importeren | Niet geëxporteerd (worker-handler.js:857). `mail-step.js` krijgt helpers **geïnjecteerd** (`lookupForm: lookupFormValue`), en worker-handler importeert mail-step — een import terug zou een cirkel maken. | **Injecteren**, net als bij mail-step: `resolveMapping: resolveMappingValue`. |
| F2 | `step.N.attachment_id` via `extraFields` volstaat | Bij een **retry** worden geslaagde stappen overgeslagen (`shouldSkipOnRetry`: `created/updated/skipped/found`) en herstelt `restoreStepOutputsFromDB` enkel `record_id`/`action` + velden gelezen op `target.odoo_model` — **geen extraFields**. | De pdf-stap krijgt een eigen `action_result` (`pdf_generated`) die NIET in die lijst staat, zodat ze bij een retry opnieuw draait; ze is idempotent via een vaste marker op het attachment (§4.6). |
| F3 | Bijlage verwijst naar `stepOrder` | `execution_order` verandert bij verplaatsen (`handleReorderTarget` wisselt nummers). | Verwijs naar het **target-id** van de pdf-stap; de stap schrijft daarvoor een eigen contextsleutel `pdf.<targetId>.attachment_id`. |
| F4 | `normalizeMailAttachments()` valideert "ook de nieuwe vorm" | Elke rij MOET een `key` binnen de Asset Manager hebben, anders gooit hij (mail-attachments.js:102-133). `resolveMailAttachments` gooit bij ontbrekende `R2_ASSETS` al vóór hij iets doet. | Lijst **splitsen** in twee soorten vóór de bestaande code; de R2-tak blijft byte-gelijk (§5). |
| F5 | `pdf_failed` is "replaybaar" | `mail_failed` telt NIET mee in `classifyFinalSubmissionStatus()` (enkel `failed` en `pipeline_abort`), dus zo'n indiening wordt `success` en staat niet in `REPLAYABLE_STATUSES`. | Zelfde gedrag als `mail_failed` aanhouden (niet-fataal, zichtbaar in het spoor), maar **niet beloven dat het replaybaar is**. `classifyFinalSubmissionStatus` NIET aanpassen (raakt alle koppelingen). Zie open punt O2. |
| F6 | Worker-route "Genereer testpdf" geeft een download terug | REGEL 4: Worker-routes geven altijd JSON. | Route geeft JSON `{filename, base64}`; de client maakt er een Blob-download van. |
| F7 | `import puppeteer from '@cloudflare/puppeteer'` bovenaan `pdf-step.js` | `tests/step-fields-test.mjs` importeert `worker-handler.js` in gewone Node. Een statische import van puppeteer daarin kan die test breken. | **Dynamische import** binnen de renderfunctie: `const { default: puppeteer } = await import('@cloudflare/puppeteer');`. |
| F8 | — | `fs_v2_targets.odoo_model` is `NOT NULL` (base schema). Geen CHECK op `operation_type`. | De pdf-stap erft `odoo_model` van de stap waaraan hij hangt (zoals chatter/mail). |
| F9 | — | De pipeline draait **synchroon** in het verzoek. De WP-plugin wacht max. **15 s** (`SUBMIT_TIMEOUT` in `class-api-client.php`). | Harde tijdslimiet op het renderen (§4.5) + open punt O1. |
| F10 | `window.OFFERTE.zet(data)` volstaat | Klopt: `zet: function (nieuw) { staat = kopie(nieuw); teken(); }`. `staat` = `{gegevens, copy}`. `OFFERTE_VELDEN` is een aparte global die alleen het "Gegevens invullen"-venster gebruikt. | `zet({gegevens, copy})` — `velden` hoort er niet in. |
| F11 | — | `laadStaat()` draait **synchroon** bij het laden van de IIFE. Een sjabloon ophalen is async. | Laadvolgorde + schrijfblokkade zoals in §7.2, anders overschrijft de eerste `bewaar()` het sjabloon met de demo-inhoud. |
| F12 | — | Instellingen hebben geen tabbladen: `renderLinks()` zet secties onder elkaar met `<div class="divider my-2"></div>`. | Derde sectie op dezelfde manier toevoegen. |

---

## 3. Database (twee migraties, Nico draait ze)

### 3.1 `supabase/migrations/20260918120000_fsv2_pdf_templates.sql`

```sql
CREATE TABLE IF NOT EXISTS fs_v2_pdf_templates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  data       jsonb       NOT NULL,   -- { gegevens, copy, velden }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- RLS + policies + `updated_at`-trigger: kopieer het patroon uit
  `20260910120000_fsv2_om_forms.sql` (sectie "3. updated_at bijhouden", met de
  `to_regprocedure('public.update_updated_at_column()')`-bewaking) en de
  RLS-regels uit `20260914150000_fsv2_calendly.sql` (regel ~86). Idempotent:
  `IF NOT EXISTS`, `DROP POLICY IF EXISTS` / `DROP TRIGGER IF EXISTS`.
- **Seed:** één rij "Offerte gebouwbeheer" met de inhoud van `OFFERTE_DATA` +
  `OFFERTE_VELDEN` uit `public/offerte-data.js`. Genereer de JSON met een
  Node-script dat het bestand in een `vm`-context evalueert
  (`vm.runInNewContext(src, { window: {} })`) en `JSON.stringify` uitschrijft —
  niet overtypen. Zet de seed achter `WHERE NOT EXISTS (SELECT 1 FROM
  fs_v2_pdf_templates)` zodat een tweede run geen dubbele rij geeft.
- `gegevens` in een sjabloon = **standaardwaarden**, nooit klantdata. Klantdata
  komt per generatie uit de mapping en wordt nergens in deze tabel bewaard.

### 3.2 `supabase/migrations/20260918120100_fsv2_pdf_step.sql`

```sql
ALTER TABLE fs_v2_targets ADD COLUMN IF NOT EXISTS pdf_template_id          uuid REFERENCES fs_v2_pdf_templates(id);
ALTER TABLE fs_v2_targets ADD COLUMN IF NOT EXISTS pdf_res_id_source        text;   -- 'step.N.record_id' (optioneel)
ALTER TABLE fs_v2_targets ADD COLUMN IF NOT EXISTS pdf_contact_source       text;   -- 'fixed' | 'dynamic' | NULL (= sjablooncontact)
ALTER TABLE fs_v2_targets ADD COLUMN IF NOT EXISTS pdf_contact_employee_id  integer;
ALTER TABLE fs_v2_targets ADD COLUMN IF NOT EXISTS pdf_contact_source_value text;   -- 'step.N.record_id'
ALTER TABLE fs_v2_targets ADD COLUMN IF NOT EXISTS pdf_filename_template    text;   -- 'Offerte-{{offerte.nummer}}.pdf'
```

- `pdf_contact_source` bewust **nullable zonder default** (i.p.v. `NOT NULL
  DEFAULT 'fixed'`): een default `'fixed'` zonder `employee_id` is voor elke
  bestaande rij een ongeldige combinatie. NULL = "gebruik het contact uit het
  sjabloon".
- `COMMENT ON COLUMN` per kolom, zoals de andere fsv2-migraties doen.
- `mail_attachments` krijgt geen migratie (jsonb, nieuwe itemvorm, §5) — wel
  de `COMMENT ON COLUMN` bijwerken met de tweede vorm.

---

## 4. Server — `src/modules/forminator-sync-v2/pdf-step.js` (nieuw)

Mirror van `mail-step.js` qua vorm. Puur waar het kan; Odoo/Supabase/Browser
alleen in de functies die dat nodig hebben.

### 4.1 Exports

```js
export class PdfStepError extends Error {}
export async function buildPdfGegevens(env, { target, template, mappings, form, contextObject, resolveMapping })
  // → { gegevens, waarschuwingen: [] }   (geen upload, geen render)
export async function renderPdf(env, { gegevens, copy })
  // → Uint8Array   (Browser Rendering)
export async function runGeneratePdfStep(env, { target, integration, submissionId, form, contextObject, mappings, resolveMapping })
  // → { action: 'pdf_generated'|'pdf_reused', attachmentId, bytes, filename, detail }
```

`runGeneratePdfStep` = template laden → `buildPdfGegevens` → idempotentiecheck
(§4.6) → `renderPdf` → upload → teruggeven. De test-route (§6.3) gebruikt enkel
`buildPdfGegevens` + `renderPdf`, zodat er bij testen nooit iets in Odoo belandt.

### 4.2 Sjabloon laden

`getSupabaseClient(env)` → `fs_v2_pdf_templates` op `target.pdf_template_id`.
Geen rij → `PdfStepError('generate_pdf: sjabloon ... bestaat niet meer.')`.

### 4.3 Gegevens vullen

1. `gegevens = structuredClone(template.data.gegevens)`.
2. Voor elke mapping van de stap: `odoo_field` bevat het **pad** in `gegevens`
   (bv. `gebouw.adres`). Sla paden die met `contact.` beginnen over (die komen
   uit §4.4). Waarde = `resolveMapping(mapping, form, contextObject)`.
   - `null`/`undefined`/`''` → sjabloonwaarde laten staan en het pad in
     `waarschuwingen` zetten (zo zie je in het spoor welk gegeven ontbrak).
   - Anders `String(waarde)` op het pad zetten (kleine `zetPad(obj, pad, w)`,
     zelfde logica als `zet()` in offerte-render.js; geen arrays nodig).
   - Alleen paden toelaten die in `template.data.velden` staan (gesloten lijst);
     een onbekend pad → waarschuwing, niet schrijven.
3. Bestandsnaam: `pdf_filename_template` met `{{pad}}` → waarde uit `gegevens`,
   onbekend = leeg (zelfde regel als de offerte-copy). Leeg of zonder `.pdf`
   → `.pdf` toevoegen; tekens `\/:*?"<>|` vervangen door `-`. Standaard:
   `Offerte-{{offerte.nummer}}.pdf`.

### 4.4 Contactpersoon

- `pdf_contact_source` leeg → niets doen (sjablooncontact).
- `'fixed'` → id = `pdf_contact_employee_id`.
- `'dynamic'` → id = `parsePositiveInteger(contextObject[pdf_contact_source_value])`
  (lokale kopie van die helper; hij is niet geëxporteerd). Geen geldig id →
  `PdfStepError` met de bron en de waarde in de tekst (zelfde stijl als
  `create_activity`).
- `searchRead(env, { model: 'hr.employee', domain: [['id','=',id]], fields: ['name','work_email','image_512'], limit: 1 })`.
  Geen record → `PdfStepError`.
- `gegevens.contact.naam = name`, `gegevens.contact.email = work_email || ''`.
- Foto: **`image_512`, niet `image_1920`** (die kan meerdere MB base64 zijn en
  gaat door `page.evaluate`). Leeg/`false` → sjabloonfoto laten staan. Mime
  afleiden uit de eerste tekens van de base64: `/9j/` → `image/jpeg`, `iVBOR` →
  `image/png`, `PHN2Zy`/`PD94` → `image/svg+xml`, anders `image/png`.
  `gegevens.contact.foto = 'data:<mime>;base64,<...>'`.

### 4.5 Renderen (Browser Rendering)

```js
async function renderPdf(env, { gegevens, copy }) {
  if (!env.BROWSER) throw new PdfStepError('generate_pdf: Browser Rendering is niet gekoppeld (binding BROWSER ontbreekt).');
  const { default: puppeteer } = await import('@cloudflare/puppeteer');   // F7
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.goto(`${env.APP_BASE_URL}/offerte.html?server=1`, { waitUntil: 'networkidle0', timeout: RENDER_TIMEOUT_MS });
    await page.evaluate((data) => window.OFFERTE.zet(data), { gegevens, copy });
    await page.evaluate(() => Promise.all([
      document.fonts.ready,
      ...Array.from(document.images).map((img) => img.complete ? null
        : new Promise((r) => { img.onload = img.onerror = r; }))
    ]));
    return await page.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
```

- De hele `renderPdf` loopt binnen een **tijdsbudget** (`RENDER_TIMEOUT_MS`,
  voorstel 9000) via `Promise.race` met een timer die `PdfStepError('generate_pdf:
  renderen duurde langer dan 9 s')` gooit. Reden: F9 — de plugin wacht maximaal
  15 s op de hele pipeline.
- `APP_BASE_URL` staat al in `wrangler.jsonc` `vars`.
- `offerte.html` is publiek bereikbaar (assets-binding, geen `run_worker_first`);
  dat is bestaand gedrag. Er zit geen klantdata in het bestand zelf — die komt
  via `evaluate`.
- `@page { size: A4; margin: 0 }` en `@media print` staan al in `offerte.css`
  (regels ~669-695); `preferCSSPageSize: true` volgt die.
- Controleer in de `@cloudflare/puppeteer`-docs (skill `cloudflare` of
  `agents-sdk`) de exacte `launch`-signatuur en of `page.pdf()` een Buffer of
  Uint8Array teruggeeft — pas `naarBase64` daarop aan. Niet gokken.

### 4.6 Uploaden + idempotentie (F2)

Marker: `description = 'OM pdf-stap target:<target.id> submission:<submissionId>'`.

1. Eerst `searchRead('ir.attachment', [['description','=',marker]], ['id','file_size'], limit 1)`.
   Gevonden → `{ action: 'pdf_reused', attachmentId }`, **niet opnieuw renderen**.
   (Dit is het retry-pad: de stap draait opnieuw omdat `pdf_generated` niet in
   de skiplijst staat, maar maakt geen tweede pdf.)
2. Anders renderen en `create(env, { model: 'ir.attachment', values: { name:
   filename, datas: naarBase64(bytes), type: 'binary', mimetype:
   'application/pdf', description: marker, ...resLink } })`.
   `naarBase64` importeren uit `mail-attachments.js`.
3. `resLink`: alleen als `pdf_res_id_source` een geldig positief id oplevert →
   `{ res_model: target.odoo_model, res_id }`. Anders geen koppeling.
4. Een **replay** is een nieuwe indiening met een nieuw `submissionId` → nieuwe
   pdf. Dat is bedoeld (nieuwste sjabloon en gegevens).

### 4.7 Aansluiting in `worker-handler.js`

- `import { runGeneratePdfStep, PdfStepError } from './pdf-step.js';` naast de
  import van `runSendMailStep`.
- Nieuw blok `if (opType === 'generate_pdf') { ... continue; }` **direct vóór**
  het blok `// ── send_mail: één gewone mail klaarzetten ...`. Kopieer de vorm
  van het send_mail-blok (try → `createSubmissionTargetResult` → `continue`;
  catch → `action_result: 'pdf_failed'`, `error_detail: err.message`,
  `console.warn(... '(non-fatal)')`).
- Aanroep: `runGeneratePdfStep(env, { target, integration: { id:
  submission.integration_id }, submissionId: submission.id, form:
  normalizedForm, contextObject, mappings, resolveMapping: resolveMappingValue })`.
  `mappings` is al geladen bovenaan de lus (`listMappingsByTarget`).
- Bij succes (`pdf_generated` én `pdf_reused`):
  ```js
  contextObject[`pdf.${target.id}.attachment_id`] = res.attachmentId;          // F3: stabiel bij herordenen
  registerTargetOutput(contextObject, target, { action: res.action, recordId: null }, mappings,
                       { attachment_id: res.attachmentId });                    // step.N.attachment_id, voor wie het wil
  ```
  `odoo_record_id` in het resultaat = `attachmentId`; `error_detail` = de
  waarschuwingen (ontbrekende gegevens) als tekst, of `null`.
- **`recordId: null`** in `registerTargetOutput`: `step.N.record_id` van een
  pdf-stap mag nooit een attachment-id zijn, want de stap heeft `odoo_model`
  van het bovenliggende record — een activiteit gekoppeld aan
  `step.N.record_id` zou dan op het verkeerde record belanden.
- Calendly-fases: de bestaande tak voor een STRING-waarde (`'skip'`/`'default'`)
  werkt al generiek vóór de opType-takken. Geen worker-wijziging nodig; alleen
  de UI (§7.4).
- `classifyFinalSubmissionStatus`, `shouldSkipOnRetry`,
  `restoreStepOutputsFromDB`: **niet aanpassen.**

### 4.8 `validation.js`

- In `validateTargetPayload`: een blok `if (payload.operation_type ===
  'generate_pdf') { ... return; }` naast het `send_mail`-blok:
  - `odoo_model` verplicht (F8);
  - `pdf_template_id` verplicht;
  - `pdf_contact_source` ∈ `{null, '', 'fixed', 'dynamic'}`; bij `'fixed'`
    een positief geheel `pdf_contact_employee_id`; bij `'dynamic'` een
    `pdf_contact_source_value` die matcht op `/^step\.[^.]+\.record_id$/`;
  - `pdf_res_id_source` leeg of datzelfde patroon.
- `isInhoudStap` (calendly_behavior-validatie) **niet** uitbreiden: de pdf-stap
  gebruikt de string-vorm (`default`/`skip`), niet de inhoud-override. De
  bestaande string-validatie accepteert die al.

### 4.9 `routes.js`

- Allowlist-regels voor de zes `pdf_*`-kolommen in **beide**
  `'POST /api/integrations/:id/targets'` en
  `'PUT /api/integrations/:id/targets/:targetId'`, direct onder de bestaande
  `mail_res_id_source`-regel, zelfde vorm:
  `...(payload.pdf_template_id !== undefined ? { pdf_template_id: payload.pdf_template_id || null } : {}),`
  (`pdf_contact_employee_id` via `Number(...) || null`).
- Sjabloonbeheer (nieuw, gewone module-routes → achter de auth-gate):
  - `GET /api/pdf-templates` → `[{id, name, updated_at, in_gebruik}]`
    (`in_gebruik` = aantal targets met dat `pdf_template_id`). Geen `data` in de lijst.
  - `GET /api/pdf-templates/:id` → volledige rij.
  - `POST /api/pdf-templates` → body `{name, data}`; `data` verplicht met
    `gegevens` en `copy` als object en `velden` als array. De client stuurt
    bij "Nieuw" `OFFERTE_DATA` + `OFFERTE_VELDEN` mee (§7.1).
  - `PUT /api/pdf-templates/:id` → `{name?, data?}`, dezelfde validatie.
  - `DELETE /api/pdf-templates/:id` → **409** met het aantal stappen zolang
    een `fs_v2_targets`-rij ernaar verwijst.
  - Validatie in een kleine pure functie `validatePdfTemplateData(data)` in
    `pdf-step.js` (of `validation.js`), zodat route en seed dezelfde regel delen.
- `POST /api/targets/:targetId/pdf-test` (§6.3).

---

## 5. Bijlage bij `send_mail` (`mail-attachments.js` + `mail-step.js`)

Nieuwe itemvorm in `fs_v2_targets.mail_attachments`:

```jsonc
{ "key": "banners/x.pdf", "name": "Brochure.pdf" }                 // bestaand
{ "type": "pdf_step", "targetId": "<uuid>", "name": "Offerte.pdf" } // nieuw (F3: target-id, geen stepOrder)
```

- **Splitsen vóór de bestaande code (F4):** nieuwe export
  `splitMailAttachments(lijst) → { assets: [...], pdfSteps: [...] }`.
  `normalizeMailAttachments` en de R2-tak van `resolveMailAttachments` krijgen
  alleen de `assets`-lijst en blijven verder **ongewijzigd**.
- `MAX_MAIL_ATTACHMENTS` (5) geldt voor beide soorten samen.
- `resolveMailAttachments(env, lijst, contextObject)`: derde parameter.
  - Als de `assets`-lijst leeg is: de `R2_ASSETS`-controle overslaan (anders
    faalt een mail met enkel een pdf-bijlage op een omgeving zonder R2).
  - Per `pdfSteps`-item: `id = contextObject?.['pdf.' + targetId + '.attachment_id']`.
    Ontbreekt → `MailAttachmentError('Bijlage "<name>" ontbreekt: de pdf-stap
    leverde niets op (mislukt, overgeslagen of staat na deze mail).')`. Zo
    komt de mail op `mail_failed` en vertrekt er geen mail zonder offerte.
  - Grootte: lees `file_size` van die attachments (`searchRead` op
    `ir.attachment`) en tel ze mee in het totaal tegen
    `MAX_MAIL_ATTACHMENT_BYTES`.
  - Volgorde van `ids`: in de volgorde van de oorspronkelijke lijst.
- `mail-step.js`: de enige aanroep (`resolveMailAttachments(env,
  target.mail_attachments)` rond regel 467) krijgt `contextObject` mee.
  `contextObject` is al een parameter van `runSendMailStep`.
- `describeMailAttachments` (voorbeeld in de composer): `pdfSteps`-items
  teruggeven als `{ type: 'pdf_step', targetId, name, missing: false,
  dynamic: true }` — geen Odoo-lookup, er bestaat nog niets.
- `routes.js` bewaart `mail_attachments` zoals ze binnenkomt (geen normalisatie
  bij opslaan) — dat blijft zo.

---

## 6. Client — nieuw staptype

### 6.1 `public/forminator-sync-v2-detail-add-target-wizard.js`

- `SPECIAL`: `{ id: 'generate_pdf', icon: 'file-text', label: 'PDF genereren', desc: 'Offerte of document als pdf' }`.
- In `handleAddTargetWithType()` een tak `if (objectId === 'generate_pdf')`
  gemodelleerd op de `send_mail`-tak (rond regel 275): zelfde manier om de
  bovenliggende stap te kiezen (filter op stappen met een `odoo_model` die geen
  chatter/mail/pdf zijn), payload:
  `{ operation_type: 'generate_pdf', odoo_model: parent.odoo_model,
  pdf_res_id_source: 'step.' + parentOrder + '.record_id', pdf_template_id:
  <eerste sjabloon uit GET /pdf-templates, of weigeren met een melding als er
  geen is>, pdf_filename_template: 'Offerte-{{offerte.nummer}}.pdf' }`.

### 6.2 Nieuw: `public/forminator-sync-v2-detail-pdf-composer.js`

IIFE, template literals, export via `Object.assign(window.FSV2, {
renderPdfComposer, handleSavePdfComposer, handlePdfTest })`.
Gebruik `-detail-mail-composer.js` als vormvoorbeeld (hoe hij `S()`, `esc()`,
de targetkaart en het opslaan doet).

Inhoud van de kaart:
1. **Sjabloon**: `<select>` uit `GET /pdf-templates` (cache in `S()`), met een
   link "Bewerken" → `/offerte.html?template=<id>` (`target="_blank"`).
2. **Gegevens** (per groep uit `template.data.velden`, groep "Contactpersoon"
   overslaan): per pad een regel met label, bronkeuze en waarde.
   - Bronnen: *Sjabloonwaarde* (= geen mapping), *Formulierveld*
     (`source_type: 'form'`, keuzelijst uit `S().detailFormFields`), *Vorige
     stap* (`source_type: 'previous_step_output'`, keuzelijst
     `step.<order>.record_id` en `step.<order>.<veld>` van de voorgaande
     stappen — **hergebruik** wat de bestaande MappingTable/`computeChainSuggestions`
     daarvoor gebruikt; zoek eerst, bouw niet opnieuw), *Vaste waarde*
     (`source_type: 'static'`).
   - Opslaan: dezelfde mapping-API's als de andere stappen
     (`POST /api/targets/:targetId/mappings`, `DELETE ...`, `PUT /api/mappings/:id`)
     met `odoo_field = <pad>`, `is_required: false` (een verplichte
     `previous_step_output` die ontbreekt zou de hele stap op
     `dependency_missing` zetten — voor een document is "sjabloonwaarde" beter).
     Bekijk hoe `handleSaveStepMappings()` dat voor gewone stappen doet en
     volg exact datzelfde pad.
3. **Contactpersoon**: drie keuzes — *Uit het sjabloon* (NULL), *Vaste
   medewerker* (zoekveld op `hr.employee`; zoek eerst of er al een
   medewerker-/gebruikerszoeker bestaat, bv. bij `activity_user_id`, en
   hergebruik die), *Uit een vorige stap* (keuzelijst `step.N.record_id` van
   voorgaande stappen; toon erbij dat die stap een `hr.employee` moet zijn).
4. **Hangt aan**: `pdf_res_id_source` (voorgaande stap of "nergens").
5. **Bestandsnaam**: tekstveld met `{{pad}}`.
6. **Genereer testpdf**: roept `POST /api/targets/:id/pdf-test` aan (§6.3),
   maakt van `base64` een Blob en downloadt die als `filename`. Toon
   `waarschuwingen` als toast.

### 6.3 `POST /api/targets/:targetId/pdf-test` (routes.js)

- Laadt target, sjabloon en mappings; body mag `{ sample: {pad: waarde} }`
  bevatten.
- Vult met `buildPdfGegevens` waarbij `form` = `sample` en `contextObject` =
  `{}` en een eenvoudige `resolveMapping` die `static` teruggeeft, `form`
  opzoekt in `sample`, en de rest leeg laat (→ sjabloonwaarde + waarschuwing).
  Bij `pdf_contact_source === 'dynamic'`: sjablooncontact + waarschuwing
  "dynamische contactpersoon wordt pas bij een echte indiening ingevuld".
  `'fixed'` wordt wel echt uit Odoo gehaald.
- `renderPdf` → JSON `{ success: true, data: { filename, base64, waarschuwingen } }`.
- **Geen upload naar Odoo.**

### 6.4 `public/forminator-sync-v2-detail-mapping-tab.js`

Elke plek waar `send_mail` apart behandeld wordt, krijgt een `generate_pdf`-tak.
Gevonden plekken (zoek zelf nog eens op `'send_mail'` in het bestand):

| waar (±regel) | wat |
|---|---|
| kopregel, ~107 | `opTypeLbl = 'PDF bij ' + modelLabel` / `'PDF genereren'`, `stepName = 'PDF'` |
| chain-badges, ~137 | `pdf_res_id_source` en `pdf_contact_source_value` meenemen zoals `_mailResIdSrc` |
| icoon, ~201 | `'file-text'` |
| ~209 | `odoo_model` niet tonen (zoals chatter/mail) |
| ~467 | "Koppeling vorige stap"-kader niet tonen (zoals mail) |
| `renderOpenTargetCard`, ~695 | `window.FSV2.renderPdfComposer(...)` i.p.v. MappingTable |
| `handleSaveStepMappings`, ~1911 | naar `window.FSV2.handleSavePdfComposer(...)` |
| `ACTIE_STAPPEN`, ~1449 | `'generate_pdf'` toevoegen (fase-opties = Uitvoeren / Niets doen) |
| `_linkedOrders`, ~2109 | pdf-stap: orders uit `pdf_res_id_source` en `pdf_contact_source_value`. Mailstap: voor elk `mail_attachments`-item met `type === 'pdf_step'` het `getTargetOrder` van dat target-id. |
| `handleDuplicateTarget`, ~2230 | de zes `pdf_*`-velden aan `extraFields` toevoegen. `mail_*` staat daar vandaag ook niet in; dat laten zoals het is. |

### 6.5 Overige client-bestanden

- `public/forminator-sync-v2-detail.js` (~479-492): label/badge voor `generate_pdf`.
- `public/forminator-sync-v2-detail-submissions-tab.js` (~394-398 en de uitleg
  rond ~429): `pdf_generated` (badge-success, "pdf gemaakt"), `pdf_reused`
  (badge-ghost, "pdf bestond al"), `pdf_failed` (badge-error, "pdf mislukt")
  plus een uitklapregel die `error_detail` toont.
- `public/forminator-sync-v2-mail-attachments.js`: sectie "PDF-stappen in deze
  koppeling" boven de Asset Manager-lijst. Toont de `generate_pdf`-stappen uit
  `S().detail.targets` met een lagere order dan de mailstap; toevoegen levert
  `{ type: 'pdf_step', targetId, name: <gerenderde standaardnaam of 'Offerte.pdf'> }`.
  In de bijlagelijst krijgt zo'n item een ander icoon en het label "wordt per
  indiening gemaakt".
- `public/forminator-sync-v2.html`: `<script src="/forminator-sync-v2-detail-pdf-composer.js">`
  naast de andere `detail-*`-composers, vóór `-bootstrap.js`.
- `public/forminator-sync-v2-bootstrap.js`: alleen nieuwe `data-action`s
  registreren als de composer ze niet zelf afhandelt (volg hoe de mail-composer
  het doet).

---

## 7. Instellingen + de editor

### 7.1 `public/forminator-sync-v2-settings.js`

- `_renderPdfTemplatesSection()`; in `renderLinks()` achteraan toevoegen met
  dezelfde `divider` (F12).
- Tabel: naam, laatst bewerkt, "gebruikt in N stappen", knoppen *Bewerken*
  (`/offerte.html?template=<id>`, nieuw tabblad), *Hernoemen*, *Verwijderen*
  (409 → melding met het aantal).
- *Nieuw*: `POST /pdf-templates` met `{ name, data: { gegevens, copy, velden } }`.
  `OFFERTE_DATA`/`OFFERTE_VELDEN` zijn op die pagina niet geladen: haal ze via
  een `GET` op een bestaand sjabloon ("Kopie van ...") óf voeg
  `<script src="/offerte-data.js">` toe aan `forminator-sync-v2.html`. Kies
  het tweede (eenvoudiger, één bron).

### 7.2 `public/offerte-render.js` (Python-procedure, één script)

Laadvolgorde (F11), exact zo:

1. Bovenaan de IIFE: `var params = new URLSearchParams(location.search);`
   `var SERVER = params.get('server') === '1';`
   `var TEMPLATE_ID = params.get('template') || null;`
   `var OPSLAGSLEUTEL = TEMPLATE_ID ? 'offerte-ontwerp-' + TEMPLATE_ID : 'offerte-ontwerp-v1';`
   `var serverKlaar = !TEMPLATE_ID;` (mag er naar de server geschreven worden?)
2. `laadStaat()`: bij `SERVER` of `TEMPLATE_ID` **geen** `localStorage` lezen,
   gewoon `kopie(window.OFFERTE_DATA)`.
3. Na de eerste `teken()` (onderaan, bij "Start"): als `TEMPLATE_ID`, dan
   `fetch('/forminator-v2/api/pdf-templates/' + TEMPLATE_ID, { credentials: 'include' })`:
   - 401 → `location.href = '/'`.
   - OK → `window.OFFERTE_VELDEN = data.velden || window.OFFERTE_VELDEN;`
     `staat = { gegevens: data.gegevens, copy: data.copy };` `serverKlaar = true;`
     `teken();` en de naam in `.ov-werkbalk-titel` zetten.
   - Fout → melding "Sjabloon kon niet geladen worden — wijzigingen worden NIET
     bewaard" en `serverKlaar` blijft `false`.
4. `bewaar()`:
   - `localStorage` zoals nu (met de per-sjabloon-sleutel).
   - Plus, als `TEMPLATE_ID && serverKlaar`: gedebouncede (1000 ms)
     `PUT /forminator-v2/api/pdf-templates/<id>` met `{ data: { gegevens, copy,
     velden: window.OFFERTE_VELDEN } }`; melding "Bewaard" / "Bewaren mislukt".
   - **Nooit PUT'en zolang `serverKlaar` false is** — anders overschrijft de
     demo-inhoud het sjabloon.
   - Bij `SERVER` nooit iets bewaren.
5. Actie `herstellen` met `TEMPLATE_ID`: opnieuw ophalen van de server (stap 3)
   i.p.v. terug naar `OFFERTE_DATA`.
6. Controleer of `bewaarGegevens()` en `pasJsonToe()` ook `bewaar()` aanroepen;
   zo niet, toevoegen — anders gaan die wijzigingen nooit naar de server.
7. De render-functies zelf NIET aanraken.

Laatst-bewerkt wint bij twee mensen tegelijk; dat is aanvaardbaar, niet oplossen.

### 7.3 `public/offerte.html`

Een link "← Koppelingen" (`href="/forminator-v2"`) als eerste element in
`.ov-werkbalk`. Verdwijnt vanzelf bij afdrukken (hele werkbalk).

### 7.4 `public/offerte-data.js`

Ongewijzigd. Blijft de seed en de terugval.

---

## 8. Configuratie + verificatie

- `wrangler.jsonc`: `"browser": { "binding": "BROWSER" }` op topniveau, met een
  commentaarregel waarom. `nodejs_compat` staat al aan.
- `package.json`: `@cloudflare/puppeteer` in `dependencies`. **Meld aan Nico**
  dat `npm install` nodig is.
- Na elke fase draaien (moeten groen blijven):
  ```bash
  node src/modules/forminator-sync-v2/tests/forms-test.mjs
  node src/modules/forminator-sync-v2/tests/mail-step-test.mjs
  node src/modules/forminator-sync-v2/tests/step-fields-test.mjs
  node src/modules/forminator-sync-v2/tests/chain-source-parity-test.mjs
  node src/modules/forminator-sync-v2/tests/replay-status-parity-test.mjs
  node src/modules/forminator-sync-v2/tests/om-form-fields-test.mjs
  ```
  `step-fields-test` is de kanarie voor F7: faalt die na fase 2, dan staat de
  puppeteer-import niet dynamisch.
- `node --check` op elk aangeraakt `.js`-bestand.
- `claude.md`: een korte sectie "Koppelingen — pdf-stap (2026-09)" met de
  afspraken uit §2 (F2, F3, F5, F9) en de tabel "wat staat waar", in de stijl
  van de andere Koppelingen-secties.

Handmatige test (Nico):
1. Instellingen → PDF-ontwerpen: sjabloon openen, tekst wijzigen, pagina
   verversen → wijziging staat er nog, ook in een ander browserprofiel.
2. Stap "PDF genereren" na een lead-stap; velden mappen; contact vast →
   "Genereer testpdf" → juiste opmaak, waarden, naam/foto/e-mail.
3. Contact dynamisch op de Calendly-hostzoekstap → echte testboeking → pdf in
   de chatter van het record met de juiste host.
4. Mailstap erna met de pdf als bijlage → `mail.mail` in Odoo heeft de pdf.
5. Mailstap boven de pdf-stap schuiven → geblokkeerd. Pdf-stap boven zijn
   bovenliggende stap → geblokkeerd.
6. **Tijd meten** bij een echte formulierinzending (zie O1).
7. Een inzending forceren die op een latere stap faalt en laten retryen →
   er komt GEEN tweede pdf in Odoo (`pdf_reused` in het spoor).

---

## 9. Volgorde van uitvoeren

| Fase | Inhoud | Klaar als |
|---|---|---|
| 1 | Migraties (§3) + seed-script | SQL leest idempotent; seed-JSON gegenereerd, niet getypt |
| 2 | `pdf-step.js`, `validation.js`, routes voor targets + sjablonen + pdf-test, `wrangler.jsonc`, `package.json` | tests uit §8 groen, `node --check` ok |
| 3 | Aansluiting in `worker-handler.js` (§4.7) | tests groen; diff bevat alleen het nieuwe blok + import |
| 4 | Bijlagen (§5) | `mail-step-test` groen; R2-tak byte-gelijk op de splitsing na |
| 5 | Editor: `offerte-render.js`, `offerte.html`, settings-sectie | `node --check`; handmatige test 1 mogelijk |
| 6 | Staptype in de UI (§6) | handmatige tests 2-5 mogelijk |
| 7 | `claude.md`-sectie | — |

Na elke fase: kort melden wat af is en wat Nico moet doen (migratie draaien,
`npm install`, deployen). Zelf niets deployen.

---

## 10. Open punten voor Nico (niet zelf beslissen)

- **O1 — Wachttijd van de bezoeker.** De pipeline draait synchroon en de plugin
  wacht max. 15 s. Een browser opstarten + renderen kost naar schatting 3-8 s
  bovenop de Odoo-stappen. Het tijdsbudget (9 s) voorkomt dat de bezoeker
  vastloopt, maar dan is de pdf mislukt. Is dat aanvaardbaar voor de eerste
  versie, of moet de pdf (+ mail) later asynchroon (Queue/Workflow)? Voorstel:
  eerst meten (test 6).
- **O2 — Replay.** Een `pdf_failed`/`mail_failed` laat de indiening op
  `success` staan, dus geen replay-knop. Zo werkt `mail_failed` vandaag al.
  Wil je dat wél replaybaar, dan is dat een aparte wijziging aan
  `classifyFinalSubmissionStatus` die alle koppelingen raakt.
- **O3 — Browser Rendering op het account.** Controleren in het
  Cloudflare-dashboard of het beschikbaar is en welke limieten gelden
  (gelijktijdige browsers, minuten per dag) vóór de eerste deploy.
