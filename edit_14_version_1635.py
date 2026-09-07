#!/usr/bin/env python3
"""v1.6.35 -- mymmo-events.php: versienummer op de twee plekken die altijd
gelijk moeten staan (docblock + constante; de constante bepaalt de
cache-busting van CSS/JS)."""
import sys

PATH = 'wp-plugin/mymmo-events/mymmo-events.php'
OLD, NEW = '1.6.34', '1.6.35'

data = open(PATH, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')

a = ' * Version:           %s' % OLD
b = "define('MYMMO_EVENTS_VERSION', '%s');" % OLD
assert content.count(a) == 1, 'docblock-versie niet exact 1x gevonden'
assert content.count(b) == 1, 'versieconstante niet exact 1x gevonden'
assert content.count(OLD) == 2, 'onverwacht aantal keer %s in het bestand' % OLD

content = content.replace(a, ' * Version:           %s' % NEW)
content = content.replace(b, "define('MYMMO_EVENTS_VERSION', '%s');" % NEW)

out = content.encode('utf-8')
assert out.count(b'\r') == 0
assert content.count(NEW) == 2 and content.count(OLD) == 0
open(PATH, 'w', encoding='utf-8', newline='\n').write(content)
print('OK  %s -> %s (2 plekken)' % (OLD, NEW))
sys.exit(0)
