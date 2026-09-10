# ONTWERP — Formulieren in de OM (Forminator uitfaseren)

Status: **ontwerp + grondwerk, nog niets gebouwd.** Geen enkele bestaande route,
tabel of Forminator-koppeling wordt door dit ontwerp geraakt.
Datum: 2026-09-10.

---

## 1. Wat er vandaag staat (geverifieerd in de code, niet aangenomen)

### De weg die een Forminator-inzending nu aflegt

```
WordPress (Forminator webhook)
  → POST /forminator-v2/api/webhook?token=FORMINATOR_WEBHOOK_SECRET
      src/router/public-routes.js  → validateWebhookToken() → dispatchV2Webhook()
  → handleForminatorV2Webhook()    src/modules/forminator-sync-v2/worker-handler.js:1581
      normalizeFormValues(payload) → platte { veldnaam: "waarde" }
      resolveFormId(payload)       → "14547"
      getActiveIntegrationByFormId(env, formId)
      idempotentiesleutel = integratie + form_id + hash(payload)
      createSubmission(status: 'running')
  → runSubmissionAttempt()
      resolvers → context (bv. partner_id opzoeken/aanmaken)
      per stap (fs_v2_targets, op execution_order):
        conditie? → mappings → veldtransformaties → Odoo create/write
        of: chatter_message | create_activity | mailing_list | send_mail
      → fs_v2_submission_targets per stap, retry/replay bij fout
```

De tweede, jongere ingang staat er al en is voor dit project belangrijker dan
de eerste:

```
POST /forminator-v2/api/integrations/{id}/webhook?token={webhook_token}
  routes.js:1662 — timing-safe tokencontrole per koppeling
  → handleGenericWebhook()   worker-handler.js:1748
      identiek pad, maar: form_id is een synthetische id op de koppeling zelf,
      en bij een INACTIEVE koppeling wordt de payload wél bewaard en de
      Odoo-pipeline overgeslagen (skipPipeline) — precies wat je nodig hebt om
      velden te ontdekken vóór je iets koppelt.
```

**Dit is de deur.** Een OM-formulier is voor de pipeline niets anders dan een
derde bron naast `forminator` en `generic_webhook`. Er komt géén tweede
uitvoeringspad bij — dezelfde fout die de Sales Insight Explorer eerder maakte
met twee motoren naast elkaar.

### Wat de pipeline van een payload verwacht

`normalizeFormValues()` (worker-handler.js:110) neemt het eerste dat bestaat van
`form_fields`, `form_data`, `data`, `submission`, anders de hele body, en plat
het af tot `{ sleutel: "string" }`:

- arrays → samengevoegd met `", "` (dus een meerkeuze-checkbox komt aan als
  komma-string, niet als array);
- objecten met `value` → die waarde;
- samengestelde objecten → alle deelwaarden aan elkaar geplakt, **plus** elk
  deelveld apart als `sleutel.subsleutel`;
- JSON-strings worden eerst geparsed (een Forminator-eigenaardigheid).

`resolveFormId()` (worker-handler.js:158) zoekt op `form_id`, `formId`,
`forminator_form_id`, `ovme_forminator_id`, of het cijferstaartje van `form_uid`.

Alles is **string in, string uit**. De typering gebeurt daarna in
`fs_v2_field_transforms` (`text|boolean|integer|float|selection|many2one`,
met een `value_map` voor selectiewaarden).

### Waarom dit vandaag pijn doet

1. **Veldsleutels zijn onleesbaar.** Forminator stuurt `text-1`, `name-1`,
   `select-3`. Het mapping-scherm bevat daarom `lookupFormValue()` met een
   subsequence-matcher die probeert te raden welke sleutel je bedoelde. Die
   heuristiek bestaat alleen omdat de bron de namen niet kent.
2. **Het schema is een momentopname.** `wp_form_schemas` haalt via
   `/wp-json/openvme/v1/forminator/forms` een kopie op van elk formulier en
   bewaart die (`raw_schema` + `flattened_schema`). Twee waarheden: verandert
   iemand het formulier in WordPress, dan staat de OM stil verouderd tot
   iemand op "sync" duwt.
3. **Vormgeving zit vast aan Forminator.** Elke afwijking is een gevecht met
   hun CSS.
