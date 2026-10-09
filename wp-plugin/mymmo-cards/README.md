# Mymmo Componenten

Bouwstenen voor de blok-editor, zodat een marketeer een pagina zet zonder één
regel CSS. Wat erin zit:

| Component | Wat het is |
|---|---|
| **Kaartenstapel** | vier blokken. Kaarten die tijdens het scrollen op elkaar blijven liggen, met een randje van de vorige zichtbaar. |
| **Markeerstift** | een opmaakknop in de werkbalk van elke kop en alinea: een woord selecteren en er een streep achter zetten, in een kleur van het thema. |
| **Knop die een venster opent** | de gewone WordPress-knop, met één keuze erbij: welk tabblad van welke pop-up hij opent. |

Elk component volgt dezelfde regel: **geometrie en gedrag, nooit typografie**. In
de stylesheets staat geen enkele `font-family`, `font-size` of `font-weight`, en
kleur komt altijd uit het palet van het thema. Dat is de reden dat deze plugin
bestaat — zie hieronder.

> De MAPNAAM blijft `mymmo-cards`, ook al heet de plugin nu anders. WordPress
> herkent een plugin aan haar pad: een nieuwe map betekent op de site een
> **tweede** plugin naast de bestaande, en dan draait dezelfde code twee keer
> tot iemand het merkt.

## Waarom deze plugin bestaat

De stapel was met de hand gebouwd: core-Groepen met per kaart een eigen
inline-opvulling, een stuk CSS in "Extra CSS" van één site, en een los script
voor de beweging. Daartussen stond één kaart die uit een andere plugin kwam (de
callout van Mymmo Forms) met haar eigen titel, opvulling en achtergrond.

Die ene kaart gelijk krijgen met de andere betekende: eigenschap per eigenschap
overtypen — lettergrootte, dikte, kleur, opvulling, hoeken — via een
instellingenscherm, met een plugin-release per eigenschap. Dat convergeert niet.
De kaarten waarmee je vergeleek, waren zelf niet gelijk: de ene had
`padding-right:0`, de andere `sm` rondom.

Daarom staat het hier om:

| | Vroeger | Nu |
|---|---|---|
| Typografie | per kaart anders; de plugin-kaart bracht haar eigen kop mee | er staat **geen enkele** letterinstelling in deze plugin; koppen zijn gewone kopblokken en volgen dus het thema |
| Opvulling | inline per kaart, met de hand | op de **stapel**, in drie maten; een kaart mag afwijken |
| Hoogte | `--card: 560px`, met de hand gelijk te houden aan de hoogste kaart | **gemeten** op de pagina |
| Mobiel | een afgeleide van de desktopregels | een eigen indeling, met een instelbare volgorde per kaart |
| Beweging | een script in de site | in deze plugin, in git, met een versienummer |

## De blokken

```
Kaartenstapel            (mymmo/cards)        de stapel: geometrie en beweging
  Kop van de stapel      (mymmo/cards-kop)    blijft staan terwijl de kaarten schuiven
  Kaart                  (mymmo/card)         één of twee kolommen
    Kolom van een kaart  (mymmo/card-kolom)   vul met gewone blokken
```

Een kolom vult je met wat je wil: een kop, tekst, een afbeelding, een video, of
het blok **Mymmo ingang** (uit Mymmo Forms) om het formulier of een stap meteen
in de kaart te zetten. Zet dat blok dan op **kaal** — dan brengt het geen eigen
kaartje mee, want de kaart ís de vorm.

### Instellingen van de stapel

| Instelling | Wat het doet |
|---|---|
| Opvulling van de kaarten | krap / normaal / ruim, voor alle kaarten tegelijk |
| Maximale breedte van een kaart | standaard 1200px; de stapel zelf loopt over de volle breedte |
| Zichtbare rand per kaart | hoeveel van de kaart eronder zichtbaar blijft |
| Scrollafstand tussen kaarten | hoeveel je scrolt voor de volgende kaart de vorige raakt |
| Hoeken | van alle kaarten |
| Hoogte van de kaarten | allemaal even hoog (gemeten) of elk zo hoog als haar inhoud |
| Beweging | de kaart krimpt terwijl de volgende eroverheen schuift, of niets |
| Laten kleven | uit = gewoon onder elkaar; apart in te stellen voor een telefoon |
| Achtergrond van de pagina | de kleur waarop de kop staat |

### Instellingen van een kaart

Verdeling van de kolommen, wat er op een telefoon bovenaan komt, de inhoud
verticaal, een afwijkende opvulling of hoeken, en de achtergrondkleur. Kies die
kleur uit het palet van je thema: dan wordt de **slug** bewaard en schuift de
kaart mee als het merk ooit van tint verandert.

Een kolom heeft één instelling: **tot de rand van de kaart** — voor een
afbeelding of video die tot in de hoek doorloopt.

## De markeerstift

Een woord in een kop uitlichten, zoals het woord *anders* in "Hoe wij het anders
aanpakken". Vroeger was dat een afbeelding die met de hand achter dat ene woord
geduwd werd: per woord werk, niet te herkleuren, en scheef zodra de tekst
wijzigde.

Nu is het een **opmaak**, geen blok — dus je hoeft je kop niet in stukken te
knippen:

1. Selecteer een woord in een kop of alinea.
2. Klik op de markeerstift in de werkbalk (of onder ∨ als de werkbalk vol is).
3. Kies een streep en een kleur. Er staat ook een schakelaar **Ook cursief** bij,
   want die twee gaan meestal samen.

De strepen zijn de SVG's in `assets/vormen/`. De kleuren zijn die van het
**thema** — wat in `theme.json` staat, staat in de kiezer. Kies je geen kleur,
dan krijgt de streep de kleur van de tekst.

### Vier lengtes, automatisch gekozen

De streep wordt uitgerekt tot de breedte van het woord, en dat rekt ook de
TEXTUUR uit: een tekening voor drie letters wordt over een lange woordgroep een
uitgesmeerde balk waarin de trapjes aan het einde even breed worden als een
letter.

Daarom bestaat dezelfde stift in vier lengtes — `markering-stift-1.svg` tot
`-4.svg`, met verhoudingen van 2,1:1 tot 3,6:1. In de kiezer is dat **één keuze**;
welke tekening er op het scherm komt, meet `mymmo-markering-front.js` per woord.
Het vergelijkt de verhoudingen logaritmisch, zodat 2 tegenover 4 even ver mis is
als 4 tegenover 8 — lineair zou de langste tekening altijd winnen zodra een woord
lang wordt.

Zonder JavaScript staat er gewoon de middelste lengte: altijd een streep, alleen
een minder scherpe keuze.

### Wat er niet werkt: een markering over twee regels

Breekt de gemarkeerde tekst over twee regels, dan **valt de streep weg**. De
streep is een absoluut geplaatst pseudo-element; bij een gesplitst inline-element
beslaat dat de ruimte van het begin van de eerste regel tot het einde van de
laatste — een smalle, hoge doos, zichtbaar als een verticaal streepje dwars door
twee regels tekst.

Met CSS is dat niet te repareren: één pseudo-element kan geen twee regels beslaan,
en de fragmenten van een gesplitst inline-element zijn niet apart aan te wijzen.
Geen streep leest als een keuze, een verkeerde streep leest als een fout — dus
markeer een woord of een korte woordgroep, niet een halve zin.

### Hoe het gemaakt is

De streep is een SVG die als **masker** dient, met de kleur eronder. Zo is er
één bestand per vorm in elke merkkleur — een gekleurde SVG zou een bestand per
vorm én per kleur betekenen, en een nieuwe merkkleur een nieuwe set bestanden.

Het masker staat op een `::before` achter de tekst, niet op het element zelf:
dat laatste zou ook de letters wegmaskeren.

De keuzes staan als **klassen** op de `<mark>`
(`mymmo-mark mymmo-mark--penseel mymmo-mark--kleur-accent`), nooit als inline
stijl. Wie geen `unfiltered_html` heeft — een auteur, een redacteur op een
multisite — ziet zijn `style`-attribuut bij het bewaren gefilterd worden; een
klasse komt er altijd door.

### Een streep toevoegen

**Zet het bestand in `assets/vormen/` en dat is alles.** De lijst is de map: er
is geen array die je ernaast moet bijhouden, en dus ook niets dat kan vergeten
worden. De kiezer, de gegenereerde CSS en de proef lezen alle drie diezelfde map.

De bestandsnaam is `markering-<naam>.svg`; `<naam>` wordt de klasse
(`mymmo-mark--<naam>`) en, als hij niet in `LABELS` staat, ook het opschrift in
de kiezer (`dubbele-streep` wordt "Dubbele streep"). `LABELS` in
`includes/class-markering.php` bepaalt alleen de **volgorde** en een nette naam
— wat er niet in staat, komt gewoon achteraan.

