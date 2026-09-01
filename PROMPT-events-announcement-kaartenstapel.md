# Events-aankondiging: variatie in de kaartenstapel, meebewegende pijl bij hover

## Lees eerst deze bestanden voor je begint:
- `wp-plugin/mymmo-events/templates/announcement.php`
- `wp-plugin/mymmo-events/assets/css/mymmo-events.css` (het blok "── Aankondiging (mymmo_events_announcement) ──", rond regel 708-915)
- `wp-plugin/mymmo-events/assets/js/mymmo-events.js`

## Context

Dit is `mymmo_events_announcement` in de **mymmo-events** wp-plugin (los van de Cloudflare Worker-code in `src/`/`public/`, maar dezelfde repo — versienummer staat in `wp-plugin/mymmo-events/mymmo-events.php` regel 5 (`Version:`) en regel 29 (`MYMMO_EVENTS_VERSION`), plus een changelog-entry in `wp-plugin/mymmo-events/README.md`; verhoog en documenteer die zoals de bestaande entries daar).

Het component (`templates/announcement.php`) rendert een `.mymmo-ev-announce__deck` met daarin: 0-3 "ghost"-kaartjes (`.mymmo-ev-announce__ghost--1/2/3`, altijd minstens 2 aanwezig — desnoods leeg, zie `$ghost_total = max(count($others), 2)`) en daarbovenop de echte kaart (`.mymmo-ev-announce__card`). Een curly-arrow met label (`.mymmo-ev-announce__pointer`, met `.mymmo-ev-announce__pointer-label` en `.mymmo-ev-announce__pointer-arrow`) staat er los naast, absoluut gepositioneerd binnen `.mymmo-ev-announce__stage`.

**Waarom de ghost-kaarten nu identiek opeen liggen bij rotatie 0:** `.mymmo-ev-announce__ghost` krijgt `inset: 0` — dus exact dezelfde box als de hoofdkaart, voor alle drie. De enige styling die ze uit elkaar houdt is `transform: rotate(...)` in `.mymmo-ev-announce__ghost--1/2/3` (CSS regel ~810-812), met de default `transform-origin` (50% 50% van de eigen — identieke — box). Zet je die rotate-waarden op 0, dan vallen alle drie kaartjes en de hoofdkaart exact over elkaar, want er is nergens een positie- of pivot-verschil, enkel een hoek-verschil.

**Waarom de pijl vandaag niet meebeweegt:** er is geen enkele hover-interactie op dit component in JS (`grep -n "announce"` op `mymmo-events.js` geeft niets terug) — alles is puur CSS. `.mymmo-ev-announce__card:hover` (CSS regel ~830) animeert alleen de kaart zelf (`transform: rotate(0deg) translateY(-2px)`). De pijl (`.mymmo-ev-announce__pointer`) is een sibling van `.mymmo-ev-announce__deck` binnen `.mymmo-ev-announce__stage`, niet een descendant van de kaart, dus een simpele `.mymmo-ev-announce__card:hover .mymmo-ev-announce__pointer`-selector werkt sowieso niet (geen ouder-kind-relatie). En zelfs met een sibling-selector zou een vaste CSS-`transform-origin` niet kloppen: de pijl staat met vaste `rem`-offsets (`top: 1.5rem; right: -0.5rem`) t.o.v. de stage, terwijl de kaart een fluid-width grid-element is — het middelpunt van de kaart in pixels t.o.v. de pijl verschuift met de containerbreedte. Een geometrisch correcte pivot "rond het middelpunt van de bovenste kaart" is dus alleen betrouwbaar te berekenen met JS (`getBoundingClientRect()` op hover-moment), niet met een vaste CSS-waarde.

## Wat je implementeert

### 1. Variatie in de ghost-kaarten (CSS, `mymmo-events.css` regel ~777-812)

Vervang de huidige `.mymmo-ev-announce__ghost--1/2/3`-regels (enkel `rotate()` + `z-index`/`opacity`) door een variant die zowel een kleine positieverschuiving als een afwijkend rotatiepunt per kaartje toevoegt, zodat ze er ook bij rotatie 0 nog als drie los neergelegde kaartjes uitzien in plaats van als één stapel:

- Geef elk ghost-kaartje een eigen `transform-origin` die licht van het midden afwijkt (bv. tussen 40%–60% op beide assen, en voor elk kaartje een andere combinatie — niet alle drie dezelfde afwijking in dezelfde richting, anders roteren ze weer "samen").
- Voeg een kleine `translate()` toe vóór de `rotate()` in dezelfde `transform`-declaratie (een paar pixels, bv. `translate(6px, -5px) rotate(-5deg)` voor kaartje 1), met voor elk kaartje een andere richting/grootte zodat ze niet symmetrisch tegenover elkaar liggen.
- Hou de bestaande `z-index`- en `opacity`-waarden per kaartje (die geven al diepte), en hou de rotatiehoeken in dezelfde orde van grootte als nu (een paar graden) — het gaat om een subtiele "nonchalant neergelegde stapel", niet om een chaotische spreiding. Test visueel (of beschrijf in je PR-commentaar) dat de kaartjes bij elke combinatie nog volledig achter de hoofdkaart verdwijnen qua omvang (ze mogen niet zichtbaar buiten de hoofdkaart-rand uitsteken door de translate — check tegen de kaart-afmetingen, `inset: 0` + een paar px verschuiving hoort ruim binnen de marge te blijven die de hoofdkaart se `border-radius`/schaduw al geeft).

