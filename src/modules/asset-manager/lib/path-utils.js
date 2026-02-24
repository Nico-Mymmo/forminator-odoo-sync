/**
 * Asset Manager — Path Utilities
 *
 * Pure functions for R2 key validation, normalisatie en prefix-helpers.
 * Geen side-effects, geen I/O — alleen string-transformaties en validaties.
 *
 * Beveiligingseisen:
 *   - Geen path traversal (../)
 *   - Geen absolute paden (beginnen met /)
 *   - Geen null bytes
 *   - Max key-lengte: 1024 tekens (R2 limiet)
 *   - Alleen URL-safe tekens en /
 *   - Prefix-isolatie: user mag alleen schrijven/lezen binnen toegestaan prefix
 */

const MAX_KEY_LENGTH = 1024;

// Toegestane tekens: alfanumeriek, punten, underscores, koppeltekens, slashes, @, +, spaties (URL-encoded)
const VALID_KEY_PATTERN = /^[a-zA-Z0-9._\-\/+@ ]+$/;

/**
 * Valideert een R2 object-key op veiligheid en R2-compatibiliteit.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function validateKey(key) {
  if (typeof key !== 'string') return false;
  if (key.length === 0) return false;
  if (key.length > MAX_KEY_LENGTH) return false;
  if (key.includes('\0')) return false;        // null bytes
  if (key.includes('..')) return false;        // path traversal
  if (key.startsWith('/')) return false;       // geen absolute paden
  if (!VALID_KEY_PATTERN.test(key)) return false;
  return true;
}

/**
 * Maakt een bestandsnaam veilig voor gebruik als R2 key-component.
 * Verwijdert gevaarlijke tekens, behoudt extensie.
 *
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  if (typeof name !== 'string') return 'file';

  // Haal alleen de bestandsnaam op (na laatste /)
  const basename = name.split('/').pop() || 'file';

  // Vervang spaties door koppeltekens, verwijder gevaarlijke tekens
  const sanitized = basename
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._\-]/g, '')
    .replace(/^\.+/, '')   // geen leading dots
    .replace(/\.{2,}/g, '.') // geen dubbele punten in naam
    .replace(/-{2,}/g, '-')  // geen dubbele koppeltekens
    .toLowerCase();

  // Zorg dat het resultaat altijd een geldige bestandsnaam is
  if (!sanitized || sanitized === '.' || sanitized === '-') return 'file';
  return sanitized;
}

/**
 * Bouwt de standaard prefix voor user-specifieke bestanden.
 *
 * @param {string} userId
 * @returns {string}  Altijd eindigend op /
 */
export function buildUserPrefix(userId) {
  if (!userId) throw new Error('userId is verplicht voor buildUserPrefix');
  return `users/${userId}/`;
}

/**
 * Controleert of een key onder de public/ prefix valt.
 * Public keys mogen zonder authenticatie geserveerd worden.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isPublicKey(key) {
  return typeof key === 'string' && key.startsWith('public/');
}

/**
 * Controleert of een key binnen een toegestane prefix valt.
 * Primaire beveiligingsfunctie voor prefix-isolatie.
 *
 * @param {string} key
 * @param {string} allowedPrefix  Moet eindigen op /
 * @returns {boolean}
 */
export function isWithinPrefix(key, allowedPrefix) {
  if (typeof key !== 'string' || typeof allowedPrefix !== 'string') return false;
  const prefix = normalizePrefix(allowedPrefix);
  return key.startsWith(prefix);
}

/**
 * Forceert een trailing slash op een prefix-string.
 * Comprimeert dubbele slashes tot één slash.
 *
 * @param {string} prefix
 * @returns {string}
 */
export function normalizePrefix(prefix) {
  if (typeof prefix !== 'string') return '';
  // Comprimeer dubbele (of meer) slashes
  const cleaned = prefix.replace(/\/+/g, '/');
  return cleaned.endsWith('/') ? cleaned : cleaned + '/';
}
