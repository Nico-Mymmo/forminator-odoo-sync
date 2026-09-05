path = "src/modules/event-operations-v2/public-api.js"

data = open(path, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')

# De publieke /event-types-lijst (die de WP-plugin gebruikt voor de
# filter-chips boven kalender/lijst, via get_event_types() in
# class-api-client.php) gaf tot nu toe enkel id+name door -- geen kleur.
# Daardoor vielen die chips altijd terug op de CSS-standaardkleur (grijs),
# ook al staat de kleur wel al goed in Odoo/OM. De kaarten/single/kalender-
# dagen gebruiken hun eigen (wel al kleur-bevattende) event-lijst, dus
# daar viel het niet op.
old = """  return {
    payload: {
      meta: meta(types.length, brand),
      event_types: types.map((t) => ({ id: t.id, name: t.name }))
    },
    cached,
    ttl: CACHE_TTL.EVENT_TYPES
  };
}"""
new = """  return {
    payload: {
      meta: meta(types.length, brand),
      event_types: types.map((t) => ({ id: t.id, name: t.name, color: t.color }))
    },
    cached,
    ttl: CACHE_TTL.EVENT_TYPES
  };
}"""
assert content.count(old) == 1
content = content.replace(old, new)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

nb = open(path, 'rb').read()
assert nb.count(b'\r') == 0
t = nb.decode('utf-8')
print("OK lines", nb.count(b'\n'), "brace", t.count('{'), t.count('}'), "paren", t.count('('), t.count(')'))