4. **De typering is achteraf giswerk.** `fs_v2_field_transforms` bestaat omdat
   we bij binnenkomst niet weten dat "ja" een boolean moest zijn.

Alle vier verdwijnen zodra de OM het formulier zélf definieert.

---

## 2. Het ontwerp in één zin

> Een koppeling krijgt een tabblad **Formulier**. Daar bouw je de velden. De
> WordPress-plugin `mymmo-forms` haalt dat schema op en rendert het server-side
> via een shortcode; een inzending gaat via PHP terug naar dezelfde pipeline die
> Forminator vandaag voedt.

De OM is de enige bron van het formulier — precies het uitgangspunt van
`mymmo-events` ("er wordt in WordPress NIETS bewaard"), met dezelfde
cache-in-twee-lagen als vangnet.

---

## 3. Beslissingen en hun reden

### 3.1 Het formulier hangt aan de koppeling, niet ernaast

`fs_v2_forms.integration_id` is **uniek**: één koppeling, hoogstens één
formulier. Je maakt eerst een koppeling (dat is al de bestaande flow), en het
tabblad Formulier verschijnt zodra `source_type = 'om_form'`.

*Waarom niet een aparte module "Formulieren"?* Omdat het formulier en wat er met
een inzending gebeurt in de praktijk één ding zijn. Een los beheerscherm zou
dezelfde fout maken als de vervallen "mini-app-query": twee objecten waar er één
bedoeld is, met een deelscherm ertussen.

*Gevolg dat bewust zo is:* wil je hetzelfde formulier op twee plekken met een
andere afhandeling, dan maak je twee koppelingen. Dat is zeldzaam, en de
alternatieve constructie (één formulier → n koppelingen) maakt de vraag
"wat gebeurt er met deze inzending?" onbeantwoordbaar vanuit het formulier.

### 3.2 De veldsleutel is de payloadsleutel — en ligt vast na de eerste inzending

Je typt zelf `email`, `voornaam`, `gebouw_type`. Dát komt in de payload, dát zie
je in het mapping-scherm.

**Regel: `field_key` is onveranderlijk zodra het formulier één inzending heeft.**
Het label mag altijd wijzigen. De sleutel niet, want die staat in
`fs_v2_mappings.source_value` van elke stap en in elke bewaarde
`source_payload`; hem stil hernoemen betekent dat een koppeling zonder
foutmelding een leeg veld naar Odoo schrijft. De UI zet het veld op slot en zegt
waarom.

Hiermee mag `lookupFormValue()`'s subsequence-heuristiek voor `om_form`-bronnen
overgeslagen worden: een exacte treffer of niets. Die heuristiek blijft staan
voor Forminator, want daar is ze nog nodig.

### 3.3 Type bij de bron, niet achteraf raden

Elk veld heeft naast zijn HTML-type een **`odoo_field_type`** (`text`,
`boolean`, `integer`, `float`, `selection`, `many2one`). Bij het opslaan van het
formulier schrijft de OM die als `fs_v2_field_transforms`-rij voor deze
koppeling — dezelfde tabel die vandaag met de hand gevuld wordt. Bestaande
transforms worden **niet overschreven** (iemand kan er bewust iets anders van
gemaakt hebben); alleen ontbrekende rijen worden aangevuld.

Bij een `select`/`radio` met vaste opties krijg je de `value_map` er gratis bij:
de optiewaarden staan al in de formulierdefinitie.

### 3.4 Server-side renderen, en verzenden via WordPress

De shortcode `[mymmo_form slug="offerte-technisch-beheer"]` rendert echte HTML in
PHP. Geen JS nodig om het formulier te zien, correcte HTML voor zoekmachines,
en alle vormgeving in de plugin-CSS in plaats van in Forminator.

De browser post naar `admin-post.php`; PHP praat server-naar-server met de
Worker. Dat is exact wat `class-registration.php` van `mymmo-events` al doet, om
één reden: **de sitesleutel blijft serverside en komt nooit in de HTML.** Het
levert er meteen een WordPress-nonce, een honeypot en het echte IP-adres bij.

*Gevolg:* het formulier werkt alleen op een WordPress-site met de plugin. Een
JS-embed voor niet-WP-plekken is later een aparte, kleine toevoeging op hetzelfde
publieke endpoint — geen tweede motor, alleen een tweede renderer.

