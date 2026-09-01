# Mymmo Events

Kalender, eventpagina's en inschrijvingen op WordPress, rechtstreeks uit de
OpenVME Operations Manager.

## Het uitgangspunt

Er wordt in WordPress **niets** over events bewaard: geen custom post type,
geen eigen tabellen, geen kopie van de records. De Operations Manager is de
enige bron, met Odoo als database daarachter.

Wat wel lokaal staat is een **cache in twee lagen**: een korte transient voor
de snelheid, plus een last-known-good in een option als vangnet. Valt de API
weg, dan blijft de kalender staan. Omdat er maar een bron is, kan er niets uit
elkaar lopen — dat was precies het probleem met de vorige opzet, waar events
in WordPress gedubbeld werden en hun eigen levenscyclus kregen.

## Installeren

1. Upload de map `mymmo-events` naar `wp-content/plugins/`, of upload de zip
   via Plugins → Nieuwe plugin.
2. Activeer de plugin. De rewrite rules worden meteen doorgespoeld.
3. Ga naar **Instellingen → Mymmo Events** en vul in:
   - **API-URL** — de basis-URL van de Operations Manager, zonder pad
   - **Sitesleutel** — moet overeenkomen met een waarde uit
     `EVENTS_PUBLIC_SITE_KEYS` in de Worker
4. Klik **Verbinding testen**.

Zet in de Worker ook `EVENTS_PUBLIC_ORIGINS` op het domein van de site.

## URL's

| Pad | Wat |
|---|---|
| `/events/` | archief, met de shortcodes op een gewone pagina |
| `/event/{slug}/` | eventpagina |
| `/event/{slug}/ics/` | agendabestand |

Dit is **exact de vorm die The Events Calendar vandaag gebruikt**, dus
bestaande links en zoekresultaten blijven werken. Oude links dragen
`?owid={odoo_id}` mee; vindt de slug niets, dan valt de plugin op dat id terug
en stuurt hij met een 301 door naar de actuele URL.

Laat het pad op `event` staan. Wijzig je het toch, sla dan de permalinks
opnieuw op (Instellingen → Permalinks).

### Naast The Events Calendar

De plugin **claimt geen URL's**. Hij registreert geen rewrite rules en komt alleen in actie
als WordPress zelf niets vindt op `/event/{slug}/`:

- bestaat er nog een The Events Calendar-pagina? die blijft, ongewijzigd
- bestaat die niet, maar kent de Operations Manager het event? dan rendert deze plugin
- kent niemand het? dan blijft het een gewone 404

Daardoor kan je de plugin gerust activeren op een live site: er valt niets te breken en er
hoeven geen permalinks bewaard te worden. Deactiveer je The Events Calendar later, dan neemt
de Operations Manager die URL's automatisch over.

## Shortcodes

```
[mymmo_events_calendar]
[mymmo_events_calendar month="2026-09" type="3" format="online"]

[mymmo_events_list]
[mymmo_events_list limit="6" layout="cards" show_past="1"]

[mymmo_event]
[mymmo_event slug="q-and-a-syndicoach"]

[mymmo_events_announcement]
[mymmo_events_announcement scribble_1="events/components/scribbles-scribbles-40-2.svg"]
```

`type` is het Odoo-id van het event type, `format` is `online`, `onsite` of
`hybrid`. `[mymmo_event]` zonder slug haalt die uit de URL, zodat dezelfde
shortcode op de detailpagina werkt.

`[mymmo_events_announcement]` toont het event dat in de Operations Manager op
"Highlighten" staat (Basis-veld `x_studio_priority`), of bij gebrek daaraan
gewoon het eerstvolgende. Twee CTA's: inschrijven/meer info en "Bekijk onze
andere events" (naar de archiefpagina). De drie `scribble_*`-attributen
wijzen naar bestanden in de asset manager (bv.
`events/components/scribbles-scribbles-40-2.svg`) voor de decoratieve
accenten; overschrijf ze in de shortcode als je andere bestanden wil, geen
code-aanpassing nodig.

De kalender werkt **zonder JavaScript**: de maandnavigatie zijn gewone links
met `?mymmo_month=`. Het JS voegt alleen comfort toe — pijltjestoetsen,
dubbel verzenden blokkeren, focus op de melding na een inschrijving.

