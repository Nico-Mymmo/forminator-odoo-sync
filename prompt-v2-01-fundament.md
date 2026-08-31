# Event Operations v2 — Fase 1: fundament, Odoo-contract en publieke API

Nieuwe module `event-operations-v2` naast de bestaande `event-operations`. Deze fase bouwt de Odoo-laag, de beheer-API en de publieke lees-API.

## Het architectuurprincipe — lees dit eerst en wijk er niet van af

**Odoo is de enige database. Er komt geen enkele Supabase-tabel bij voor deze module.**

- Events staan in `x_webinar`. Inschrijvingen in `x_webinarregistrations`. Contacten in `res.partner`. Mails in `mail.mail` / `mail.template`.
- De Operations Manager is de laag waar alle handelingen gebeuren: alle UI, alle logica, alle validatie. Maar zij bezit geen data.
- Er is **geen projectie, geen spiegel, geen schaduwtabel**. Elke lees- en schrijfactie gaat naar Odoo.
- Wat wél mag: een **wegwerpcache** in Cloudflare (Cache API en de bestaande `MAPPINGS_KV`-binding) en **binaire assets in R2** met de URL in een Odoo-veld. Beide zijn per definitie herbouwbaar uit Odoo. Een cache mag op elk moment leeggegooid worden zonder dat er iets verloren gaat — als dat niet waar is, is het geen cache en mag het niet.
- **Nooit** `getSupabaseClient` importeren in deze module. Dat is de scherpste test op naleving.

Auditsporen gaan naar de Odoo-chatter (`message_post` op het record), niet naar een eigen logtabel.

## Lees eerst

- `claude.md`
- `src/lib/odoo.js`
- `src/modules/registry.js`
- `src/modules/forminator-sync-v2/module.js`
- `src/router/public-routes.js`
- `src/router/module-router.js`
- `src/lib/auth/middleware.js`
- `src/modules/event-operations/constants.js`
- `src/modules/event-operations/odoo-client.js`
- `src/modules/event-operations/services/recap-service.js`
- `src/modules/asset-manager/lib/r2-client.js`
- `wrangler.jsonc`

## Context

"Event" is het bredere woord voor wat nu `x_webinar` heet. Mymmo organiseert online én offline momenten. Bezoekers moeten die goed kunnen zien op de website en zich kunnen inschrijven. De Odoo-schermen voor events worden straks voor gebruikers verborgen: al het beheer gebeurt in de OM.

De bestaande module `event-operations` blijft in productie tot v2 bewezen is. Raak hem niet aan.

## Stap 0 — De velden bestaan al, verifieer ze

Alle benodigde Studio-velden zijn aangemaakt en op 28 augustus 2026 geverifieerd met `fields_get`. Doe die verificatie opnieuw voor je begint, en gebruik **exact** deze namen.

Op `x_webinar`:

| Veld | Type | Waarvoor |
|---|---|---|
| `x_studio_slug` | char | publieke URL; **leeg op alle bestaande records**, moet bij cutover gevuld worden |
| `x_studio_publication_state` | selection | zichtbaarheid op de website, los van `x_studio_stage_id` |
| `x_studio_capacity` | integer | max plaatsen; **0 = onbeperkt** (staat vandaag op 0 bij alle records) |
| `x_studio_registration_enabled` | boolean | inschrijvingen open of niet |
| `x_studio_registration_opens_at` | datetime | inschrijfvenster start |
| `x_studio_registration_closes_at` | datetime | inschrijfvenster einde |
| `x_studio_summary` | text | korte tekst voor kaart en kalender |
| `x_studio_hero_image_url` | char | publieke URL van het hero-beeld, zie stap 0b |
| `x_studio_seo_title` | char | SEO |
| `x_studio_seo_description` | text | SEO |

Op `x_webinarregistrations`:

| Veld | Type | Waarvoor |
|---|---|---|
| `x_studio_attendance_updated_at` | datetime | de audit die in v1 stuk is — deze velden stonden per ongeluk op `x_webinar` en zijn nu correct aangemaakt |
| `x_studio_attendance_updated_by` | many2one → `res.users` | idem |
| `x_studio_attendance_update_origin` | char | idem |
| `x_studio_source` | selection | herkomst: publiek formulier, manueel, forminator, import |
| `x_studio_registration_state` | selection | los van `x_active` |

Lees de toegestane waarden van de drie selection-velden uit met `fields_get` en gebruik die letterlijk. Verzin geen waarden.

