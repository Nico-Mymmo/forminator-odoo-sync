path = "src/modules/event-operations-v2/odoo-contract.js"

data = open(path, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')

# 1) nieuw Studio-veld: kleur per event type, door Nico zelf toegevoegd in
# Odoo Studio (x_studio_type_color_hex, Char) zodat de kleur instelbaar
# is zonder code-wijziging.
old1 = """export const EVENT_TYPE_FIELDS = {
  ID: 'id',
  NAME: 'x_name',
  ACTIVE: 'x_active',
  SEQUENCE: 'x_studio_sequence'
};"""
new1 = """export const EVENT_TYPE_FIELDS = {
  ID: 'id',
  NAME: 'x_name',
  ACTIVE: 'x_active',
  SEQUENCE: 'x_studio_sequence',
  COLOR: 'x_studio_type_color_hex'
};"""
assert content.count(old1) == 1
content = content.replace(old1, new1)

old2 = """export function toEventTypeDto(record) {
  return {
    id: int(record[EVENT_TYPE_FIELDS.ID]),
    name: str(record[EVENT_TYPE_FIELDS.NAME]),
    active: record[EVENT_TYPE_FIELDS.ACTIVE] !== false,
    sequence: int(record[EVENT_TYPE_FIELDS.SEQUENCE], 0)
  };
}"""
new2 = """export function toEventTypeDto(record) {
  return {
    id: int(record[EVENT_TYPE_FIELDS.ID]),
    name: str(record[EVENT_TYPE_FIELDS.NAME]),
    active: record[EVENT_TYPE_FIELDS.ACTIVE] !== false,
    sequence: int(record[EVENT_TYPE_FIELDS.SEQUENCE], 0),
    // null (i.p.v. '') als leeg/ontbrekend, zodat de aanroeper
    // (public-api.js) kan terugvallen op eventTypePresentation()'s
    // hardcoded standaardkleur i.p.v. een lege string als
    // achtergrondkleur door te geven.
    color: str(record[EVENT_TYPE_FIELDS.COLOR])
  };
}"""
assert content.count(old2) == 1
content = content.replace(old2, new2)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

nb = open(path, 'rb').read()
assert nb.count(b'\r') == 0
t = nb.decode('utf-8')
print("OK lines", nb.count(b'\n'), "brace", t.count('{'), t.count('}'), "paren", t.count('('), t.count(')'))
