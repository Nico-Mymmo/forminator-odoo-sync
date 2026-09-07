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

[mymmo_events_row]
[mymmo_events_row source="highlighted" count="4"]
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

`[mymmo_events_row]` toont kaarten als een losjes neergelegde stapel
scheurkalenderblaadjes (uur + locatie inbegrepen), lichter en veel lager dan
de aankondiging — bedoeld om ook mid-pagina te plaatsen. `source` bepaalt
wat marketing toont: `"highlighted"` (de gehighlighte events, in volgorde,
geen aanvulling met gewone events als er minder dan `count` zijn) of
`"next"` (standaard: gewoon de eerstvolgende events, chronologisch). `count`
is standaard 4, maar heeft **geen vaste cap** meer — elk aantal mag (tot een
ruime veiligheidsgrens in de code). Minder events dan `count`? Dan toont de
rij gewoon minder kaarten (geen blanco aanvulling meer). De kaarten
overlappen (het eerste/linkse kaartje ligt vast bovenop de stapel, elk
volgend kaartje daaronder — die volgorde verandert nooit) en de rij wordt
nooit breder dan de beschikbare ruimte: bij veel kaarten schuiven ze steeds
verder over elkaar in plaats van dat er een scrollbalk verschijnt. Hoveren
op een kaart duwt de buren opzij tot dat kaartje volledig zichtbaar is
(zonder de stapelvolgorde te wijzigen), en het "Schrijf je snel in!"-tagje
verhuist mee naar het gehoverde kaartje (na een korte vertraging, met een
kleine opwind-animatie). Geen enkel event voor de gekozen `source`: dan
toont de shortcode niets (net als de aankondiging bij een lege kalender).

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

**1.6.35**
- Mobiel: terugswipen was niet te lezen. De vorige kaart vloog van RECHTS
  binnen -- dezelfde kant waar de vinger net naartoe sleepte -- terwijl de
  gesleepte bovenste kaart tegelijk terugveerde naar haar plek. Twee
  bewegingen aan dezelfde kant, met als resultaat dat het leek alsof de
  kaart die je sleepte gewoon terugkwam, en dat je niet zag waar ze
  belandde. Vooruit en terug zijn nu spiegelbeelden: vooruit verdwijnt een
  kaart naar LINKS en komt ze onderaan de stapel, dus terugswipen trekt die
  vorige kaart ook van LINKS terug naar boven.
- Mobiel: tijdens een terugsleep beweegt de bovenste kaart niet meer. De
  vorige kaart komt van links mee met je vinger (met haar rechterrand op je
  vinger, en ze draait onderweg recht naar haar eigen hoek); de kaart die je
  zag blijft liggen en zakt enkel een plaats in de stapel. Dat is ook precies
  wat het gebaar betekent: je trekt de vorige kaart terug. Haalt de sleep de
  drempel niet, dan schuift die kaart terug naar links het beeld uit en
  blijft de stapel exact zoals hij was.
- Technisch: de terugkomende kaart draagt tijdens die beweging
  `.is-incoming` (boven de stapel, absoluut gepositioneerd, volledig
  zichtbaar, geen pointer-events) -- die klasse moet in de CSS NA de
  `data-deck-pos`-regels staan, want ze heeft dezelfde specificiteit. Omdat
  er tijdens de animatie even geen kaart in de normale flow staat (de
  invliegende kaart is absoluut, en de kaart die bovenaan lag is al naar
  positie 1 gezakt), heeft de stapel nu ook `min-height:
  var(--mymmo-ev-deck-h)` -- zonder dat klapt hij op dat moment in tot 0 en
  verspringt de hele pagina.