### 2. Pijl + label roteren mee bij hover, rond het middelpunt van de bovenste kaart (nieuwe JS in `mymmo-events.js`)

Voeg een nieuwe genummerde functie toe in `mymmo-events.js`, volgens hetzelfde patroon als de bestaande functies (`focusFlash()`, `keyboardNav()`, ...): elk `.mymmo-ev-announce`-component op de pagina wordt onafhankelijk geïnitialiseerd (zelfde filosofie als `initComponent()` voor kalender/lijst — meerdere aankondigingen op één pagina mogen niet met elkaar interfereren).

- Selecteer per `.mymmo-ev-announce` de `.mymmo-ev-announce__card`, de `.mymmo-ev-announce__pointer` en (voor stap 3) de ghost-kaartjes.
- **`mouseenter`/`mouseleave` op de kaart** (geen `mouseover`/`mouseout`, om bubbling van de child-elementen binnenin de kaart te vermijden):
  - Op `mouseenter`: bereken `card.getBoundingClientRect()` en `pointer.getBoundingClientRect()`, leid daaruit het middelpunt van de kaart af in pixel-coördinaten relatief aan de linkerbovenhoek van de pointer (`cardCenterX - pointerRect.left`, `cardCenterY - pointerRect.top`), en zet dat als `pointer.style.transformOrigin = x + 'px ' + y + 'px'`. Voeg daarna een modifier-klasse toe (bv. `mymmo-ev-announce__pointer--hover`) die in CSS een kleine extra rotatie op de bestaande `transform` zet (dus niet de bestaande `rotate(-35deg)`/`rotate(4deg)` vervangen, gewoon een paar graden erbovenop via een aparte hover-regel of een CSS-custom-property die je vanuit JS niet hoeft te zetten — kies de eenvoudigste optie die de bestaande vaste hoeken van v1.6.4 met rust laat, zie het commentaar "exacte waarden die Nico zelf live afgesteld heeft in devtools" boven `.mymmo-ev-announce__pointer-arrow`).
  - Op `mouseleave`: verwijder de modifier-klasse (en optioneel `transformOrigin` terugzetten, al maakt dat weinig uit zolang de rotatie weg is).
  - Voeg een CSS-`transition: transform 0.2s ease` toe aan `.mymmo-ev-announce__pointer-arrow` en `.mymmo-ev-announce__pointer-label` zodat de rotatie vloeiend meebeweegt in plaats van te springen (consistent met de `0.2s ease` die de kaart zelf al gebruikt).
  - Skip deze hele functie op mobiel/waar de pijl toch `display: none` staat (media query onder 34rem, CSS regel ~914) — check bv. `pointer.offsetParent !== null` of de berekende `display` voor je `getBoundingClientRect()` aanroept, anders reken je op een element met een lege/irrelevante rect.
- Let op: `mymmo-events.css` regel 751 en 762 zetten nu al een vaste `rotate()` op resp. label en pijl. Jouw hover-toevoeging moet daarbovenop komen (dus een aparte, kleinere hoek, bv. 2-4 graden extra), niet die vaste basishoek overschrijven — anders verspringt de pijl bij hover ineens naar een compleet andere stand in plaats van "mee te draaien".

### 3. Ghost-kaartjes zeer licht meebewegen bij hover (CSS + dezelfde JS-hook als stap 2)

- Hergebruik de `mouseenter`/`mouseleave`-listener van stap 2 (of een aparte, maar wel op dezelfde kaart-hover getriggerd) om een modifier-klasse op `.mymmo-ev-announce__deck` (of individueel op elk ghost-element) te zetten, bv. `mymmo-ev-announce__deck--hover`.
- Voeg per ghost-kaartje een hover-variant toe die de bestaande `transform` (translate + rotate uit stap 1) met een minieme extra waarde aanpast — een paar tiende graden extra rotatie en/of 1-2px extra verschuiving, niet meer. Het effect moet nauwelijks merkbaar zijn (denk: kaartjes "schikken" zich licht wanneer je de bovenste kaart oppakt), geen duidelijke aparte animatie die afleidt van de hoofdkaart.
- Zet ook hier een korte `transition: transform 0.2s ease` op de ghost-selectors zodat het gelijk meeloopt met de kaart- en pijl-transitie.

## Wat je NIET aanraakt

- De illustratie (`.mymmo-ev-announce__image`) en de kicker/CTA-styling — dit werk is uitsluitend de kaartenstapel en de pijl.
- De klaver-achtergrond (`.mymmo-ev-announce__clover`, `mymmo_events_clover_svg()`) — blijft zoals hij is.
- De mobiele layout (media query onder 34rem, regel ~910-915): de pijl is daar al `display: none` en de derde ghost ook — dat blijft zo; je hover-JS mag daar gewoon niets doen (zie de skip-check in stap 2).
- De data/backend-kant (`class-shortcodes.php`, `helpers.php`, `$others`/`$ghost_total`-logica in `announcement.php`) — dit is een puur visuele/interactie-wijziging op bestaande, al doorgegeven data.
- Verhoog het plugin-versienummer en voeg een README-changelog-entry toe (zie Context hierboven), maar verander verder niets aan de build/packaging.

Lees ook `CLAUDE.md` voor de projectregels.
