# Addendum E — HTML Form Recap & Chatter Integration

> Datum: 2026-03-04  
> Status: Analyse / ontwerp — nog niet geïmplementeerd  
> Scope: Twee nieuwe features die formulierdata als HTML visualiseren in Odoo

---

## Probleemstelling

Na het aanmaken of bijwerken van een Odoo-record via een webhook wil je:

1. **Feature A** — Een geformatteerde HTML-samenvatting van (een selectie van) formuliervelden opslaan in een HTML-veld op het record (bijv. `description`, `x_studio_aanvraag_html`).
2. **Feature B** — Een gestyld chatbericht posten in de chatter van het gecreëerde/bijgewerkte record, zichtbaar voor de medewerkers die het record opvolgen.

Beide features hergebruiken de bestaande pipeline-infrastructuur (resolvers → targets → mappings) en de `lookupFormValue` 4-stap-lookup.

---

## Odoo API: juiste aanroep voor chatter-berichten

Op basis van bestaande serveractie-implementatie zijn er **twee equivalente methoden** via JSON-RPC:

### Methode 1 — `mail.message.create` (direct, zoals serveractie)

```javascript
executeKw(env, {
  model: 'mail.message',
  method: 'create',
  args: [{
    model:        'project.project',   // doelmodel
    res_id:       42,                  // record-ID
    body:         '<div>...html...</div>',
    message_type: 'comment',
    subtype_id:   2,                   // mt_note — integer ID opzoeken via ir.model.data
    author_id:    env.UID              // partner_id van de Odoo-gebruiker
  }]
})
```

Nadeel: `subtype_id` is een integer die kan variëren per Odoo-instantie. Vereist een voorafgaande lookup:

```javascript
executeKw(env, {
  model: 'ir.model.data',
  method: 'search_read',
  args: [[['module','=','mail'],['name','=','mt_note']]],
  kwargs: { fields: ['res_id'], limit: 1 }
})
// → res_id is de subtype_id integer
```

### Methode 2 — `message_post` op het doelmodel (aanbevolen voor JSON-RPC)

```javascript
executeKw(env, {
  model:  'project.project',
  method: 'message_post',
  args:   [[42]],        // array met één record-ID
  kwargs: {
    body:           '<div>...html...</div>',
    message_type:   'comment',
    subtype_xmlid:  'mail.mt_note'    // Odoo lost intern de ID op
  }
})
```

Voordeel: `subtype_xmlid` als string — Odoo resolvet intern het juiste `subtype_id`. Geen voorafgaande lookup nodig.  
`message_post` is beschikbaar op elk model dat `mail.thread` erft (alle standaard Odoo-modellen: `project.project`, `crm.lead`, `res.partner`, …).

> **Keuze voor implementatie: Methode 2** (`message_post` + `subtype_xmlid`). Minder calls, robuuster over instanties heen.

### `message_type` opties

| Waarde | Gedrag |
|---|---|
| `'comment'` | Zichtbaar in chatter. Notificaties naar volgers (afhankelijk van subtype). |
| `'email'`   | Gelogd als uitgaande e-mail. |

### `subtype_xmlid` opties (meest gebruikte)

| Xmlid | Betekenis | Notificaties |
|---|---|---|
| `'mail.mt_note'`    | Interne notitie | Nee (tenzij handmatig geabonneerd) |
| `'mail.mt_comment'` | Publieke discussie | Ja, naar volgers |

---

## Feature A — `html_form_summary` als nieuw `source_type`

### Werking

Een mapping met `source_type: 'html_form_summary'` genereert een HTML-tabel als veldwaarde voor een Odoo HTML-veld. Het is de server-side tegenhanger van een handgeschreven template, maar gestructureerd.

```
mapping:
  odoo_field:   "description"
  source_type:  "html_form_summary"
  source_value: '["name-1","email-1","phone-1"]'   ← JSON-array; leeg of "*" = alles
```

