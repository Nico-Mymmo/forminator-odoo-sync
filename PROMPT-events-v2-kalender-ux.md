# Events v2: maandnavigatie + type-filter in de lijst, klik-om-aan-te-maken in de kalender, datumtijd-picker herontwerp, inschrijvingsdatums zonder uur

## Lees eerst deze bestanden voor je begint:
- `public/events-v2.html`
- `public/events-v2-client.js`
- `src/modules/event-operations-v2/routes.js`
- `src/modules/event-operations-v2/tests/contract-test.mjs`

## Context

Dit is de `/events-v2` module (Odoo is de enige database, geen server-rendering, alles via `data-action`). De kalenderweergave (FullCalendar, `dayGridMonth`) heeft al eigen prev/next-knoppen via `headerToolbar: { left: 'title', center: '', right: 'today prev,next' }` (regel ~432 in `events-v2-client.js`) — die blijven zoals ze zijn.

De lijstweergave (`#listWorkspace`) is dat kwijtgeraakt: een oudere opruiming verwijderde de hele filterbalk (zie het commentaar boven `buildQuery()`: *"De filterbalk is weg: events worden op datum opgezocht (kalender), niet meer via status/type/vorm/titel-filters"*). De backend kan filteren allang: `GET /events-v2/api/events` accepteert `state, type, format, from, to, q, include_archived, page, per_page` (zie `buildFilters()` in `routes.js` regel 113-126). Er hoeft dus **niets** aan de backend te veranderen voor dit werk — alleen `buildQuery()` in de client moet die parameters weer meesturen.

Verder staat er al een volledig werkende "nieuw event"-flow: de knop `data-action="new-event"` (in `events-v2.html` regel 372) opent `#createDialog` leeg, en `createEvent()` (regel 1392 in de client) doet de `POST /events/` en herlaadt. Die flow hergebruik je, je opent 'm alleen ook vanuit een klik op een lege kalenderdag, met de datum al ingevuld.

De datumtijd-velden in het detailpaneel gebruiken `dateTimeField()` (regel 143-160): een `<input type="date">` en een `<select>` met alle 96 kwartieren van de dag (`quarterHourOptions()`, regel 132-141), samen in een DaisyUI `.join`. Diezelfde `quarterHourOptions()` vult ook `#newStartsAtTime` in het aanmaak-dialoog. De opgeslagen waarde wordt in `collectPayload()` (rond regel 1113) samengevoegd: `payload[name] = localInputToIso(dateInput.value + 'T' + time)`, met `'00:00'` als default wanneer er geen tijd gekozen is.

`registration_opens_at` / `registration_closes_at` gebruiken vandaag dezelfde `dateTimeField()` als `starts_at` (regel 702-703) — vandaar de screenshot die Nico stuurde met een te brede, overlappende datum+tijd-combinatie voor die twee velden. Voor inschrijvingen is het uur niet relevant voor de gebruiker; het moet gewoon altijd 09:00 (openen) / 17:00 (sluiten) worden, zonder dat er een tijd-UI getoond wordt.

## Wat je implementeert

### 1. Maandnavigatie + type-filter (chips) in de lijstweergave

- Voeg een klein toolbar-rijtje toe boven de lijst-tabel (tussen de weergavewissel-kop en de `#listWorkspace`-kaart, of binnen de kaart boven `#listSummary` — kies wat visueel het netst aansluit bij de bestaande kop-balk).
- **Maandnavigatie**: twee chevron-knoppen (`chevron-left` / `chevron-right`, lucide-iconen zoals de rest van de UI) rond een label met de huidige maand (bv. "september 2026"). Bewaar de actieve maand in `state` (bv. `state.listMonth`, een `Date` of `{year, month}`-object, default de huidige maand in Brussels-tijd).
  - `data-action="list-month-prev"` en `data-action="list-month-next"`, afgehandeld in de centrale click-listener (rond regel 1429), net als `page-prev`/`page-next`.
  - **Nooit vroeger dan de huidige maand**: de "vorige"-knop wordt `disabled` zodra `state.listMonth` op de huidige kalendermaand staat (vergelijk in Brussels-tijd, niet browsertijdzone — gebruik dezelfde `Intl.DateTimeFormat`-aanpak als `isoToLocalInput()`). Dit is bewust anders dan de kalenderweergave, die je gewoon in het verleden mag laten bladeren.
  - Bij wisselen van maand: bereken `from`/`to` (eerste en laatste dag van de maand, ISO) en geef die mee aan `buildQuery()`, reset `state.page = 1`, herlaad.