**1.6.34**
- Mobiel: de kaart die na een swipe bovenaan komt, verschoot van scheefstand
  op precies het moment dat de swipe klaar was -- dat voelde houterig. Het
  was geen animatie (nagemeten met transition-events: er loopt geen
  transitie, de nieuwe bovenste kaart landt rechtstreeks op zijn nieuwe
  hoek), maar een instant sprong: de scheefstand hing aan de STAPELPOSITIE
  (0: -1.25 graden, 1: -4.5, 2: 5, 3: -7), dus een kaart die naar voren
  schoof veranderde onvermijdelijk van hoek. De hoek hoort nu bij de KAART
  zelf (`--mymmo-ev-deck-rot`, per `:nth-child` in een cyclus van 4, zoals
  `.mymmo-ev-row__card--1..4` op desktop) en verandert nooit meer. De stapel
  ligt dus nog altijd los en scheef met elke kaart anders gedraaid; enkel de
  verschuiving hangt nog van de positie af. Ook het slepen rekent die eigen
  hoek mee, zodat een kaart ook bij de eerste vingerbeweging niet rechtspringt.
- Mobiel: vooruit en terug zijn niet langer dezelfde beweging. Vooruit
  (swipe naar links) vliegt de bovenste kaart weg en komt ze onderaan de
  stapel te liggen, waar ze zacht infadet. Terug (swipe naar rechts) schuift
  de ONDERSTE kaart van buiten het scherm terug bovenop de stapel, en de
  kaart die bovenaan lag blijft liggen en zakt gewoon een plaats. Voorheen
  vloog ook bij terugswipen de bovenste kaart weg -- exact dezelfde animatie
  als vooruit, wat aanvoelde alsof je vooruit ging terwijl je terugging.
- Mobiel: bij een swipe schuiven de overige kaarten nu MET een transitie
  naar hun nieuwe plaats in de stapel (voorheen sprong de hele stapel in
  een keer om). Dat is wat zichtbaar maakt dat je door de stapel gaat. Enkel
  de kaart die van buiten het scherm terug moet, staat een frame lang
  transitieloos (`.is-returning` op de kaart, niet meer op de hele stapel),
  anders zie je die over het scherm zweven.
- Alleen de mobiele stapel is geraakt; de desktopkaart van de aankondiging
  (en haar decoratieve kaartjes erachter) blijft ongewijzigd.

**1.6.33**
- Bugfix (rij, desktop): `[mymmo_events_row]` stond bij het laden van de
  pagina als geheel een overlap-breedte (3.25rem, of de door JS berekende
  waarde) te ver naar links, en sprong pas op zijn plaats zodra je een
  kaartje hoverde. Oorzaak: het "Schrijf je snel in!"-tagje
  (`.mymmo-ev-row__pointer`, een `<span>`) staat in de markup VOOR de
  kaarten, dus was dat span het echte `:first-child` van
  `.mymmo-ev-row__cards` -- en de CSS-regel die de negatieve `margin-left`
  bij de eerste kaart weghaalt, hing net aan `:first-child`. Dus kreeg ook
  de eerste kaart die negatieve marge en schoof de hele rij een overlap
  naar links. Bij de eerste hover verhuist dat tagje via JS in het
  gehoverde kaartje, waardoor de eerste kaart plots wel `:first-child`
  werd en de rij "vanzelf" goed stond -- vandaar dat het enkel bij het
  laden leek te gebeuren. De regel hangt nu aan `:first-of-type` (de
  kaarten zijn de enige `<a>`'s in die container, dus dat klopt ongeacht
  waar het tagje op dat moment staat).
- Bugfix (rij, desktop): `rowOverlapFit()` mat de kaartbreedte met
  `getBoundingClientRect()`, maar elke kaart staat licht gedraaid en de
  bounding box van een gedraaid element is breder dan de kaart zelf (bij
  200x172px en 2 graden ruim 6px). Die extra pixels rekenden mee als
  kaartbreedte, waardoor de rij systematisch iets te veel overlap kreeg en
  smaller uitviel dan de beschikbare ruimte. Nu `offsetWidth`, en de
  containerbreedte is de echte contentbreedte (zonder de padding van de
  container).