### Gegenereerde HTML (voorbeeld)

```html
<table style="border-collapse:collapse;width:100%;font-size:14px;">
  <tbody>
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="font-weight:600;padding:6px 12px;width:38%;color:#374151;">Naam</td>
      <td style="padding:6px 12px;color:#111827;">Nico Plinke</td>
    </tr>
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="font-weight:600;padding:6px 12px;color:#374151;">E-mail</td>
      <td style="padding:6px 12px;color:#111827;">nico@example.com</td>
    </tr>
    <tr>
      <td style="font-weight:600;padding:6px 12px;color:#374151;">Telefoon</td>
      <td style="padding:6px 12px;color:#111827;">+32 499 000 000</td>
    </tr>
  </tbody>
</table>
```

Inline CSS — compatibel met Odoo chatter én veldweergave.

### Veldlabels

Server-side beschikbaar: prettified field-id (`email-1` → `Email`, `first-name` → `First Name`). Geen extra API-call nodig.  
Optioneel: labels meegeven in `source_value` als object-array: `[{"id":"email-1","label":"E-mailadres"}]`.

### Benodigde wijzigingen

| Bestand | Wijziging |
|---|---|
| `src/modules/forminator-sync-v2/worker-handler.js` | Functie `buildHtmlFormSummary(fieldIds, normalizedForm)`. Nieuwe `case 'html_form_summary'` in `resolveMappingValue()`. |
| `src/modules/forminator-sync-v2/validation.js` | `'html_form_summary'` toevoegen aan `source_types` in `getMvpConstants()`. |
| `public/forminator-sync-v2-mapping-table.js` | UI: bij keuze `html_form_summary` een multi-select tonen voor veldkeuze. `source_value` opslaan als `JSON.stringify([id1, id2, ...])`. |

**Geen DB-schema-wijziging.** `source_value` is al `TEXT` en kan een JSON-array bevatten.

---

## Feature B — `chatter_message` als nieuw `operation_type`

### Concept

Een target met `operation_type: 'chatter_message'` post een chatbericht op een record dat door een eerder target in de pipeline werd aangemaakt of bijgewerkt. De koppeling loopt via `previous_step_output`.

### Configuratie

```
Target (order 1):
  operation_type: "upsert"
  odoo_model:     "project.project"
  label:          "project"
  → output: contextObject["step.1.record_id"] = 42

Target (order 2):
  operation_type:   "chatter_message"
  odoo_model:       "project.project"
  chatter_template: "<div style='...'>Aanvraag ingediend door ..."
  chatter_message_type: "comment"
  chatter_subtype_xmlid: "mail.mt_note"
  
  Mapping (identifier):
    source_type:  "previous_step_output"
    source_value: "step.1.record_id"
    is_identifier: true
    odoo_field:   "id"           ← conventioneel; wordt gebruikt als recordId
```

### Gegenereerd HTML-chatbericht (voorbeeld — geïnspireerd op serveractie-stijl)

```html
<div style="display:flex;align-items:flex-start;
    background-color:#e8f0fe;border:1px solid #c3dafe;
    border-radius:6px;padding:12px 16px;gap:10px;max-width:640px;">
  <span style="font-size:24px;line-height:1;margin-right:6px;">📋</span>
  <div style="line-height:1.5;font-size:14px;">
    <div style="font-size:15px;font-weight:600;color:#1a237e;margin-bottom:8px;">
      Formulier ontvangen
    </div>
    <table style="border-collapse:collapse;width:100%;">
      <tr>
        <td style="font-weight:600;padding:3px 10px 3px 0;color:#374151;width:38%;">Naam</td>
        <td style="color:#111827;">Nico Plinke</td>
      </tr>
      <tr>
        <td style="font-weight:600;padding:3px 10px 3px 0;color:#374151;">E-mail</td>
        <td style="color:#111827;">nico@example.com</td>
      </tr>
    </table>
  </div>
</div>
```