## Vormgeving

Alle kleuren en maten staan als custom properties op `.mymmo-ev`. Overschrijf
ze in je thema, dan hoeft deze plugin niet aangepast te worden:

```css
.mymmo-ev {
  --mymmo-ev-accent: #0d9488;
  --mymmo-ev-accent-soft: #99f6e4;
  --mymmo-ev-accent-ink: #0369a1;
  --mymmo-ev-radius: 10px;
}
```

Typografie wordt **geërfd van het thema**. De plugin laadt zelf geen fonts, dus
de koppen blijven in Gelica en de tekst in Rethink Sans staan.

Elke template is overschrijfbaar vanuit het thema. Kopieer het bestand naar
`{jouw-thema}/mymmo-events/` en pas het daar aan:

```
templates/calendar.php
templates/list.php
templates/single.php
templates/registration-form.php
templates/partials/event-card.php
```

## Wat de plugin niet doet

- geen events schrijven of wijzigen; alleen lezen, plus inschrijvingen doorsturen
- geen rechtstreekse verbinding met Odoo of Supabase
- geen eigen accounts of login voor deelnemers
- de sitesleutel komt nooit in de HTML: het formulier post naar
  `admin-post.php` en PHP praat met de API

## Bij problemen

**De kalender is leeg.** Alleen gepubliceerde en afgeronde events zijn
publiek. Staat een event in de Operations Manager op Concept, dan hoort het er
niet te staan. Een event heeft ook een slug nodig.

**Een melding dat de kalender niet ververst is.** De plugin kon de API niet
bereiken en toont de laatst bekende versie. Controleer de API-URL en de
sitesleutel met **Verbinding testen**.

**Een gewijzigd event komt niet door.** De cacheduur staat standaard op 300
seconden. Klik **Cache leegmaken** om het meteen te zien.

**Een 404 op `/event/{slug}/`.** Sla de permalinks opnieuw op.

Zet `WP_DEBUG` aan om de fouten in `debug.log` te zien; alles wordt gelogd met
het voorvoegsel `[mymmo-events]`.

## Bijwerken

Upload de nieuwe zip via Plugins → Nieuwe plugin → Plugin uploaden. WordPress ziet dat de
plugin al bestaat en biedt **Vervang huidige met geüploade** aan. Je instellingen blijven
staan: die zitten in de database, niet in de bestanden.

Ga daarna één keer naar Instellingen → Permalinks en klik Opslaan. Dat is alleen nodig als
je *Detailpagina's overnemen* aan hebt staan, maar het kan nooit kwaad.

## Versies

**1.6.12**
- Nieuw REST-endpoint `/wp-json/mymmo-events/v1/reload?token=...` dat de volledige cache
  (transients + last-known-good) in een keer leegmaakt. Beveiligd met een token
  (`mymmo_events_reload_token`, in te stellen bij Instellingen → Mymmo Events -- daar staat
  ook de kant-en-klare Reload-URL en een knop om een nieuw token te genereren), niet met een
  WordPress-login: dit moet zowel als knop vanuit de Operations Manager werken als als
  server-naar-server-aanroep, en geen van beide heeft een ingelogde sessie.
- De vorige aanpak (een JS-timer die periodiek op de achtergrond pollde) is bewust NIET
  aangehouden -- te veel overhead voor een tabblad dat gewoon open staat. De normale
  60s-cache (`mymmo_events_cache_ttl`) blijft gewoon zoals hij was: bij elke nieuwe
  paginalading wordt gecontroleerd of de cache ouder is dan de ingestelde tijd, en zo ja
  opnieuw opgehaald. Dat werkte altijd al correct; het enige wat ontbrak was een manier om
  daar niet op te hoeven wachten.