### 3.5 Publicatie is een versienummer, geen timestamp

`fs_v2_forms.version` gaat met 1 omhoog bij elke bewaarde wijziging. De publieke
schema-respons draagt die versie, en de **ETag wordt uit de versie berekend, niet
uit een gegenereerd-op-tijdstip**. Dat is letterlijk de les uit
`meta.generated_at` bij de events-API: een timestamp in de ETag betekent dat
`If-None-Match` nooit matcht en elke verversing de hele molen laat draaien.

Een formulier heeft `status`: `draft` of `published`. Een concept is via de
publieke API onvindbaar (404, niet 403 — bestaan is zelf informatie), zodat een
half afgewerkt formulier nooit per ongeluk op een pagina staat. Voorbekijken doe
je in de OM zelf.

### 3.6 Geen tweede bevestigingsmail

De koppeling kán al mailen: de `send_mail`-stap met de gedeelde bewerklaag
(`public/mail-token-editor.js`) bestaat sinds 2026-09-08 en heeft Postmark-
opvolging (afgeleverd/geopend/geklikt) er al aan hangen. De plugin stuurt dus
**geen enkele mail**. Wie een bevestiging wil, zet een `send_mail`-stap in de
koppeling — daar staat de editor, daar staan de statistieken.

### 3.7 Antispam zonder captcha, in v1

Vier lagen, in deze volgorde, en geen captcha:

1. honeypot-veld (altijd gerenderd, nooit zichtbaar) — vangt het meeste;
2. minimale invultijd: een verborgen, ondertekend tijdstempel; sneller dan
   ~3 seconden ingevuld is een bot;
3. WordPress-nonce (vangt cross-site posts);
4. rate limit in de Worker per sitesleutel en per IP-hash, met hetzelfde
   patroon als `REGISTER_RATE_LIMIT` in de events-API.

Cloudflare Turnstile is de uitbreiding als dit niet volstaat — bewust niet in
v1, want elke captcha kost inzendingen.

### 3.8 Wat v1 NIET doet

Bestandsupload, betalingen, meerstaps-formulieren, berekeningen en
voorwaardelijke velden. Niet omdat het niet kan, maar omdat elk van die vier een
eigen vraagstuk meebrengt (opslag en bewaartermijn, PCI, sessiestatus,
uitdrukkingstaal) en geen van vier vandaag nodig is om een bestaand
Forminator-formulier te vervangen. Voorwaardelijke velden zijn de meest
waarschijnlijke eerste uitbreiding; het schema hieronder laat er ruimte voor
zonder ze nu te bouwen.

---

## 4. Het datamodel

Twee nieuwe tabellen. Namen met `fs_v2_`-prefix omdat ze in dezelfde module
leven en aan `fs_v2_integrations` hangen — historisch dezelfde reden als
waarom de repo nog `forminator-odoo-sync` heet.

```
fs_v2_forms
  id, integration_id (UNIEK, FK → fs_v2_integrations ON DELETE CASCADE)
  slug (uniek)          — wat in de shortcode staat
  name, description
  status                — draft | published
  version               — +1 bij elke save; voedt de ETag
  submit_label
  success_mode          — message | redirect
  success_message, redirect_url
  theme        jsonb    — CSS-variabelen (kleur, afronding, spatiëring)
  allowed_sites jsonb   — [] = elke geconfigureerde site
  published_at, created_at, updated_at

fs_v2_form_fields
  id, form_id (FK ON DELETE CASCADE)
  order_index
  field_key             — payloadsleutel; UNIEK per formulier; vast na 1e inzending
  field_type            — text|email|tel|number|date|textarea|select|radio
                          |checkbox|checkbox_group|hidden|heading|paragraph
  label, help_text, placeholder
  is_required, default_value
  options      jsonb    — [{value,label}]
  width                 — full | half
  validation   jsonb    — {minlength,maxlength,min,max,pattern}
  odoo_field_type       — seed voor fs_v2_field_transforms
```

`heading` en `paragraph` zijn geen invoervelden maar opmaak in het formulier;
ze leveren niets aan de payload. Ze zitten in dezelfde tabel omdat ze in
dezelfde volgorde staan — een aparte tabel zou de sortering over twee plekken
verdelen.