- Mobiel: de kaartenstapel van `[mymmo_events_row]` en
  `[mymmo_events_announcement]` is nu ECHT identiek. Beide hadden hun eigen
  buitenmarges (2.25rem 0 0.5rem vs. 5.5rem 1.5rem 4.5rem, en onder 34rem
  nog een derde waarde) en hun eigen decoratie (scribble vs. klavertje),
  waardoor ze anders uitgelijnd stonden. Alle binnenruimte zit nu in
  `.mymmo-ev-swipestack` zelf, en op mobiel valt alle decoratie weg -- dat
  was tegelijk het laatste zichtbare verschil en de reden dat de stapel
  optisch uit het midden hing. Ook het "Schrijf je snel in!"-tagje en de
  kaartopmaak (padding) zijn nu in beide templates dezelfde markup, ook
  tussen 34rem en 40rem (daar toonde de aankondiging voorheen nog de
  desktopkaart).
- Mobiel: de kaartjes ACHTER de bovenste lagen te hoog. Ze liggen op
  `position: absolute; inset: 0`, en de swipe-hint stond in diezelfde
  container -- dus rekende `inset: 0` vanaf boven die hint i.p.v. vanaf de
  bovenste kaart. De kaarten zitten nu in hun eigen wrapper
  (`.mymmo-ev-swipestack__cards`) waar niets anders in staat; hint en
  stipjes staan eronder, buiten dat kader.
- Mobiel: swipen is herwerkt. De weggeswipete kaart zweefde zichtbaar
  terug over het scherm naar de achterkant van de stapel (het herstapelen
  gebeurde met de transitie nog actief) -- dat gaat nu transitieloos in een
  frame. De drempel is relatief aan de kaartbreedte (18%, minimum 45px) en
  een snelle flick volstaat ook, i.p.v. een vaste 70px die op een klein
  scherm als "blijft plakken" aanvoelde. Een sleep die als swipe eindigt
  onderdrukt de klik die daarna volgt, zodat je niet per ongeluk naar het
  event navigeert. En alleen de bovenste kaart is bereikbaar: de links van
  de kaarten erachter gaan uit de tab-orde (die kaarten stonden al op
  `pointer-events: none`).
- Mobiel: stipjes onder de stapel tonen hoeveel events er in de stapel
  zitten en waar je zit, en zijn aanklikbaar om direct naar een kaart te
  springen. De hint "Swipe om al onze aankomende events te bekijken"
  verdwijnt na de eerste swipe (de plek blijft gereserveerd, zodat de
  stapel niet verspringt).
- Wisselt het venster van of naar de mobiele breedte (devtools, of een
  tablet die kantelt), dan wordt het andere gedrag nu alsnog
  geinitialiseerd -- voorheen deed swipen niets tot een harde refresh,
  omdat `initRows()` zichzelf overslaat op mobiel en `initSwipeDecks()` op
  desktop.

**1.6.32**
- De wpautop/`<br>`-bug uit 1.6.31 (kapotte type-filterchips) bleek breder
  te zitten dan enkel die ene chip: hetzelfde patroon (een inline element
  als `<a>`/`<span>`/`<button>` waarvan de openingstag op een eigen regel
  eindigt, met de tekst pas op de volgende regel) stond op zeker een tiental
  plekken door de hele plugin, o.a. het pijltje bij "Meer info en
  inschrijven" (stond daardoor te hoog t.o.v. de tekst -- een verdwaalde
  `<br>` vóór de tekst maakte de link-box hoger, waardoor de tekst zelf
  lager kwam te staan en het pijltje er t.o.v. de tekst te hoog uitzag).
  In plaats van elke plek apart te patchen (foutgevoelig, en een nieuw
  template zou er zo weer intrappen), is de fix nu centraal:
  `mymmo_events_render()` in includes/helpers.php herleidt alle witruimte
  in de gerenderde HTML van elk template tot één spatie voor die HTML de
  functie verlaat. HTML-witruimte buiten `<pre>`/`<script>`/`<textarea>` is
  toch al betekenisloos voor de browser (behalve als woordscheiding), dus
  dit verandert visueel niets -- maar laat wpautop nergens meer een kaal
  regel-einde over om verkeerd in een `<br>` om te zetten, op geen enkele
  pagina, nu of in een toekomstig template.
