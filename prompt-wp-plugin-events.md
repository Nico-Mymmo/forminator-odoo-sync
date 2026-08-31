# WordPress-plugin: Mymmo Events

Aparte codebase, geen onderdeel van de Worker-repo. Doel: de events uit Event Operations v2 tonen op de WordPress-site — kalender, lijst en detailpagina — zonder ze te dubbelen als WordPress-posts.

Deze plugin kan gebouwd worden zodra de publieke API uit `prompt-v2-01-fundament.md` staat. Bouw hem niet vóór die API, en verzin geen eigen contract: de responsvorm in dat document is het contract.

## Context en de ene ontwerpbeslissing die alles bepaalt

Vandaag worden events gedubbeld in WordPress via The Events Calendar. Dat heeft één echt voordeel — de pagina werkt ook als Odoo of de Worker onbereikbaar is — en één echt nadeel: er zijn twee records met elk hun eigen levenscyclus, en die lopen uit elkaar. Dat is de bron van de syncissues.

Het voordeel komt niet van het dubbelen maar van de **lokale beschikbaarheid**. Die kan je hebben zonder een tweede bron:

- Geen custom post type. Geen eigen tabellen. Geen event-records in WordPress.
- Wel een **cache in twee lagen**: een korte transient voor normale snelheid, plus een `wp_option` met de laatst geslaagde respons als vangnet.
- Faalt de API of duurt hij te lang, dan rendert de plugin uit het vangnet en zet een stille admin-notice. De bezoeker ziet nooit een lege of gebroken kalender.
- Er is één bron van waarheid — Event Operations. Uit elkaar lopen kan per definitie niet meer.

## Structuur

```
mymmo-events/
  mymmo-events.php            -- header, activatie, autoload
  includes/
    class-api-client.php      -- HTTP naar de OM-API, met cache en vangnet
    class-cache.php           -- transient + last-known-good, key-opbouw, purge
    class-shortcodes.php      -- registratie van de shortcodes
    class-router.php          -- rewrite rules voor de detailpagina + redirects
    class-settings.php        -- instellingenpagina
    class-registration.php    -- inschrijfformulier + POST naar de OM-API
    helpers.php               -- datumformattering (NL), escaping, ics-generatie
  templates/
    calendar.php
    list.php
    single.php
    registration-form.php
    partials/event-card.php
  assets/
    css/mymmo-events.css
    js/mymmo-events.js        -- alleen kalendernavigatie en formulier-submit
  languages/
```

Alle templates moeten overschrijfbaar zijn vanuit het thema, volgens de gebruikelijke conventie: eerst zoeken in `{thema}/mymmo-events/{template}.php`, dan in de plugin. Zo kan een designwijziging in het thema gebeuren.

## Wat je implementeert

### 1. Instellingen

Instellingenpagina onder Instellingen → Mymmo Events, met:

- **API-basis-URL** (bv. `https://forminator-sync.openvme-odoo.workers.dev`)
- **Sitesleutel** — gaat mee als header `X-Mymmo-Site-Key`
- **Cacheduur** in seconden, standaard 300
- **Basispad voor eventpagina's**, standaard `events`
- **Tijdzone-weergave**, standaard `Europe/Brussels`
- Een knop **Cache leegmaken** en een knop **Verbinding testen** die de API bevraagt en het resultaat toont

Sla de sleutel op als optie, niet in de code. Toon hem gemaskeerd na opslaan.

### 2. API-client met cache en vangnet

`class-api-client.php` met methodes `get_events( $args )`, `get_event( $slug )`, `get_event_types()`, `register( $slug, $payload )`.

Regels waar je je aan moet houden:

- `wp_remote_get` met een **timeout van 3 seconden**. Langer wachten is nooit acceptabel voor een paginarender.
- Cachekey is een hash van endpoint plus genormaliseerde parameters. Normaliseer eerst — parameters in een andere volgorde mogen niet tot een tweede cachevulling leiden.
- Bij een geslaagde respons: schrijf naar de transient **en** naar de last-known-good-optie, met een timestamp.
- Bij een fout, een timeout of een niet-200: lees uit last-known-good. Lukt dat ook niet, geef een lege set terug en laat de template een nette "geen events gepland"-boodschap tonen — nooit een PHP-fout of een lege pagina.
- Stuur de `ETag` uit de vorige respons mee als `If-None-Match`. Bij een 304 verleng je simpelweg de transient. Dat maakt het pollen goedkoop, wat het hele punt van die ETag in de API is.
- Log fouten via `error_log` met een `[mymmo-events]`-prefix, en zet een dismissible admin-notice als de laatste geslaagde respons ouder is dan een uur.

### 3. Shortcodes

Drie shortcodes, allemaal server-side gerenderd. Ze moeten werken in een klassiek thema, in een Elementor-codeblok en in een Gutenberg-shortcodeblok — daarom shortcodes en geen builder-specifieke widgets.

**`[mymmo_events_calendar]`**

Maandkalender. Parameters: `month` (`YYYY-MM`, standaard de huidige), `type` (event-type-slug), `format` (`online|onsite|hybrid`), `show_past` (`0|1`).