Bestaande velden hergebruiken, niet dupliceren: `x_studio_webinar_info` is de redactionele inhoud voor de publieke pagina, `x_studio_user_id` de host, `x_studio_co_host` de tweede spreker, `x_studio_live_event_location` de locatie, `x_studio_webinar_link` de online link.

### Stap 0a — Format wordt afgeleid, niet opgeslagen

Er komt **geen** `x_studio_format`-veld. Online, op locatie of hybride volgt uit de data die er al is, en dat is robuuster dan een apart veld dat kan verlopen:

- `x_studio_live_event_location` gevuld **en** `x_studio_webinar_link` gevuld → `hybrid`
- alleen `x_studio_live_event_location` gevuld → `onsite`
- anders → `online`

Zet die afleiding in `odoo-contract.js` als één functie `deriveFormat(record)`. Nergens anders.

`x_event_type_id` blijft wat het is: de inhoudelijke categorie, met vandaag vijf waarden — Webinar, Infosessie, Q&A, Live Event, Groepsopleiding. Die gebruik je voor kleur en filtering op de website, niet om het format te bepalen. Zo hoeft er geen mapping onderhouden te worden als er een type bijkomt.

### Stap 0b — Hero-beeld via de asset-manager

De bytes gaan naar de bestaande asset-manager-module, niet naar een nieuwe opslag. Gebruik `putObject` uit `src/modules/asset-manager/lib/r2-client.js` met sleutel `events/{odooId}/hero.{ext}`, bouw de publieke URL zoals `recap-service.js` dat doet met `env.BASE_ASSET_URL`, en schrijf die URL naar `x_studio_hero_image_url`.

De URL in Odoo is de enige verwijzing die telt. Geen bestandslijst, geen index, geen tweede administratie — bestaat het veld niet of is het leeg, dan heeft het event geen hero-beeld.

### Stap 0c — Velden die je nooit aanraakt

Op alle bestaande records geverifieerd leeg, en dus dood:

- `x_studio_event_type` (selection) — `false` op elk record
- `x_studio_many2one_field_4p8_1jhb7es30`
- `x_studio_binary_field_43c_1ilec7eit`, `x_studio_datetime_field_7v5_1ilea618c`, `x_studio_one2many_field_9hq_1ilea9sm6`

Nooit lezen, nooit schrijven, niet in een veldenlijst opnemen.

## Stap 1 — Het Odoo-contract

Één bestand `src/modules/event-operations-v2/odoo-contract.js` dat de enige plek is waar Odoo-veldnamen voorkomen. De rest van de module kent alleen nette namen. Dit lost in één keer de rommel op die vandaag over vijf bestanden verspreid zit.

Wat dit bestand moet doen:

**Veldnamen centraliseren.** Eén `EVENT_FIELDS`- en `REGISTRATION_FIELDS`-object. Nergens anders in de module staat een `x_studio_`-string.

**De dubbele en drievoudige velden oplossen.** `x_webinar` heeft drie event-type-velden: `x_event_type_id` (many2one → `x_webinar_event_type`), `x_studio_event_type` (selection) en `x_studio_many2one_field_4p8_1jhb7es30`. **`x_event_type_id` is de enige echte** — geverifieerd: de andere twee zijn leeg op elk record. Let op: de bestaande module gebruikt de constante `x_webinar_event_type_id`, een veld dat niet bestaat; er zit een runtime-detectie in `odoo-client.js` die dat wegwerkt. Die detectie is niet nodig — schrijf gewoon de juiste naam.

**De deelnemer oplossen naar `res.partner`.** Zie stap 6b. Het contract bevat `resolvePartnerByEmail(env, email, profile)`: zoekt een partner op genormaliseerd e-mailadres en maakt er anders één aan. Alle contactgegevens leven op `res.partner`; op de registratie komen geen telefoon- of bedrijfsvelden.

**De afgeleide tekstvelden meeschrijven.** `x_studio_starting_day` en `x_studio_starting_time` zijn losse char-velden, en de mailtemplates 52 en 53 gebruiken ze in hun subject. `x_studio_date` staat naast `x_studio_event_datetime`. Bij elke schrijfactie op de datum berekent het contract deze drie mee uit `x_studio_event_datetime`, in `Europe/Brussels`. Nooit meer handmatig, en nooit meer uit sync.

**Datetime-conversie op één plek.** Odoo geeft datetimes terug als `"YYYY-MM-DD HH:MM:SS"` in UTC zonder `Z`, en verwacht datzelfde formaat bij schrijven. Het contract zet dat om van en naar een echte ISO-timestamp met `Z`. Twee functies, `fromOdooDatetime` en `toOdooDatetime`, en verder gebruikt niemand in de module een datumstring rechtstreeks. De huidige module doet deze conversie op drie plekken met drie verschillende uitkomsten; dat is de bron van de status-verschillen tussen kalender en detailpaneel.