- Event Operations (de Cloudflare Worker) roept deze reload-URL nu automatisch aan
  (`src/modules/event-operations-v2/lib/wp-reload.js`) net na elke schrijfactie op een event
  (aanmaken, wijzigen, publiceren/depubliceren, archiveren, verwijderen, hero-afbeelding) --
  ná de eigen KV-cache-invalidatie van de Worker, als een fire-and-forget seintje via
  `ctx.waitUntil()`. Zo is een wijziging in de Operations Manager meteen zichtbaar op de
  website in plaats van tot 60 seconden te wachten. Configuratie gebeurt met het
  Worker-secret `EVENTS_WP_RELOAD_WEBHOOKS` (kommagescheiden lijst van volledige reload-URL's
  incl. token, één per WordPress-site) -- ontbreekt dat secret, dan gebeurt er gewoon niets;
  geen gekoppelde site is een geldige toestand. Mislukt een aanroep (timeout, foutstatus),
  dan wordt dat enkel gelogd: Odoo blijft de bron van waarheid en de gewone 60s-cache vangt
  het sowieso op.

**1.6.11**
- Aankondiging (`mymmo_events_announcement`): de kaartjes achter de hoofdkaart lagen bij
  rotatie 0 exact op elkaar, want ze deelden dezelfde `inset: 0`-box en verschilden enkel in
  hoek, rond hetzelfde middelpunt. Elk kaartje heeft nu een eigen `transform-origin` (licht
  naast het midden, elk anders) en een kleine `translate()` vóór de rotate, zodat het een
  losse, nonchalant neergelegde stapel blijft ook als je de hoeken zou platzetten.
- De pijl + het label ("Schrijf je snel in") draaien nu mee wanneer je over de bovenste kaart
  hovert, met een pivot op het echte, gemeten middelpunt van de kaart (`announcementHover()`
  in `mymmo-events.js`) -- niet een vaste CSS-waarde, want de kaart is fluid-width en de pijl
  staat op vaste offsets. Zo lijkt de pijl aan de kaart vast te hangen in plaats van los in de
  hoek te blijven staan. De vaste basishoeken uit 1.6.4 blijven behouden; de hover voegt er
  een kleine rotatie bovenop toe.
- Diezelfde hover laat ook de achterliggende kaartjes zeer licht meebewegen (een fractie van
  een graad/pixel), zodat de stapel oogt alsof je 'm even oppakt.

**1.6.10**
- De eerste keer dat een bezoeker naar een nieuwe maand bladert, was die maand nog nooit
  opgehaald en dus altijd traag (een nieuwe live aanvraag), ook al ging elke daaropvolgende
  wissel tussen al bezochte maanden vlot. Vanaf nu haalt de shortcode bij het laden van de
  pagina in ÉÉN aanvraag meteen alle events op van deze maand tot 12 maanden verderop
  (`fetch_horizon_events()`), en rendert hij bij diezelfde laadbeurt ook alle maanden in dat
  bereik mee in de pagina -- verborgen, op de gevraagde maand na (`[data-month-slot]`).
  Vorige/volgende maand is binnen dat bereik daardoor pure DOM tonen/verbergen in
  `mymmo-events.js`: geen enkele aanvraag meer, dus geen wachttijd, ook niet de eerste keer.
- Economischer voor de Operations Manager, niet minder: elke bezoeker (voor dezelfde
  maandreeks en dezelfde filters) doet exact dezelfde aanvraag, die dus uit de gedeelde
  60-seconden-cache van `Mymmo_Events_Api_Client` komt in plaats van dat elke bezoeker zijn
  eigen, verse Odoo-aanvraag triggert. Voor normaal bladergedrag (tot 12 maanden vooruit)
  kost een volledige sessie zo hooguit één live aanvraag per 60 seconden, gedeeld door alle
  bezoekers samen -- niet één aanvraag per bezoeker per maand.
- Bladert iemand toch verder dan 12 maanden vooruit (zeldzaam), dan valt dit terug op de
  bestaande REST-aanvraag per maand (`class-rest.php`), zoals in 1.6.7.
- `mymmo-events.js` is hierop aangepast: `applyVisibility()` en `syncChips()` werken nu per
  maand-slot (anders zou een lege maand meetellen met een gevulde), en de pijltjestoetsen
  richten zich op de zichtbare maand-slot in plaats van de eerste in de broncode.