Eindigt de naam op een cijfer (`markering-stift-2.svg`), dan is het een **lengte
van dezelfde streep**, geen aparte streep: alles wat enkel in dat eindcijfer
verschilt, wordt één keuze in de kiezer. De verhouding wordt uit de `viewBox`
van het bestand gelezen, niet uit de naam — een tekening kan dus nooit een
andere lengte blijken te hebben dan waarvoor ze wordt ingezet.

Wat de tekening moet zijn:

| | |
|---|---|
| Vulling | **zwart op transparant**. De tekening bepaalt alleen de VORM; de kleur komt eronder vandaan, uit het palet. Een gekleurde SVG zou een bestand per vorm én per kleur betekenen. |
| Schaling | `preserveAspectRatio="none"` — de streep rekt mee met de lengte van het woord. |
| Opbouw | paden met een `fill`, geen `stroke`, geen `<use>`, geen tekst. Een masker kijkt naar dekking, niet naar kleur. |
| viewBox | **strak om de tekening**, zonder lucht eromheen. De streep wordt tot de volle breedte van het vak uitgerekt, dus lege ruimte in de viewBox duwt de streep opzij. |

Bewust geen URL-veld in de editor: die waarde zou in de pagina van een bezoeker
belanden, en een streep hoort bij de huisstijl — niet bij het bericht.

## De knop die een venster opent

Een gewone knop neerzetten en in de zijbalk kiezen **wat** hij opent: een
tabblad van een pop-up uit Mymmo Forms. Bij de ContactPopup is dat bijvoorbeeld
"Offertetool", "Stuur ons een bericht" of "Plan een gesprek".

1. Voeg een **Knoppen**-blok toe — of kies in de inserter meteen
   **"Knop die een venster opent"**; dat is dezelfde knop, alleen vindbaar.
2. Typ de tekst en stel de knop in zoals elke andere knop.
3. Open in de zijbalk het paneel **Opent een venster** en kies je tabblad.

De lijst komt uit de **opstellingen** zelf: de tabbladen die het venster écht
heeft, met de opschriften die daar ingesteld staan. Staat er maar één opstelling,
dan zie je enkel de tabbladen; bij meerdere staat de naam van de pop-up ervoor.

### Waarom de keuze niet uit de INGANGEN komt

Dat was 1.6.0, en het klopte niet. Een ingang zegt HÓE een venster opengaat — een
knop, een klasse, een callout — niet WÁT je te zien krijgt. De lijst stond
daardoor vol met ingangen die enkel bestonden om ergens een knop te kunnen
zetten, en het tabblad dat je wilde openen stond er niet eens in.

De opstelling kan niet verouderen en bevat niets dat er niet toe doet. De
ingangen blijven waarvoor ze bedoeld zijn: callouts.

### Waarom het GEEN eigen knopblok is

Een eigen blok zou zijn eigen vorm meebrengen — eigen kleuren, randen, opvulling
— en dan staat er op de pagina een knop die nét niet is zoals alle andere.
Precies het probleem waarvoor deze plugin bestaat. Door de **kern-knop uit te
breiden** krijg je elke eigenschap die WordPress kent (kleur, rand, typografie,
breedte, opvulling, stijlvarianten) en stijlt het thema hem, net als de rest.

Er komt dus één attribuut bij op `core/button` (`mymmoIngang`), meer niet.

### Hoe hij het venster opent

Mymmo Forms kent drie soorten ingang. Een **klasse-ingang** tekent zelf niets:
ze rendert het venster met `button="no"` en een trigger-selector, en daarna
opent elk element met die klasse dat venster. Dat is wat we nodig hebben — onze
knop is dat element.

`class-knop.php` stelt daarom ter plekke een klasse-ingang samen met de gekozen
opstelling, het gekozen tabblad en een eigen trigger
(`mymmo-opent-<opstelling>-<tabblad>`), en geeft die aan
`Mymmo_Forms_Shortcodes::render_ingang()`. Er wordt **geen regel venster-logica
overgeschreven**: welk formulier, welke agenda, welke stappen, welke teksten —
dat blijft allemaal van Mymmo Forms. Er wordt ook **niets bewaard**: dat object
leeft alleen tijdens dat ene verzoek, en de ingangenlijst in wp-admin blijft
onaangeroerd.

Twee knoppen met dezelfde keuze delen **één** venster: de trigger-klasse is uit
die keuze afgeleid, dus het venster wordt maar één keer uitgeschreven. Een tweede
exemplaar zou hetzelfde formulier nog eens in de DOM zetten, met alles wat
daaraan hangt.

### Op een tabblad, niet op een stap

Binnen het gekozen tabblad begint de stappenreeks bij stap 1. Een stap vooraan
zetten kan alleen een **callout**, want die haalt de stap uít het venster en zet
hem in de pagina. Dat is bewust niet nagebouwd voor een knop.

### Als Mymmo Forms niet aanstaat

Dan is het gewoon een knop. Het paneel zegt dat, in plaats van een lege
keuzelijst te tonen. `mymmo-cards` importeert niets uit die plugin: het gebruikt
haar publieke klassen achter een `class_exists()`, en de koppeling is
éénrichting.

De **link** van de knop blijft de terugval voor wie geen JavaScript heeft. Laat
je hem leeg, dan krijgt de knop er bij het renderen een (`href="#"`) — zonder
`href` is een `<a>` niet met het toetsenbord te bereiken, en dan zou de knop
alleen met de muis werken.

## Hoe de stapel werkt

Alles staat in CSS-variabelen; twee ervan worden op de pagina gemeten.

| Variabele | Waar komt ze vandaan |
|---|---|
| `--mk-kop` | de hoogte van de kop — gemeten |
| `--mk-hoogte` | de hoogste kaart — gemeten; voedt de kleefwiskunde en de marge onder de kop |
| `--mk-kaart-hoogte` | per kaart: het oplopende maximum tot en met haar — haar hoogte én haar scrollafstand |
| `--mk-stap`, `--mk-gap`, `--mk-hoeken`, `--mk-max` | ingesteld op de stapel |
| `--mk-aantal`, `--mk-index` | geteld in PHP |

Daaruit volgt `--mk-kleef` (waar kaart 1 blijft staan) en `--mk-slot` (hoeveel
hoogte één kaart in de pagina inneemt, en dus hoe lang je voor haar scrolt).

Drie dingen die bewust zo zijn:

- **De index wordt in PHP geteld, niet in CSS.** `nth-child` levert geen getal
  op dat je in `calc()` kan gebruiken, en het met de hand uitschrijven is
  precies wat er eerder stond: `.stack-1 {} .stack-2 {}` tot en met het aantal
  kaarten dat er toen toevallig was. Daarom rendert de stapel haar kinderen zelf.
- **Invoer en gebruik zijn gescheiden.** Wat een redacteur instelt, komt als
  inline `style` op het blok — en een inline waarde wint van élke selector, ook
  van een media query op datzelfde element. Zou `--mk-stap` rechtstreeks
  gebruikt worden, dan kon een telefoon de ingestelde waarde nooit verkleinen.
  De inline-stijl zet dus `--mk-stap`, en de CSS rekent daaruit per breekpunt
  `--mk-stap-nu` uit. Om dezelfde reden is de opvulling een **klasse**.
- **Zonder JavaScript werkt de stapel.** Beide gemeten waarden hebben een
  terugval. Wat je dan verliest is de exacte pasvorm en de krimp, niet de stapel.

## Wat het script doet

Twee dingen, en niets anders: de twee hoogtes meten, en de kaart laten krimpen
terwijl de volgende eroverheen schuift. Het meet met de klasse `--meten`, die de
kaarten even op hun natuurlijke hoogte zet — zonder dat meet het zijn eigen
vorige antwoord, want de kaarten dragen op dat moment al `min-height`.

Bewust **geen** `ResizeObserver`: die ziet ook onze eigen `min-height`
veranderen en meet dan zichzelf in een kringetje. In de plaats daarvan:
`load` van de afbeeldingen, `fonts.ready`, `resize`, en `mymmo:venster` (Mymmo
Forms haalt een stap uit een kaart en zet hem er weer in — de kaart wordt daar
hoger of lager van).

## Grenzen

- Een kaart is minstens zo hoog als alle kaarten **vóór** haar, en niet hoger.
  Staat er in de laatste kaart veel meer dan in de rest, dan worden de kaarten
  ervoor dus niet meegerekt.