**Serializers.** `toEventDto(record)` en `toRegistrationDto(record)` die een Odoo-record omzetten naar de vorm die de API teruggeeft, en `toOdooEventValues(dto)` voor de omgekeerde richting. Dit is het contract met de UI en met de WordPress-plugin.

## Stap 2 — Module-skeleton

```
src/modules/event-operations-v2/
  module.js            -- code 'event_operations_v2', route '/events-v2'
  routes.js            -- beheer-API, achter requireAuth
  public-api.js        -- publieke handlers, aangeroepen via public-routes.js
  constants.js         -- statussen, formats, limieten, cache-TTL's
  odoo-contract.js     -- zie stap 1
  lib/
    events-service.js         -- lezen en schrijven van events via het contract
    registrations-service.js
    slug.js                   -- slug afleiden en uniek maken via een Odoo-zoekactie
    validation.js
    blocks.js                 -- redactionele HTML opbouwen
    cache.js                  -- de wegwerpcache, zie stap 4
```

Projectregels: routes retourneren JSON, nooit HTML-strings. Geen geneste template literals. Geen `ui.js` in de modulemap — de UI komt in fase 2 als `public/events-v2.html`. Registreer de module in `src/modules/registry.js` en volg `forminator-sync-v2/module.js`.

Registratie in de `modules`-tabel gebeurt met één kleine migratie — dat is de enige migratie in deze fase, en ze bevat uitsluitend de `INSERT` in `modules` plus de auto-grant aan admins, zoals `20260211000000_event_operations_v1.sql`. Geen nieuwe tabellen.

## Stap 3 — Prestaties, want er is geen projectie

Dit is het punt waar het misgaat als je niet oplet. De bestaande module doet tot ~200 externe calls per sync omdat hij per webinar een aparte call doet. Zonder projectie is discipline hier het enige wat je hebt.

Harde regels:

- **Elke lijst is twee Odoo-calls, niet meer.** Eén `search_read` op `x_webinar` met een expliciete veldenlijst, en één `read_group` op `x_webinarregistrations` gegroepeerd op `x_studio_linked_webinar` voor de aantallen. Nooit een call per event.
- **Nooit `fields: []`.** Dat haalt elk veld van elk record op. De bestaande `getWebinarRegistrations` doet dit en het moet in v2 nergens voorkomen.
- **Geen `limit: 100`.** Gebruik echte paginering met `offset` en `limit`, en geef het totaal terug uit een `search_count`.
- **Aanwezigheidstellers via `read_group`**, niet door alle registratierecords op te halen en in JavaScript te tellen.
- Voor de registratielijst: `search_read` met paginering plus één `read_group` voor de tellers, en de bestaande lead-resolutie ongewijzigd hergebruiken uit `event-operations/services/lead-resolution-service.js` — dat is goed werk.

## Stap 4 — De wegwerpcache

`lib/cache.js`, bovenop de Cloudflare Cache API voor de publieke responses en `MAPPINGS_KV` voor de beheerlijsten.

- TTL's in `constants.js`: publieke kalender 60 seconden, publiek eventdetail 60 seconden, event types 300 seconden, beheerlijsten 15 seconden.
- **Purge op elke schrijfactie.** Elke `POST` of `PATCH` op een event invalideert de cache-entries van dat event en van alle lijsten. Als je twijfelt tussen te veel of te weinig purgen: purge te veel.
- Een cache-miss mag nooit een fout worden. Bij een KV- of Cache-fout ga je door naar Odoo.
- Zet in de responsheaders een `X-Cache: hit|miss`, zodat het meetbaar is.
- Geen cache op iets wat een gebruiker net zelf gewijzigd heeft: na een schrijfactie lees je terug uit Odoo, niet uit de cache.

## Stap 5 — Beheer-API

Alles achter `requireAuth`. Paden relatief aan `/events-v2`.

