# Event Operations v2 — Fase 3: inschrijvingen

**Bedoeld voor: Claude Opus 5.**

Waarom Opus en niet Sonnet: deze fase schrijft voor het eerst naar Odoo op basis van
publieke, ongeauthenticeerde input. Er zitten drie dingen in die stil fout kunnen gaan en
die je later niet meer terugvindt — dubbele inschrijvingen, dubbele contactpersonen, en
capaciteit die onder gelijktijdige verzoeken overschreden wordt. Dat is oordeelswerk,
geen invulwerk.

## Lees eerst

- `claude.md`
- `src/modules/event-operations-v2/odoo-contract.js` — volledig
- `src/modules/event-operations-v2/lib/partners.js` — `resolvePartnerByEmail` staat er al
- `src/modules/event-operations-v2/lib/events-service.js`
- `src/modules/event-operations-v2/lib/validation.js`
- `src/modules/event-operations-v2/public-api.js`
- `src/modules/event-operations-v2/routes.js`
- `src/modules/event-operations-v2/constants.js`
- `src/modules/event-operations-v2/tests/contract-test.mjs` — 48 tests, moeten groen blijven
- `src/modules/event-operations/services/lead-resolution-service.js` — hergebruiken, niet herschrijven
- `src/modules/event-operations/services/webinar-registration-service.js` — als referentie voor de v1-aanpak
- `wp-plugin/mymmo-events/includes/class-registration.php` — de client die dit endpoint gaat aanroepen
- `wp-plugin/mymmo-events/templates/registration-form.php` — welke velden er komen

## Architectuurregel die niet ter discussie staat

**Odoo is de enige database.** Geen Supabase, geen `getSupabaseClient`, geen nieuwe tabel.
Cache is wegwerpbaar. Auditsporen gaan naar de Odoo-chatter via `message_post`.
Geen `x_`-veldnaam buiten `odoo-contract.js`.

## Context

Inschrijvingen komen vandaag via Forminator binnen en worden door
`forminator-sync-v2` naar Odoo geschreven. De koppeling naar het juiste webinar is
daar configuratie: één mappingrij, en als die waarde leeg is schrijft de Worker de
registratie stil weg zonder `x_studio_linked_webinar`. De Odoo-automations voor
bevestigings- en remindermail vuren dan nooit.

Deze fase maakt daar een einde aan: het event zit in het pad van het endpoint, dus de
link is bij constructie gegarandeerd.

De WordPress-plugin is al gebouwd en post naar
`POST /events-v2/public/v1/events/{slug}/register` met dit lichaam:

```json
{
  "first_name": "…", "last_name": "…", "email": "…",
  "phone": "…", "company": "…", "questions": "…",
  "consent": true, "source": "public_form",
  "utm": { "utm_source": "…", "utm_campaign": "…" }
}
```

Dat contract staat vast — pas de plugin niet aan om het endpoint makkelijker te maken.

## Wat je implementeert

### 1. `POST /events-v2/public/v1/events/:slug/register`

Registreren in `src/router/public-routes.js` gebeurt al: `isEventsPublicApiPath` vangt het
hele prefix. Je moet in `public-api.js` wel de POST-tak openzetten — die staat nu op
`405` voor alles behalve GET. Doe dat gericht: alleen dit ene pad mag POST.

Eisen:

- **Sitesleutel** blijft verplicht, net als bij de GET-routes.
- **Rate limit** strenger dan de leesroutes: dit is een schrijfpad. Neem een aparte
  emmer, bijvoorbeeld 20 per minuut per sitesleutel, plus een tweede op het
  e-mailadres (5 per uur) zodat één adres niet twintig events kan volspammen.
- **Nooit cachen**, en na een geslaagde inschrijving de eventcache invalideren zodat het
  aantal vrije plaatsen meteen klopt.
- **Alleen op een event dat publiek zichtbaar is** (`PUBLIC_VISIBLE_STATES`) én waarvan
  `registrationStatus()` open zegt. Gebruik die bestaande pure functie; herhaal de
  regels niet.
- Antwoordvorm bij succes `{ "ok": true, "registration": { "id": … } }`, bij weigering
  `{ "error": "leesbare Nederlandse tekst" }` met een passende statuscode. De plugin
  toont die tekst letterlijk aan de bezoeker bij een verwachte situatie, dus schrijf hem
  zo dat een bezoeker er iets aan heeft: "Je bent al ingeschreven voor dit event",
  "Dit event is volzet", "Inschrijven is gesloten".

### 2. De drie dingen die stil fout gaan — hier zit het echte werk

**Dubbele inschrijving.** Odoo heeft geen unieke index op (webinar, partner). Doe vóór de
create een `search_count` op
`[[LINKED_WEBINAR,'=',eventId],[PARTNER,'=',partnerId]]`. Bestaat er al één, geef dan
409 met "Je bent al ingeschreven voor dit event" — en geen nieuwe rij.

Let op de wedloop: twee gelijktijdige verzoeken met hetzelfde adres kunnen beide de
controle passeren. Los dat op met een kortdurende slot in KV op
`evtv2:reg:{eventId}:{emailHash}` (bijvoorbeeld 30 seconden) die je zet vóór de controle
en vrijgeeft na de create. Lukt het zetten niet omdat hij al bestaat, geef dan dezelfde
409. Dit is de belangrijkste regel van deze fase.

**Dubbele contactpersoon.** `resolvePartnerByEmail` in `lib/partners.js` doet dit al
correct: zoeken met `=ilike` op het genormaliseerde adres, bij een bestaande partner
alleen lege velden aanvullen en nooit een bestaande waarde overschrijven, bij meerdere
treffers de oudste gebruiken met een chatternotitie. Hergebruik die functie ongewijzigd.
Zet `x_studio_contact_created` op de registratie op `true` als er echt een nieuwe partner
is aangemaakt — dat veld wordt in Odoo-views gebruikt.

