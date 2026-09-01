# Ontwerpvoorstel — Sales Insight Explorer als één graph-driven querysysteem

Status: **goedgekeurd en uitgevoerd** — zie §11 voor wat er effectief gebouwd is en hoe het
geverifieerd is. De blijvende architectuurafspraken staan in `CLAUDE.md` ("Sales Insight
Explorer — één graaf, één cascade-motor").
Datum: 2026-08-03

> Let op bij het lezen van §3: de node-keys in de tabellen hieronder (`lead`,
> `partner_building`, ...) waren voorstelnamen. In de implementatie is de node-key gelijk aan de
> Odoo-modelnaam, behalve bij een rol-splitsing: `crm.lead`, `res.partner` (gebouwen),
> `res.partner:contact` (contactpersonen), `x_web_visitor`, `x_ad_touchpoint`,
> `x_sales_action_sheet`, `mail.message`, `mail.activity`. Ook de dotted edge
> `lead → partner_building` is een samengestelde edge van twee hops geworden (zie §3, laatste
> paragraaf) omdat een dotted veld niet leesbaar is in een `search_read`.

---

## 1. Wat het onderzoek heeft bevestigd (feiten, geen aannames)

**Bevinding A is bevestigd.** `x_sales_action_sheet` heeft géén veld `lead_id`. De echte
koppeling is `x_studio_as_opportunity_ids` (many2many → `crm.lead`). De blokkade in
`routes.js` r.1577-1622 ("Relations to crm.lead are not allowed… `x_sales_action_sheet.lead_id`
does not exist") verbiedt dus iets op basis van een veldnaam die nooit heeft bestaan. De
generieke motor had dit pad met `relation_type: 'many2many'` + de juiste veldnaam
structureel wél gekund. De blokkade is een historisch misverstand, geen echte beperking.

**De many2one-bug is bevestigd** — en is ernstiger dan gedacht:

1. `buildTraversalDomain()` (`query-executor.js` r.499) doet bij many2one
   `[['id','in',sourceIds]]`, waarbij `sourceIds` de *primary keys van de bronrecords* zijn
   (r.418/423). De FK-waarde van `relation_field` wordt nergens uitgelezen. `crm.lead.partner_id
   → res.partner` zoekt dus partners met lead-id's → willekeurige verkeerde records.
2. `applyRelationAggregation()` (r.531-539) groepeert op `record[step.relation_field]` van het
   **doel**record, waar dat veld bij many2one niet bestaat → alles komt in één groep onder
   `undefined` → resultaat is structureel leeg (`first → null`, `count → 0`).
3. Vanaf stap 2 in een pad is de link naar het oorspronkelijke basisrecord verloren:
   r.463 zet `source_id: r.source_id || r.id`, maar `r.source_id` bestaat niet op een
   Odoo-record, dus het valt terug op de id van de tussenlaag.

Kortom: de multi-stap traversal van `query-executor.js` heeft nooit correct gewerkt voor
paden dieper dan één one2many/many2many-stap.

**Twee bugs die niemand nog had gezien:**

- `routes.js` r.1687 leest `isVerifyMode`, maar dat wordt pas op r.1746 gedeclareerd →
  temporal dead zone. Een zware-veldenquery zonder filter geeft daardoor géén nette
  400 `QUERY_TOO_BROAD` maar een 500 uit de catch.
- `semantic-query-executor.js` is **dood** — geen enkele import in `src/`. Het commentaar
  bovenaan (beide paden roepen dezelfde functie aan) klopt niet: `routes.js` heeft zijn eigen
  inline copy, `mini-app-bridge.js` gebruikt de generieke `executeQuery()`. De wizard en
  mini-apps lopen vandaag dus écht op twee verschillende motoren met twee verschillende
  resultaatvormen (genest `__leads` versus platte `alias.field`-kolommen).
- Alle 13 enrichment-bestanden draaien met `limit: false` (onbegrensd) en zetten alle
  bron-id's in één domain, zonder batching.

**Odoo-onderzoek (live instance):**

| Vraag | Antwoord |
|---|---|
| Bestaat er een apart contactmodel? | Nee. Contactpersonen en gebouwen/VME's zijn beide `res.partner`. `x_sales_action_sheet` heeft zelfs beide kanten: `x_studio_for_company_id` ("Gebouw") én `x_studio_contact_id` ("Contactpersoon"), beide → `res.partner`. |
| Visitor → contact? | Géén relatie. `x_web_visitor` heeft alleen char `x_studio_email`. De huidige `visitor-partner-enrichment.js` matcht op `res.partner.email`. |
| Touchpoint → contact? | Bestaat niet. `x_ad_touchpoint` heeft één enkele relatie: `x_studio_visitor` (many2one → `x_web_visitor`). |
| Schaal | ~223.000 touchpoints, ~47.000 visitors, `res.partner`-id's tot 933.000. |

---

## 2. Jouw keuzes, verwerkt in dit ontwerp

1. **Rol-varianten als aparte graaf-nodes** — één model `res.partner`, twee nodes
   ("Gebouwen/VME's" en "Contactpersonen").
2. **Edge-type `value_match`** voor visitor ↔ contact (e-mailgelijkheid), geen Studio-werk.
3. **Startpunt is een node-eigenschap** (`can_be_root`). Vertrekpunten: leads, contacten,
   gebouwen, web visitors, actiebladen. Touchpoints, chatter en activiteiten zijn wél
   cascade-doelen maar géén vertrekpunt. Elk nieuw model dat later in de graaf komt,
   krijgt die vlag expliciet mee.
4. **Bestaande opgeslagen zoekopdrachten mogen verloren gaan** — geen compat-laag, geen
   migratiescript. Schone codebase; je bouwt de gedeelde queries opnieuw op.

---

## 3. Het graaf-datamodel

Server-side, één source of truth. De wizard haalt het op via een API-endpoint en tekent
daar de spiderweb mee — geen client-side kopie meer.

### Node

```js
{
  key: 'partner_building',              // graaf-identiteit (≠ modelnaam)
  model: 'res.partner',                 // Odoo-model
  label: "Gebouwen / VME's",
  icon: 'building-2',
  nameField: 'name',
  can_be_root: true,                    // vertrekpunt in de wizard, ja/nee
  baseDomain: [['is_company', '=', true]],   // rol-scoping + model-quirks
  dateFields: [{ field: 'create_date', label: 'Aanmaakdatum' }],
  extraFilters: ['partner_type', 'company_status'],
  heavyFields: [],                      // velden die een filter vereisen
  maxRecords: 5000                      // cap per stap (overschrijfbaar)
}
```

`baseDomain` is de plek voor alle model-quirks die vandaag als code in `routes.js` en
`buildPayload()` staan: `crm.lead` → `['active','in',[true,false]]`, `res.partner` →
`is_company`, actiebladen → `x_active`. Declaratief, niet in code per query.

### Nodes (initiële set)

| key | model | vertrekpunt | baseDomain |
|---|---|---|---|
| `lead` | `crm.lead` | ✅ | `active in [true,false]` |
| `partner_building` | `res.partner` | ✅ | `is_company = true` |
| `partner_contact` | `res.partner` | ✅ | `is_company = false` |
| `visitor` | `x_web_visitor` | ✅ | — (3 heavyFields) |
| `actionsheet` | `x_sales_action_sheet` | ✅ | `x_active in [true,false]` |
| `touchpoint` | `x_ad_touchpoint` | ❌ | — |
| `chatter` | `mail.message` | ❌ | `message_type in [comment,email,notification]` |
| `activity` | `mail.activity` | ❌ | — |

### Edge

```js
{
  from: 'lead', to: 'partner_contact',
  field: 'partner_id',
  type: 'many2one',
  side: 'from',            // aan welke kant het koppelveld leeft — dit fixt de bug
  label: 'Klant'
}
```

`side` is de sleutel tot de correcte domain-opbouw. Elke edge wordt één keer gedeclareerd;
de inverse richting wordt automatisch afgeleid (een many2one van A naar B is een one2many
van B naar A). Vandaag staat dezelfde relatie op drie plekken (`GRAPH_EDGES`,
`RELATION_META`, het enrichment-bestand) met onderling afwijkende waarden — dat verdwijnt.

### Edges (initiële set)

| van → naar | veld | type |
|---|---|---|
| `touchpoint` → `visitor` | `x_studio_visitor` | many2one |
| `visitor` → `lead` | `x_studio_lead_ids` | many2many |
| `actionsheet` → `lead` | `x_studio_as_opportunity_ids` | many2many |
| `actionsheet` → `partner_building` | `x_studio_for_company_id` | many2one |
| `actionsheet` → `partner_contact` | `x_studio_contact_id` | many2one |
| `lead` → `partner_contact` | `partner_id` | many2one |
| `lead` → `partner_building` | `partner_id.commercial_partner_id` | many2one (dotted) |
| `partner_contact` → `partner_building` | `commercial_partner_id` | many2one |
| `visitor` → `partner_contact` | `x_studio_email` = `email` | **value_match** |
| elke node → `chatter` / `activity` | `model` + `res_id` | mail-patroon (auto-gegenereerd) |

Vier edge-types, alle vier in één traversal-functie:

- `many2one` — lees de FK-waarden úit de bronrecords, zoek doel op `id in [die waarden]`.
  Dotted paden (`partner_id.commercial_partner_id`) worden als domain-pad meegegeven,
  precies zoals `partner-lead-enrichment.js` het vandaag al doet.
- `one2many` / `many2many` — zoek doel op `<veld> in [bron-id's]`.
- `value_match` — haal het bronveld op, zoek doel op `<doelveld> in [waarden]`
  (genormaliseerd: lowercase + trim, zoals de huidige e-mailmatch).
- Mail-patroon — `['model','=',<odoo-model>], ['res_id','in',ids]`, generiek per node.

### Samengestelde edge — beslist: enkel waar de weg ondubbelzinnig is

`touchpoint → contact` krijgt GEEN samengestelde edge (beslissing Nico): die verbinding loopt
over de visitor, en een touchpoint is nooit een vertrekpunt. Een gebruiker start bij de web
visitor en haalt daar twee losse takken op: de contactpersonen (los, via het e-mailadres) en
de touchpoints.

Eén samengestelde edge is er wel: `crm.lead → res.partner` (gebouw/VME). Reden: uit de live
data blijkt dat `crm.lead.partner_id` naar de CONTACTPERSOON wijst (een individu), nooit naar
de company — het gebouw hangt aan diens `commercial_partner_id`. Dat is exact wat de oude
`partner-lead-enrichment.js` al deed met het dotted domain `partner_id.commercial_partner_id`.
De edge wordt uitgevoerd als twee gewone hops en heet in de UI "Gebouw / VME (via
contactpersoon)", zodat zichtbaar blijft hoe de koppeling loopt.

---

## 4. De cascade-JSON (opslag, delen, mini-apps)

Recursieve boom vanaf één root. Willekeurige diepte, per stap eigen velden/filters/periode.

```json
{
  "version": 2,
  "root": {
    "node": "lead",
    "fields": ["name", "create_date", "stage_id"],
    "filters": [{ "field": "won_status", "operator": "in", "value": ["won"] }],
    "time_scope": { "field": "create_date", "mode": "relative", "relative_amount": 30, "relative_unit": "days", "direction": "past" },
    "limit": 500
  },
  "cascade": [
    {
      "edge": "lead>partner_building",
      "as": "__gebouwen",
      "fields": ["name", "x_studio_number_of_apartments"],
      "filters": [],
      "cascade": [
        {
          "edge": "partner_building>partner_contact",
          "as": "__contactpersonen",
          "fields": ["name", "email", "x_studio_contact_type"]
        }
      ]
    }
  ]
}
```

Eigenschappen:

- Eén vorm voor wizard, opslag (`saved_searches` → afgeleide `sales_insight_queries`) en
  mini-apps. Geen tweede representatie.
- `edge` verwijst naar een graaf-edge, nooit naar een hardcoded functienaam. Een nieuw
  model/koppeling toevoegen = één node + één edge declareren, nul nieuwe code.
- Filters, datumvelden en periodes werken op **elke** stap, niet alleen op de root — dat is
  vandaag de grootste functionele beperking.
- Een model mag meerdere keren in een pad voorkomen (nodig voor
  gebouw → contact, beide `res.partner`); wat verboden blijft is dezelfde **edge** twee keer
  achter elkaar in dezelfde richting (dat zou een oneindige lus zijn).
- `{{param.NAAM}}`-placeholders blijven exact werken: `resolveQueryParameters()` in
  `mini-app-bridge.js` doet een deep-walk over de hele definitie, dus ook over `cascade`.
  Inclusief het `period_override`-type. Dat mechanisme wordt hergebruikt, niet herschreven.

### Resultaatvorm

```json
{
  "records": [
    {
      "id": 1234, "name": "Lead X", "create_date": "...",
      "__gebouwen": [
        { "id": 9, "name": "VME Zonneheuvel", "x_studio_number_of_apartments": 24,
          "__contactpersonen": [ { "id": 88, "name": "Jan Peeters", "email": "..." } ] }
      ]
    }
  ],
  "meta": { "total": 412, "truncated": false, "steps": [ ... per stap: aantal + duur ... ] }
}
```

`records` = rijen van het basismodel, met geneste `__<alias>`-arrays. Dat is precies het
contract dat `odoo-query-verkenner.html` ("Query-Tester") verwacht en dezelfde mentale vorm
als de huidige `__leads`/`__touchpoints`. **Het contract wijzigt dus niet** — alleen de
sleutelnamen worden consistent (uit `as` van de edge in plaats van 12 ad-hoc namen).
Many2one-stappen leveren nog steeds een object in plaats van een array, net als het huidige
`__partner`.

---

## 5. Repareren of vervangen?

**Voorstel: de relatietak van `query-executor.js` vervangen, de rest ervan behouden.**

Behouden — dit werkt en is niet-triviaal om te herbouwen:

- de basisquery (`search_read` met domain, limit, offset, preview-limiet 50);
- de aggregatietak via `read_group` + de capability-detectie;
- de exporttak (`lib/export/*`).

Vervangen — `RelationTraversal` is niet het datamodel dat we nodig hebben, en niet alleen
door bugs:

- de resultaatvorm is een **platte scalaire kolom** (`alias.field`, één waarde per
  basisrecord via een aggregatie), terwijl de wizard en de mini-apps **geneste
  kindrecords per ouder** nodig hebben. Dat is geen bugfix, dat is een andere vorm.
- `source_id` gaat vanaf stap 2 verloren, dus per-ouder groeperen kán er structureel niet.
- many2one is in zowel de domain-opbouw als de groepering fout (zie §1).

Er blijft dus **één motor** over: `executeCascade()` doet de basisquery via de bestaande
executor-code en daarna alle relatiestappen generiek. `runSemanticQuery` (wizard) en
`runSharedQuery` (mini-apps) worden beide dunne wrappers daarrond. Een query die in de
wizard is opgebouwd geeft in een mini-app per definitie hetzelfde resultaat, want het is
letterlijk dezelfde functie op dezelfde JSON.

---

## 6. Guards — in gewone taal

Elke cascade-stap is een aparte vraag aan Odoo (geen SQL-join). Drie generieke,
declareerbare beschermingen in plaats van de huidige per-geval-code:

1. **Cap per stap** (`maxRecords`, default 5000). Levert een stap meer records op dan de
   cap, dan stopt de motor met een duidelijke melding "te veel resultaten, verfijn je
   filter" in plaats van minutenlang te blijven hangen of stil af te kappen. Vandaag staat
   dit maar op één plek (`lead-enrichment.js`) en draait al de rest onbegrensd.
2. **Zware velden vereisen een filter** (`heavyFields` per node). De drie grote
   HTML/JSON-velden van `x_web_visitor` mogen niet zonder filter opgevraagd worden. Dat is
   vandaag hardcoded in `routes.js` (en kapot, zie §1); het wordt node-metadata, zodat een
   nieuw model met een zwaar veld enkel een declaratie nodig heeft.
3. **Id's in blokken van 500** naar Odoo. Vandaag gaan alle bron-id's in één domain; bij
   47.000 visitors of 223.000 touchpoints loop je dan tegen Odoo-limieten aan. Batching is
   onzichtbaar voor de gebruiker en verandert niets aan het resultaat.

Geen streaming/cursor-aanpak — dat botst met de Cloudflare Worker-limieten en is met een
cap + verplicht filter niet nodig. Merk op dat touchpoints geen vertrekpunt zijn, dus de
223.000 touchpoints komen altijd binnen als kinderen van een reeds gefilterde
visitor-selectie; de cap is daar de vangnet, niet de dagelijkse realiteit.

---

## 7. Bestandsplan

Nieuw:

```
src/modules/sales-insight-explorer/lib/graph/
  graph-nodes.js       — node-declaraties (incl. can_be_root, baseDomain, heavyFields)
  graph-edges.js       — edge-declaraties + inverse-derivatie + samengestelde edges
  graph-service.js     — getGraph(env): graaf + veldinfo uit schema-service, gecached
  cascade-models.js    — validatie van de v2 cascade-JSON
  cascade-executor.js  — executeCascade(): de enige traversal-motor
```

Nieuw endpoint `GET /insights/api/sales-insights/graph` → de wizard tekent de spiderweb
hieruit. `GRAPH_EDGES`, `RELATION_META` en `MODEL_CONFIG` verdwijnen uit
`semantic-wizard.js`.

Weg (in deze volgorde, na akkoord):

- de 13 bespoke enrichment-bestanden (`lead-enrichment.js`, `chatter-enrichment.js`,
  `activity-enrichment.js` en de 10 paar-specifieke);
- `semantic-query-executor.js` (dood bestand);
- de 12 `if`-blokken 5a-5l in `runSemanticQuery()` (`routes.js` r.1763-1981), de inline
  Actieblad→Partner→Lead-hack (r.1894-1924), de crm.lead-blokkade (r.1577-1622) en de
  modelspecifieke domain-hacks (r.1657-1734) → verhuizen naar node-metadata;
- `executeRelationTraversal()`, `buildTraversalDomain()`, `enrichWithRelations()`,
  `applyRelationAggregation()` en de relatietak van `executeViaMultiPass()` in
  `query-executor.js`;
- `buildPayload()`'s hardcoded `if (model === …)`-cascade in `semantic-wizard.js`
  (r.416-625) → bouwt de cascade-boom uit de graaf.

Ongewijzigd hergebruikt: `mini-app-bridge.js` (`resolveQueryParameters`,
`autoDetectMiniAppParameters`, `period_override`), `saved-search-sharing.js` (het
één-vinkje-patroon), `schema-service.js` (`ensureSchema` + de dynamische Studio-modellen —
diezelfde `ir.model`-lijst voedt straks ook de graaf-nodes), `lib/export/*`.

---

## 8. Implementatiefasen

1. Graaf-declaraties + `graph-service.js` + het API-endpoint. Geen gedragswijziging.
2. `cascade-executor.js` + validatie, met unit-achtige verificatie per edge-type
   (vooral many2one en value_match, de twee die vandaag fout zijn).
3. `runSemanticQuery` wordt een dunne wrapper; `runSharedQuery` idem. Beide acceptatietests
   end-to-end verifiëren, in de wizard én via een mini-app met
   `window.platform.odoo.runQuery()`.
4. Wizard-front-end: cascade-boom uit de graaf, `buildPayload()` vervangen.
5. Opruimen (§7) — pas als 3 en 4 groen zijn.

Alle bestandsbewerkingen volgen de verplichte procedure uit `CLAUDE.md`: bestanden >150
regels uitsluitend via een Python-script met binaire read/write, `newline='\n'`,
`assert content.count(old_block) == 1`, en na élke schrijfactie `node --check` +
CR-byte-count 0 + volledige `diff` tegen `git show HEAD:<pad>`.

## 9. Acceptatietests

1. `crm.lead` → `partner_building` (via `partner_id.commercial_partner_id`) →
   `partner_contact` (via inverse `commercial_partner_id`). Beide stappen leveren enkel
   records die aan de geselecteerde ouders hangen.
2. `visitor` → `touchpoint` (inverse `x_studio_visitor`) als tak A, en `visitor` →
   `partner_contact` (e-mailmatch) → `lead` (inverse `partner_id`) als tak B — twee losse
   takken naast elkaar vanuit hetzelfde vertrekpunt.

Beide via dezelfde `executeCascade()`, beide identiek in wizard en mini-app.

## 10. Geen Studio-werk nodig

Met `value_match` en de rol-varianten is er voor beide acceptatietests géén nieuw
Odoo-veld nodig. Mocht je later toch een echte `x_studio_partner_id` op `x_web_visitor`
willen (sneller, zuiverder), dan is dat een Studio-taak plus een extra edge-declaratie —
geen codewijziging.

---

## 11. Uitgevoerd (2026-08-03)

Gebouwd zoals hierboven beschreven. Wat er concreet staat:

| Bestand | Rol |
|---|---|
| `lib/graph/graph-nodes.js` | 8 nodes met `canBeRoot`, `baseDomain`, `heavyFields`, `maxRecords` |
| `lib/graph/graph-edges.js` | 9 gedeclareerde edges → 30 resolved edges (tegenrichting + mail-edges automatisch) |
| `lib/graph/cascade-models.js` | vorm + validatie van de cascade-query (v2) |
| `lib/graph/cascade-executor.js` | de enige traversal-motor: `fk_forward`, `fk_reverse`, `value_match`, `mail`, `composite` |
| `lib/graph/graph-service.js` | serialisatie voor de client |
| `GET /insights/api/sales-insights/graph` | nieuw endpoint; de wizard tekent de spiderweb hieruit |

Aangesloten op één motor: `runSemanticQuery()` (288 regels bespoke cascade → dunne wrapper) en
`mini-app-bridge.js#runSharedQuery()` roepen beide `executeCascade()` aan.
`saved-search-sharing.js` valideert nu tegen de graaf (geen schema-introspectie meer nodig bij
delen), `query-repository.js` leidt `base_model` af uit `root.node`, `mini-app-discovery.js`
beschrijft de geneste cascade-vorm inclusief `shape` per alias.

Front-end: `MODEL_CONFIG`, `GRAPH_EDGES` en `RELATION_META` zijn weg uit
`public/semantic-wizard.js`; die komen nu van de server via `loadGraph()`. `buildPayload()` is
van 288 regels `if (model === '...')` naar één generieke graaf-wandeling gegaan.

Opgeruimd: de relatietak van `query-executor.js` (272 regels verwijderd, plus een expliciete
`RELATIONS_NOT_SUPPORTED`-guard). De 13 enrichment-bestanden en `semantic-query-executor.js`
zijn nergens meer geïmporteerd maar staan nog op schijf — verwijderen mocht ik niet, dus dat is
één commando voor jou:

```
git rm src/modules/sales-insight-explorer/lib/{lead,chatter,activity,partner-lead,partner-actionsheet,visitor-touchpoint,visitor-lead,touchpoint-visitor,actionsheet-partner,lead-partner,lead-actionsheet,lead-visitor,visitor-partner}-enrichment.js src/modules/sales-insight-explorer/lib/semantic-query-executor.js
```

### Verificatie

- `tests/cascade-executor-test.mjs` — 28 checks, alle geslaagd. Draait de volledige motor tegen
  een fake-Odoo waarvan de fixtures uit ECHTE records komen (lead 11332 → contactpersoon 933417
  → gebouw 933416 "Duinenpark"; visitor 29758 met twee touchpoints), dus met de exacte
  Odoo-waardevormen. Dekt beide acceptatietests, het mail-patroon, de drie guards, filters per
  stap en de id-batching (1200 records → meerdere batches van max 500).
- `tests/wizard-payload-test.mjs` — 21 checks, alle geslaagd. Laadt de échte
  `public/semantic-wizard.js` in een VM en controleert dat `buildPayload()` voor beide scenario's
  een cascade-query bouwt die de SERVERvalidatie goedkeurt.
- `node --check` + CR-count 0 op elk gewijzigd bestand; alle 335 relatieve imports in `src/`
  resolven.
- De Odoo-domainvormen die de motor uitstuurt zijn los tegen de live instance geverifieerd
  (o.a. `commercial_partner_id in [...] + is_company = false`, `x_studio_visitor in [...]`).

**Nog te doen door jou:** een echte klik-door in de gedeployede worker. Mijn omgeving heeft geen
netwerktoegang naar `mymmo.odoo.com`, dus de laatste stap (wizard openen, beide paden lopen, en
een gedeelde query in de Query-Tester-mini-app draaien) kan ik niet zelf uitvoeren.
