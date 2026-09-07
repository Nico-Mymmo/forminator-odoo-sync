#!/usr/bin/env python3
"""v1.6.33 -- README.md: nieuwe changelog-sectie boven de vorige."""
import sys

PATH = 'wp-plugin/mymmo-events/README.md'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')
before_lines = content.count('\n')

anchor = '## Versies\n\n**1.6.32**\n'
assert content.count(anchor) == 1, 'changelog-anker niet exact 1x gevonden'

ENTRY = """## Versies

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
"""

content = content.replace(anchor, ENTRY)

out = content.encode('utf-8')
assert out.count(b'\r') == 0
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)
print('OK  regels voor=%d na=%d' % (before_lines, content.count('\n')))
sys.exit(0)