### Execution flow in `runSubmissionAttempt`

```
1. Target order 1 (upsert): record aanmaken → recordId = 42
   registerTargetOutput → contextObject["step.1.record_id"] = 42

2. Target order 2 (chatter_message):
   a. Lees is_identifier-mapping → recordId = resolveContextValue("step.1.record_id") = 42
   b. Valideer: parsePositiveInteger(recordId) → 42 ✓
   c. Render body:
      - Als chatter_template ingesteld: placeholder-substitutie via lookupFormValue
        "{name-1}" → "Nico Plinke" (4-stap-lookup)
      - Als chatter_template leeg: genereer tabel via buildHtmlFormSummary("*", normalizedForm)
   d. executeKw → project.project.message_post([42], body=..., subtype_xmlid=...)
   e. return { action: 'created', recordId: message_id }
```

### Placeholder-substitutie in `chatter_template`

Zelfde mechanisme als `source_type: 'template'` in mappings — hergebruikt `lookupFormValue`:

```javascript
const body = (target.chatter_template || '').replace(/\{([^}]+)\}/g, (_, key) =>
  lookupFormValue(normalizedForm, key)
);
```

Dus `{name-1.fname}` → `'Nico'` (via subsequentie-match stap 4).

### Benodigde DB-migratie

```sql
ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS chatter_template       TEXT,
  ADD COLUMN IF NOT EXISTS chatter_message_type   TEXT DEFAULT 'comment',
  ADD COLUMN IF NOT EXISTS chatter_subtype_xmlid  TEXT DEFAULT 'mail.mt_note';
```

Migratie-bestand: `supabase/migrations/YYYYMMDDHHMMSS_fsv2_add_chatter_message_target.sql`

### Benodigde code-wijzigingen

| Bestand | Wijziging |
|---|---|
| `src/modules/forminator-sync-v2/odoo-client.js` | Nieuwe export `postChatterMessage(env, { model, recordId, body, messageType, subtypeXmlid })` — wrapper om `executeKw` met `method: 'message_post'`. |
| `src/modules/forminator-sync-v2/worker-handler.js` | Nieuwe branch `if (opType === 'chatter_message')` in target-loop van `runSubmissionAttempt`. Functie `buildChatterBody(target, normalizedForm)`. |
| `src/modules/forminator-sync-v2/validation.js` | `'chatter_message'` toevoegen aan `operation_types` in `getMvpConstants()`. |
| `public/forminator-sync-v2-detail.js` | Bij `operation_type === 'chatter_message'`: toon HTML-textarea voor `chatter_template` + selects voor `message_type`/`subtype_xmlid`. Geen reguliere mapping-tabel. |
| `public/forminator-sync-v2-wizard.js` | Optioneel: chatter-target toevoegbaar als extra stap na een upsert-target. |

---

## Gecombineerde use case: Project aanmaken + chatter

### Pipeline-configuratie

```
Integratie: "Projectaanvraag"

Resolver:
  type: partner_by_email
  input:  email-1
  output: context.partner_id

Target 1 (order 1, upsert, label "project"):
  odoo_model:       project.project
  identifier_type:  mapped_fields
  Mappings:
    name                 ← template "Aanvraag {name-1}"
    partner_id           ← context.partner_id (identifier + update)
    description          ← html_form_summary ["name-1","email-1","phone-1"]
    x_studio_bron        ← static "website-formulier"

Target 2 (order 2, chatter_message):
  odoo_model:           project.project
  chatter_template:     |
    <div style="display:flex;...">
      <span>📋</span>
      <div>
        <b>Nieuwe projectaanvraag</b><br>
        Naam: {name-1}<br>
        E-mail: {email-1}<br>
        Telefoon: {phone-1}
      </div>
    </div>
  chatter_message_type:  comment
  chatter_subtype_xmlid: mail.mt_note
  Mapping (identifier):
    source_type:   previous_step_output
    source_value:  step.1.record_id
    is_identifier: true
    odoo_field:    id
```