| Methode + pad | Doet |
|---|---|
| `GET /api/events` | lijst met filters `state`, `type`, `format`, `from`, `to`, `q` en paginering. Bevat per event het aantal inschrijvingen en de vrije plaatsen |
| `POST /api/events` | aanmaken in `x_webinar`; slug afleiden uit de titel en uniek maken via een Odoo-zoekactie op `x_studio_slug` |
| `GET /api/events/:id` | één event, `id` is de Odoo-id |
| `PATCH /api/events/:id` | partieel bijwerken; de afgeleide datumvelden gaan automatisch mee |
| `POST /api/events/:id/publish` | `x_studio_publication_state` naar `published`. Weiger als titel, slug, datum, duur, event type of samenvatting ontbreekt, met een lijst van wát mist |
| `POST /api/events/:id/unpublish` | terug naar `draft` |
| `POST /api/events/:id/cancel` | naar `cancelled` |
| `POST /api/events/:id/duplicate` | kopie als draft, zonder inschrijvingen, met een nieuwe slug |
| `POST /api/events/:id/archive` | `x_active` op `false` |
| `GET /api/event-types` | uit `x_webinar_event_type` |
| `POST /api/events/:id/hero-image` | multipart via de asset-manager, zie stap 0b; de resulterende URL naar `x_studio_hero_image_url` |

Schrijf bij elke statuswijziging een chatterbericht op het Odoo-record via `message_post`, met wie het deed en wat er veranderde. Dat is het auditspoor, en het staat waar het hoort.

Statusovergangen die je afdwingt: `draft → published`, `published → draft | cancelled`, `cancelled → draft`. Elke andere overgang is een 409 met een leesbare melding.

## Stap 6 — Publieke lees-API

Deze endpoints staan **niet** achter de auth-gate en moeten geregistreerd worden in `src/router/public-routes.js`, volgens hetzelfde dispatchpatroon als `POST /forminator-v2/api/webhook`.

| Methode + pad | Doet |
|---|---|
| `GET /events-v2/public/v1/events` | gepubliceerde events; parameters `from`, `to`, `type`, `format`, `limit` (max 200), `include_past` |
| `GET /events-v2/public/v1/events/:slug` | één event met de redactionele inhoud als HTML |
| `GET /events-v2/public/v1/event-types` | types met naam, slug en kleur |

Eisen aan alle drie:

- **Nooit `x_studio_webinar_link` teruggeven.** Die link is voor ingeschrevenen en gaat alleen per mail. Dit is een harde regel: bouw hem in de serializer in, niet in de handler, zodat hij niet per ongeluk kan lekken.
- **Sitesleutel** via header `X-Mymmo-Site-Key`, vergeleken met `env.EVENTS_PUBLIC_SITE_KEYS` (komma-gescheiden). Timing-safe vergelijken, zoals `forminator-sync-v2/routes.js:1489-1521`. Zonder of fout: 401.
- **CORS** alleen voor de origins in `env.EVENTS_PUBLIC_ORIGINS`.
- **ETag** over de body, `304` bij een matchende `If-None-Match`, plus `Cache-Control: public, max-age=60, stale-while-revalidate=300`.
- **Rate limit** per sitesleutel via `MAPPINGS_KV`: 120 verzoeken per minuut, daarboven 429 met `Retry-After`.
- **Stabiele vorm.** Dit is het contract met de WordPress-plugin. Eén serializer in `odoo-contract.js`, zodat een veldwijziging op één plek gebeurt.

Responsvorm voor een event in de lijst:

```json
{
  "id": 71,
  "slug": "q-and-a-master-25-09",
  "title": "…",
  "summary": "…",
  "type": { "id": 3, "name": "Q&A", "slug": "q-and-a", "color": "#1f5c7a" },
  "format": "online",
  "starts_at": "2026-09-25T09:00:00Z",
  "ends_at": "2026-09-25T10:00:00Z",
  "timezone": "Europe/Brussels",
  "location": { "name": null, "address": null },
  "hero_image_url": "https://link.openvme.be/assets/events/71/hero.jpg",
  "registration": { "open": true, "capacity": 100, "seats_left": 42 },
  "url": "/events/q-and-a-master-25-09"
}
```

De detailrespons voegt `body_html`, `speakers` (host en co-host) en `seo` toe.

## Stap 6b — De deelnemer is een `res.partner`, e-mail is de sleutel

Bouw dit nu al als functie in `odoo-contract.js`, ook al gebruikt fase 3 hem pas. Zo staat de regel op één plek vast voor het inschrijf-endpoint erop leunt.

De deelnemer van een inschrijving is `x_studio_registered_by`, een many2one naar `res.partner`. Er komen **geen** telefoon- of bedrijfsvelden op de registratie: die gegevens horen op de partner. Het e-mailadres is de identiteit.

`resolvePartnerByEmail(env, email, profile)` doet:

