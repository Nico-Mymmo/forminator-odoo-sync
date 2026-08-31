# Event Operations v2 — het ⋯-menu doet niets, en wat er daarna nog openstaat

## Lees eerst

- `public/events-v2-client.js` — vooral `renderDetail` (de actiebalk rond r. 688-710) en
  de klikdelegatie (r. 1320-1387)
- `public/events-v2.html` — de DaisyUI-versie op r. 19
- `src/modules/event-operations-v2/lib/events-service.js` — `setEventActive`, `deleteEvent`
- `src/modules/event-operations-v2/routes.js` — de archive/unarchive/delete-routes (r. 259-270)
- `src/modules/event-operations-v2/tests/contract-test.mjs` — hier komt de regressietest bij
- `CLAUDE.md` — de projectregels

## Het gerapporteerde probleem

"Als ik op archiveren druk gebeurt er niets."

## De oorzaak — nagekeken, niet vermoed

Ga dit niet opnieuw uitzoeken. Het is dit, en het is één regel.

In `public/events-v2-client.js` r. 692-694 staat de ⋯-dropdown:

```js
'<div class="dropdown dropdown-top dropdown-end ml-auto">' +
  '<button class="btn btn-sm btn-ghost btn-square" tabindex="0">⋯</button>' +
  '<ul class="dropdown-content menu menu-sm bg-base-100 rounded-box ...">' +
```

De `<ul class="dropdown-content">` heeft **geen `tabindex="0"`**.

DaisyUI 4 (hier 4.12.14, via de CDN in `events-v2.html` r. 19) opent en sluit zijn
dropdown puur met CSS, op `:focus` en `:focus-within` van de container. Het openhouden
gebeurt dus doordat de focus *binnen* de dropdown blijft.

Wat er nu gebeurt als je op een menu-item klikt:

1. `mousedown` op het `<li><a>`
2. die `<a>` heeft geen `href` en geen `tabindex`, dus hij is niet focusbaar
3. de focus verlaat daarmee de `<button>` en gaat naar `<body>`
4. `:focus-within` op de container vervalt, en de CSS verbergt `.dropdown-content`
5. `mouseup` landt op een element dat niet meer zichtbaar is
6. de browser vuurt daarom **geen `click`** — de delegatiehandler op r. 1320 wordt nooit
   bereikt

De handler zelf is in orde, de route bestaat, `setEventActive` werkt, `x_active` bestaat
op `x_webinar` (nagekeken: `ir.model.fields` id 13126, boolean). Er is niets stuk aan de
serverkant. Het `click`-event komt simpelweg nooit tot stand.

**Dit raakt alle vijf de items in dat menu**, niet alleen archiveren: Dupliceren,
Publieke JSON, Annuleren, Archiveren/Terughalen en Verwijderen. Ze hebben nooit gewerkt.
Dat verklaart ook een eerdere melding van Nico dat hij events niet kon verwijderen in de
OM — er is toen aan de verkeerde kant gezocht en de backend is gerepareerd terwijl de
knop het probleem was.

Elke andere module in deze codebase doet het wél goed. Vergelijk:

- `public/forminator-sync-v2.html` r. 100: `<ul tabindex="0" class="dropdown-content ...">`
- `public/event-operations-client.js` r. 295: idem
- `public/detail-panel-controller.js` r. 600: idem
- `public/mini-apps.html` r. 198 en 365: idem op een `<div>`

## Wat je implementeert

### 1. De dropdown klikbaar maken

Zet `tabindex="0"` op de `.dropdown-content` in `renderDetail`. Zet er een korte comment
bij die zegt *waarom* — dat DaisyUI's dropdown focusgedreven is en het item zonder dit
attribuut de focus verliest voor de klik landt. Anders wordt dit bij een volgende
herschrijving weer weggelaten; dat is precies hoe het is ontstaan.

Los dit op met dat attribuut. Bouw er **geen** JavaScript omheen: geen `mousedown`-
handler, geen `preventDefault`, geen eigen open/dicht-logica. Het is een ontbrekend
attribuut, geen ontbrekende functionaliteit.