---

## Open designvragen

| # | Vraag | Opties | Aanbeveling |
|---|---|---|---|
| 1 | Veldlabels in HTML-tabel | (a) Prettified field-id • (b) WP API-call voor labels | (a) — eenvoudig, geen extra call |
| 2 | Veldkeuze UI | (a) Multi-select checkboxes • (b) Comma-separated tekstveld | (a) — geconsisteerd met FieldPicker |
| 3 | `subtype_xmlid` configureerbaar? | Ja (select in UI) / Nee (hardcoded `mt_note`) | Ja — geeft flexibiliteit |
| 4 | `chatter_template` leeg → fallback? | (a) Lege body, target overgeslagen • (b) Auto-genereer tabel van alle velden | (b) — nuttiger standaardgedrag |
| 5 | Emoji/stijl in template | Vrij te configureren via textarea | — |

---

---

## UX-ontwerp — Integratie zonder cognitieve overload

> Dit deel behandelt *hoe* de twee nieuwe features in de bestaande interface passen — en welke herontwerp-beslissingen daarvoor nodig zijn. De interface is al complex; nieuwe features mogen die complexiteit niet vermenigvuldigen.

---

### UX-diagnose: waar de huidige interface wringt

Voordat je iets nieuws toevoegt, analyseren we wat de huidige interface zwaar maakt. Er zijn vier concrete bronnen van cognitieve overload:

**1. De MappingTable heeft te veel kolommen tegelijk zichtbaar**  
Een gebruiker ziet gelijktijdig: Odoo-veld, Bron, Waarde, een blauw `⇄`-badge, een geel `⋯`-badge, identifier-checkbox, bijwerken-checkbox, en soms een waarde-map sectie én inline subvelden. Voor een marketeer met weinig technische achtergrond zijn dat zeven tot tien beslismomenten per rij.

**2. De detail view heeft tabs die mentaal haaks op elkaar staan**  
"Veldkoppelingen" en "Formuliervelden" zijn cognitief hetzelfde scherm — je hebt de formuliervelden nodig *terwijl* je veldkoppelingen maakt. Ze staan nu in aparte tabs, wat constant switchen vereist.

**3. Targets zien er allemaal hetzelfde uit — ook al doen ze fundamenteel verschillende dingen**  
Een `upsert` target (datakoppeling) en — straks — een `chatter_message` target (communicatie) worden allebei als een blok met een tabel getoond. Maar een chatter-bericht heeft geen veldkoppelingen; het heeft een editor. Dezelfde shell vermindert de leesbaarheid.

**4. De wizard maakt één target en stopt — maar laat geen ruimte voor "en dan?"**  
De gebruiker verlaat de wizard en gaat naar een detail-view die zichtbaar complexer is. Er is geen zachte overgang. De wizard communiceert niet wat er nog nader ingesteld kan worden.

---

### Ontwerpprincipes voor deze uitbreiding

Drie principes sturen alle keuzes hieronder:

**Principe 1 — Intent-first, niet mechanic-first**  
De gebruiker denkt in termen van wat er moet gebeuren ("stuur een notitie naar de chatter"), niet in termen van `operation_type: chatter_message`. Elke UI-keuze formuleert de actie vanuit het doel.

**Principe 2 — Progressive disclosure op rijniveau**  
Elke configuratierij toont standaard alleen wat nodig is voor 90% van de gevallen. Geavanceerde opties (identifier, bijwerken-flag, value_map) zijn zichtbaar maar ingetrokken — uitklapbaar per rij, niet per tab.

**Principe 3 — Visuele identiteit per target-type**  
Elk target-type heeft een onderscheidend visueel frame. Een chatter-target ziet eruit als een berichteditor. Een upsert-target ziet eruit als een datakoppeling. De vorm communiceert de functie.