- Bugfix: een oude WordPress-eventpagina die op concept (draft) stond, werd
  voor ingelogde redacteuren/admins nog altijd getoond in plaats van de
  actuele OM-pagina. Oorzaak: de terugval-routing in
  includes/class-router.php trok zich terug van elke URL waar WordPress
  zelf geen 404 gaf -- en een concept-post is voor een ingelogde redacteur
  wel rechtstreeks te bekijken (WP's eigen draft-preview, geen 404), ook al
  is hij voor een gewone bezoeker niet publiek opvraagbaar (die kreeg de
  actuele OM-pagina dus al wel correct). De terugval controleert nu ook of
  de gevonden WP-post daadwerkelijk `post_status = 'publish'` heeft; is dat
  niet zo (concept, pending, private, ...), dan neemt de OM de pagina toch
  over.

**1.6.31**
- Bugfix: op de events-kalenderpagina (`/events/`) werden de type-
  filterchips ("Groepsopleiding", "Q&A", ...) veel te groot getekend --
  devtools toonde een lege `<br>` vooraan in de chip, vóór de labeltekst.
  Oorzaak: `templates/partials/type-filter.php` had de sluitende `>` van
  de `<a>`-tag op een eigen regel, met een regel-einde vóór de PHP-echo
  van het label. Op pagina's waar de shortcode-output door WordPress'
  `wpautop()` loopt (afhankelijk van HOE/waar de shortcode ingevoegd is --
  zie ook `remove_filter('the_content', 'wpautop')` in
  includes/class-router.php voor de detailpagina's, die dit al bewust
  omzeilen) zet die filter zo'n "kale" regel-einde binnen een inline
  element (`<a>`, geen blok-element) om in een letterlijke `<br>`-tag --
  vandaar wel zichtbaar op de kalenderpagina, niet overal.
  - Fix: geen letterlijk regel-einde meer direct binnen de `<a>` in
    type-filter.php, ongeacht of wpautop op een pagina actief is.
  - Dezelfde kwetsbare schrijfwijze (inline `<span>`/`<a>`/`<button>` met
    een regel-einde direct na de openingstag, vóór de tekst) komt ook op
    een aantal andere plekken in de plugin voor -- nog niet aangepast in
    deze release, zie het gesprek voor de volledige lijst.

**1.6.30**
- Verfijning van de mobiele kaartenstapel uit 1.6.29, na feedback op een
  eerste doorgevoerde versie (1.6.30-poging) die intussen weer volledig is
  teruggedraaid naar 1.6.29 en van hieruit opnieuw is opgebouwd (zie
  CLAUDE.md, sectie "wp-plugin/mymmo-events" voor de aanleiding/procedure):
  - De slagschaduw van de gestapelde kaartjes was te intens (elke kaart
    droeg dezelfde zware desktop-schaduw, en die stapelde zichtbaar op).
    Elke stapelpositie heeft nu een eigen, lichtere schaduw (de onderste
    kaartjes hebben geen schaduw meer).
  - Alle kaartjes in de stapel zijn nu altijd even hoog: JS meet na render
    de natuurlijke hoogte van elke kaart en past het maximum toe op de
    hele stapel (herberekend na laden/webfonts/resize), zodat onderliggende
    kaartjes niet langer zichtbaar "afgekapt" oogden. De titel wordt
    afgekapt met ellipsis na 2 regels, en elke kaart toont nu ook de
    samenvatting van het event (max. 4 regels, ellipsis).
  - De swipe-hint stond na v1.6.30-poging 1 onder de hele kaartenstapel
    (verwarrend, want die viel soms samen met de rand van een onderliggend
    kaartje) -- hij staat nu boven de stapel, in de vaste lay-outflow.
  - De "Bekijk onze andere events"-knop op de kaartjes is verdwenen op
    mobiel; die boodschap staat nu in de swipe-hint zelf.
  - De swipe-hint tekst sprak over "veeg naar links", wat verwarrend was
    omdat het systeem net cyclisch is (na het laatste event begin je weer
    bij het eerste) -- de tekst benoemt nu geen richting meer.
  - Het "Schrijf je snel in!"-tagje (met het krulletje) verschijnt nu ook
    op mobiel altijd, voor beide shortcodes (bij de rij verscheen dit
    voorheen enkel via :hover op desktop, wat op mobiel nooit triggerde),
    met een korte, automatische verschijn-animatie i.p.v. hover-gebonden.

**1.6.29**
- `[mymmo_events_row]` en `[mymmo_events_announcement]`: op mobiel tonen
  beide shortcodes nu dezelfde "Tinder-stijl" kaartenstapel. Het bovenste
  kaartje toont het eerstvolgende event, met de volgende kaartjes er
  lichtjes zichtbaar achter. Vegen naar links toont het volgende event, naar
  rechts het vorige (cyclisch: na het laatste begint de stapel weer vooraan).
  Op desktop blijft de layout van beide shortcodes ongewijzigd (rij
  respectievelijk aankondiging met stapel als decoratie).
  - Op mobiel valt de knop "Bekijk onze andere events" (rij) en de
    secundaire CTA-knop (aankondiging) weg, en komt er in de plaats een
    subtiele swipe-hint met een scribble-pijltje te staan.
  - De ghost-kaartjes achter de hoofdkaart in de aankondiging zijn niet
    langer pure decoratie op mobiel: een tik op zo'n kaartje navigeert nu
    naar het bijhorende event (net als bij de rij).

**1.6.28**
- `[mymmo_events_announcement]`: het kleine datumbadge op de stapelkaartjes
  ACHTER de hoofdkaart (`.mymmo-ev-announce__ghost-date`) rekte zich uit tot
  de vole kaartbreedte -- zichtbaar als een lange gekleurde balk op het
  randje dat achter de hoofdkaart uitsteekt. Oorzaak: de ouder van dat
  badge is een flex-column zonder eigen `align-items`, dus de browser-
  standaard (`stretch`) rekte het mee. Bestond al langer, viel enkel niet
  op omdat dat achterste kaartje meestal geen (of een ander) datumbadge
  toonde.

**1.6.27**
- `[mymmo_events_announcement]`:
  - De kicker ("Aanbevolen event"/"Binnenkort") en de type-pill ernaast tonen
    nu even groot -- de kicker had iets ruimere padding en een relatief
    groot vinkje-icoon t.o.v. het kleine bolletje van de pill.
  - Op mobiel verdwijnt de illustratie (nam enkel ruimte in), en de twee
    knoppen staan naast elkaar op één rij i.p.v. onder elkaar.
- De tekstkleur op alle `.mymmo-ev-pill`-tags (kaarten, single, aankondiging)
  is een tikje donkerder gemaakt voor betere leesbaarheid.

**1.6.26**
- De filter-chips boven de kalender/lijst (per event-type) tonen nu ook echt
  hun eigen kleur uit Odoo/OM -- de publieke `/event-types`-lijst die de
  plugin daarvoor gebruikt (`get_event_types()`) gaf tot nu toe enkel
  id+naam door, geen kleur, dus vielen ze altijd terug op grijs. Vereist een
  nieuwe deploy van de Worker (`src/modules/event-operations-v2/public-api.js`).
- Diezelfde balk (navigatie + maandtitel + filter-chips) is compacter op
  mobiel: de chips wrapten voorheen over meerdere regels en namen veel
  hoogte in. Nu blijven nav+titel op de eerste regel en scrollen de chips
  op de tweede regel horizontaal, zonder scrollbar -- een vaste, vertrouwde
  hoogte ongeacht het aantal types.

**1.6.25**
- Alle badges/pills/chips die een event-type-kleur tonen (kaartenrij-badge,
  actieve categoriepil boven kalender/lijst, en de nieuwe pil in de
  aankondiging-widget) gebruiken nu hetzelfde lichte-tag-patroon: een lichte
  tint van de Odoo-kleur als achtergrond met donkere tekst, in plaats van een
  volle kleur met witte tekst -- blijft leesbaar ongeacht hoe licht of donker
  de kleur is die in de Operations Manager gekozen wordt.
- `[mymmo_events_announcement]`: toont nu ook de type-pill (zelfde kleur/stijl
  als op de kaarten en de detailpagina) -- ontbrak hier voorheen helemaal.

**1.6.24**
- `[mymmo_events_row]`:
  - De typebadge staat nu inline vlak boven de titel i.p.v. absoluut in de hoek -- die botste
    daar met de curl van het "Schrijf je snel in!"-tagje. Geen afkapping meer, en kleiner
    lettertype.
  - Klokje voor het uur op elk kaartje (zelfde icoon als elders in de plugin).
  - Fix: bij een pagina-herlaad konden de kaarten kort verkeerd gepositioneerd blijven staan
    (te ver naar links) tot de eerste hover ze "corrigeerde". ResizeObserver + fonts.ready
    herrekenen de overlap nu automatisch zodra de kaartenrij van grootte verandert, ongeacht
    de oorzaak (laatgeladen lettertype, een pagebuilder die de rij pas later toont, ...).

**1.6.23**
- `[mymmo_events_row]`:
  - Kaarten hebben nu een `min-width` van 200px (was een vaste 9.5rem breedte) -- ze mogen niet
    meer smaller worden dan dit, ook niet bij veel kaarten in de rij.
  - Nieuw: badge met het eventtype in de hoek die leeg is voor de huidige `date_align`, in de
    kleur van dat type (zelfde kleur als de pill op de eventpagina's).

**1.6.22**
- `[mymmo_events_row]`:
  - Kaarten worden nooit meer smaller gemaakt om meer kaarten te laten passen -- rowOverlapFit()
    laat ze i.p.v. daarvan verder over elkaar schuiven (zoals een pak kaarten), tot bijna volledig
    verborgen als het aantal het vereist. Hoveren (of swipen, zie hieronder) duwt ze weer uiteen.
  - Op mobiel/touch werkt hoveren niet: een horizontale swipe over de kaartenrij maakt nu het
    volgende/vorige kaartje "actief" (zelfde visuele reveal als :hover op desktop), swipe
    terug om weer dieper in de stapel te gaan.
  - Bij `date_align="right"` verhuist het "Schrijf je snel in!"-tagje mee naar de linkerbovenhoek
    van de kaart (i.p.v. rechts) en wordt het krulletje horizontaal gespiegeld, zodat het nog
    steeds naar de kaart toe wijst.

**1.6.21**
- `[mymmo_events_row]`, weer een ronde verfijningen:
  - Minder kaarten dan de beschikbare breedte toelaat? De rij vult zich nu altijd volledig
    (`rowOverlapFit()` kan de overlap ook kleiner dan de standaardwaarde maken, of zelfs een
    kleine tussenruimte, i.p.v. altijd minstens de standaardoverlap te houden en de rest van de
    breedte ongebruikt te laten).
  - Nieuwe config-optie "datumuitlijning" (site-breed in Instellingen -> Mymmo Events, en per
    plaatsing overschrijfbaar met het `date_align`-attribuut): "links" (standaard) houdt de
    huidige tekstuitlijning maar draait de stapelvolgorde om (linkse kaartje nu onderaan i.p.v.
    bovenaan de stapel); "rechts" lijnt datum + uur rechts uit op elk kaartje en houdt de
    stapelvolgorde zoals voorheen (linkse kaartje bovenaan). Zo blijft de datum altijd zichtbaar,
    ook op een kaartje dat grotendeels achter een andere kaart schuilgaat.
  - Geen afkapping van de titel meer (was 2 regels + ellipsis) -- kaarten zijn nu iets hoger
    (min-hoogte i.p.v. vaste hoogte) en blijven dankzij `align-items: stretch` op de rij nog
    steeds altijd exact even hoog als elkaar.
  - De "Schrijf je snel in!"-plopanimatie oogde houterig door een te extreme cubic-bezier over
    de hele animatie -- vervangen door een subtielere aanloop met een eigen, zachtere
    timing-function per fase (infaden, kleine terugwijkende aanloop, lichte overshoot).

**1.6.20**
- `[mymmo_events_row]`, verder verfijnd op basis van feedback:
  - Minder events dan `count`? Toont nu gewoon minder kaarten, geen lege opvulkaartjes meer.
  - Stapelvolgorde ligt vast: het eerste (linkse) kaartje ligt altijd bovenop, elk volgend
    kaartje daaronder -- inline z-index per kaart. Hoveren duwt de buren opzij tot het kaartje
    volledig zichtbaar is, maar wijzigt die volgorde niet meer (voorheen kreeg het gehoverde
    kaartje zelf een hogere z-index).
  - Geen horizontale scrollbar meer: `rowOverlapFit()` (mymmo-events.js) berekent hoeveel de
    kaarten moeten overlappen zodat de rij altijd binnen de beschikbare breedte blijft, hoe
    hoog `count` ook staat.
  - Kaarten zijn nu een vaste hoogte (was min-hoogte) zodat ze altijd exact even hoog zijn.
  - Het "Schrijf je snel in!"-tagje bestaat nu maar één keer per rij en verhuist naar het
    gehoverde kaartje in plaats van vast op het eerste te staan -- verschijnt pas na een halve
    seconde hoveren, met een kleine cartoonachtige opwind-animatie, en verdwijnt meteen bij
    weghoveren.

**1.6.19**
- Scribble achter `[mymmo_events_row]` verdween achter de kaarten -- opgelost door de vaste
  breedte en opacity te laten vallen en de positie iets aan te passen (`top: 30%`,
  `right: -5%`), zoals live afgesteld in devtools. Op smalle schermen krijgt de scribble alsnog
  een `max-width` zodat hij daar niet over de hele rij bleedt.

**1.6.18**
- `[mymmo_events_row]`: de harde cap van 4 kaarten is opgeheven -- `count` mag nu elk aantal zijn
  (tot een ruime veiligheidsgrens). Vanaf een handvol kaarten overlappen ze losjes als een stapel
  scheurkalenderblaadjes i.p.v. een grid met steeds smallere kolommen, en schuift de rij
  horizontaal door als niet alles past. Hoveren op een kaart duwt de buren zichtbaar opzij.
  Elke kaart toont nu ook het uur en de locatie van het event. Dat het aantal instelbaar is,
  staat nu ook duidelijker uitgelegd op de instellingenpagina (shortcode-tabel + de bouwer).

**1.6.17**
- `[mymmo_events_row]` toont nu ook een decoratieve scribble rechts achter de kaartenrij, en
  een "Schrijf je snel in!"-tagje met krulletjepijltje boven het eerste event in de rij --
  zelfde tekst/asset-aanpak als bij `[mymmo_events_announcement]`.

**1.6.16**
- `[mymmo_events_row]` staat nu ook op de instellingenpagina (Instellingen → Mymmo Events)
  in de shortcode-referentietabel, met uitleg over `source` en `count`.
- Nieuwe "Shortcode-bouwer" op diezelfde pagina: kies een component, vul de parameters in via
  gewone formuliervelden (incl. de event types als aanvinkbare chips), en kopieer de kant-en-
  klare shortcode. Bedoeld zodat marketing zelf shortcodes kan samenstellen zonder de
  parameternamen te hoeven kennen of accolades met de hand te typen.

**1.6.15**
- Nieuwe shortcode `[mymmo_events_row]`: max. 4 kaarten naast elkaar (gehighlighte events in
  volgorde OF de eerstvolgende events, per plaatsing te kiezen via `source`), bedoeld als
  minder invasief alternatief voor `[mymmo_events_announcement]` om ook mid-pagina te
  plaatsen. Elk kaartje krijgt een eigen kleine rotatie/verschuiving, zodat de rij oogt als
  los naast elkaar gelegde scheurkalenderblaadjes. Minder dan 4 events voor de gekozen bron:
  blanco kaartjes vullen aan tot 4 (geen aanvulling met events van de andere bron). Rechtsonder
  een subtiele "Bekijk onze andere events"-link.
- Mobiel-fixes in de aankondiging (`mymmo_events_announcement`): de pijl, de illustratie en
  het derde stapelkaartje verdwenen op smalle schermen eerder volledig (`display: none`) --
  precies de content die de widget herkenbaar maakt. Ze blijven nu altijd zichtbaar, enkel
  verkleind/herschikt (de illustratie stroomt bijvoorbeeld onder de tekst i.p.v. als
  overlappende hoek-afbeelding, die anders achter de volle-breedte tekst zou verdwijnen).

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
