path = "src/modules/event-operations-v2/lib/events-service.js"

data = open(path, 'rb').read()
assert data.count(b'\r') == 0
content = data.decode('utf-8')

# 1) invalidateNamespace erbij nodig voor setEventTypeColor() hieronder
# (invalidateEvents dekt enkel CACHE_NS.EVENTS, niet CACHE_NS.EVENT_TYPES).
old1 = "import { readThrough, invalidateEvents } from './cache.js';"
new1 = "import { readThrough, invalidateEvents, invalidateNamespace } from './cache.js';"
assert content.count(old1) == 1
content = content.replace(old1, new1)

# 2) COLOR mee opvragen bij het listen van event types.
old2 = """        fields: [EVENT_TYPE_FIELDS.ID, EVENT_TYPE_FIELDS.NAME, EVENT_TYPE_FIELDS.ACTIVE, EVENT_TYPE_FIELDS.SEQUENCE],
        order: `${EVENT_TYPE_FIELDS.SEQUENCE} asc, ${EVENT_TYPE_FIELDS.NAME} asc`"""
new2 = """        fields: [
          EVENT_TYPE_FIELDS.ID,
          EVENT_TYPE_FIELDS.NAME,
          EVENT_TYPE_FIELDS.ACTIVE,
          EVENT_TYPE_FIELDS.SEQUENCE,
          EVENT_TYPE_FIELDS.COLOR
        ],
        order: `${EVENT_TYPE_FIELDS.SEQUENCE} asc, ${EVENT_TYPE_FIELDS.NAME} asc`"""
assert content.count(old2) == 1
content = content.replace(old2, new2)

# 3) schrijffunctie: kleur van een event type instellen vanuit de OM. Geen
# eigen validatie-laag zoals de events (dit is één simpel veld) -- gewoon
# een hex-check hier, en zowel de EVENT_TYPES- als de EVENTS-cache
# ongeldig maken (de publieke eventrespons bevat de kleur ook, zie
# public-api.js, en zit in een andere namespace).
old3 = """/**
 * Auditspoor. Gaat naar de Odoo-chatter, niet naar een eigen logtabel:
 * daar hoort het, en het is de enige plek die overleeft als de cache
 * leeggegooid wordt.
 *
 * Nooit fataal — een mislukte notitie mag een geslaagde wijziging niet
 * terugdraaien.
 */
export async function logToChatter(env, eventId, message, actor = null) {"""
new3 = """const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Kleur van één event type wijzigen (x_studio_type_color_hex in Odoo,
 * toegevoegd via Odoo Studio -- geen eigen kleurentabel, Odoo blijft de
 * enige database). Gebruikt door de "Typekleuren"-instellingen in de OM.
 *
 * @param {Object} env
 * @param {number} id
 * @param {string} color - hex-code, bv. "#0D9488"
 * @param {{email?:string,name?:string}|null} [actor]
 * @returns {Promise<{ types: Object[] }>} de vernieuwde lijst
 */
export async function setEventTypeColor(env, id, color, actor = null) {
  const typeId = Number(id);
  if (!Number.isInteger(typeId) || typeId <= 0) {
    throw new ValidationError('Ongeldig event-type-id');
  }
  if (typeof color !== 'string' || !HEX_COLOR_RE.test(color)) {
    throw new ValidationError('Kleur moet een hex-code zijn, bv. #0D9488');
  }

  await write(env, {
    model: ODOO_MODELS.EVENT_TYPE,
    ids: [typeId],
    values: { [EVENT_TYPE_FIELDS.COLOR]: color }
  });

  const who = actor?.email || actor?.name || 'onbekende gebruiker';
  try {
    await messagePost(env, {
      model: ODOO_MODELS.EVENT_TYPE,
      id: typeId,
      body: `Kleur gewijzigd naar ${color} — door ${who}`
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} chatterbericht mislukt voor event type ${typeId}:`, error?.message);
  }

  // Beide namespaces: de type-lijst zelf, en de publieke eventrespons die
  // de kleur meeneemt (zie handleEventList/handleEventDetail in
  // public-api.js) -- anders blijft de site de oude kleur cachen tot de
  // TTL verloopt.
  await invalidateNamespace(env, CACHE_NS.EVENT_TYPES);
  await invalidateEvents(env);

  return listEventTypes(env, { bypassCache: true });
}

/**
 * Auditspoor. Gaat naar de Odoo-chatter, niet naar een eigen logtabel:
 * daar hoort het, en het is de enige plek die overleeft als de cache
 * leeggegooid wordt.
 *
 * Nooit fataal — een mislukte notitie mag een geslaagde wijziging niet
 * terugdraaien.
 */
export async function logToChatter(env, eventId, message, actor = null) {"""
assert content.count(old3) == 1
content = content.replace(old3, new3)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

nb = open(path, 'rb').read()
assert nb.count(b'\r') == 0
t = nb.decode('utf-8')
print("OK lines", nb.count(b'\n'), "brace", t.count('{'), t.count('}'), "paren", t.count('('), t.count(')'))
