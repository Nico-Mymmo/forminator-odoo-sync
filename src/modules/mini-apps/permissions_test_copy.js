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
  // Operations Manager-admin: mag ALLE apps zien, ook private/specific van
  // anderen -- puur leesrecht (bekijken/draaien), zie canEdit() hieronder die
  // bewust GEEN admin-bypass heeft (bewerken blijft eigenaar-only).
  if (user.role === 'admin') return true;
  // Een admin heeft deze app als favoriet voor IEDEREEN gemarkeerd -- dat
  // overrulet bewust de eigen zichtbaarheidskeuze van de eigenaar, anders zou
  // "favoriet voor iedereen" niets betekenen voor wie de app niet mocht zien.
  if (app.is_global_favorite) return true;
  if (app.visibility === 'shared') return true;
  if (app.visibility === 'specific') {
    return Array.isArray(app.shared_user_ids) && app.shared_user_ids.includes(user.id);
  }
  return false;
}

export function canEdit(app, user) {
  if (!user || !app) return false;
  // Bewust GEEN admin-bypass: tweaken van titel/omschrijving/rechten/HTML-
  // inhoud blijft altijd exclusief voorbehouden aan de eigenaar (zie doc-
  // comment bovenaan dit bestand). Admins mogen enkel bekijken (canView).
  return app.owner_user_id === user.id;
}

export function isValidUUID(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Valideert en normaliseert een lijst met te delen u