1. Normaliseer het adres: trim en lowercase. Werk verder alleen met die genormaliseerde vorm.
2. Zoek met `search_read` op `res.partner` met domein `[['email', '=ilike', normalized]]`, gesorteerd op `create_date asc`, limiet 2.
3. Precies één resultaat: gebruik die partner. Vul lege velden aan uit `profile` (naam, telefoon, bedrijf) maar **overschrijf nooit een bestaande waarde** — de CRM-gegevens in Odoo zijn leidend over wat iemand in een formulier typt.
4. Geen resultaat: maak een partner aan met naam, e-mail en wat er verder in `profile` zit.
5. Meer dan één resultaat: gebruik de oudste, en zet een chatterbericht op die partner dat er een duplicaat op hetzelfde adres bestaat. Faal niet — een dubbele partner in Odoo mag nooit een inschrijving blokkeren.

Zet `x_studio_webinar_registratie_email` op de registratie met het adres zoals de bezoeker het intypte, zodat je later kan zien wat er echt is ingevuld. De partner houdt de canonieke waarde.

Twee dingen om te weten voor fase 3, zodat het contract er nu al op voorbereid is: er is geen databaseconstraint die twee inschrijvingen van hetzelfde adres op hetzelfde event tegenhoudt, dus de dubbelcontrole is een expliciete `search_count` op `[['x_studio_linked_webinar', '=', id], ['x_studio_registered_by', '=', partnerId]]` vóór de create. En `x_studio_contact_created` op de registratie zet je op `true` wanneer stap 4 een nieuwe partner heeft aangemaakt — dat veld wordt vandaag al in Odoo-views gebruikt.

## Wat je NIET doet

- **Geen enkele Supabase-tabel voor deze module.** Geen `evt_*`, geen projectie, geen cachetabel, geen logtabel. `getSupabaseClient` komt niet voor in de module, met als enige uitzondering niets.
- Geen UI. Geen `public/events-v2.html`, geen HTML uit de Worker. Alleen JSON.
- Geen inschrijf-endpoint. `POST .../register` komt in fase 3 — alleen de partner-resolver uit stap 6b bouw je nu.
- Geen mailverzending. Dat komt in fase 4.
- Geen `x_studio_format`-veld aanmaken, en geen mapping van event type naar format. Format wordt afgeleid, zie stap 0a.
- Geen telefoon- of bedrijfsveld op de registratie. Die gegevens staan op `res.partner`.
- Geen eigen bestandsindex voor hero-beelden. De URL in `x_studio_hero_image_url` is de enige verwijzing.
- Niets aanraken in `src/modules/event-operations/`, `public/event-operations-client.js`, `public/*-controller.js` of de `webinar_snapshots`-tabellen. v1 blijft draaien.
- Geen datamigratie. De bestaande `x_webinar`-records zijn al de bron; er valt niets te verhuizen. Dat is het voordeel van deze keuze.
- Geen `x_studio_event_type` of `x_studio_many2one_field_4p8_1jhb7es30` lezen of schrijven.

## Definitie van klaar

- Alle velden uit stap 0 bestaan, opnieuw geverifieerd met `fields_get`, en de selection-waarden komen letterlijk uit Odoo
- `grep -r "getSupabaseClient" src/modules/event-operations-v2/` geeft nul resultaten
- `grep -rE "x_studio_(event_type|many2one_field|binary_field|datetime_field|one2many_field)" src/modules/event-operations-v2/` geeft nul resultaten
- Er is precies één migratie, en die bevat alleen de moduleregistratie
- Een event kan via de beheer-API aangemaakt, bijgewerkt en gepubliceerd worden, met correcte weigering van ongeldige statusovergangen
- Een datumwijziging past `x_studio_date`, `x_studio_starting_day` en `x_studio_starting_time` automatisch aan
- Een event met alleen een locatie levert format `onsite`, met locatie én link `hybrid`, met geen van beide `online`
- Een hero-beeld uploaden zet een werkende URL in `x_studio_hero_image_url` en het bestand staat in R2 onder `events/{id}/hero.*`
- `resolvePartnerByEmail` vindt een bestaande partner op een adres met andere hoofdletters, en maakt er precies één aan als hij niet bestaat
- Een lijst van 50 events kost twee Odoo-calls, aantoonbaar uit de logs
- `GET /events-v2/public/v1/events` werkt zonder sessiecookie met een geldige sitesleutel, geeft 401 zonder, en 304 bij een matchende ETag
- De publieke respons bevat nergens `x_studio_webinar_link`
- Elke statuswijziging staat als chatterbericht op het Odoo-record

Lees ook `claude.md` voor de projectregels.