**Capaciteit.** Bepaal de bezetting met de bestaande `getRegistrationCounts`, niet door
alle registraties op te halen. Is de capaciteit bereikt, dan 409 "Dit event is volzet".
Ook hier geldt de wedloop: gebruik hetzelfde slotmechanisme, en accepteer dat een
overboeking van één in het uiterste geval mogelijk blijft — beschrijf dat in een comment
in plaats van te doen alsof het waterdicht is.

### 3. Wat er in Odoo geschreven wordt

Op `x_webinarregistrations`, met de veldnamen uit `REGISTRATION_FIELDS`:

| Veld | Waarde |
|---|---|
| `x_name` | `"{voornaam} {naam}"`, of het e-mailadres als er geen naam is |
| `x_studio_linked_webinar` | het event-id uit het pad — **altijd gevuld** |
| `x_studio_registered_by` | de partner uit `resolvePartnerByEmail` |
| `x_studio_webinar_registratie_email` | het adres zoals de bezoeker het typte |
| `x_studio_webinar_questions` | de vraag, of leeg |
| `x_studio_registration_state` | `registered` |
| `x_studio_source` | `public_form` |
| `x_studio_contact_created` | `true` als de partner net is aangemaakt |

Schrijf de UTM-gegevens en het toestemmingsvinkje **niet** naar losse velden — die
bestaan niet en we verzinnen er geen bij. Zet ze als chatterbericht op de registratie via
`message_post`. Dat is traceerbaar en vraagt geen Studio-werk.

### 4. Inschrijvingenwerkblad in de beheer-API

| Route | Doet |
|---|---|
| `GET /api/events/:id/registrations` | gepagineerd, met `normalizePagination`. Twee Odoo-calls: één `search_read` met een expliciete veldenlijst, plus de bestaande lead-resolutie in batch. Nooit een call per rij, nooit `fields: []` |
| `POST /api/registrations/:id/attendance` | body `{ attended: boolean }`. Schrijft `x_studio_webinar_attended` én de drie auditvelden die nu wél op de registratie staan: `x_studio_attendance_updated_at`, `_updated_by`, `_update_origin` |
| `POST /api/events/:id/registrations` | handmatig toevoegen door een beheerder, `source: manual`, zelfde dubbelcontrole |
| `PATCH /api/registrations/:id` | alleen `state` wijzigen (afmelden) |

Bij de aanwezigheidsaudit: schrijf de velden in één `write` samen met de vlag, en **geen
try/catch-fallback die de auditvelden weglaat** — dat is precies de constructie waardoor
het auditspoor in v1 nooit werkte. Faalt de write, dan faalt de actie en zie je het.

### 5. UI: het inschrijvingenpaneel

Uitbreiden in `public/events-v2.html` en `public/events-v2-client.js`. Houd de bestaande
opzet: `data-action` met een centrale listener, geen inline `onclick`, geen eigen
statusberekening.

- Een sectie in het detailpaneel met het aantal en een tabel: naam, e-mail, vraag,
  aanwezig, bron, aangemaakt op
- Aanwezigheid als checkbox. **Let op de valkuil uit v1**: de centrale click-handler mag
  geen `preventDefault()` doen op een `input`, anders draait het vinkje terug en vuurt er
  geen `change`-event. De bestaande handler slaat `INPUT`, `SELECT` en `TEXTAREA` al over
  — houd dat zo.
- Paginering, en een knop om een deelnemer handmatig toe te voegen
- De lead-status per deelnemer tonen als de resolutie er een geeft, met een deeplink naar
  Odoo

## Wat je NIET doet

- Geen Supabase-tabel, geen `getSupabaseClient`
- Geen nieuwe Studio-velden verzinnen; UTM en toestemming gaan naar de chatter
- `lib/partners.js` en `lead-resolution-service.js` niet herschrijven
- De WordPress-plugin niet aanpassen: het contract is al gebouwd en getest
- Geen mails versturen — dat is fase 4
- Niets aanraken in `src/modules/event-operations/` (v1) behalve het importeren van
  `lead-resolution-service.js`
- Geen tweede migratie

## Definitie van klaar

- `node src/modules/event-operations-v2/tests/contract-test.mjs` blijft groen, met nieuwe
  tests voor de dubbelcontrole en de capaciteitsgrens
- `grep -rn "getSupabaseClient" src/modules/event-operations-v2/ --include=*.js` geeft nul code-resultaten
- `grep -rnE "'x_[a-z_]+'|\"x_[a-z_]+\"" src/modules/event-operations-v2/ --include=*.js | grep -v odoo-contract.js | grep -vE ":\s*\*|//"` geeft nul resultaten
- Een inschrijving via het echte WordPress-formulier komt in Odoo terecht **met**
  `x_studio_linked_webinar` gevuld
- Een tweede inschrijving met hetzelfde adres op hetzelfde event geeft 409 en maakt geen
  tweede rij
- Twee gelijktijdige verzoeken met hetzelfde adres leveren één registratie op
- Een bestaand contact wordt hergebruikt en zijn naam wordt niet overschreven
- Een event met capaciteit 2 en twee inschrijvingen weigert de derde
- Een aanwezigheidsklik zet de vlag én de drie auditvelden, aantoonbaar in Odoo
- Een lijst van 50 inschrijvingen kost twee Odoo-calls

Lees ook `claude.md` voor de projectregels.