**1.6.9**
- Grote snelheidswinst voor een pagina met zowel `[mymmo_events_calendar]` als
  `[mymmo_events_list]` voor dezelfde maand (zoals nu het geval is): de lijst vraagt
  voortaan exact hetzelfde raster op als de kalender (maandag t/m zondag, met een paar
  dagen uit de buurmaanden erbij -- die worden er voor de weergave weer uitgefilterd,
  enkel de shortcode-`limit` wordt na het filteren toegepast). Omdat from/to/type/format/
  limit dan identiek zijn, komt de TWEEDE van de twee (calendar of list) uit het
  per-request geheugen of de transient-cache van `Mymmo_Events_Api_Client`, in plaats van
  zelf nog eens live naar de Operations Manager te gaan. Op zo'n pagina halveert dat het
  aantal live aanvragen per laadbeurt en per maandwissel.

**1.6.8**
- Regressie uit 1.6.7 gefixt: zonder een vastgezet `type`-attribuut stuurde de kalender/
  lijst de VOLLEDIGE lijst type-id's mee als filter naar de API (bedoeld om "alles" te
  betekenen). Twee gevolgen: `get_event_types()` garandeert geen vaste volgorde, dus elke
  wisselende volgorde was een andere cache-key -- permanente cache-misses, dus een trage
  eerste load EN een trage maandwissel; en miste die lijst een type-id dat een event wél
  had, dan viel dat event stil weg terwijl "geen filter" net alles hoort te tonen. Nu wordt
  bij een niet-vastgezet type helemaal geen `type`-parameter meer meegestuurd (zoals vóór
  1.6.7) -- de chips filteren toch al clientside op de ongefilterde data.

**1.6.7**
- De type-filter chips en de maandnavigatie wisselen nu clientside, zonder de pagina te
  herladen: een klik op een chip toont/verbergt gewoon wat al op de pagina staat, en een
  klik op vorige/volgende maand haalt enkel die maand op via een nieuw REST-endpoint
  (`/wp-json/mymmo-events/v1/calendar` en `/list`), 60 seconden clientside gecached. Zonder
  JavaScript blijven het gewoon links die de pagina herladen -- dat vangnet staat er nog.
- Chips staan nu standaard allemaal actief (filteren dus nog niets), in plaats van visueel
  uit te staan terwijl toch alles getoond werd. Ze staan bovendien rechts in de balk,
  kleiner, en filteren enkel de kalender/lijst waar ze bij horen -- niet meer de hele
  pagina als er twee shortcodes naast elkaar staan.
- `[mymmo_events_list]` toont voortaan een MAAND tegelijk, met dezelfde vorige/volgende-
  navigatie als de kalender, in plaats van kaal de eerstvolgende N events. Nieuw attribuut
  `month`; `show_past` staat nu toe om ook voorbij de huidige maand terug te bladeren.

**1.6.6**
- `[mymmo_events_calendar]`: bladert niet meer terug voor de huidige maand (de pijl staat er
  dan niet meer, en een handmatig aangepaste `?mymmo_month=` in de URL wordt teruggezet).
  Nieuw: togglebare chips om op event type te filteren, zonder JavaScript (`?mymmo_type=`,
  komma-lijst van type-id's) -- enkel zichtbaar als het `type`-attribuut van de shortcode
  zelf leeg is, anders staat die al vast.
- `[mymmo_events_list]`: dezelfde chips-filter als de kalender, zelfde voorwaarde.

**1.6.0**
- `[mymmo_events_announcement]` herwerkt na feedback: geen shortcode-attributen meer (vaste
  huisstijl-component). Het klavertje wordt nu inline als SVG met een eigen kleur getekend
  (de bronillustratie was zelf bijna wit en de asset-host stuurt geen CORS-headers, waardoor
  een CSS mask-image er stil faalde) en staat groot achter de hele kaartenstapel. De
  kaartjes erachter zijn nu exact even groot als de hoofdkaart (enkel anders gedraaid, als
  een neergelegde stapel speelkaarten) in plaats van losse kaartjes met een eigen maat. De
  illustratie is groter en de samenvatting krijgt een vaste hoogte van 4 regels met
  gereserveerde witruimte ernaast.

**1.5.0**
- Nieuwe shortcode `[mymmo_events_announcement]`: een speelse aankondiging-callout voor het
  gehighlighte event (nieuw Basis-veld in de Operations Manager, "Highlighten") of, bij
  gebrek daaraan, het eerstvolgende. Twee CTA's (inschrijven/meer info, en naar de
  archiefpagina), met een paar aankomende events er lichtjes gedraaid achter als
  kaartenstapel en decoratieve scribbles uit de asset manager.