### 2. Het menu sluiten na een actie

Met `tabindex="0"` blijft de focus na een klik binnen de dropdown, dus het menu blijft
open staan. Dat leest als "er gebeurde niets", ook als de actie wél gelukt is.

Sluit het menu aan het begin van de delegatiehandler, zodra vaststaat dat er een
`data-action` geraakt is die uit een dropdown komt: `document.activeElement.blur()`.
Doe het één keer centraal in die handler, niet per `case`.

Let op de dialogen: `blur()` mag het openen van `removeDialog` of `composerDialog` niet
verstoren. Controleer dat het keuzevenster nog opengaat via ⋯ → Verwijderen.

### 3. Zichtbare terugkoppeling bij archiveren

`archiveEvent` doet al een `toast(...)`, maar controleer of die ook echt verschijnt en of
het paneel klopt na de actie:

- na archiveren verdwijnt het event uit de lijst (het filter "Gearchiveerd" staat
  standaard uit) — dat mag, maar het geselecteerde paneel moet dan de gele
  "Dit event is gearchiveerd"-balk met de knop **Terughalen** tonen, niet leeg vallen
- `state.detail = result.payload.data` — controleer dat de DTO `active: false` teruggeeft
  na archiveren, want de banner en het menu-item hangen daaraan
- na terughalen verschijnt het event weer in de lijst

Als het paneel na archiveren leeg valt terwijl het event nog geselecteerd is, herstel dat
dan: een gearchiveerd event moet je kunnen blijven bekijken, anders kan je het niet
terughalen zonder eerst het filter aan te zetten.

### 4. Een regressietest, zodat dit niet terugkomt

Voeg aan `src/modules/event-operations-v2/tests/contract-test.mjs` een statische test toe
die `public/events-v2-client.js` en `public/events-v2.html` inleest en faalt als er een
`class="...dropdown-content..."` in voorkomt zonder `tabindex="0"` op hetzelfde element.

Dat is een grove test, en dat is hier precies goed: het is een CSS-contract dat je niet
in een unit-test kan nabootsen, en de fout is onzichtbaar tot iemand handmatig klikt.

Voeg in dezelfde test ook toe: elke `data-action`-waarde die in
`public/events-v2-client.js` of `public/events-v2.html` voorkomt, heeft een bijhorende
`case` in de delegatiehandler, en elke `case` wordt ergens gebruikt. Dat vangt de andere
regressie die in dit bestand herhaaldelijk is opgetreden — een actie die bij een
herschrijving zijn handler kwijtraakte.

## Openstaande punten in deze module

Deze zijn nagekeken tegen de live Odoo. Pak ze in deze volgorde aan, ná punt 1 t/m 4.

### A. Zes actieve events zonder host — twee daarvan staan gepubliceerd

`x_studio_user_id` is leeg op de events 28, 76, 81, 84, 86 en 94. De host is de afzender
van de mails, dus zonder host falen de Odoo-mailtemplates. Stand van zaken:

| id | naam | stage |
|---|---|---|
| 28 | Infosessie Verenigde Eigenaars x OpenVME | Done |
| 76 | Q&A Syndicoach: vragen over mede-eigendom | **Published** |
| 81 | Live Syndicoach event: Een kleine VME beheren | Draft |
| 84 | Salon van mede-eigendom | Draft |
| 86 | Opleidingssessie en Q&A | **Published** |
| 94 | Dit is weer een test2 | Draft |

Sinds kort is een host verplicht om te publiceren, dus dit kan niet meer nieuw ontstaan —
maar 76 en 86 stonden al gepubliceerd voor die regel bestond. Ze hebben ook geen slug,
dus ze komen niet in de publieke lijst en worden nog door The Events Calendar bediend.

Wat jij doet: **niets wijzigen in de data.** Meld dit aan Nico met deze tabel, zodat hij
de host in Odoo kan zetten. Bouw wel iets zichtbaars: laat de OM in het detailpaneel
waarschuwen als een gepubliceerd event geen host heeft, in plaats van dat dit pas blijkt
uit een gefaalde mail.

