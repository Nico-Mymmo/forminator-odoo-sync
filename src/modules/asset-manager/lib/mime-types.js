/**
 * Asset Manager — MIME Type Whitelist
 *
 * Centraliseert MIME-type detectie en validatie voor uploads.
 * Enkel whitelisted types worden geaccepteerd.
 */

/**
 * Mapping van bestandsextensie naar MIME-type.
 * Extensies in lowercase, zonder punt.
 */
const EXTENSION_TO_MIME = {
  // Images
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  gif:  'image/gif',
  webp: 'image/webp',
  svg:  'image/svg+xml',
  // Text
  html: 'text/html',
  htm:  'text/html',
  css:  'text/css',
  txt:  'text/plain',
  // Application
  pdf:  'application/pdf',
  zip:  'application/zip',
  json: 'application/json',
};

/**
 * Set van toegestane MIME-types (voor snelle lookup).
 */
const ALLOWED_MIME_TYPES = new Set(Object.values(EXTENSION_TO_MIME));

/**
 * Retourneert het MIME-type op basis van de bestandsextensie.
 * Geeft 'application/octet-stream' bij onbekende extensie.
 *
 * @param {string} filename
 * @returns {string}
 */
export function getMimeType(filename) {
  if (typeof filename !== 'string') return 'application/octet-stream';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_TO_MIME[ext] || 'application/octet-stream';
}

/**
 * Controleert of een MIME-type in de whitelist staat.
 *
 * @param {string} mimeType
 * @returns {boolean}
 */
export function isAllowedMimeType(mimeType) {
  if (typeof mimeType !== 'string') return false;
  // Normalize: 'image/jpeg; charset=utf-8' → 'image/jpeg'
  const normalized = mimeType.split(';')[0].trim().toLowerCase();
  return ALLOWED_MIME_TYPES.has(normalized);
}
