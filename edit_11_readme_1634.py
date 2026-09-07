#!/usr/bin/env python3
"""v1.6.34 -- README.md: nieuwe changelog-sectie boven de vorige."""
import sys

PATH = 'wp-plugin/mymmo-events/README.md'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')
before_lines = content.count('\n')

anchor = '## Versies\n\n**1.6.33**\n'
assert content.count(anchor) == 1, 'changelog-anker niet exact 1x gevonden'

ENTRY = """## Versies

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
"""

content = content.replace(anchor, ENTRY)

out = content.encode('utf-8')
assert out.count(b'\r') == 0
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)
print('OK  regels voor=%d na=%d' % (before_lines, content.count('\n')))
sys.exit(0)
