path = "src/modules/event-operations-v2/public-api.js"

data = open(path, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')

# 1) typeColor doorgeven aan toPublicEventDto -- die had de optie al
# (options.typeColor), maar niemand riep hem ooit met een waarde aan, dus
# viel altijd terug op de hardcoded EVENT_TYPE_PRESENTATION-kleur in
# odoo-contract.js. Nu gebruiken we de echte kleur uit Odoo
# (x_studio_type_color_hex) wanneer die is ingesteld.
old1 = """function toPublicPayload(record, { registrationCount, detail }) {
  const dto = toPublicEventDto(record, { registrationCount, detail });"""
new1 = """function toPublicPayload(record, { registrationCount, detail, typeColor }) {
  const dto = toPublicEventDto(record, { registrationCount, detail, typeColor });"""
assert content.count(old1) == 1
content = content.replace(old1, new1)

# 2) lijst: één (gecachte) opvraag van de types levert de kleur per
# event_type_id -- geen call per event, gewoon dezelfde lijst die
# handleEventTypes() ook al gebruikt.
old2 = """  const { events, rawById, cached } = await listEvents(env, {
    filters,
    limit,
    order: `${EVENT_FIELDS.STARTS_AT} asc`,
    detail: false,
    cacheTtl: CACHE_TTL.PUBLIC_LIST
  });"""
new2 = """  const { events, rawById, cached } = await listEvents(env, {
    filters,
    limit,
    order: `${EVENT_FIELDS.STARTS_AT} asc`,
    detail: false,
    cacheTtl: CACHE_TTL.PUBLIC_LIST
  });

  // één (gecachte) opvraag voor de hele lijst i.p.v. een lookup per event.
  const { types: eventTypesForColor } = await listEventTypes(env);
  const typeColorById = new Map(eventTypesForColor.map((t) => [t.id, t.color]));"""
assert content.count(old2) == 1
content = content.replace(old2, new2)

old3 = """    events: withSlug.map((internal) =>
      toPublicPayload(rawById[internal.id], {
        registrationCount: internal.registration.count,
        detail: false,
        sharedCanonicalOrigin: env?.EVENTS_SHARED_CANONICAL_ORIGIN
      })
    )"""
new3 = """    events: withSlug.map((internal) =>
      toPublicPayload(rawById[internal.id], {
        registrationCount: internal.registration.count,
        detail: false,
        typeColor: typeColorById.get(internal.event_type.id),
        sharedCanonicalOrigin: env?.EVENTS_SHARED_CANONICAL_ORIGIN
      })
    )"""
assert content.count(old3) == 1
content = content.replace(old3, new3)

# 3) detail: zelfde principe, één opvraag voor dit ene event.
old4 = """  const dto = toPublicPayload(raw, {
    registrationCount: event.registration.count,
    detail: true,
    sharedCanonicalOrigin: env?.EVENTS_SHARED_CANONICAL_ORIGIN
  });"""
new4 = """  const { types: eventTypesForColor } = await listEventTypes(env);
  const typeColor = eventTypesForColor.find((t) => t.id === event.event_type.id)?.color;

  const dto = toPublicPayload(raw, {
    registrationCount: event.registration.count,
    detail: true,
    typeColor,
    sharedCanonicalOrigin: env?.EVENTS_SHARED_CANONICAL_ORIGIN
  });"""
assert content.count(old4) == 1
content = content.replace(old4, new4)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

nb = open(path, 'rb').read()
assert nb.count(b'\r') == 0
t = nb.decode('utf-8')
print("OK lines", nb.count(b'\n'), "brace", t.count('{'), t.count('}'), "paren", t.count('('), t.count(')'))
