# Regelboek — Mymmo Componenten (`wp-plugin/mymmo-cards`)

Voor wie hier een component bouwt of aanpast. Claude Code leest dit vanzelf zodra
er in deze map gewerkt wordt. De regels van de repo (`claude.md` in de hoofdmap)
gelden ook, in het bijzonder de **bestand-editingprocedure** en het blok
"Componenten — mymmo-cards".

## Met wie je praat

Wie hier een component maakt, is meestal **geen ontwikkelaar**. Die persoon
(vandaag David) bedenkt wat er op de pagina moet komen en hoe het moet werken; jij,
Claude, doet de rest. Op die computer staan geen Node, geen Python en geen PHP, en
dat hoeft ook niet: wat zo'n programma nodig heeft, draait op GitHub.

Wat hij doet, en niets meer:

1. Zeggen wat hij wil: in gewone woorden, met een schets, een schermafbeelding of
   een voorbeeld van een andere site.
2. Kijken op zijn **testpagina** (een conceptpagina op de site), op zijn telefoon
   en op zijn computer.
3. Zeggen wat er anders moet. Of dat het goed is.

Al de rest doe jij, zonder het te vragen of uit te leggen: zie "Van idee tot op de
site" hieronder. Dat hij iets vraagt, IS de opdracht om het op de site te zetten.

**Zo praat je met hem:**

- Gewone taal. Geen Node, Python, PHP, branch, commit, push, pull request,
  samenvoegen, merge, stempel, review, controle, lint, workflow, release, CI,
  versienummer of bestandsnaam -- tenzij hij er zelf naar vraagt. Zeg "ik zet het
  op de site" en "het staat erop".
- Vraag nooit iets te installeren, een commando te draaien, of iets op GitHub of in
  wp-admin te doen. Kan iets alleen met een programma dat hier niet staat, dan doet
  GitHub het.