- **Type-filter als chips**, rechtsboven in diezelfde balk: geen `<select>`, maar een rij toggelbare chips — één per item uit `state.types` (al geladen via `loadTypes()`). Gebruik DaisyUI `badge`/`btn btn-xs` toggle-stijl (`btn-active` of een eigen `is-active`-klasse wanneer aan), consistent met de bestaande badge-kleuren per type (zie `typeStyle()` / `state.typeColorById`, gebruikt door de kalender — hergebruik die kleuren voor de chip-achtergrond zodat kalender en lijst dezelfde kleurtaal spreken).
  - Meerdere types tegelijk aan mogen (`state.listTypeFilter = Set` van type-ids). Klik op een chip toggelt 'm.
  - Let op: de backend-filter `type` in `buildFilters()` accepteert momenteel maar **één** id (`Number.parseInt(p.get('type'), 10)`). Met meerdere aangevinkte chips heb je twee opties: (a) client-side na de fetch filteren op `state.events` wanneer er >1 chip actief is, of (b) de backend-route uitbreiden naar een kommagescheiden lijst. Kies (a) tenzij je toch al in `routes.js` zit — geen backend-wijziging is de veiligere, kleinere patch.
  - `renderList()` moet met de actieve chips rekening houden vóór het renderen van de rijen.

### 2. Nieuw event aanmaken door op een lege kalenderdag te klikken