RLS: aan, met een deny-all policy voor `public`, exact het patroon van
`20260821120000_fix_rls_disabled_in_public.sql`. Alle toegang loopt via
`getSupabaseClient(env)` met de service_role-sleutel; die bypasst RLS.

Aan `fs_v2_integrations` verandert **niets**. `source_type` krijgt er in de
praktijk één waarde bij (`om_form`) en `forminator_form_id` wordt gevuld met een
synthetische id (`omform-…`), net zoals `generic_webhook` dat al doet met
`generic-…`. Dus geen migratie op die tabel, geen risico voor bestaande rijen.

---

## 5. Het contract tussen plugin en Worker

### 5.1 Schema ophalen

```
GET  {OM}/forminator-v2/public/v1/forms/{slug}
     Header: X-Mymmo-Site-Key: <sleutel uit FORMS_PUBLIC_SITE_KEYS>
     Header: If-None-Match: "<vorige etag>"
  → 200 { form: {...}, fields: [...], version: 7 }   ETag: "7-<hash>"
  → 304 (leeg)                                       ← de normale respons
  → 404 bij onbekende slug of status=draft
```

### 5.2 Inzending

```
POST {OM}/forminator-v2/public/v1/forms/{slug}/submit
     Header: X-Mymmo-Site-Key: <sleutel>
     Body:
{
  "form_id":   "3f1c…",            ← uuid van fs_v2_forms
  "form_slug": "offerte-technisch-beheer",
  "form_data": {
    "email":       "nico@mymmo.com",
    "voornaam":    "Nico",
    "gebouw_type": "appartementsgebouw",
    "consent":     "ja"
  },
  "meta": {
    "site":         "openvme.be",
    "page_url":     "https://openvme.be/offerte/",
    "submitted_at": "2026-09-10T12:00:00Z",
    "utm_source":   "google",
    "ip_hash":      "…"
  }
}
```

**Geverifieerd tegen de bestaande code:** `normalizeFormValues()` neemt
`form_data` (tweede kandidaat in de lijst) en `resolveFormId()` neemt
`payload.form_id` (eerste kandidaat). Er hoeft dus **niets** aan
`worker-handler.js` te veranderen om deze payload te verwerken.

Eén detail dat wél aandacht vraagt: `normalizeFormValues()` kijkt alleen naar
`form_data`, dus alles onder `meta` zou onbereikbaar zijn voor het
mapping-scherm. De submit-handler voegt daarom vóór de pipeline elke meta-waarde
als `meta_<naam>` toe aan `form_data` (`meta_page_url`, `meta_utm_source`, …).
Punten in de sleutel worden vermeden omdat `normalizeFormValues()` die vorm al
gebruikt voor samengestelde velden. De onbewerkte body blijft integraal in
`source_payload` staan.

Antwoord: `{ success: true, data: { submission_id, status } }` — dezelfde vorm
als de generieke webhook, dus het Indieningen-tabblad, replay en de retries
werken ongewijzigd.

### 5.3 Wat de plugin met het antwoord doet

Zoals `class-registration.php`: resultaat in een transient met een token in de
URL, `wp_safe_redirect` terug naar de pagina, melding tonen, transient weg.
Geen gegevens in de querystring.

---

## 6. Bestanden

Nieuw, niets vervangen:

```
supabase/migrations/
  20260910120000_fsv2_om_forms.sql          ← bijgeleverd, nog niet toegepast

src/modules/forminator-sync-v2/
  forms/schema.js        veldtypes + validatie van een formulierdefinitie (puur,
                         testbaar zonder netwerk of database)
  forms/database.js      CRUD op fs_v2_forms(_fields), via getSupabaseClient
  forms/public-api.js    GET schema + POST submit: sitesleutel, rate limit, ETag
  forms/submit.js        body → pipeline-payload → handleGenericWebhook
  tests/forms-test.mjs   schemavalidatie, meta-afvlakking, ETag-stabiliteit

src/router/public-routes.js   ← één blok erbij voor /forminator-v2/public/v1/forms/*
                                (naast het bestaande events-blok)

public/
  forminator-sync-v2-detail-form-builder.js   het tabblad Formulier
  forminator-sync-v2.html                     ← één <button role="tab"
                                                data-detail-tab="form"> erbij

wp-plugin/mymmo-forms/          nieuwe, aparte plugin (niet in mymmo-events)
  mymmo-forms.php
  includes/class-api-client.php   3s timeout, last-known-good, ETag
  includes/class-cache.php        transient + option-vangnet
  includes/class-shortcodes.php   [mymmo_form slug="…"]
  includes/class-submit.php       admin-post → Worker
  includes/class-settings.php     basis-URL + sitesleutel
  templates/form.php, templates/partials/field-*.php
  assets/css/mymmo-forms.css      CSS-variabelen, per site overschrijfbaar
  assets/js/mymmo-forms.js        alleen progressive enhancement
```