---

### Ontwerp: chatter-target als berichtcomposer

Een `chatter_message`-target in de detail-view krijgt een fundamenteel andere visual shell dan een datakoppeling-target:

```
┌─────────────────────────────────────────────────────────────────────┐
│  💬  Notitie in chatter                      project.project  [2]   │
│  ─────────────────────────────────────────────────────────────────  │
│  Stuur bericht naar het record uit:   [ Stap 1 — Project    ▼ ]    │
│                                                                      │
│  Berichtinhoud                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ <div style="...">                                            │   │
│  │   <b>Nieuwe aanvraag</b><br>                                 │   │
│  │   Naam: {name-1}<br>E-mail: {email-1}                       │   │
│  │ </div>                                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  [ + Veld invoegen ▾ ]   — opent FieldPicker, plaatst {field-id}   │
│                                                                      │
│  Voorvertoning  ───────────────────────────────────────────────     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Nieuwe aanvraag                                             │   │
│  │  Naam: {naam-1}   E-mail: {email-1}                         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Type notitie: ( •) Interne notitie  ( ) Publieke discussie        │
│                                                                      │
│                               [  Opslaan  ]                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Elementen die hier cruciaal zijn:**

- **Icoon 💬** — geeft onmiddellijk de identiteit van dit target-type.
- **"Stuur bericht naar het record uit: [Stap N ▾]"** — één dropdown, niet een mapping-rij met `source_type: previous_step_output`. De complexe binding naar het vorige target is verborgen in één begrijpelijk keuzemoment.
- **Textarea met monospace font** — HTML is vrij in te typen, maar de gebruiker hoeft het niet te kennen: de `+ Veld invoegen`-knop opent de bestaande FieldPicker en plaatst `{field-id}` op de cursorpositie.
- **Live voorvertoning** — rendert de template met placeholder-waarden vervangen door voorbeeldteksten (of de meest recente test-submission payload). Dit is een `<div>` die de textarea-inhoud via `innerHTML` toont. Geen extra API-call — puur client-side.
- **Type notitie** — twee radio-knoppen: "Interne notitie" (`subtype_xmlid: mail.mt_note`) en "Publieke discussie" (`mail.mt_comment`). Geen technische xmlid zichtbaar.

**Wat achter de schermen staat (niet zichtbaar voor de gebruiker):**
- De `is_identifier`-mapping naar het vorige target's `record_id` wordt automatisch aangemaakt bij keuze van de stap in de dropdown.
- `chatter_message_type: 'comment'` wordt altijd gebruikt (het is de enige juiste waarde voor `message_post` — het type-onderscheid zit in `subtype_xmlid`, niet in `message_type`).

---

### Ontwerp: html_form_summary als kaartblok in een datakoppeling-target

`html_form_summary` is geen losse configuratie — het is een **blok dat je aan een bestaand upsert-target toevoegt**. De gebruiker denkt: "Ik wil dat dit veld de samenvatting van het formulier bevat." Niet: "Ik wil een source_type van 'html_form_summary' instellen."

Implementatie in de MappingTable UI: een extra actieknop onderaan een target, naast de bestaande "+ Rij toevoegen":

```
┌──────────────────────────────────────────────────────────────────────┐
│  Veldkoppelingen — project.project                                   │
│  ┌────────────────┬──────────────────┬──────────────────────────┐    │
│  │ Odoo veld      │ Bron             │ Waarde                   │    │
│  ├────────────────┼──────────────────┼──────────────────────────┤    │
│  │ name           │ Formulierveld    │ name-1                   │    │
│  │ email          │ Formulierveld    │ email-1                  │    │
│  │ description    │ 📋 Samenvatting  │ naam, e-mail, telefoon   │    │
│  │                │                  │ [bewerken ✏]             │    │
│  └────────────────┴──────────────────┴──────────────────────────┘    │
│                                                                       │
│  [ + Veld toevoegen ]   [ 📋 Formuliersamenvatting toevoegen ]       │
└──────────────────────────────────────────────────────────────────────┘
```

Klik op **"📋 Formuliersamenvatting toevoegen"** opent een modaal:

```
┌──────────────────────────────────────────────────────────────────┐
│  Formuliersamenvatting                                     [✕]   │
│  ─────────────────────────────────────────────────────────────── │
│  Odoo-veld om de samenvatting in op te slaan:                    │
│  [ description           ▾ ]   ← Odoo veld-picker               │
│                                                                  │
│  Welke velden opnemen?                                           │
│  (•) Alle velden                                                 │
│  ( ) Geselecteerde velden:                                       │
│      ☑ Naam          ☑ E-mail         ☑ Telefoon               │
│      ☐ Geboortedatum ☑ Bericht        ☐ Hoe gevonden           │
│                                                                  │
│  Voorvertoning:                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Naam      │ Nico Plinke          │                       │   │
│  │ E-mail    │ nico@example.com     │                       │   │
│  │ Telefoon  │ +32 499 000 000      │                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│              [  Annuleren  ]   [  Toevoegen  ]                  │
└──────────────────────────────────────────────────────────────────┘
```

Resultaat: één mapping-rij toegevoegd met `source_type: 'html_form_summary'`, `source_value: '["name-1","email-1","phone-1"]'` en de gekozen Odoo-veldnaam. De rij toont een `📋 Samenvatting`-badge als brontype, met bewerkbaar potlood.

---

### Ontwerp: target-type kiezer bij nieuw target toevoegen

In de detail-view, wanneer de gebruiker een extra actie wil toevoegen, opent een picker — geen kale "Voeg target toe"-knop:

```
Wat wil je dat het formulier nog meer doet?

 ┌─────────────────────────────────────────────────────────────┐
 │  📝  Bijwerken of aanmaken        res.partner, project...   │  ← upsert
 │      Koppel formuliervelden aan een Odoo-record             │
 ├─────────────────────────────────────────────────────────────┤
 │  📋  Altijd nieuw aanmaken        activiteit, taak...       │  ← create
 │      Maak élke keer een nieuw record, geen zoekstap         │
 ├─────────────────────────────────────────────────────────────┤
 │  ✏️  Bijwerken als gevonden       websitebezoeker...        │  ← update_only
 │      Verrijk een bestaand record, sla over als niet gevonden│
 ├─────────────────────────────────────────────────────────────┤
 │  💬  Notitie in chatter           op elk record             │  ← chatter_message
 │      Plaats een HTML-bericht in de chatter van het record   │
 └─────────────────────────────────────────────────────────────┘
