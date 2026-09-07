#!/usr/bin/env python3
"""v1.6.33 -- assets/css/mymmo-events.css

1. Rij-kaarten: :first-child -> :first-of-type (de hele rij stond bij het
   laden een overlap-breedte te ver naar links, want het pointer-<span>
   staat in de markup voor de kaarten en was dus het echte :first-child).
2. De mobiele kaartenstapel (rij + aankondiging) volledig herschreven:
   identieke structuur/marges voor beide componenten, extra
   .mymmo-ev-swipestack__cards-wrapper als positioneringskader, geen
   decoratie meer op mobiel, stipjes-indicator, en een hint die na de
   eerste swipe verdwijnt.
"""
import sys

PATH = 'wp-plugin/mymmo-events/assets/css/mymmo-events.css'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0, 'CR gevonden in baseline -- eerst normaliseren'
content = data.decode('utf-8')
before_lines = content.count('\n')

# ---------------------------------------------------------------- 1a
old = """/* Eerste (bovenste) kaart heeft niets om over te schuiven. */
.mymmo-ev-row__card:first-child {
  margin-left: 0;
}"""
new = """/* Eerste (bovenste) kaart heeft niets om over te schuiven.
   v1.6.33: :first-of-type, NIET :first-child. Het "Schrijf je snel in!"-
   tagje (.mymmo-ev-row__pointer, een <span>) staat in de markup VOOR de
   kaarten, dus was dat span het echte :first-child en kreeg ook de eerste
   kaart de negatieve margin-left. Daardoor stond de hele rij bij het laden
   van de pagina precies een overlap-breedte (3.25rem, of de door JS
   berekende waarde) te ver naar links; zodra je een kaart hoverde
   verhuisde het tagje via JS in die kaart, werd de eerste kaart plots wel
   :first-child en sprong de rij terug op zijn plaats -- vandaar dat dit
   enkel "bij het laden" leek te gebeuren. De kaarten zijn de enige <a>'s
   in de container, dus :first-of-type klopt ongeacht waar dat tagje op dat
   moment staat. */
.mymmo-ev-row__card:first-of-type {
  margin-left: 0;
}"""
assert content.count(old) == 1, '1a: anker niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 1b
old = """.mymmo-ev-row__card:first-child:hover,
.mymmo-ev-row__card:first-child.is-active {
  margin-left: 0;
}"""
new = """.mymmo-ev-row__card:first-of-type:hover,
.mymmo-ev-row__card:first-of-type.is-active {
  margin-left: 0;
}"""
assert content.count(old) == 1, '1b: anker niet exact 1x gevonden'
content = content.replace(old, new)

# ---------------------------------------------------------------- 2
marker = 'Swipebare kaartenstapel'
assert content.count(marker) == 1, '2: marker niet exact 1x gevonden'
cut = content.rindex('/*', 0, content.index(marker))
old_tail = content[cut:]
assert '.mymmo-ev-swipehint__scribble' in old_tail
assert '.mymmo-ev-swipestack {' in old_tail
assert old_tail.rstrip().endswith('}')