**1.4.1**
- Opgelost: `/event/{slug}/ics/` gaf ERR_INVALID_RESPONSE. WordPress had voor de 404 al
  status 404 en `Content-Type: text/html` klaargezet, en een bestand met een tegenstrijdig
  type en status is voor de browser een ongeldige respons. Nu eerst status 200, alle
  openstaande buffers weg, en een expliciete Content-Length.

**1.4.0**
- Feitenlabels ("WANNEER", "WAAR") stonden nog verkeerd: het thema zette de label-span op
  volle breedte met het icoon links en de tekst rechts. De iconen zijn eruit en de labels
  zijn gewone blocks — geen thema kan daar nog tussen komen.
- De inschrijfknop staat weer op één regel, met het pijltje achter de tekst in plaats van
  eronder. Defensief tegen thema's die `button` op display:block zetten.
- Het vraagveld ("Heb je al een vraag?") is nu per event aan of uit te zetten in de
  Operations Manager. Vraagt het Odoo-veld `x_studio_ask_question` (boolean); ontbreekt dat,
  dan staat het veld aan zoals voorheen.
- "Toevoegen aan agenda" is uit de voetregel gehaald en verschijnt nu in de bedankboodschap
  na een geslaagde inschrijving — dan is het pas nuttig.

**1.3.0**
- Eventpagina opnieuw opgezet. Vier fouten opgelost: de titel en de samenvatting stonden er
  dubbel (thema plus template), de hero liep buiten de kolom, de feitenlabels stonden naast
  in plaats van boven de waarde omdat thema's `dt`/`dd` eigen styling geven, en "Toevoegen
  aan agenda" brak over drie regels.
- De titel komt nu van het thema, zodat de pagina eruitziet als elke andere pagina.
  De feitenblokken gebruiken geen `<dl>` meer.

**1.2.0**
- Terugval-routing in plaats van een alles-of-niets-schakelaar. De plugin claimt geen URL's
  meer en komt alleen in actie waar WordPress een 404 zou geven. Bestaande The Events
  Calendar-pagina's blijven dus werken, ook met de plugin actief. Geen rewrite rules, geen
  permalinks bewaren, niets dat kan breken.

**1.1.3**
- Cacheduur standaard van 300 naar 60 seconden. Dat is de enige vertraging tussen
  publiceren in de Operations Manager en zichtbaar worden op de site. Kort mag: een
  verversing stuurt de vorige ETag mee, dus een onveranderd antwoord komt terug als 304
  zonder inhoud. Bestaande installaties houden hun ingestelde waarde — pas die zelf aan.

**1.1.2**
- Opgelost: de kalender bleef leeg door een 503. `format('c')` gaf een `+` in de
  querystring, en daar betekent `+` een spatie; de API kreeg een onleesbare datum. De
  parameters gaan nu als `…Z` de deur uit, en de API negeert een onleesbare grens in
  plaats van te falen.
- Debugmodus: `?mymmo_debug=1` op een pagina met een shortcode toont, alleen voor
  beheerders, welk verzoek er ging, met welke parameters en waar het antwoord vandaan kwam.

**1.1.0**
- Merken: een event hoort bij openvme, syndicoach of beide. Het merk komt uit de
  sitesleutel (`merk:sleutel`), dus een site kan de events van het andere merk niet opvragen.
- Canonical voor gedeelde events, zodat twee sites geen dubbele content opleveren.
- De kalender opent op de eerstvolgende maand met events in plaats van op de huidige maand.
- Diagnosepaneel in de instellingen: wat de API echt teruggeeft, per maand geteld.
- Events zonder slug worden niet meer getoond — die hebben geen pagina.
- Gefaseerd omschakelen: `/event/{slug}/` overnemen is nu een expliciete instelling.

**1.0.0** — eerste versie.