```

Na keuze verschijnt het juiste configuratiekader direct inline onder de bestaande targets — zonder paginaverversing. De technische `operation_type`-waarde is nergens zichtbaar.

---

### Herontwerp: de MappingTable — progressive disclosure per rij

Het grootste UX-probleem is de tabel. Huidige staat: alle kolommen permanent zichtbaar voor alle rijen. Voorgestelde staat: drie permanente kolommen + uitklapbare rij.

```
Standaardweergave (altijd):
┌──────────────────┬────────────────────┬─────────────────────┬────┐
│ Odoo veld        │ Bron               │ Waarde              │    │
├──────────────────┼────────────────────┼─────────────────────┼────┤
│ name  [verplicht]│ Formulierveld   ▾  │ name-1          ▾   │ ⋯  │ ← klik ⋯ = uitklap
│ email [verplicht]│ Formulierveld   ▾  │ email-1         ▾   │ ⋯  │
│ phone            │ Formulierveld   ▾  │ phone-1         ▾   │ ⋯  │
└──────────────────┴────────────────────┴─────────────────────┴────┘

Uitklapbare rij (klik ⋯ op rij "email"):
┌─────────────────────────────────────────────────────────────────┐
│  email [verplicht]  ─  Formulierveld  ─  email-1       [↑ sluiten] │
│  ─────────────────────────────────────────────────────────────── │
│  ☑ Markeer als identifier (zoeksleutel om record te vinden)     │
│  ☑ Bijwerken bij bestaand record                                │
│                                                                  │
│  Waarde-map per keuze:  (alleen relevant voor keuzevelden)      │
│  Geen keuzevelden — n.v.t.                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Effect:** Een marketeer die alleen formuliervelden aan Odoo-velden koppelt, ziet een overzichtelijke drie-koloms-tabel. Een gevorderde gebruiker klikt de `⋯`-knop per rij open en ziet de geavanceerde opties. Geen informatie verdwijnt — de tabel wordt dunner, niet smaller.