NEW_TAIL = """/* -- Swipebare kaartenstapel (mobiel: rij + aankondiging) ------------------
   Op mobiel (<= 40rem) tonen [mymmo_events_row] en
   [mymmo_events_announcement] EXACT dezelfde stapel: dezelfde DOM-structuur
   (zie templates/row.php en templates/announcement.php), dezelfde klassen,
   dezelfde buitenmarges en dezelfde swipe-logica. Kaarten liggen licht
   gedraaid over elkaar, net als de vaste decoratieve stapel die de
   aankondiging op desktop heeft (.mymmo-ev-announce__ghost--1/2/3), maar
   het zijn ECHTE kaarten met eigen titel/tijd/knop.

   Structuur (identiek in beide templates):

     .mymmo-ev-swipestack            position: relative; reserveert bovenaan
                                     ruimte voor het pointer-tagje
       .mymmo-ev-announce__pointer   "Schrijf je snel in!", absoluut
                                     rechtsboven in die ruimte
       .mymmo-ev-swipestack__cards   <-- krijgt .mymmo-ev-deck-mode van JS;
                                     DIT is het positioneringskader van de
                                     kaarten erachter (inset: 0)
         .mymmo-ev-deck-card * n
       .mymmo-ev-swipedots           stipjes (door JS gebouwd)
       .mymmo-ev-swipehint           "Swipe om ..."-hint; verdwijnt na de
                                     eerste swipe

   v1.6.33 -- wat er mis was in 1.6.30-1.6.32 en hier gefixt is:
   - De kaarten erachter liggen op position: absolute; inset: 0. Zaten de
     hint (en straks de stipjes) in dezelfde container, dan rekende inset: 0
     vanaf de BOVENKANT van die container -- dus vanaf boven de hint -- en
     lagen die kaartjes systematisch te hoog t.o.v. de bovenste kaart.
     Vandaar nu een wrapper die niets anders bevat dan de kaarten zelf.
   - De rij en de aankondiging hadden op mobiel verschillende buitenmarges
     (2.25rem 0 0.5rem vs. 5.5rem 1.5rem 4.5rem, of 4.5/0.5/2.75 onder
     34rem) en verschillende decoratie (scribble vs. klavertje). Beide
     stonden daardoor anders uitgelijnd, terwijl ze er identiek horen uit te
     zien. Alle binnenruimte zit nu in .mymmo-ev-swipestack, alle decoratie
     valt op mobiel weg.
   - De rotaties van de kaartjes erachter zijn iets kleiner dan op desktop
     (-4.5/5/-7 graden i.p.v. -5/6/-9): een gedraaide kaart is breder dan
     zijn eigen kader, en op telefoonbreedte staken de hoeken buiten de
     beschikbare ruimte (horizontale paginascroll). */
.mymmo-ev-swipestack {
  display: none;
  position: relative;
}
.mymmo-ev-swipestack .mymmo-ev-announce__card {
  grid-template-columns: 1fr;
}
/* Enkel de kaarten -- niets anders in deze wrapper, zie doc-blok. */
.mymmo-ev-swipestack__cards {
  position: relative;
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card {
  width: auto;
  min-width: 0;
  margin: 0 !important;
  overflow: hidden;
  height: var(--mymmo-ev-deck-h, auto);
  transition: transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.25s ease, box-shadow 0.2s ease;
  touch-action: pan-y;
  /* Sleepgevoel: geen tekstselectie of native link/image-drag die de swipe
     halverwege afbreekt met een pointercancel. */
  user-select: none;
  -webkit-user-select: none;
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card a,
.mymmo-ev-deck-mode .mymmo-ev-deck-card img {
  -webkit-user-drag: none;
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card.is-dragging {
  transition: none;
}
/* Herstapelen na een swipe gebeurt bewust ZONDER transitie (JS zet deze
   klasse een frame lang): de weggevlogen kaart wordt eerst op zijn
   rustpositie teruggezet en pas daarna achteraan de stapel ingevoegd. Met
   transities aan zag je die kaart zichtbaar terugzweven over het scherm --
   de "kaart vliegt terug"-glitch van 1.6.30-1.6.32. */
.mymmo-ev-deck-mode.is-restacking .mymmo-ev-deck-card {
  transition: none !important;
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="0"] {
  position: relative;
  z-index: 4;
  transform: rotate(-1.25deg);
  opacity: 1;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.10);
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="1"] {
  position: absolute;
  inset: 0;
  z-index: 3;
  transform: translate(6px, -5px) rotate(-4.5deg);
  transform-origin: 42% 58%;
  opacity: 1;
  pointer-events: none;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="2"] {
  position: absolute;
  inset: 0;
  z-index: 2;
  transform: translate(-7px, 6px) rotate(5deg);
  transform-origin: 58% 44%;
  opacity: 0.9;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="2"] .mymmo-ev-announce__body {
  opacity: 0.85;
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="3"] {
  position: absolute;
  inset: 0;
  z-index: 1;
  transform: translate(4px, 9px) rotate(-7deg);
  transform-origin: 46% 64%;
  opacity: 0.75;
  pointer-events: none;
  box-shadow: none;
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="3"] .mymmo-ev-announce__body {
  opacity: 0.4;
}
.mymmo-ev-deck-mode .mymmo-ev-deck-card[data-deck-pos="hidden"] {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
  box-shadow: none;
}

/* Titel max. 2 regels, samenvatting max. 4 regels, met ellipsis als het
   langer is -- samen met equalizeDeckCardHeights() in mymmo-events.js
   (dat de hoogste kaart meet en die hoogte als --mymmo-ev-deck-h op de
   wrapper zet) houdt dit alle kaarten in de stapel exact even hoog. */
.mymmo-ev-swipestack .mymmo-ev-announce__title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mymmo-ev-swipestack .mymmo-ev-announce__summary {
  margin-right: 0;
}

/* Stipjes onder de stapel: hoeveel kaarten er zijn en waar je zit, en
   aanklikbaar om direct naar een kaart te springen. Zonder indicator was
   er op mobiel geen enkel signaal hoeveel events er nog volgden (de
   swipe-hint zei "swipe", maar niet hoe vaak). JS bouwt de knopjes, zodat
   het aantal altijd exact het aantal kaarten volgt. */
.mymmo-ev-swipedots {
  display: none;
  justify-content: center;
  align-items: center;
  gap: 0.1rem;
  margin: 1rem 0 0;
}
.mymmo-ev-swipedot {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}
.mymmo-ev-swipedot::before {
  content: "";
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--mymmo-ev-line);
  transition: width 0.22s ease, background-color 0.22s ease;
}
.mymmo-ev-swipedot.is-active::before {
  width: 1.15rem;
  background: var(--mymmo-ev-accent-ink);
}

/* Hint ONDER de stapel (v1.6.33): tot 1.6.32 stond die erboven, omdat de
   geabsoluteerde kaartjes erachter door hun offset onder de bovenste kaart
   uitstaken en tekst daarna onvoorspelbaar verschoof. Nu zitten die
   kaartjes in hun eigen wrapper (zie boven), dus staat de tekst eronder
   wel vast -- en dat is ook de logische leesplek: eerst de kaart, dan wat
   je ermee kan. */
.mymmo-ev-swipehint {
  display: none;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0.55rem 0 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--mymmo-ev-muted);
  text-align: center;
  transition: opacity 0.3s ease;
}
.mymmo-ev-swipehint__scribble {
  width: 1.85rem;
  height: auto;
  flex: 0 0 auto;
  opacity: 0.85;
}
/* Na de eerste swipe is de boodschap overbodig. visibility i.p.v. display,
   zodat de stapel niet verspringt op het moment dat de hint weggaat. */
.mymmo-ev-swipehint.is-dismissed {
  opacity: 0;
  visibility: hidden;
}

@media (max-width: 40rem) {
  /* Alle binnenruimte van de mobiele zone zit hier -- padding-top
     reserveert de plek van het pointer-tagje, de zijkanten geven de
     gedraaide hoeken van de kaartjes erachter de ruimte die ze nodig
     hebben. */
  .mymmo-ev-swipestack {
    display: block;
    padding: 4.5rem 1.5rem 0.5rem;
  }
  .mymmo-ev-swipedots { display: flex; }
  .mymmo-ev-swipehint { display: flex; }

  .mymmo-ev-row__cards { display: none; }
  .mymmo-ev-row__more { display: none; }
  .mymmo-ev-announce__deck { display: none; }

  /* Identieke buitenmarges voor beide componenten (zie doc-blok). */
  .mymmo-ev-row,
  .mymmo-ev-announce__stage {
    padding: 0;
    /* clip, niet hidden: de gedraaide hoeken mogen nooit horizontale
       paginascroll veroorzaken, maar dit mag ook geen scroll-container
       worden (dat breekt position: sticky in het thema eromheen). */
    overflow-x: clip;
  }

  /* Geen decoratie op mobiel: het klavertje van de aankondiging en de
     scribble van de rij waren het laatste zichtbare verschil tussen beide
     componenten, en ze trokken de stapel ook optisch uit het midden. */
  .mymmo-ev-row__scribble,
  .mymmo-ev-announce__stage > .mymmo-ev-announce__clover {
    display: none;
  }

  /* Het pointer-tagje bestaat op mobiel enkel binnen de stapel (identieke
     markup in beide templates); de desktopvariant van de aankondiging
     (direct kind van .mymmo-ev-announce__stage) blijft verborgen. */
  .mymmo-ev-announce__stage > .mymmo-ev-announce__pointer {
    display: none;
  }
  .mymmo-ev-swipestack > .mymmo-ev-announce__pointer {
    top: 0;
    right: 0;
    /* Anticiperende verschijnbeweging: op mobiel bestaat er geen hover,
       dus speelt deze animatie hier eenmalig af bij het laden. */
    animation: mymmoRowPointerPop 0.5s both;
    animation-delay: 0.35s;
  }
  .mymmo-ev-swipestack .mymmo-ev-announce__pointer-arrow { width: 4rem; }
  .mymmo-ev-swipestack .mymmo-ev-announce__pointer-label {
    font-size: 0.8125rem;
    max-width: 6.5rem;
  }

  /* Kaartopmaak gelijk over de hele mobiele zone: de aankondiging deed dit
     pas onder 34rem, waardoor 34-40rem een andere kaart toonde dan de rij
     op diezelfde breedte. */
  .mymmo-ev-swipestack .mymmo-ev-announce__card { padding: 1.15rem; }
  .mymmo-ev-swipestack .mymmo-ev-announce__image { display: none; }
}
"""

content = content[:cut] + NEW_TAIL

out = content.encode('utf-8')
assert out.count(b'\r') == 0
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)

after_lines = content.count('\n')
print('OK  regels voor=%d na=%d  (verwijderde tail=%d regels, nieuwe tail=%d regels)' % (
    before_lines, after_lines, old_tail.count('\n'), NEW_TAIL.count('\n')))
sys.exit(0)