- Kolommen binnen een kaart slaan om onder 640px — met een gewone **media
  query**, dus aan de breedte van het scherm. Een container query zou logischer
  zijn (het gaat over de kaart), maar `container-type` maakt van de kaart het
  referentiekader voor `position: fixed`: een venster van Mymmo Forms in die
  kaart zou dan niet meer over de pagina liggen maar in de kaart gevangen
  zitten — en dat zie je pas als iemand op de knop drukt.
- Er is nog **geen** voorbeeld van een stapel in het beheerscherm. Je ziet hem in
  de editor (zonder kleefgedrag, want dat is niet te bewerken) en op een
  concept-pagina.

## Zonder WordPress bekijken

```bash
php wp-plugin/mymmo-cards-preview.php > proef.html
```

Bouwt een stapel van vijf kaarten met dezelfde renderfuncties als op een pagina:
tekst naast beeld, beeld tot in de hoek, een video, een kaart met een ingang
erin, en een kaart met een lege tweede kolom (die hoort niet gerenderd te
worden). Let op: in die proef staat geen thema, dus de letter is die van de
browser — beoordeel de typografie op de site zelf.

```bash
php wp-plugin/mymmo-markering-preview.php > proef.html
```

Zet elke streep in elke kleur naast elkaar: op een kop, in lopende tekst en op
een donkere achtergrond. Het palet in die proef is een voorbeeld — op de site
komen de kleuren uit `theme.json`.

## De huisstijl

Sinds 1.9.0 heeft de plugin één plek met de waarden van de huisstijl, en
controles die erover waken -- zodat een nieuw component er niet meer uitspringt
omdat het net een andere afronding, een eigen grijs of een zwaardere schaduw
meebrengt.

| Wat | Waar |
|---|---|
| De enige letterlijke kleuren, afrondingen, schaduwen, randen en opvullingen | `assets/css/mymmo-huisstijl.css` |
| De categorie "Mymmo" in de inserter, en het laden van die stylesheet | `includes/class-huisstijl.php` |
| De grenzen in de blok-editor (voor iedereen, op elke site) | `includes/class-bewaking.php` |
| De iconen: de thingies uit de Asset Manager | `mymmo_cards_thingies()` in `includes/helpers.php` |
| De controle op de code | `node wp-plugin/huisstijl/controleer.mjs` |
| Bewuste uitzonderingen, met de reden | `wp-plugin/huisstijl/uitzonderingen.json` |
| Het regelboek (wat mag, hoe je bouwt, hoe de regels strenger worden) | `CLAUDE.md` naast dit bestand |

**In de editor** ziet een redacteur alleen nog wat het thema aanbiedt: het
palet, de lettergroottes en de opvullingen van het thema, geen eigen kleur, geen
eigen lettertype, geen eigen afronding of rand. "Extra CSS" en de stijlen van het
thema zijn niet meer te wijzigen, en de Font Library staat uit. Bewaart iemand
een pagina waarin er toch een eigen kleur, lettertype of `<style>` BIJ gekomen
is (geplakt, of via de code-editor), dan weigert de editor dat met de reden
erbij. Wat al op een pagina stond, blijft staan.

Noodrem in `wp-config.php`: `define('MYMMO_HUISSTIJL_OPEN', true);` zet de
bewaking uit; `define('MYMMO_HUISSTIJL_BEHEERDERS', 'naam@mymmo.com');` stelt
een paar adressen vrij.

## Bouwen

```bash
bash wp-plugin/build-mymmo-cards.sh 1.0.1
```

Het versienummer staat op **twee** plekken in `mymmo-cards.php` (de docblock en
`MYMMO_CARDS_VERSION`) en moet daar gelijk staan — de constante bepaalt de
cache-busting van CSS en JS. Het script controleert dat en weigert anders.

Sinds 1.9.0 maakt het script ook geen zip zolang de huisstijlcontrole niet
groen is én er geen review is voor precies deze code
(`wp-plugin/mymmo-cards.review.json`, gezet door `/huisstijl-review` in Claude
Code). `CLAUDE.md` legt uit hoe.

**Uploaden hoeft niet meer (sinds 1.9.1).** Wat op `master` komt, bouwt GitHub
en brengt het uit als release `mymmo-cards-vX.Y.Z`
(`.github/workflows/mymmo-cards-release.yml`). Elke site kijkt elk uur of er een
nieuwere is en werkt zichzelf bij (`includes/class-updates.php`); wie niet wil
wachten, klikt in wp-admin op Dashboard → Updates → "Opnieuw controleren". Een
site neemt enkel een release die de workflow maakte en waarvan de commit op
`master` staat. Lokaal bouwen blijft kunnen om iets uit te proberen; zet zo'n zip
niet met de hand op een site, want de volgende update zet hem terug.

Uitzetten per site: `define('MYMMO_CARDS_GEEN_AUTO_UPDATE', true);` in
`wp-config.php`. De nieuwe versie staat dan nog wel onder Updates.

## Versies

**1.10.0** — de stappen. Een nieuw component voor "de werkwijze in vier
stappen": blok **Stappen** (`mymmo/stappen`) met daarin een blok **Stap** per
stap. De inhoud van een stap zijn gewone blokken (kop, alinea, lijst, knoppen,
kolommen, video); het nummer zet de plugin zelf. Op een computer staan de
stappen als panelen naast elkaar en schuift de ene na de andere open terwijl je
scrolt; op een telefoon, in de editor en zonder JavaScript staan ze onder
elkaar.

Vervangt een handgebouwde versie op syndicoach.be met een eigen `<style>` en
`<script>` in een HTML-blok. Wat daarvan bewust NIET is meegekomen, en waarom:

- de eigen kleuren, letters en knopstijlen: die komen nu uit het thema en het
  palet, zoals bij elk component;
- het breekpunt van 1024px: de stand naast elkaar begint op 782px, het
  breekpunt van de rest van de plugin;
- de schuifbalk in een open paneel: het script MEET of elke stap in het scherm
  past, en anders blijven de stappen onder elkaar staan;
- de Captain/Assistant-kaarten die breder worden onder de muis: dat is een
  apart component, geen onderdeel van een stap.

Ook nieuw: de lijststijl **Vinkjes (in een stap)** voor de kern-lijst, met een
vinkje in de kleur van het nummer.

**1.9.1** — de plugin werkt zichzelf bij. Wat op `master` komt, brengt GitHub
uit als release, en elke site haalt die binnen het uur op; uploaden is niet meer
nodig. Dit is de laatste versie die nog met de hand op een site moet. Zie
"Bouwen".

De hoeken komen uit de huisstijl: **Recht, Klein (14px) of Groot (28px)**, op de
stapel en op een kaart, in plaats van een schuifbalk van 0 tot 60 en een lijst
met 16/35/48. Een bestaande stapel of kaart krijgt de maat die er het dichtst bij
ligt: 16 wordt 14, 35 en 48 worden 28. Dat is de enige zichtbare wijziging, en
ze is bewust: zo heeft elke kaart op de site dezelfde hoeken.

De rand van de keien heeft geen schuifbalk meer: een kei heeft een rand of niet
(of volgt de wolk), en de dikte komt uit de huisstijl (1,5px, dezelfde als de
keitjes). Een bestaande rand van 2px of meer wordt 1,5px.

**1.9.0** — de huisstijl als vangrail. Er is één bestand met de toegelaten
kleuren, afrondingen, schaduwen, randen en opvullingen
(`mymmo-huisstijl.css`), en de stapel en de keien verwijzen er nu naar in plaats
van eigen waarden te dragen -- er verandert niets aan hoe ze eruitzien. Alle
blokken staan in een eigen categorie **Mymmo** in de inserter (was: Ontwerp).
De kleurkiezers van de stapel, de kaart en de keien bieden alleen nog het palet
van het thema aan; een eigen kleur kiezen kan niet meer (een bestaande blijft
staan). De paginakleur van de stapel is standaard leeg = de paginakleur van de
huisstijl, wat hetzelfde wit is als vroeger.

De keien slaan nu om op dezelfde breedte als de kaarten (smaller dan 640px).
Tot nu toe stonden ze op exact 640px al gestapeld terwijl de kaarten er nog
naast elkaar stonden.

Nieuw voor de hele site: de editor biedt alleen nog aan wat het thema heeft
(geen eigen kleur, lettergrootte, regelhoogte, afronding of rand; geen
standaardkleuren van WordPress), "Extra CSS" en de stijlen van het thema liggen
vast, de Font Library staat uit, en opslaan wordt geweigerd als er een eigen
kleur, lettertype of `<style>` bijkomt. De patronen van wordpress.org staan uit;
die van het thema blijven. Zie "De huisstijl" hierboven.

De lijst met thingies staat nu in `mymmo_cards_thingies()` (helpers.php), voor
elk component; de keien gebruiken ze daar.