De bestaande MappingTable.render() hoeft structureel niet te wijzigen: de `⋯`-knop triggert een accordion per rij (`data-action="toggle-mapping-row-details"`), het uitklapblok bevat de bestaande identifier/update-checkboxen en de waarde-map sectie.

---

### Herontwerp: detail-view tabs — Formuliervelden als slide-in

Huidige structuur: drie tabs (Veldkoppelingen | Formuliervelden | Submissions).

**Probleem:** "Formuliervelden" is een *referentietool* die je tijdens het mappen wilt zien, niet een aparte taak. In de huidige structuur verplicht het een tabswitch die je mapping-context doorbreekt.

**Oplossing:** Verwijder de "Formuliervelden"-tab. Vervang door een **"Bekijk formuliervelden"**-knop in de MappingTable-header (naast de Odoo FieldPicker). Klikken opent een side drawer of small modal met de veldentabel — de tabel is al beschikbaar in `S().detailFormFields`.

```
Resulterende tab-structuur:

  [ Veldkoppelingen ]   [ Submissions ]

  → "Formuliervelden" is een uitklapbare referentie-drawer, geen tab
```

De `renderDetailFormFields()`-functie in `detail.js` blijft intact; ze wordt alleen niet meer als tab-content gerend maar als drawer-content bij een knopklik.

**Bijkomend voordeel:** De "Submissions"-tab is semantisch anders dan "Veldkoppelingen" (history vs. configuratie). Twee tabs in plaats van drie is cognitief lichter en communiceren duidelijker het verschil tussen "instellen" en "opvolgen".

---

### Wizard-uitbreiding: chatter als optionele stap 4

De wizard maakt nu altijd één target aan. Na de mapping (stap 3), voordat de gebruiker op "Aanmaken" klikt, verschijnt een optionele stap:

```
Stap 3 — (na veldkoppelingen invullen)

  ─────────────────────────────────────────────
  ✉  Wil je ook een notitie in de chatter plaatsen?

     Wanneer het formulier ingediend wordt, kan er automatisch een
     bericht in de Odoo-chatter verschijnen — handig voor opvolging.

     [  Sla over  ]   [  Ja, stel in  ]
  ─────────────────────────────────────────────
```

Kies "Ja, stel in" → inline mini-editor (dezelfde als in de detail-view, maar vereenvoudigd):

```
  Inhoud van de notitie:
  ┌──────────────────────────────────────────────────────────────┐
  │  Nieuw formulier ingediend door {name-1}                     │
  │  E-mail: {email-1}                                           │
  └──────────────────────────────────────────────────────────────┘
  [ + Veld invoegen ▾ ]

  Type: (•) Interne notitie  ( ) Publieke discussie

                    [  Sla over  ]   [  Aanmaken  ]
```

