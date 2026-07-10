/**
 * Mini-Apps — permission helpers
 *
 * Zichtbaarheid ('visibility') kent drie waarden:
 *   'private'  – enkel de eigenaar
 *   'shared'   – alle ingelogde gebruikers met module-toegang
 *   'specific' – eigenaar + gebruikers in shared_user_ids
 *
 * Tweaken (bewerken van titel/omschrijving/rechten/HTML-inhoud) is altijd
 * exclusief voorbehouden aan de eigenaar — "shared" betekent hier
 * uitsluitend "mag de app draaien/bekijken", niet "mag bewerken".
 */

export function canView(app, user) {
  if (!user || !app) return false;
  if (app.owner_user_id === user.id) return true;
  if (app.visibility === 'shared') return true;
  if (app.visibility === 'specific') {
    return Array.isArray(app.shared_user_ids) && app.shared_user_ids.includes(user.id);
  }
  return false;
}

export function canEdit(app, user) {
  if (!user || !app) return false;
  return app.owner_user_id === user.id;
}

export function isValidUUID(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Valideert en normaliseert een lijst met te delen user-ids.
 * - Filtert non-UUID/ongeldige entries eruit
 * - Sluit de eigenaar zelf uit (staat impliciet altijd toe)
 * - Dedupliceert
 *
 * @param {Array} rawIds
 * @param {string} ownerUserId
 * @returns {string[]}
 */
export function normalizeSharedUserIds(rawIds, ownerUserId) {
  if (!Array.isArray(rawIds)) return [];
  const unique = new Set();
  for (const id of rawIds) {
    if (isValidUUID(id) && id !== ownerUserId) {
      unique.add(id);
    }
  }
  return Array.from(unique);
}