**1.8.8** — waar de academy opent is een KEUZELIJST: de inhoudspagina en elke
cursus apart, gegroepeerd. De lijst komt uit de academy zelf (`/api/catalog`,
`destinations`), dus een nieuwe cursus of een nieuwe pagina (bv. certificaten)
staat er vanzelf in. De knop bewaart een PAD (`mymmoAcademyPad`); een knop van
1.8.5-1.8.7 met enkel een cursus blijft werken.

**1.8.7** — de academy-popup wordt ook herkend als op Instellingen → Mymmo
academy nog enkel een formulier staat (en geen popup): elke popup met dat
formulier telt dan. Zonder dat bleef de knop een gewone knop, zonder de keuze
waar de academy opent.

**1.8.6** — bij de academy-popup kies je ook een les (optioneel), en kan je de
cursus intypen als de lijst met cursussen niet geladen kon worden. Zonder dat
kon je in dat geval enkel het overzicht openen.

**1.8.5** — "Opent een venster" op een gewone knop werkt met de popup van de
academy (Mymmo Forms 1.20.6): kies je die popup, dan vraagt het paneel waar de
academy opent (het overzicht of een cursus), en wordt de knop een academy-knop.
Waarom: de knop schreef een EIGEN kopie van het venster uit, en die kopie
kende de academy niet -- na het verzenden bleef de bezoeker op het
dankjewelscherm staan, en wie al aangemeld was kreeg het formulier opnieuw.

**1.8.4** — de keienwolk is volledig in te stellen voor een telefoon.

- Per kei: grootte, scheef, links/rechts en hoger/lager op een telefoon. Per
  keitje: maat, plaats en scheef, naast het bestaande "tonen op een telefoon".
  Per wolk: breedte van een kei, (verticale) overlap, lucht boven en onder, en
  de standaardmaat van keitjes zonder eigen telefoonmaat.
- Een telefoonwaarde die je NIET invult, volgt de computer (of de automatische
  zigzag). Daarom hebben die attributen bewust geen standaard: een aanpassing
  aan de computerstand neemt de telefoon mee tot je de telefoon zelf instelt.
  "Alles zoals op de computer" wist ze weer.
- Zet het voorbeeld van de editor op Mobiel, en slepen, "Rondom schikken" en
  "Keitje toevoegen" bewaren de TELEFOONplaats; de computer blijft staan. De
  sleepgreep is dan groen. Een keitje dat op een telefoon verborgen is, staat
  in dat voorbeeld half doorzichtig, zodat je het terug kan aanzetten.

**1.8.3** — de grote keien zijn organische vierkanten.

- Een grote kei is geen afgeronde blob meer maar een organisch vierkant: vier
  hoeken tussen ~82 en ~98 graden, elk met een eigen afronding, en zijden die
  licht bollen. border-radius kan dat niet (de hoeken blijven 90 graden), dus
  de vorm is nu een SVG-pad achter de inhoud (`Mymmo_Cards_Keien::kei_paden()`,
  vier vormen). De rand is een echte lijn in vaste pixels.
- Het ademen golft nu tussen twee standen van dat pad (SMIL `<animate>`, want
  CSS kan `d` niet animeren in Safari). Wie beweging uit heeft staan, krijgt de
  vorm stil: het script haalt de animatie weg.
- De keitjes blijven rond.

**1.8.2** — rustiger: randkleur, begrensde parallax, subtieler zweven.

- Randkleur en -dikte op de grote keien: voor de hele wolk, en per kei te
  overschrijven. De rand staat er altijd (standaard onzichtbaar), zodat een kei
  niet van maat verandert als je een kleur kiest.
- De parallax is begrensd: hoogstens ~70px uitslag, zacht afgeremd (tanh) in
  plaats van een harde stop. Midden op het scherm is er een RUSTZONE waarin de
  keitjes stil op hun plek tegen de keien liggen; ze schuiven pas weg als de
  wolk het scherm in- of uitgaat.
- Het tempo van een keitje is niet meer in te stellen: het volgt uit maat en
  laag (groot en vooraan = sneller). De oude snelheid van een keitje wordt
  genegeerd.
- Zweven subtieler: "zacht" 4px over 9s (was 7px over 7,5s), "speels" 8px; de
  keitjes wiebelen minder en trager.

**1.8.1** — de keitjes liggen TEGEN de keien, niet in een ring rond de pagina.

- De plaats van een keitje rekent nu tegen de KERN (de keien samen) in plaats
  van tegen de volle breedte. Op een breed scherm lag "5%" anders ver van de
  keien weg. Gevolg voor een wolk die al op een pagina staat: de keitjes staan
  na de update op een andere plek -- druk één keer op "Rondom schikken".
- "Rondom schikken" meet de echte omtrek van de keien en legt de keitjes er
  onregelmatig tegenaan: soms een paartje, soms half over de rand (dan liggen
  ze ervoor). Elke klik geeft een andere schikking.
- Maximale breedte van het geheel, standaard 1200px.
- Alle keitjes schuiven in DEZELFDE richting; enkel het tempo verschilt. Een
  negatieve snelheid van 1.8.0 telt als positief.
- Geen schaduw meer onder de keien.
- Aanwijzen haalt een kei niet meer naar voren: dat knipte in één klap door de
  buur heen. De volgorde ligt vast; hover vergroot enkel een tikje.

**1.8.0** — de keienwolk.

- Nieuw blok "Keienwolk" (`mymmo/keien`) met twee kindblokken: "Kei" (groot,
  met gewone blokken erin -- een afbeelding, een uitspraak) en "Keitje" (klein,
  met een tekening uit de stappen van Mymmo Forms). Bedoeld voor alles wat
  vanuit de KLANT spreekt ("Klinkt dit bekend?"): vrij, overlappend, bewegend,
  het tegendeel van een rij kaartjes.
- De keien zweven (CSS), hun vorm ademt traag, en een schaduw op de grond
  krimpt als ze opstijgen. De keitjes schuiven parallax voorbij, elk met een
  eigen snelheid; positief is sneller dan de pagina (dichtbij), negatief trager
  (ver weg). In het MIDDEN van het scherm staat alles waar het in de editor
  staat.
- Alles staat in de blok-editor, per wolk, kei en keitje -- niets in een
  instellingenscherm. Keitjes versleep je aan hun greep; "Keitjes rondom
  schikken" legt ze in een ring als vertrekpunt.
- Een nieuwe wolk start met de drie uitspraken van "Klinkt dit bekend?" in de
  kleuren van syndicoach.be en tien keitjes eromheen. De afbeeldingen van de
  keien kies je zelf; de teksten staan er als voorbeeldtekst, niet als inhoud.
- Wie beweging heeft uitgezet (prefers-reduced-motion), krijgt alles stil. Een
  kei met een venster van Mymmo Forms erin beweegt niet: een translate zou dat
  venster in de kei vangen.
- De bestaande blokken zijn niet aangeraakt.

**1.7.1** — een knop die een venster opent, opent het nu ook echt.

- Op sommige pagina's deed de knop niets. Oorzaak: het venster werd maar één
  keer per verzoek uitgeschreven, met een vlag die bijhield dat het er al stond.
  WordPress rendert dezelfde inhoud vaak meer dan eens per verzoek en gooit de
  eerste uitvoer weg (een SEO-plugin die een beschrijving maakt, een excerpt,
  een menu). De vlag stond dan al op "gedaan" bij de render die wél op de pagina
  kwam -- knop met klasse, geen venster erbij. Daarom niet altijd: het hangt af
  van wat er nog meer op de site draait.
- Het venster gaat nu altijd mee; Mymmo Forms 1.17.26 houdt er bij het laden één
  per keuze over. Met een oudere Mymmo Forms werkt de knop ook, alleen staat het
  venster dan dubbel in de pagina.

**1.7.0** — de knop kiest een TABBLAD, niet een ingang.