De nieuwe JS-bestanden blijven onder de 150-regelgrens waar het kan; het
tabblad-bestand volgt het bestaande `detail-*`-patroon met export via
`Object.assign(window.FSV2, { … })` en aanroepen als `window.FSV2.naam()`.
Tabs blijven `tabs-boxed`. Voor de plugin geldt de volledige procedure uit
CLAUDE.md (Python-script per bestand, byte-niveau controle, versienummer op
twee plekken, changelog met "waarom", schone zip-kopie).

---

## 7. Volgorde, met dubbeldraaien als uitgangspunt

Niets aan Forminator wordt aangeraakt. De twee systemen draaien naast elkaar tot
jij per formulier beslist om te wisselen.

**Fase 1 — schema en bouwer (OM alleen).** Migratie, `forms/schema.js`,
`forms/database.js`, het tabblad. Je kan formulieren definiëren en bekijken;
er staat nog niets op een website. Nul risico.

**Fase 2 — publieke API.** `GET schema` + `POST submit`, sitesleutel, rate
limit, ETag. Te testen met `curl` zonder dat er een plugin bestaat: een submit
op een inactieve koppeling bewaart de payload en slaat Odoo over
(`skipPipeline`) — precies de bestaande veiligheidsklep.

**Fase 3 — WP-plugin, één testpagina.** Shortcode op een niet-gelinkte pagina.
Inzending komt binnen in het Indieningen-tabblad, koppeling nog inactief. Hier
controleer je vormgeving op een echt mobiel toestel.

**Fase 4 — eerste echte formulier, parallel.** Kies een formulier met laag
volume. Bouw het na in de OM, zet een nieuwe koppeling op met dezelfde stappen
als de Forminator-koppeling, activeer, en zet de OM-shortcode op de pagina —
het Forminator-formulier blijft bestaan en actief, alleen niet meer zichtbaar.
Bij twijfel is terugzetten één wijziging aan één pagina.

**Fase 5 — uitrollen per formulier**, met minstens twee weken tussen "shortcode
gewisseld" en "Forminator-formulier gedeactiveerd".

**Fase 6 — opruimen, pas als alles over is.** `wp_form_schemas`/`wp_sites`, de
`openvme/v1`-endpoint op de sites, `FORMINATOR_WEBHOOK_SECRET`, en de
subsequence-heuristiek in `lookupFormValue()`. Niet eerder: zolang één
Forminator-koppeling leeft, is dat allemaal in gebruik.

---

## 8. Wat hierna beslist moet worden

- **Sitesleutel:** een nieuwe `FORMS_PUBLIC_SITE_KEYS` (los van
  `EVENTS_PUBLIC_SITE_KEYS`), of één gedeelde sleutelset voor alle publieke
  OM-endpoints? Los is netter per module, gedeeld scheelt beheer.
- **Bewaartermijn van inzendingen.** `fs_v2_submissions.source_payload` bevat
  persoonsgegevens en groeit onbeperkt. Er is vandaag geen opruimbeleid; met
  eigen formulieren wordt dat sneller relevant.
- **Slugs bij hernoemen.** Verandert een slug, dan breekt de shortcode op de
  pagina. Voorstel: oude slugs bijhouden als alias in plaats van hard breken.
- **Meerdere merken.** `allowed_sites` staat in het schema maar wordt in v1
  niet afgedwongen. Zodra hetzelfde formulier op openvme.be én syndicoach.be
  staat, moet duidelijk zijn of dat één koppeling met een `meta_site`-mapping is
  of twee koppelingen.