De wizard maakt dan bij submit twee targets aan: target 1 (upsert, order 1) + target 2 (chatter_message, order 2, automatisch gekoppeld aan target 1's output).

**Waarom dit de wizard niet complex maakt:**  
De stap is optioneel en verschijnt pas na de mapping. De gebruiker die gewoon een upsert wil, klikt "Sla over" — de flow is identiek aan vandaag. De stap is informatief geformuleerd ("handig voor opvolging"), niet technisch.

---

### Overzicht: welke UI-elementen veranderen, welke niet

| Element | Verandering | Impact |
|---|---|---|
| `MappingTable` — kolommen | `⋯` uitklarap per rij; advanced columns verborgen | Visueel lichter, bestaand gedrag intact |
| `renderDetailFormFields()` | Van tab naar side drawer | Tab-lijst inkorten van 3 naar 2 |
| `renderDetailMappings()` — target header | Target-type badge + keuzer voor nieuw target | Nieuwe targets zijn type-bewust |
| `chatter_message` target | Nieuwe visual shell (berichtcomposer, geen tabel) | Visueel onderscheidend van data-targets |
| `html_form_summary` | "📋 Formuliersamenvatting toevoegen"-knop in MappingTable | Geen nieuwe bron-kolom-optie zichtbaar by default |
| Wizard stap 3 | Optionele "chatter ook instellen?"-stap na mapping | Sla je over → gedrag identiek aan vandaag |
| Bestaande targets | Ongewijzigd — geen herconfiguratie nodig | Geen breaking change |

---

## Implementatievolgorde (voorgestelde sprints)

### Sprint 1 — UX-sanering (geen nieuwe features, enkel UI-verbetering)

Aanpak: reduceer zichtbare complexiteit *vóór* je nieuwe features toevoegt. Anders stapel je bovenop een al kraakvolle interface.

```
1. mapping-table.js: ⋯-knop per rij + accordion voor identifier/update/value_map
   → Advanced columns zichtbaar bij uitklap, niet meer permanent
2. detail.js: "Formuliervelden"-tab omzetten naar side drawer
   → renderDetailFormFields() output verplaatst naar een <dialog> of slide-in panel
   → Tab-navigatie: 3 tabs → 2 tabs (Veldkoppelingen | Submissions)
3. Deploy + smoke test alle bestaande integraties
```

**Geen functiewijziging** — puur presentatie. Na deze sprint is de UI lichter en klaar voor uitbreidingen.

---

### Sprint 2 — Feature A: html_form_summary

```
4. worker-handler.js: buildHtmlFormSummary(fieldIds, normalizedForm)
   + case 'html_form_summary' in resolveMappingValue()
5. validation.js: 'html_form_summary' toevoegen aan source_types
6. mapping-table.js: "📋 Formuliersamenvatting toevoegen" knop
   + modaal met veld-multi-select + live tabel-voorvertoning
   + rij-badge '📋 Samenvatting' voor html_form_summary rijen
7. Deploy + end-to-end test (formulier → Odoo HTML-veld → zichtbaar in record)
```

---

### Sprint 3 — Feature B: chatter_message + wizard-uitbreiding

```
8. DB-migratie: ALTER TABLE fs_v2_targets ADD COLUMN chatter_template TEXT,
                ADD COLUMN chatter_message_type TEXT DEFAULT 'comment',
                ADD COLUMN chatter_subtype_xmlid TEXT DEFAULT 'mail.mt_note'
9. npx supabase db push
10. odoo-client.js: postChatterMessage(env, { model, recordId, body, messageType, subtypeXmlid })
11. worker-handler.js: chatter_message branch in target-loop
    + buildChatterBody(target, normalizedForm)
12. validation.js: 'chatter_message' toevoegen aan operation_types
13. detail.js: target-type kiezer (4-optie picker bij "Actie toevoegen")
    + chatter_message visual shell (berichtcomposer UI)
    + "Stuur bericht naar het record uit: [Stap N ▾]" dropdown
    + live voorvertoning van template-rendering
    + "Type notitie" radio (intern / publiek)
14. wizard.js: optionele stap 4 "Notitie in chatter plaatsen?" na mapping-stap
15. Deploy + end-to-end test (formulier → Odoo chatter-bericht zichtbaar)
```
