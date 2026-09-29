/**
 * Toegang tot de D1-database van de website-tracker (bezoekersgedrag).
 *
 * De tracker (repo website-tracker) BEZIT deze database en haar schema; de OM
 * leest er alleen uit. Zie website-tracker/docs/ontwerp-web-visitor-events.md §7.
 * Daarom laat dit bestand enkel SELECT/WITH door: een schrijfactie vanuit de OM
 * zou naast de tracker een tweede schrijver maken, en dan klopt de regel "de
 * events staan er zoals ze binnenkwamen" niet meer.
 *
 * Binding: WEB_EVENTS in wrangler.jsonc (database website-tracker-events).
 */

export function hasWebEvents(env) {
  return !!env.WEB_EVENTS;
}

/**
 * @param {object} env
 * @param {string} sql  moet met SELECT of WITH beginnen
 * @param {Array} params
 * @returns {Promise<{results: Array, meta: object}>}
 */
export async function readWebEvents(env, sql, params = []) {
  if (!env.WEB_EVENTS) throw new Error('WEB_EVENTS-binding ontbreekt (D1 website-tracker-events).');
  // Een CTE kan ook een schrijfactie inleiden (WITH ... INSERT), dus beide controles.
  if (!/^\s*(WITH|SELECT)\b/i.test(sql) || /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ATTACH|VACUUM)\b/i.test(sql)) {
    throw new Error('web-events: alleen lezen (SELECT/WITH) is toegestaan.');
  }
  return env.WEB_EVENTS.prepare(sql).bind(...params).all();
}