- Maandnavigatie via gewone links met een `?mymmo_month=`-parameter, zodat de kalender werkt zonder JavaScript. De JS voegt daarna alleen navigatie zonder herladen toe, als progressive enhancement.
- Kleur per event type uit `type.color` in de API-respons.
- Een dag met meer dan drie events toont er drie plus "nog N".
- Elk event linkt naar zijn detailpagina.
- Toon alle datums in de weergavetijdzone, niet in UTC en niet in de browsertijdzone. De API geeft UTC met een expliciete `timezone` mee; converteer met `DateTimeZone`, nooit met `date_default_timezone_set`.

**`[mymmo_events_list]`**

Parameters: `limit` (standaard 10), `type`, `format`, `from`, `to`, `layout` (`cards|rows`), `show_past`.

**`[mymmo_event slug="…"]`**

Één event volledig, met titel, datum, locatie of "online", sprekers, `body_html`, hero-beeld en het inschrijfformulier. Zonder `slug` valt hij terug op de slug uit de URL, zodat dezelfde shortcode op de detailpagina werkt.

### 4. Detailpagina's en URL-behoud

Registreer een rewrite rule op `{basispad}/{slug}` die een virtuele pagina rendert met `templates/single.php`. Geen echte WP-pagina per event.

Dit is het enige deel waar SEO-schade kan ontstaan, dus:

- Neem exact de slugstructuur over die The Events Calendar vandaag gebruikt, zodat bestaande URL's blijven werken. Controleer die structuur op de live site voordat je hem vastlegt.
- Zet 301-redirects van eventuele afwijkende oude URL's naar de nieuwe.
- Genereer een correcte `<title>`, meta description en Open Graph-tags uit het `seo`-object in de API-respons, met terugval op titel en `summary`.
- Voeg `Event`-structured data toe volgens schema.org, inclusief `eventAttendanceMode` afgeleid van `format` en `location` afgeleid van het locatieobject.
- Genereer een `.ics`-bestand per event op `{basispad}/{slug}/ics`, met een "Toevoegen aan agenda"-link.
- Zet `noindex` op events die voorbij zijn én geen recap hebben, zodat je archief niet volloopt met dode pagina's.

### 5. Inschrijfformulier

`templates/registration-form.php`, gerenderd binnen de detailpagina, met een POST naar de OM-API via `class-registration.php`.

- Velden: voornaam, naam, e-mail, telefoon, bedrijf, vragen (vrij tekstveld), plus de akkoordvinkjes.
- Verstuur naar `POST /events-v2/public/v1/events/{slug}/register` met de sitesleutel als header. **Nooit** rechtstreeks vanuit de browser: altijd via `admin-post.php` of een eigen REST-route, zodat de sitesleutel serverside blijft.
- WordPress-nonce plus een honeypot-veld tegen bots. Geen captcha in de eerste versie.
- Toon de API-foutmeldingen letterlijk aan de bezoeker als het om een verwachte situatie gaat — al ingeschreven, event vol, inschrijvingen gesloten. Bij een onverwachte fout een generieke boodschap plus een `error_log`-regel.
- Na succes: purge de cache van dit event, zodat het aantal vrije plaatsen meteen klopt.
- Is `registration.open` `false` of `seats_left` `0`, render dan geen formulier maar de reden.

### 6. Opmaak

Eén CSS-bestand, met alle kleuren als custom properties op een `.mymmo-events`-root zodat het thema ze kan overschrijven. Geen framework, geen build-stap, geen jQuery-afhankelijkheid. Enqueue de CSS en JS alleen op pagina's waar een shortcode of de detailroute actief is.

Responsief: de maandkalender wordt op smalle schermen een lijst per dag, geen horizontaal schuivend raster.

## Wat je NIET doet

- **Geen custom post type, geen eigen tabellen, geen event-records in WordPress.** Dit is de kern van de opdracht.
- Geen schrijfacties naar Odoo of naar Supabase. De plugin praat uitsluitend met de publieke OM-API.
- Geen The Events Calendar-code hergebruiken of ernaar verwijzen. De plugin moet ook werken als die plugin gedeactiveerd is — dat is het eindbeeld.
- Geen React of Gutenberg-blockbuild in de eerste versie. Shortcodes eerst; blocks kunnen er later bovenop.
- Geen eigen gebruikersaccounts of inlogfunctie voor deelnemers.
- De sitesleutel nooit in HTML, JavaScript of een datattribuut.

## Definitie van klaar

- De drie shortcodes renderen correct op een testpagina, met en zonder JavaScript
- Met de Worker bewust onbereikbaar blijft de kalender staan, uit last-known-good, en verschijnt er een admin-notice
- Een tweede paginaload doet geen tweede API-call binnen de cacheduur, en een call na het verlopen levert een 304
- Datums en tijden staan correct in Europe/Brussels, ook voor een bezoeker in een andere tijdzone
- Een bestaande The Events Calendar-URL komt op de juiste nieuwe pagina uit
- Een inschrijving komt aan in de OM, een tweede met hetzelfde e-mailadres krijgt de melding "al ingeschreven", en het aantal vrije plaatsen klopt direct daarna
- De sitesleutel komt nergens in de paginabron voor