### B. `x_studio_linked_webinar` staat nog op `set null`

Nagekeken: `ir.model.fields` id 13199, `on_delete = "set null"`. Het advies was
`restrict`, zodat Odoo een harde ondergrens vormt en een event met inschrijvingen nergens
in Odoo stil verwijderd kan worden. De expliciete twee-staps-cascade in `deleteEvent`
blijft werken met `restrict`, want die verwijdert eerst de kinderen.

Dit is een instelling in Odoo, geen code. Meld het; wijzig het niet.

### C. Geen cron die `published` → `done` zet

Er is niets dat een event na zijn einddatum automatisch afsluit. Dat betekent dat
afgelopen events als `published` blijven staan en in de publieke lijst blijven, en dat
"Afgerond" een handmatige actie is die iemand moet onthouden.

Bouw een cron-tak in de bestaande `scheduled`-handler, in de stijl van
`src/modules/cx-automations/cron.js`. Eisen:

- alleen events met stage `published` waarvan de berekende einddatum voorbij is —
  gebruik `computeEndsAt` uit `odoo-contract.js`, verzin geen tweede berekening
- één `search_read` en één `write` over alle betrokken ids, niet één call per event
- log wat er omgezet is, en zet een chatterbericht op elk event via `logToChatter`
- schakelbaar via een env-variabele, zodat het zonder deploy uit kan

### D. Inschrijven doet ~5 Odoo-calls op een rij

In `registrations-service.js` gebeuren de partner-lookup en de duplicaatcontrole na
elkaar terwijl ze niet van elkaar afhangen. Parallelliseren scheelt ongeveer 300 ms op
het versturen van een inschrijving.

Let op de bestaande racebeveiliging: na het aanmaken wordt met
`findExistingRegistration` gecontroleerd of iemand anders voor was, en zo ja wordt de
eigen registratie weer verwijderd. Die controle moet blijven staan en moet ná het
aanmaken blijven gebeuren. Parallelliseer alleen wat er vóór gebeurt.

## Wat je NIET aanraakt

- **De 74 events zonder slug.** Nico heeft backward compatibility uitdrukkelijk
  uitgesteld: "Nog geen backward compatability. Dat komt. Eerst zorgen dat de flow werkt
  voor NIEUWE events." Geen backfill, geen slug-generatie voor bestaande events.
- `src/modules/event-operations/` — de v1-module. Die blijft draaien tot v2 volledig is.
- Niets in Supabase voor deze module. Odoo is de enige database; dat is een harde eis van
  Nico. De migratie `20260831081157_event_operations_v2_module.sql` registreert alleen de
  module en heeft daar een comment over.
- `odoo-contract.js` is de enige plek waar `x_`-veldnamen mogen staan. Zet nergens anders
  een veldnaam hard in de code.
- De WordPress-plugin. Er is hier geen pluginwijziging nodig.
- Geen nieuwe velden in Odoo aanmaken. Vraag erom als je er een nodig hebt.

## Definitie van klaar

- Alle vijf de items in het ⋯-menu doen wat ze zeggen. Klik ze één voor één na; dit is de
  kern van de opdracht en de reden dat het eerder is misgegaan.
- Archiveren laat het event uit de lijst verdwijnen, toont de gele balk in het paneel, en
  Terughalen zet het terug.
- Het menu staat na een klik niet meer open.
- De statische test faalt als iemand `tabindex="0"` op een `dropdown-content` weghaalt,
  en faalt als een `data-action` geen handler heeft.
- `node src/modules/event-operations-v2/tests/contract-test.mjs` is groen.
- `npx wrangler deploy --dry-run` bouwt zonder fout.
- Een gepubliceerd event zonder host is zichtbaar als probleem in de OM.
- Afgelopen gepubliceerde events worden automatisch `done`.

Lees ook `CLAUDE.md` voor de projectregels.