- Voeg `dateClick`-callback toe aan de FullCalendar-config (naast het bestaande `eventClick`, regel ~433-448). FullCalendar's `dateClick` triggert al alléén op een klik op de dagcel zelf (niet op een event erin), dus geen extra logica nodig om "leeg" te detecteren.
- In de handler: vul `#newStartsAtDate` (en eventueel `#newStartsAtTime` op een zinnig default zoals `10:00`) met de aangeklikte datum, dan `el('createDialog').showModal()` — exact dezelfde weg als de bestaande `case 'new-event':` (regel ~1495), alleen met de datum al ingevuld in plaats van leeg.
- Industry-standard UX-details om mee te nemen: geen klik toestaan op dagen in het verleden (FullCalendar's `validRange` of een check in `dateClick` die gewoon `return` doet vóór je het dialoog opent), en een `cursor: pointer` + lichte hover-highlight op dagcellen in de toekomst zodat het duidelijk is dat je erop kan klikken (dit kan puur CSS zijn, `.fc-daygrid-day:not(.fc-day-past):hover`).

### 3. Datumtijd-picker herontwerp

Dit raakt `dateTimeField()` en `quarterHourOptions()` in de client, en de bijbehorende CSS in `events-v2.html`.

- **Overlap oplossen**: de screenshot toont het `.join`-groepje (date-input + tijd-select) dat breder is dan zijn kolom, waardoor het over het "Duur (min)"-veld ernaast valt. `dateTimeField()`/`field()` staan waarschijnlijk in een grid met vaste kolombreedtes (`grid grid-cols-2` ofzo, zoek de omliggende markup rond regel 660-703) — geef het datum+tijd-blok `min-width: 0` en `flex: 1 1 auto` op de children zodat het krimpt in plaats van overduwt, en test met een brede tijdselectie (uren-select + minuten-select samen zijn breder dan de oude enkele HH:MM-select, zie volgende punt).
- **Volledige omlijning i.p.v. een stukje**: nu heeft (vermoedelijk) alleen het `<input type="date">` een `input-bordered`-rand en oogt de `<select>` los. Zet een rand om het hele `.join`-blok (`border border-base-300 rounded-lg` op de wrapper-`div.join`) en haal de individuele randen van de losse velden weg (of maak ze consistent) zodat het visueel één component is, zoals in de gewenste screenshot.
- **Uren en kwartieren splitsen**: vervang de ene `quarterHourOptions()`-select door twee aparte `<select>`'s — één voor het uur, één voor het kwartier (`:00 / :15 / :30 / :45`). Sneller scannen en kiezen dan door 96 gecombineerde opties bladeren. Pas `dateTimeField()` aan om beide te renderen (`data-dt-hour-for="name"` / `data-dt-minute-for="name"`), en pas het verzamelpunt in `collectPayload()` (regel ~1113-1119) aan om beide select-waarden samen te voegen tot `HH:MM` vóór `localInputToIso()`. Doe hetzelfde voor het aanmaak-dialoog (`#newStartsAtTime` wordt `#newStartsAtHour` + `#newStartsAtMinute`).
- **Geen 00:00–08:00**: events beginnen en eindigen nooit midden in de nacht. Laat de uren-select starten bij `08` i.p.v. `00` (pas de lus in de nieuwe uren-generator aan: `for (var h = 8; h < 24; h += 1)`). Denk vanuit de gebruiker: dit geldt voor start- én eindtijd van een event — niet voor iets waar een middernachtwaarde wél zinnig kan zijn, dus check even of er ergens anders (bv. een cutoff-tijdstip) dezelfde helper hergebruikt wordt voor iets waar 00:00–08:00 wél moet kunnen. Voor zover nu bekend is `quarterHourOptions()` alleen in gebruik voor event start-/eindtijden, dus dat is waarschijnlijk geen probleem — even bevestigen met een grep op de functienaam voor je 'm aanpast.

### 4. Inschrijvingen openen/sluiten: alleen datum, geen uur

- Nieuwe helper `dateOnlyField(label, name, isoValue)` naast `dateTimeField()`: rendert alleen het `<input type="date">` met `data-dt-date="name"`, geen tijd-select erbij, geen `.join` nodig.
- Gebruik die voor `registration_opens_at` en `registration_closes_at` (regel 702-703) in plaats van `dateTimeField()`.
- In `collectPayload()` (het blok dat `[data-dt-date]` doorloopt, regel ~1113-1119): wanneer er voor een datumveld géén bijbehorende `[data-dt-time-for]`-select bestaat (dat is voortaan het geval voor deze twee velden), val niet terug op `'00:00'` maar op een vast tijdstip per veldnaam: `09:00` voor `registration_opens_at`, `17:00` voor `registration_closes_at`. Een kleine lookup-map (`{ registration_opens_at: '09:00', registration_closes_at: '17:00' }`) met `'00:00'` als algemene fallback voor de rest is voldoende — geen aparte functie nodig.
- Zorg dat dit ook geldt voor het weergeven: als `isoToLocalInput()` de datum uit een bestaande `registration_opens_at`/`_closes_at` haalt, toon dan gewoon de datum in het `<input type="date">`, de tijd wordt genegeerd in de UI (die stond er toch al vast op 09:00/17:00 als het via deze weg is aangemaakt; oudere records met een afwijkend uur tonen gewoon hun datum, en krijgen bij de eerstvolgende save automatisch 09:00/17:00 — dat is acceptabel, geen migratie nodig).

## Wat je NIET aanraakt

- De kalenderweergave se eigen `prev`/`next`/`today`-knoppen (regel ~432): die blijven ongewijzigd, mogen ook gewoon naar het verleden bladeren.
- De backend-routes in `src/modules/event-operations-v2/routes.js` — `buildFilters()` ondersteunt al alles wat nodig is voor de maand- en type-filter in de lijst. Wijzig deze file alleen als je bewust kiest voor optie (b) bij de meerdere-types-filter (zie boven), en dan zo minimaal mogelijk.
- `dateTimeField()`/`quarterHourOptions()` mogen intern veranderen (opsplitsen in uur+kwartier), maar de opgeslagen ISO-waarden en het `data-dt-date`-contract met `collectPayload()` moeten compatibel blijven met alle andere velden die deze helper gebruiken (bv. `ends_at`, als dat er ook is — grep even na).
- De legacy `event-operations` (v1) module en `public/event-operations-client.js` — dit werk is uitsluitend voor `event-operations-v2` / `events-v2*`.
- `src/modules/event-operations-v2/tests/contract-test.mjs` leest `public/events-v2-client.js` en `public/events-v2.html` als tekst voor contract-checks — run die test na je wijzigingen om te zien of je niets breekt dat het contract bewaakt.

Lees ook `CLAUDE.md` voor de projectregels.