- Vraag geen toestemming voor tussenstappen ("zal ik committen?", "zal ik
  pushen?"). Enkel wel als het iets raakt dat al op pagina's staat (zie hieronder).
- Kort. Wat je maakte in een of twee zinnen, waar hij het vindt (in de editor:
  blok toevoegen, categorie **Mymmo**, de naam van het blok) en wat hij kan
  uitproberen. Geen lijst bestanden, geen regelaantallen, geen uitleg over hoe het
  intern werkt.
- Houdt de controle iets tegen, los het dan zelf op en zet het opnieuw op de site.
  Zeg hoogstens in een zin wat je aanpaste, als hij het ziet ("de schaduw is
  lichter: er mag maar een schaduwniveau zijn").
- Lukt iets niet en kan jij het niet oplossen (het wacht op Nico, GitHub doet
  niets), zeg dat dan in een zin, en dat Nico het oppakt. Laat hem nooit achter met
  een technische foutmelding.

**Wat al op de site staat.** Een NIEUW component ziet niemand tot iemand het op een
pagina zet: dat kan zonder vragen. Een wijziging aan een component dat al op
pagina's staat (de kaartenstapel, de keienwolk, de markeerstift, de knop, ...)
zien bezoekers meteen. Vraag dan eerst, in een zin: "Dit verandert ook de
kaartenstapel op elke pagina waar die al staat. Is dat goed?" Kan het ook als een
nieuwe keuze in de zijbalk, met de huidige stand als standaard, stel dat dan voor:
dan verandert er niets aan wat er al staat.

## De vangrails beslissen, niet een persoon

Wat een designfout tegenhoudt, is geen goedkeuring van Nico maar drie vangrails.
Ze draaien vanzelf; wie het component bedenkt, merkt er niets van.

1. **De huisstijlcontrole** (`wp-plugin/huisstijl/controleer.mjs`): harde regels
   (kleur, afronding, zwaarte, breekpunten, blokinstellingen, ...), plus een
   syntaxcontrole van de PHP en JS. Draait op GitHub bij elke push. Rood = niet op
   de site.
2. **De review** (`/huisstijl-review` in Claude Code): het oordeel dat een lint
   niet kan geven -- hiërarchie, zwaarte, consistentie, mobiel en desktop. Na een
   goede review zet jij een stempel bij precies deze code; zonder stempel is de
   controle rood.
3. **De bewaking in de editor** (`includes/class-bewaking.php`), op de site zelf:
   geen eigen kleuren, lettertypes, afrondingen, Extra CSS of themastijlen.

**Het terrein is `wp-plugin/mymmo-cards/`.** Wat daarin blijft, gaat vanzelf naar
de site. Twee dingen wachten op Nico (`.github/CODEOWNERS`; GitHub houdt ze
tegen):

- **de vangrails zelf**: de huisstijl, de controle, de uitzonderingen, de bewaking,
  het automatisch bijwerken, het bouwscript en dit regelboek. Wil iemand een regel
  anders, stel het voor (zie "Aanscherpen");
- **alles buiten deze map**: de Worker (`src/`), de andere plugins, migraties, de
  pagina's in `public/`. Heeft een component daar iets nodig, zet het dan op een
  APARTE branch, zodat het component zelf niet hoeft te wachten.

Raakt een vraag iets buiten deze map, zeg dan vooraf (in gewone taal) dat dat deel
op Nico wacht, in plaats van het er stil bij te doen.

> **Nooit** een controle, de huisstijl of een uitzondering aanpassen om rood groen
> te krijgen. Pas het component aan. Zit een regel echt in de weg, stop dan en zeg
> welke en waarom -- werk er niet omheen.

## Van idee tot op de site

Dit doe jij, telkens hij iets wil zien. Op deze computer is enkel git nodig. Heb je
toch Node, draai dan ook de controle zelf (stap 4): dat spaart een ronde.

1. **De branch.** Een component = een branch `component/<naam>`; alleen zo'n
   branch zet GitHub op de site. Begin altijd met `git fetch origin`.
   - Nieuw component: `git switch -c component/<naam> origin/master`.
   - Verder werken: `git switch component/<naam>`, `git pull` (iemand anders kan
     er intussen iets op gezet hebben) en `git merge origin/master`.
     Een conflict in het versienummer of in de README los je zelf op: het hoogste
     nummer wint, beide secties in de README blijven staan.
2. **Bouwen** -- zie "Een component bouwen" hieronder.
3. **Het versienummer ophogen**, bij ELKE ronde die iets aan de plugin wijzigt:
   een nieuw component +0.1.0 (1.9.2 → 1.10.0), een aanpassing +0.0.1 (1.10.0 →
   1.10.1). Twee plekken in `mymmo-cards.php` (docblock + `MYMMO_CARDS_VERSION`)
   en een `**X.Y.Z**`-sectie bovenaan "Versies" in `README.md`: wat er veranderde
   en waarom. Een nummer dat al op de site staat, krijgt nooit andere code.
4. **De review**: `/huisstijl-review`. Die eindigt met de stempel:
   `bash wp-plugin/huisstijl/stempel.sh "<samenvatting>"` (enkel git nodig). Heb je
   Node: eerst `node wp-plugin/huisstijl/controleer.mjs` tot er geen fouten meer
   zijn.
5. **Committen en pushen**: de code en `wp-plugin/mymmo-cards.review.json` samen,
   dan `git push -u origin component/<naam>`.
6. **GitHub doet de rest** (`.github/workflows/huisstijl.yml`): de controle, dan de
   job "Naar de site" (pull request, samenvoegen, release), en daarna krijgen de
   sites een seintje en werken ze zich bij. Enkele minuten.
7. **Nakijken of het erop staat**, om de 30 seconden, hoogstens 10 minuten:
   `curl -s https://syndicoach.be/wp-json/mymmo-cards/v1/versie`. Staat het nieuwe
   nummer er, zeg dan: "Het staat erop. Ververs je testpagina." (In de editor de
   pagina opnieuw laden, anders kent ze het nieuwe blok nog niet.)
8. **Staat het er na 10 minuten niet**, kijk dan op GitHub. Dat kan zonder
   aanmelding, maar hoogstens 60 keer per uur, dus zuinig:
   - `curl -s https://api.github.com/repos/Nico-Mymmo/forminator-odoo-sync/commits/$(git rev-parse HEAD)/check-runs`
     → per controle `name`, `status`, `conclusion` en `id`.
   - Bij `failure`:
     `curl -s https://api.github.com/repos/Nico-Mymmo/forminator-odoo-sync/check-runs/<id>/annotations`
     → de meldingen, met bestand, regel en wat er in de plaats moet.

   | Melding | Wat je doet |
   |---|---|
   | een H-, U- of R-code, of een PHP-/JS-syntaxfout | het component aanpassen (nooit de controle), versie +0.0.1, review en stempel opnieuw, pushen |
   | "Eerst master binnenhalen" | `git fetch origin` en `git merge origin/master`, review en stempel opnieuw, pushen |
   | "Nieuw versienummer nodig" | versie ophogen, stempel opnieuw, pushen |
   | "Niet op de site" met een review die vereist is | de branch raakt iets buiten het terrein: dat wacht op Nico. Zeg het in een zin. |
   | na 5 minuten nog geen enkele controle | de branch heet niet `component/...`, of GitHub hapert. Zeg dat Nico het bekijkt. |

   Pas als je het niet kan oplossen, zeg je het tegen hem (zie "Zo praat je met
   hem").
9. **De volgende aanpassing** aan hetzelfde component: dezelfde branch, terug naar
   stap 1 ("verder werken").

Een **testpagina** is een conceptpagina (of een privépagina) op de site waar het
component komt -- meestal syndicoach.be. Bezoekers zien ze niet. Het nieuwe blok
staat in de editor onder de categorie **Mymmo**.

Bewust GEEN aparte testsite: een component neemt zijn letter en kleuren van het
thema van de site waar het staat. Op een andere site zie je dus niet wat er echt
komt te staan.

Lokaal een zip bouwen (`bash wp-plugin/build-mymmo-cards.sh X.Y.Z`) kan nog voor
wie Node heeft. Zet die nooit met de hand op een site: dan draait daar code die niet
op `master` staat, en de volgende automatische update zet ze terug.

## De huisstijl

`assets/css/mymmo-huisstijl.css` is het ENIGE bestand met een letterlijke kleur,
afronding, schaduw, randdikte of opvulling. Een component gebruikt enkel deze
waarden:

| Wat | Waarde | Waarvoor |
|---|---|---|
| Kleur | `--mymmo-kleur-pagina` | de achtergrond van de pagina |
| | `--mymmo-kleur-vlak` | een vlak zonder eigen kleur (een kaart) |
| | `--mymmo-kleur-vlak-licht` | een klein licht vlak bovenop iets (een keitje) |
| | `--mymmo-kleur-accent-zacht` | de zachte merktint (een kei) |
| | `--mymmo-kleur-lijn` | een dunne lijn rond een licht vlak |
| | `--mymmo-kleur-focus` | de focusring |
| Zwaarte | `--mymmo-rand` | de enige randdikte |
| | `--mymmo-schaduw-1` | het enige schaduwniveau: iets dat boven de pagina zweeft |
| | `--mymmo-focus`, `--mymmo-focus-afstand` | `outline` + `outline-offset` bij `:focus-visible` |
| Afronding | `--mymmo-afronding-m` | beeld en video in een vlak; "Klein" in de editor |
| | `--mymmo-afronding-l` | een vlak (een kaart); "Groot" in de editor |
| | `--mymmo-afronding-rond` | een pil of een rondje |
| Ruimte | `--mymmo-ruimte-krap/-normaal/-ruim` | de opvulling van een vlak, zoals op de kaartenstapel |
| | `…-telefoon` | dezelfde drie op een telefoon (in je `@media (max-width: 781px)`) |

- **Een afronding die een redacteur kiest**, komt uit `mymmo_cards_afrondingen()`
  (Recht / Klein / Groot) en wordt met `mymmo_cards_afronding()` omgezet; een
  oudere vrije waarde wordt de dichtstbijzijnde. Kopieer dat patroon, maak geen
  eigen lijst.
- **Kleur die een redacteur kiest**, komt uit het palet van het thema:
  `ColorPalette` met `disableCustomColors: true`, en bewaar de SLUG (zie `naarSlug()`
  in `mymmo-cards-editor.js`). In de CSS wordt dat `var(--wp--preset--color--<slug>)`.
- **Geen typografie.** Geen lettertype, -grootte, -dikte, regelhoogte of
  letterafstand. De inhoud van een component zijn gewone kop- en alineablokken, en
  die volgen het thema.
- **Iconen zijn thingies** uit de Asset Manager: `mymmo_cards_thingies()` en
  `mymmo_cards_thingie_url($slug)` in `includes/helpers.php`. Geen Dashicons op de
  site, geen icoonlettertype, geen eigen inline SVG, geen emoji als icoon. Een
  nieuw thingy: eerst in de Asset Manager (`brand/thingies/thingies_<slug>.svg`),
  dan in de lijst -- de controle haalt elk bestand online op en weigert een naam die
  niet bestaat. Een `<img>` in de markup krijgt `loading="eager"` en
  `class="skip-lazy no-lazyload" data-no-lazy="1" data-skip-lazy="1"`: de
  lazyload-plugin op syndicoach.be herschrijft anders `src` naar `data-src`.
- **Een kleine glyph** (vinkje, plus, pijltje) teken je met CSS op een `::before`.
- **Mist er een waarde** voor wat je bouwt (een kleinere afronding, een tweede
  schaduw): vraag ze aan. Zet ze niet in je component -- dat is precies de fout
  waarvoor dit bestaat.

## Mobiel en desktop

- **Vier breekpunten, en geen andere.** Telefoon = smaller dan 640px:
  `@media (max-width: 639.98px)` / `(min-width: 640px)`. Smal = tot en met 781px
  (de grens van WordPress): `@media (max-width: 781px)` / `(min-width: 782px)`.
  Zo slaat elk component op hetzelfde moment om als de kaarten en de keien.
- **Een telefoon is een eigen indeling, geen afgeleide.** Elke stylesheet met flex
  of grid heeft een telefoonregel. Denk na over de volgorde (wat komt eerst?), niet
  enkel over "onder elkaar".
- **Een instelling die op een telefoon anders moet**, krijgt een eigen
  telefoonwaarde ZONDER standaard: leeg = volgt de computer. In de CSS:
  `var(--mk-x-m, var(--mk-x))`. Het patroon staat in de keienwolk (1.8.4).
- Geen vaste hoogte voor iets groots, geen schuifbalken, geen `100vw`.
- Aanraakdoelen minstens 44 × 44 px op een telefoon.
- Bekijk het op 375, 768 en 1280 px breed, in de editor via Voorbeeld → Mobiel, en
  op een echt toestel voor je het uitrolt.
- Wie beweging afwijst (`prefers-reduced-motion`), krijgt een stilstaand component.

## Een component bouwen (en hoe het in Gutenberg werkt)

**Bestanden** -- de keienwolk is het voorbeeld:

| Wat | Waar |
|---|---|
| Registratie + render (PHP is leidend) | `includes/class-<naam>.php` |
| De editor, zonder bouwstap (`wp.element.createElement`) | `assets/js/mymmo-<naam>-editor.js` |
| Gedrag op de pagina, alleen als het moet (`view_script`) | `assets/js/mymmo-<naam>.js` |
| Geometrie en gedrag | `assets/css/mymmo-<naam>.css` |
| Enkel hulpmiddelen in de editor (handvatten, selectie) | `assets/css/mymmo-<naam>-editor.css` |
| Aanmelden | `require_once` + `::init()` in `mymmo-cards.php` |

- De stylesheet hangt af van de huisstijl:
  `wp_register_style('mymmo-<naam>', ..., [Mymmo_Cards_Huisstijl::HANDLE], MYMMO_CARDS_VERSION)`.
- Een **dynamisch blok** (`render_callback`); `save` geeft enkel
  `InnerBlocks.Content`. De attributen staan op twee plekken (PHP is leidend), en
  gesloten lijsten gaan met `wp_localize_script` van PHP naar de editor -- nooit een
  tweede kopie in de JS.
- **Inhoud = core-blokken** via `useInnerBlocksProps` (niet `<InnerBlocks>`, zie de
  uitleg bovenaan `mymmo-cards-editor.js`), met `allowedBlocks` waar het component
  een vaste opbouw heeft en een `template` zodat een nieuw blok meteen iets toont.
- **In de inserter**: `category: 'mymmo'`, een Dashicon als `icon`, een titel van
  één tot drie woorden, een beschrijving van één zin die zegt WAT het doet, en
  `keywords` in het Nederlands en het Engels.
- **`supports`**: `html: false`, `anchor`, en `align: ['wide', 'full']` als dat
  zinvol is. NOOIT `color`, `typography`, `spacing`, `border`, `shadow` of
  `dimensions`: dat geeft een vrije kleur, maat of afronding in de zijbalk.
- **De zijbalk (eigenschappen):**
  - Volgorde: eerst wat het component IS (inhoud, indeling -- dit paneel staat
    open), dan het uitzicht (kleur, vorm), dan "Op een telefoon", dan "Beweging".
    Alleen het eerste paneel staat open.
  - Elke keuze uit een gesloten lijst: `SelectControl` of knoppen met de waarden van
    de huisstijl; een kleur met `ColorPalette` uit het palet van het thema.
  - Een schuifbalk (`RangeControl`) alleen voor geometrie die geen huisstijl is
    (positie, schaal, draaiing, breedte). Nooit voor afronding, rand, schaduw, kleur
    of letter.
  - Labels in het Nederlands; een `help`-tekst waar het gevolg niet vanzelf spreekt.
  - Goede standaardwaarden: zonder iets in te stellen ziet het component er af uit.
  - Geen tekstveld waarin iemand CSS, een kleur of een maat typt.
- **Wat je in de editor ziet, is wat er op de pagina komt**: dezelfde klassen en
  variabelen in `edit()` als in de render.
- **Een venster van Mymmo Forms erin?** Dan geen `transform`, `contain` of
  `container-type` op dat element of zijn voorouders: het venster zit daar anders in
  gevangen (zie de uitleg in `mymmo-cards.css`).
- **Twee klassen** voor elke regel die een element raakt (`.mymmo-x .mymmo-y img`):
  een blokthema drukt zijn stijlen na de onze af.

## De controle

| Code | Wat | Niveau |
|---|---|---|
| H01 | letterlijke kleur (ook als terugval in een `var()`) | fout |
| H02 | typografie | fout |
| H03 | afronding buiten de huisstijl | fout |
| H04 | schaduw buiten de huisstijl | fout |
| H05 | randdikte buiten de huisstijl | fout |
| H06 | breekpunt buiten de vier | fout |
| H07 | `!important` | fout |
| H08 | `@import`, `@font-face`, Google Fonts, beeld van buiten de Asset Manager | fout |
| H09 | `overflow: auto/scroll` | fout |
| H10 | `contain` / `container-type` | fout |
| H11 | selector zonder `.mymmo-`, of een element met maar één klasse | fout |
| H12 | `100vw` | fout |
| H13 | flex/grid zonder telefoonregel | fout |
| H14 | beweging zonder `prefers-reduced-motion` | fout |
| H15 | losse opvulling of tussenruimte | waarschuwing |
| H16 | vaste hoogte voor iets groots | waarschuwing |
| H17 | `--mymmo-…` buiten de huisstijl gemaakt, of een die niet bestaat | fout |
| H18 | stylesheet zonder afhankelijkheid van de huisstijl | fout |
| H20 | inline stijl met iets anders dan variabelen | fout |
| H21 | inline SVG op de pagina, `<use>`, `<defs>` | fout |
| H22 | Dashicons of een icoonlettertype op de pagina | fout |
| H23 | thingy dat niet in de Asset Manager staat | fout |
| H30 | blok niet in de categorie `mymmo` | fout |
| H31 | `color`/`typography`/`spacing`/... in `supports` | fout |
| H32 | inserter-icoon dat geen Dashicon is | fout |
| H33 | vrije kleur-, letter-, rand- of maatkiezer | fout |
| H34 | schuifbalk of tekstveld voor afronding, rand, schaduw, kleur of letter | fout |
| H40 | versienummer niet op twee plekken gelijk, of geen README-sectie | fout |
| U01 | uitzondering die minder vindt dan ze zegt | fout |
| R01 | geen review voor deze code (`--bouw`) | fout |

Bestaande uitzonderingen staan in `wp-plugin/huisstijl/uitzonderingen.json`, elk
met de reden. Een paar zijn een "te doen" (de vrije hoeken van de stapel, de vrije
randdikte van de keien).

## De review

`/huisstijl-review` loopt deze lijst af. Elke **moet** die niet klopt, betekent:
geen stempel.

- **Hiërarchie** (moet): één duidelijk hoofdelement; koppen zijn core-kopblokken in
  de juiste volgorde, geen `h1` in een component.
- **Zwaarte** (moet): hoogstens één schaduwniveau; geen dubbele omlijsting (rand én
  schaduw én eigen achtergrond op hetzelfde vlak); randen enkel waar ze iets
  scheiden.
- **Consistentie** (moet): dezelfde opvulling, afronding en afstand als een kaart
  of kei ernaast; niets wat de controle niet ziet maar wel anders oogt.
- **Kleur** (moet): hoogstens één accentkleur per component; tekst op een vlak
  haalt 4,5:1.
- **Iconen** (moet): thingies, in één maat binnen een component.
- **Mobiel** (moet): eigen indeling, logische volgorde, aanraakdoelen, geen
  horizontale schuifbalk, geen inhoud die verdwijnt zonder reden.
- **Gutenberg** (moet): categorie, paneelvolgorde, gesloten lijsten, goede
  standaardwaarden, Nederlandse labels.
- **Toegankelijkheid** (moet): zichtbare focus (`--mymmo-focus`), `alt` op beelden,
  `aria-hidden` op versiering.
- **Beweging** (mag, maar dan): subtiel, en stil voor wie het afwijst.

## Aanscherpen

De vangrails worden strenger met elke fout die erdoor glipt.

1. Zie je een designfout op de site die niet tegengehouden werd: zeg het in één zin
   tegen Claude ("regel erbij: knoppen in een component hebben altijd ...").
2. Claude zet de regel met het WAAROM in dit regelboek; maakt er waar het kan een
   controle van in `controleer.mjs` (een nieuwe H-code); en zoekt meteen waar de
   fout nog voorkomt.
3. Breekt de nieuwe regel bestaande code, dan begint ze als **waarschuwing**, of
   komen de bestaande gevallen in `uitzonderingen.json` met hun reden. Zodra de
   bestaande code eraan voldoet, wordt ze een **fout**.
4. Is ze niet te automatiseren, dan komt ze in de lijst van de review.
5. De lijst uitzonderingen wordt alleen korter.

Die wijzigingen raken de vangrails zelf, dus Nico keurt ze goed.

## Wat je nooit doet

- Extra CSS, een `<style>` in een HTML-blok, een `style="..."` in een pagina.
- Een eigen stylesheet buiten deze plugin, of een tweede plugin voor een component.
- Een lettertype toevoegen, of de stijlen van het thema wijzigen.
- De controle, de huisstijl, de uitzonderingen of het bouwscript aanpassen om groen
  te krijgen.
- Een zip met een versienummer dat al bestaat.
- Een zip met de hand op een site zetten: daar hoort enkel te staan wat op
  `master` staat.
- Wie het component bedenkt iets laten installeren, een commando laten draaien,
  of laten kiezen tussen technische stappen.