- De keuzelijst komt nu uit de **opstellingen** van Mymmo Forms: de tabbladen die
  het venster écht heeft, met hun eigen opschriften ("Offertetool", "Stuur ons
  een bericht", "Plan een gesprek").
- Waarom 1.6.0 fout zat: een ingang zegt HÓE een venster opengaat, niet WÁT je te
  zien krijgt. De lijst stond vol ingangen die enkel bestonden om ergens een knop
  te kunnen zetten, en het tabblad dat je wilde openen stond er niet eens in.
- Staat er maar één opstelling, dan toont de lijst enkel de tabbladen. Bij
  meerdere staat de naam van de pop-up ervoor.
- Een knop die met 1.6.0 op een ingang stond, **zegt dat** — in de editor én op de
  pagina voor wie mag bewerken. Stil laten vallen zou een knop opleveren die
  niets doet en er goed uitziet.
- Het venster wordt per (opstelling, tabblad) één keer uitgeschreven
  (teruggedraaid in 1.7.1: die vlag was de oorzaak van knoppen die niets deden).

**1.6.0** — een knop die een venster van Mymmo Forms opent.

- De **kern-knop van WordPress** krijgt één keuze erbij: welke ingang hij opent.
  Geen eigen knopblok, want dat zou zijn eigen vorm meebrengen en er dus net
  anders uitzien dan de rest van de knoppen op de site.
- In de inserter staat hij als **"Knop die een venster opent"** — een variant van
  `core/buttons`, want `core/button` zelf verschijnt alleen als je al in een
  knoppenrij staat.
- De brug gebruikt de **klasse-ingang** van Mymmo Forms: die rendert het venster
  zonder eigen knop en opent op elk element met haar trigger-klasse. Er wordt
  dus geen venster-logica overgeschreven, en de oorspronkelijke ingang blijft
  onaangeroerd.
- Twee knoppen met dezelfde ingang delen één venster.
- Een knop **zonder link** krijgt er bij het renderen een, anders is hij niet met
  het toetsenbord te bereiken. De klasse gaat erop met
  `WP_HTML_Tag_Processor`, niet met een reguliere expressie.
- Staat Mymmo Forms niet aan, dan is het gewoon een knop — en zegt het paneel
  dat, in plaats van een lege keuzelijst te tonen.

**1.5.3** — lettertype en dikte bij de markering.

- **De knop "vet" deed niets op een kop, en dat was geen bug.** `<strong>` krijgt
  van de browser `font-weight: bolder`, en dat is *relatief*: in een kop die al
  op 700 staat betekent bolder 900, en heeft het lettertype geen 900, dan
  verandert er niets — zonder foutmelding, zonder zichtbaar verschil.
- Daarom staat er nu **Dikte** in het paneeltje, met absolute waarden
  (Normaal 400 tot Extra vet 800). Een gesloten lijst: 350 of 512 bestaat in geen
  van onze lettertypes, en een dikte die stil terugvalt op de dichtstbijzijnde
  is een instelling die iets anders doet dan ze zegt.
- En **Lettertype**, gevuld uit `theme.json`. De plugin kent geen enkele
  lettertypenaam; de klasse wijst naar `var(--wp--preset--font-family--<slug>)`,
  net zoals de kleuren al naar het palet wezen. Zet iemand er een lettertype bij
  in het thema, dan staat het de volgende paginalading in de kiezer.
- Beide regels gebruiken **twee klassen** (`.mymmo-mark.mymmo-mark--font-x`).
  WordPress drukt de stijlen van een blokthema inline in de `<head>` af, dus ná
  onze stylesheet; `.wp-block-heading { font-family }` zou bij gelijk gewicht
  gewonnen hebben.
- De klassenlogica in de editor kent nu drie voorvoegsels naast de vorm
  (`--kleur-`, `--font-`, `--gewicht-`). Stond er één niet in die lijst, dan werd
  die klasse voor een vorm aangezien en bij de eerstvolgende wijziging
  weggegooid — zichtbaar als een instelling die zichzelf terugzet.

**1.5.2** — de streep ligt strakker om het woord.

- De doos van de streep was het hele inline-element (van bovenlengte tot
  onderlengte, ruim 1,2em) plus nog eens 0,14em boven en onder en 0,28em links
  en rechts. Resultaat: bijna anderhalf keer de lettergrootte hoog en een halve
  letter te breed aan weerszijden.
- De hoogte wordt nu **rechtstreeks gezet** als deel van de lettergrootte
  (`--mk-mark-hoogte`, 1,15em) en verticaal gecentreerd, los van de toevallige
  metriek van het lettertype. De uitloop links en rechts staat apart
  (`--mk-mark-uitloop`, 0,15em).
- Beide waarden zijn **gemeten**: bij 1em blijft de laatste letter onbedekt —
  het rechteruiteinde van de tekening loopt omhoog en breekt daar in dunne
  treden, dus daar zit minder inkt dan links. Bij 1,2em wordt het weer een vlek.
- Het keuzescript meet sindsdien het **pseudo-element zelf**
  (`getComputedStyle(el, '::before')`) in plaats van het woord plus een kopie
  van die marges. Twee plekken met dezelfde getallen lopen ooit uiteen.

**1.5.1** — de echte tekeningen, in vier lengtes.

- De vijf strepen die ik zelf getekend had, zijn vervangen door **vier
  tekeningen van de huisstijl**: dezelfde stift in vier lengtes.
- Ze zijn alle vier getekend in één canvas van 500×100, rechts uitgelijnd, met de
  lege ruimte links. Die ruimte is eruit: de **viewBox is bijgesneden tot de
  bounding box** van het pad (gemeten met `getBBox()` in een echte browser, niet
  geschat op de controlepunten). Zonder dat zou de streep naar rechts geduwd
  worden en maar over het laatste stuk van het woord lopen.
- **De lengte wordt per woord gekozen** door `mymmo-markering-front.js`. Zonder
  JavaScript staat de middelste lengte er, dus er is altijd een streep.
- **Een markering die over twee regels breekt toont geen streep meer** in plaats
  van een verticaal streepje dwars door beide regels.
- 1.5.0 is nooit uitgerold; die zip bevat nog mijn eigen tekeningen.

**1.5.0** — de markeerstift, en de plugin wordt een componentenbibliotheek.

- **Nieuw: de markeerstift.** Een opmaakknop in de werkbalk van elke kop en
  alinea. Selecteer een woord, kies een streep en een kleur uit het palet van
  het thema. Een schakelaar zet het woord meteen ook cursief.
- **De strepen zijn de bestanden in `assets/vormen/`.** Een tekening toevoegen
  is een bestand neerzetten, geen regel code: de kiezer, de gegenereerde CSS en
  de proef lezen alle drie die map.
- Het vervangt de afbeelding die op syndicoach.be met de hand achter het woord
  *anders* geduwd stond: per woord werk, niet te herkleuren, en scheef zodra de
  tekst wijzigde.
- Het is een **opmaak en geen blok**, zodat een kop niet in stukken geknipt hoeft
  te worden om er één woord uit te lichten.
- De streep is een SVG als **masker**, met de kleur eronder — één bestand per
  vorm in elke merkkleur, in plaats van een bestand per vorm én per kleur.
- De keuzes staan als **klassen** op de `<mark>`, nooit als inline stijl: wie
  geen `unfiltered_html` heeft, ziet zijn `style`-attribuut bij het bewaren
  gefilterd worden.
- De **plugin heet nu Mymmo Componenten**. Er komen meer bouwstenen bij, en die
  horen bij elkaar: ze delen dezelfde uitgangspunten. De **mapnaam blijft
  `mymmo-cards`** — WordPress herkent een plugin aan haar pad, dus hernoemen zou
  op de site een tweede plugin naast de bestaande opleveren.
- Nieuw: `php wp-plugin/mymmo-markering-preview.php > proef.html`.

**1.4.7** — wat onder de stapel staat, begint weer onder de laatste kaart.

- De kaarten hangen buiten de flow (in ankers van 0px); hun hoogte zit in de
  lege vlakken ertussen. In 1.4.6 verdween het vlak achter de laatste kaart om
  de dode scroll weg te nemen — en daarmee de enige plek waar de hoogte van die
  kaart in de pagina stond. De sectie eronder begon dus bovenaan die kaart.
- Twee eisen die tegen elkaar in lijken te gaan: het loslaten moet op de landing
  vallen (anders dode scroll), én de hoogte van de laatste kaart moet in de
  pagina staan (anders overlapt wat eronder komt). Dat kan alleen als het
  KLEEFGEBIED eerder eindigt dan de STAPEL — vandaar twee dozen:

  | doos | taak |
  |---|---|
  | `.mymmo-kaarten-lijf` | de ouder van alle kaarten; eindigt bij de landing en bepaalt dus wanneer ze loslaten |
  | `.mymmo-kaarten-uitloop` | staat eráchter, buiten het lijf, en zet enkel de hoogte van de laatste kaart in de pagina |

  Alles in één doos stoppen kan niet: dan verschuift het loslaten mee met die
  hoogte en is de dode scroll terug.
- **De scrollpositie blijft nu staan bij een hermeting.** Tijdens het meten gaan
  de kaarten even op hun natuurlijke hoogte en wordt de pagina korter; stond de
  bezoeker ver in de stapel, dan kapte de browser zijn scrollpositie af en stond
  hij daarna ergens anders. Dat gebeurt precies wanneer een afbeelding of een
  lettertype laat binnenkomt — midden in het lezen dus. Kwam aan het licht bij
  het nameten in de browser.

**In de browser nagemeten** (zes kaarten, viewport 914px):

| scroll | de zes kaarten | afstand tot de sectie eronder |
|---|---|---|
| 3150 | 167 / 183 / 199 / 215 / 231 / **260** | 40px onder de kaart |
| 3200 | 130 / 146 / 162 / 178 / 194 / 210 | 40px |
| 3300 | 30 / 46 / 62 / 78 / 94 / 110 | 40px |
| 3400 | −70 / −54 / −38 / −22 / −6 / 10 | 40px |

Het hoopje vertrekt op de landing, houdt zijn randjes van 16px, en de sectie
eronder blijft op elke scrollpositie exact 40px (de ingestelde lucht) onder de
laatste kaart.

**1.4.6** — het hoopje vertrekt als geheel, op het moment dat het af is.

Twee fouten, allebei in de kleefwiskunde:

- **Elke kaart had een EIGEN `top`** (167, 183, 199, ...). Een kleefelement laat
  los zodra `onderrand van de ouder - scroll = top`, dus met verschillende
  toppen laat elke kaart op een ander moment los: eerst de bovenste, 16px later
  de volgende. Op het scherm is dat "de bovenste kaart schuift weg over een
  hoopje dat blijft liggen". Alle ankers delen nu hetzelfde kleefpunt en de
  staffeling zit in de KAART (haar `top` binnen het anker) — dan laten ze per
  definitie samen los en blijven de randjes staan zoals ze liggen.
- **Achter de laatste kaart stond nog een leeg vlak** (haar scrollafstand). Dat
  was de dode scroll: de kaart lag op haar plek en er gebeurde niets tot dat
  vlak voorbij was. De scrollafstand staat nu TUSSEN de kaarten en niet erachter,
  dus het einde van de stapel valt samen met het moment dat de laatste kaart
  ligt.

**In de browser nagemeten** (zes kaarten, viewport 914px):

| scroll | posities van de zes kaarten | onderlinge afstand |
|---|---|---|
| 3160 | 167 / 183 / 199 / 215 / 231 / **250** | laatste kaart nog 19px onderweg |
| 3180 | 150 / 166 / 182 / 198 / 214 / **230** | 16 / 16 / 16 / 16 / 16 |
| 3240 | 90 / 106 / 122 / 138 / 154 / 170 | 16 / 16 / 16 / 16 / 16 |
| 3440 | −110 / −94 / −78 / −62 / −46 / −30 | 16 / 16 / 16 / 16 / 16 |

Dus: geen pauze tussen aankomen en vertrekken, en de onderlinge afstanden
blijven exact 16px terwijl alles omhoog schuift.

**Wat nog steeds geldt:** dat wegschuiven heeft scrollruimte NÁ de stapel nodig.
Staat de stapel helemaal onderaan een pagina, dan is er niets meer om naar te
scrollen en blijft het hoopje liggen. De proefpagina heeft daarom sinds deze
versie een sectie onder de stapel — anders meet je iets anders dan de site.

**1.4.5** — herstel: de laatste kaart bleef staan terwijl het dek wegschoof.

- In 1.4.0 kregen alle kaarten behalve de laatste een eigen wikkel ("het dek"),
  zodat die laatste kaart het dek zou wegduwen. Dat gaf het omgekeerde: het dek
  had een ANDERE ouder dan de laatste kaart, en een kleefelement laat los op de
  onderrand van zijn eigen ouder. Het dek liet dus eerder los — de laatste kaart
  bleef staan terwijl de kaarten eronder wegschoven.
- Die wikkel is weg. Sinds de ankers geen hoogte meer hebben (1.4.4) is hij
  overbodig: alle kaarten staan in dezelfde ouder en laten allemaal los op
  hetzelfde moment, het einde van de stapel. Ze schuiven dus als geheel omhoog.
- **In de browser nagemeten** (proefpagina, zes kaarten): de kaarten klikken vast
  op 167 / 183 / 199 / 215 / 231 / 247px, blijven daar staan, en gaan daarna
  allemaal tegelijk naar dezelfde positie (90, -10, -110, …). De krimp loopt
  cumulatief op tot 0,85 / 0,88 / 0,91 / 0,94 / 0,97 voor de vijf kaarten onder
  de bovenste.
- **Let op bij het beoordelen:** dat samen wegschuiven heeft scrollruimte NÁ de
  stapel nodig. Staat de stapel onderaan de pagina, dan eindigt de pagina op het
  moment dat de laatste kaart vastklikt en zie je het nooit gebeuren.

**1.4.4** — het dek schuift als GEHEEL mee omhoog.

- Het loslaatmoment van een kleefelement hangt af van zijn EIGEN hoogte:
  `onderrand van de ouder - scroll = top + eigen hoogte`. Elk anker had de
  hoogte van zijn kaart, dus liet elke kaart op een ander moment los — je zag er
  een meegaan terwijl de rest bleef staan, en op een ander tempo.
- Een anker heeft nu GEEN hoogte (0px) en de kaart hangt er absoluut in. Dan
  valt de vergelijking terug op `onderrand - scroll = top`, en die is voor alle
  kaarten hetzelfde (op de randjes van een paar pixels na). Ze laten samen los
  en schuiven als geheel omhoog, precies zoals ze liggen.
- De scrollafstand zit nu volledig in het lege vlak achter elke kaart. Daardoor
  is de uitloop van 1.4.3 overbodig: `top + 0` valt vanzelf samen met het moment
  dat de laatste kaart haar kleefpositie bereikt.

**1.4.3** — herstel: het dek liet nog steeds te vroeg los.

- De rekensom: een kleefelement laat los zodra `onderrand van de ouder - scroll
  = top + eigen hoogte`. De onderrand van het dek is waar de laatste kaart
  BEGINT, dus het dek liet los terwijl die kaart nog een volle kaarthoogte onder
  de vouw zat. Op een telefoon is dat een heel scherm, en dan zie je een kaart
  uit het midden het dek wegduwen.
- Het dek krijgt nu achteraan een lege UITLOOP ter hoogte van de hoogste kaart
  in dat dek, en de laatste kaart wordt met een even grote negatieve marge weer
  op haar plek getrokken. De onderrand van het dek ligt daardoor precies een
  kaarthoogte later: het loslaten valt samen met het moment dat de laatste kaart
  haar kleefpositie bereikt. De scrollafstand van de stapel blijft gelijk.
- De uitloop gebruikt de hoogste kaart IN HET DEK, niet die van de hele stapel.
  Is de laatste kaart de langste — een formulier bijvoorbeeld — dan zou het dek
  anders pas loslaten als die er al overheen ligt.

**1.4.2** — herstel: het dek werd door de voorlaatste kaart weggeduwd.

- Een kleefelement wordt weggeduwd zodra de onderrand van zijn OUDER op
  `top + de eigen hoogte van dat element` komt. Het kleefelement was het slot:
  kaart PLUS scrollruimte. Die ruimte telde dus mee in die hoogte, en daardoor
  begon het wegduwen een volle kaarthoogte te vroeg — op een telefoon een heel
  scherm te vroeg, waardoor het leek alsof de voorlaatste kaart het dek wegduwde.
- De kaart kleeft nu zelf (in `.mymmo-kaart-anker`, precies zo hoog als de
  kaart) en de scrollruimte staat als een leeg vlak erachter
  (`.mymmo-kaart-ruimte`). Samen even lang als het oude slot, dus het ritme van
  de stapel verandert niet.

**1.4.1** — herstel: er kleefde niets meer.

- De kleefregel stond op `.mymmo-kaarten > .mymmo-kaart-slot`, een DIRECTE
  kindselector. Sinds 1.4.0 staan de slots in het dek en zijn ze geen direct
  kind meer van de stapel, dus gold die hele regel niet meer voor ze: geen
  sticky, geen `top`, geen hoogte. Alle kaarten kwamen gewoon onder elkaar.
- Meteen een oudere fout mee: de negatieve marge die de marge onder de kop
  opheft, hing aan `:first-of-type`. Dat betekent "het eerste kind van hetzelfde
  ELEMENTTYPE", en de kop is ook een `div` — die was dus altijd de eerste en de
  regel raakte nooit een kaart. Gevolg: een stuk dode scrollruimte tussen de kop
  en de eerste kaart. De eerste kaart krijgt nu een eigen klasse uit PHP.

**1.4.0** — de laatste kaart duwt het dek naar boven.

- Een kleefelement blijft plakken zolang zijn OUDER duurt. Alle kaarten stonden
  in dezelfde ouder, dus bleven de bovenrandjes van de eerdere kaarten staan tot
  voorbij de laatste kaart — ook terwijl die er al overheen lag. Je zag een
  stapel randjes bevriezen terwijl de laatste kaart eroverheen schoof.
- Alles behalve de laatste kaart staat nu in een eigen wikkel (`.mymmo-kaarten-dek`).
  Die houdt op waar de laatste kaart begint, dus daar laten de kaarten erin los
  en worden ze naar boven geduwd. De laatste kaart heeft het scherm dan voor
  zich — wat vooral telt als daar een formulier in staat, want die kaart is hoog.
- De laatste kaart blijft zelf wél kleven, zodat ze op haar plek komt te liggen
  in plaats van voorbij te schuiven.
- Die wikkel is een ECHTE doos. `display: contents` zou hier alles kapotmaken:
  geen doos, geen begrenzing, en dan blijven de randjes weer staan tot het einde
  van de stapel.

**1.3.0** — een kaart rekt niet meer mee met een hoge kaart verderop.

- De regel is nu: **een kaart is minstens zo hoog als alle kaarten vóór haar,
  en niet hoger.** Een oplopend maximum dus, geen gedeelde hoogte.
- Waarom die en geen andere: een kier ontstaat doordat een kaart KORTER is dan
  de kaart die ze bedekt — dan steekt die eronder uit. Wat een kaart doet die
  er LÁTER overheen komt, raakt haar niet; die ligt er straks bovenop. Met één
  gedeelde hoogte rekte de hoogste kaart van de stapel alles op, ook de kaarten
  die er ver voor liggen — bij een laatste kaart met een formulier erin werden
  alle korte kaarten ervoor onnodig lang.
- "Negeer de laatste kaart" zou dat éne geval ook oplossen, maar alleen omdat
  de hoge kaart daar toevallig laatste staat; in het midden is de kier er weer.
- De scrollafstand volgt diezelfde hoogte per kaart: door een korte kaart scrol
  je sneller, en de volgende komt dus eerder in beeld.

**1.2.3** — herstel: op een telefoon waren de kaarten niet even hoog.

- Het meetscript topte de gemeten hoogte af op 88% van de schermhoogte, zodat
  een kaart altijd in beeld paste. Dat werkte averechts: is de hoogste kaart
  groter dan dat plafond — op een telefoon eerder regel dan uitzondering — dan
  groeit zíí door haar eigen inhoud terwijl de kortere kaarten op het plafond
  blijven staan. Ze zijn dan dus niet meer even hoog, en in een stapel zie je
  dat meteen: onder een korte kaart komt de kaart daaronder door als een kier.
- Het plafond is weg. Alle kaarten krijgen de hoogte van de hoogste, punt. Dat
  een hoge kaart niet in één keer in beeld past is de prijs van wat erin staat;
  je scrolt er dan doorheen terwijl ze vastgeklikt staat.

**1.2.2** — herstel: uitlijnen was in de editor niet te zien.

- De editor zette `min-height: 0` op elke kaart, zodat een lege nieuwe kaart
  het canvas niet 560px lang maakte. Gevolg: in de editor was er nooit vrije
  ruimte in een kaart, en dus viel er niets uit te lijnen — aan "gecentreerd",
  "onderaan" of de gestapelde variant kon je draaien zonder dat er iets bewoog,
  terwijl het op de pagina wel klopte.
- De hoogte blijft nu staan in de editor. Ze komt daar uit de terugval in de
  stylesheet (560px): het script dat op de pagina de hoogste kaart meet, draait
  in het canvas niet. De verhouding klopt dus niet tot op de pixel, maar de
  ruimte is er — en daar gaat het om bij het uitlijnen.
- Staat de stapel op "elk zo hoog als haar inhoud", dan is de kaart in de
  editor ook weer zo hoog als haar inhoud.

**1.2.1** — herstel: centreren deed niets.

- Het raster in een kaart stond op `min-height: 100%`, maar de kaart heeft geen
  vaste hoogte — alleen een minimum. Een percentage tegen een onbepaalde hoogte
  is nul, dus het raster was precies zo hoog als zijn inhoud en stond de rest
  van de kaart leeg onderaan. Er viel dan ook niets te centreren: `align-items`
  verdeelt ruimte die er niet is.
- De kaart is nu een flexkolom en het raster groeit mee (`flex: 1`). Pas daarna
  betekent "gecentreerd" of "onderaan" iets.
- Daarbij: de rij rekt op (`align-content: stretch`) en de plek van de inhoud
  komt van `align-items`. Dat is ook wat een KOLOM nodig heeft om zelf te kunnen
  afwijken — bij een rij die zo hoog is als haar inhoud valt er per kolom niets
  uit te lijnen. Gestapeld blijft `align-content` sturen: daar gaat het over
  waar het hele blok hangt.

**1.2.0** — uitlijning per kolom, en apart voor naast elkaar en gestapeld.

- **Een kolom kan zelf kiezen** waar haar inhoud hangt: die van de kaart,
  bovenaan, gecentreerd of onderaan. Twee kolommen naast elkaar hebben zelden
  dezelfde wens — tekst gecentreerd naast een beeld dat van boven tot onder
  loopt, of een knop die onderaan blijft staan terwijl de tekst bovenaan begint.
- **De kaart heeft nu twee uitlijningen**: een voor naast elkaar en een voor
  gestapeld (onder 640px). Dat zijn twee verschillende vragen: naast elkaar gaat
  het over de tekst t.o.v. het beeld ernaast, gestapeld over waar het blok
  inhoud in de kaart hangt. Gestapeld blijft standaard bovenaan.
- Daarbij een stille fout rechtgezet: de desktopuitlijning stond buiten elke
  media query en won met haar twee klassen ook op een telefoon van de mobiele
  regel met er een. "Bovenaan" op een kaart betekende dus ook bovenaan
  gestapeld, wat toevallig klopte met de standaard — maar "gecentreerd" was op
  een telefoon niet te krijgen.
- **De vorm op de achtergrond is apart in te stellen op een smal scherm**
  (grootte, positie, draaiing, dekking). Nodig omdat de kaart daar een heel
  andere vorm heeft: wat op 1200px een hoek vult, ligt op 375px over de halve
  tekst. Staat de schakelaar uit, dan geldt gewoon wat er voor breed stond.
- **Een kolom heeft een eigen binnenmarge**, bovenop de opvulling van de kaart,
  en ook die kan op een smal scherm anders. Voor tekst die naast een beeld staat
  dat tot de rand loopt: aan die kant is meer lucht nodig dan aan de buitenkant,
  en dat kan de plugin niet raden.
- Uitlijning per kolom geldt alleen NAAST elkaar. Gestapeld is elke rij zo hoog
  als haar inhoud, dus daar valt niets uit te lijnen; wat daar telt is waar het
  hele blok hangt, en dat is de uitlijning van de kaart.

**1.1.6** — herstel: de maat van de vorm vraagt niets meer aan het bestand.

- Twee eerdere pogingen lieten de hoogte uit het BEELD komen (`height: auto`,
  daarna `aspect-ratio: auto 1`). Allebei hangen ze af van wat de browser uit
  het bestand kan afleiden, en de merk-SVG's hebben alleen een `viewBox` — geen
  `width`, geen `height`. Zo'n bestand heeft geen eigen afmetingen, dus viel de
  browser terug op 150px hoog en schaalde de tekening niet mee.
- De vorm is nu een VLAK met de afbeelding als achtergrond. De hoogte komt van
  een procentuele `padding-top`, en die rekent altijd tegen de BREEDTE van de
  kaart — in elke browser, voor elk bestand. De tekening past erin met
  `background-size: contain` en houdt haar eigen verhouding.
- De URL gaat nu door een strengere controle (geen haakjes, aanhalingstekens of
  witruimte): ze belandt in een `url(...)` in een style-attribuut.

**1.1.5** — de vorm heeft nog maar drie instellingen.

- **Grootte, positie, draaiing.** De aparte hoogte is weg: dat waren twee maten
  voor een vorm die er maar een nodig heeft, en ze werkten elkaar tegen (een
  breedtepercentage rekent tegen de breedte van de kaart, een
  hoogtepercentage tegen haar hoogte).
- De vorm houdt nu haar **eigen hoogte-breedteverhouding**, met
  `aspect-ratio: auto 1`: `auto` is de verhouding van het beeld zelf, en de `1`
  erachter is de terugval voor een bestand dat er geen heeft — wat bij de
  merk-SVG's het geval is (alleen een `viewBox`, geen `width`/`height`).
- Een bestaande vorm hoeft niet opnieuw ingesteld: het attribuut heet intern nog
  `sierBreedte`, alleen het label is nu "Grootte". Een eerder ingestelde hoogte
  wordt genegeerd.

**1.1.4** — de vorm groeit nu zoals je verwacht, en veel verder.

- De hoogte van de doos volgde hetzelfde PERCENTAGE als de breedte, en dat is
  niet dezelfde maat: een breedtepercentage rekent tegen de breedte van de
  kaart (pakweg 1200px), een hoogtepercentage tegen haar hoogte (pakweg 560px).
  De doos was dus veel platter dan breed, en bij `object-fit: contain` bepaalt
  de kleinste kant hoe groot de tekening wordt — een vierkante vorm groeide
  daardoor maar half zo snel als het getal beloofde. "200%" gaf geen vorm van
  twee keer de kaartbreedte, en dat leest als een limiet die er niet is.
  De hoogte volgt nu de breedte in ECHTE pixels (`aspect-ratio: 1`).
- De grenzen staan ruimer: breedte en hoogte tot **1000%**, positie van -300%
  tot 400%. Een harde grens blijft nodig — deze waarden belanden in een
  style-attribuut op de pagina van een bezoeker — maar op een kaart van 1200px
  is 1000% twaalf meter beeld, en daar houdt het redelijke op.

**1.1.3** — herstel: een SVG zonder eigen afmetingen was niet te schalen.

- De vorm stond op `height: auto`, en dan hangt haar maat af van wat er in het
  BESTAND staat. De merk-SVG's (`link.openvme.be/assets/brand/…`) hebben alleen
  een `viewBox` en geen `width`/`height`: zo'n bestand heeft geen eigen
  afmetingen, de browser valt terug op 150px hoog, en de breedte opdraaien
  maakte de doos wel breder maar de tekening niet groter.
- De vorm krijgt nu een EIGEN doos (breedte én hoogte in % van de kaart) met
  `object-fit: contain`. De tekening schaalt daarbinnen mee, of het nu een SVG
  met of zonder afmetingen is of een PNG.
- Nieuw regelaartje: **Hoogte**, standaard 0 = dezelfde maat als de breedte.
  Voor een brede sliert of een hoge vorm.

**1.1.2** — herstel: de vorm op de achtergrond bleef op 100% steken.

- De algemene beeldregel (`.mymmo-kaarten .mymmo-kaart img`) is (0,2,1) en die
  van de sierafbeelding (0,2,0) — een klasse minder, een elementnaam meer. De
  `max-width: 100%` daar won dus van de `max-width: none` hier, en een vorm kon
  nooit groter worden dan de kaart. Net wat een sierafbeelding wél moet kunnen:
  groter dan de kaart, en dan afgesneden.
  De uitzondering staat nu expliciet in die regel (`:not(.mymmo-kaart-sier)`) en
  niet in een specificiteitstruc — een regel op een elementnaam raakt altijd
  meer dan je bedoelt.

**1.1.1** — herstel: de blokken waren leeg in de editor.

- `useInnerBlocksProps` geeft de blokken terug ALS PROP (`props.children`), niet
  als los element. In 1.1.0 gaf de edit-functie daarna nog eigen kinderen mee
  aan `createElement` — en dat moet ook, want InspectorControls hoort erbij —
  waardoor React die prop negeerde en de hele inhoud van het blok verdween. In
  de editor zag je een leeg kadertje: geen foutmelding, geen kolommen, niets.
  Op de PAGINA was er niets aan de hand (die wordt door PHP gerenderd), wat het
  extra verwarrend maakt.
  `binnenProps()` haalt `children` er nu uit en geeft hem apart terug.

**1.1.0** — de stapelbeweging klopt, de editor liegt niet meer, en een vorm op de achtergrond.

- **De krimp telt op.** Een kaart wordt kleiner voor élke kaart die er nog
  overheen komt, niet alleen voor de eerstvolgende. Daardoor lopen de zichtbare
  randen als een waaier uit elkaar; met alleen de volgende kaart zijn ze
  allemaal even breed en ziet de stapel er plat uit. De voortgang wordt gemeten
  aan de KLEEFPOSITIE (de laatste 320px voor een kaart aankomt), niet aan de
  overlap — zo is de maat gelijk voor elke kaart, hoe hoog ze ook is.
- **Nooit een transform op een kaart met een venster erin** (en nooit
  `scale(1)`): een element met een transform wordt het referentiekader voor
  `position: fixed` van alles wat erin staat, en dan zit het venster van Mymmo
  Forms in de kaart gevangen in plaats van over de pagina te liggen. Je ziet dat
  niet tot iemand op de knop drukt.
- **De container query is weg.** Om dezelfde reden: `container-type` is
  layout-containment, en dat doet met `position: fixed` precies hetzelfde. De
  kolommen slaan nu om met een gewone media query op 640px. In de editor klopt
  dat ook — het canvas staat daar sinds WordPress 6.3 in een iframe, dus een
  media query meet de breedte van het canvas.
- **De editor toont nu wél twee kolommen.** Een gewone `<InnerBlocks>` zet twee
  eigen wikkels tussen het raster en de kolommen, waardoor dat grid nog maar
  één kind had. Met `useInnerBlocksProps` zitten de kolommen er rechtstreeks in,
  net als in de PHP-render.
- **Een beeld "tot de rand" vult nu echt de hele kolom** (van boven tot onder,
  `object-fit: cover`). Daarvoor stond het nog op zijn eigen verhouding met wit
  erboven en eronder.
- **Nieuw: een vorm op de achtergrond van een kaart** (swirl, blob, tekening).
  Kies hem uit de mediabibliotheek of plak een URL, en zet breedte (% van de
  kaart), positie, draaiing en dekking. Breder dan 100% en naar een hoek
  geschoven steekt hij uit de kaart, en dan snijdt de kaart hem af — dat
  afsnijden is het effect. Bewust een `<img>` en geen `background-image`: die
  kan je niet groter dan haar vlak maken zonder te rekenen, en
  `background-position` in procenten doet iets anders dan je verwacht zodra het
  beeld groter is dan de doos.

**1.0.3** — kolommen naast elkaar vanaf 640px kaartbreedte.

- De drempel stond op **782px**, het breekpunt van WordPress. Dat getal gaat
  over de breedte van het SCHERM en betekent "dit is een telefoon" — maar de
  drempel wordt gemeten aan de **kaart**, en een kaart van 700px is geen
  telefoon. Gevolg: kaarten die ruim plaats hadden voor twee kolommen bleven
  gestapeld, en in de editor (canvas met zijbalk: 650 tot 1000px) zag je
  daardoor iets anders dan op de pagina.
- Nu **640px**. Bij die breedte houd je met de normale opvulling ongeveer 240 en
  360 pixels over voor de twee kolommen. Een telefoon (kaart ~343px) blijft
  gestapeld.

**1.0.2** — volle breedte is de standaard.

- Een stapel staat voortaan op **volle breedte** tenzij je het zelf wijzigt.
  Zonder dat belandt ze in de inhoudskolom van het thema (vaak 650 tot 800px) en
  is een kaart nooit breder dan dat — hoe hoog je de maximale breedte ook zet.
  Dat leest als "de instelling doet niets".
- De `alignfull`-klasse wordt nu **server-side** gerenderd. Dit blok bewaart
  enkel de inhoud van de kaarten, dus de editor kan die klasse nergens in de
  opgeslagen markup zetten, en `get_block_wrapper_attributes()` voegt ze niet
  toe (`align` is geen block-support die de server afhandelt). Zonder dat stond
  de stapel in de editor wel op volle breedte en op de pagina niet.

**1.0.1** — breedte en kolommen.

- **Maximale breedte van een kaart** (standaard 1200px, instelbaar op de
  stapel). De stapel zelf blijft over de volle breedte lopen: de kop moet de
  kaarten kunnen afdekken terwijl ze eronder doorschuiven. De kop kreeg daarom
  een binnenwikkel — haar kleur loopt door tot de rand, haar tekst begint op
  dezelfde lijn als de kaarten.
- **De kolommen slaan nu om op de breedte van de KAART** (container query) in
  plaats van die van het scherm. Met een maximale breedte kloppen die twee niet
  meer met elkaar, en dan zou een media query in het ene geval goed zitten en in
  het andere niet.
- De volgorde en de uitlijning bij één kolom hingen aan de telefoon-media-query
  en horen bij dezelfde omslag; die staan nu in dezelfde container query. Twee
  bronnen voor dezelfde keuze lopen ooit uiteen.

**1.0.0** — eerste versie.

- Vier blokken (stapel, kop, kaart, kolom), server-side gerenderd.
- Geometrie en beweging in de plugin; typografie uit het thema.
- Opvulling op de stapel, hoogte gemeten, mobiel als eigen indeling.
