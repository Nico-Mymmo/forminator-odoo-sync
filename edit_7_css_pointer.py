#!/usr/bin/env python3
"""v1.6.33 -- assets/css/mymmo-events.css, nazicht op de mobiele render:
het "Schrijf je snel in!"-tagje stond met right: 0 tegen de buitenrand van
de stapel (absolute positionering rekent vanaf de PADDING-box, dus viel de
1.5rem zijruimte van .mymmo-ev-swipestack weg) en liep daardoor tot tegen
de schermrand -- op een smal toestel werd het label zelfs afgesneden. Nu
1rem, dus net iets over de rand van de kaart maar altijd binnen het scherm.
"""
import sys

PATH = 'wp-plugin/mymmo-events/assets/css/mymmo-events.css'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')

old = """  .mymmo-ev-swipestack > .mymmo-ev-announce__pointer {
    top: 0;
    right: 0;"""
new = """  .mymmo-ev-swipestack > .mymmo-ev-announce__pointer {
    top: 0;
    /* Absolute positionering rekent vanaf de padding-box, dus right: 0 zou
       de 1.5rem zijruimte van .mymmo-ev-swipestack negeren en het label tot
       tegen de schermrand duwen (waar het op een smal toestel afgesneden
       werd). 1rem laat het net iets over de kaartrand komen -- daar wijst
       het krulletje ook naartoe -- en houdt het binnen het scherm. */
    right: 1rem;"""
assert content.count(old) == 1, 'anker niet exact 1x gevonden'
content = content.replace(old, new)

out = content.encode('utf-8')
assert out.count(b'\r') == 0
assert content.count('{') - content.count('}') == 0
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)
print('OK  regels=%d' % content.count('\n'))
sys.exit(0)
