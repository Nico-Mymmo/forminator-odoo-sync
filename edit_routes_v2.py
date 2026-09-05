path = "src/modules/event-operations-v2/routes.js"

data = open(path, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')

old1 = """  listEventTypes,
  listHostUsers,
  getStages
} from './lib/events-service.js';"""
new1 = """  listEventTypes,
  setEventTypeColor,
  listHostUsers,
  getStages
} from './lib/events-service.js';"""
assert content.count(old1) == 1
content = content.replace(old1, new1)

old2 = """  'GET /api/event-types': withErrors(async (context) => {
    const { types, cached } = await listEventTypes(context.env);
    return json({ success: true, data: types }, 200, cacheHeader(cached));
  }),"""
new2 = """  'GET /api/event-types': withErrors(async (context) => {
    const { types, cached } = await listEventTypes(context.env);
    return json({ success: true, data: types }, 200, cacheHeader(cached));
  }),

  /**
   * PATCH /events-v2/api/event-types/:id
   * Body: { color: '#rrggbb' }
   *
   * Kleur van één event type wijzigen (x_studio_type_color_hex in Odoo,
   * door Nico toegevoegd via Studio). Zie setEventTypeColor() voor de
   * validatie en cache-invalidatie.
   */
  'PATCH /api/event-types/:id': withErrors(async (context) => {
    const id = Number.parseInt(context.params?.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Ongeldig event-type-id', { status: 400 });
    }

    const body = await readJsonBody(context.request);
    const { types } = await setEventTypeColor(context.env, id, body.color, context.user);
    return json({ success: true, data: types });
  }),"""
assert content.count(old2) == 1
content = content.replace(old2, new2)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

nb = open(path, 'rb').read()
assert nb.count(b'\r') == 0
t = nb.decode('utf-8')
print("OK lines", nb.count(b'\n'), "brace", t.count('{'), t.count('}'), "paren", t.count('('), t.count(')'))
