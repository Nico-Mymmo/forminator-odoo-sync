#!/usr/bin/env python3
"""v1.6.35 -- README.md: nieuwe changelog-sectie boven de vorige."""
import sys

PATH = 'wp-plugin/mymmo-events/README.md'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')
before_lines = content.count('\n')

anchor = '## Versies\n\n**1.6.34**\n'
assert content.count(anchor) == 1, 'changelog-anker niet exact 1x gevonden'

ENTRY = """## Versies

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
"""

content = content.replace(anchor, ENTRY)

out = content.encode('utf-8')
assert out.count(b'\r') == 0
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)
print('OK  regels voor=%d na=%d' % (before_lines, content.count('\n')))
sys.exit(0)
