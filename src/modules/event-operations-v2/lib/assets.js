/**
 * Event Operations v2 — Assets
 *
 * Beelden gaan naar R2 via de asset-manager. De publieke URL wordt in
 * Odoo bewaard (x_studio_hero_image_url) en is daarmee de enige
 * verwijzing: geen bestandsindex, geen tweede administratie.
 *
 * Bewust niet geimporteerd uit event-operations v1: die module wordt
 * verwijderd bij de cutover.
 */

import { putObject } from '../../asset-manager/lib/r2-client.js';

/** Val hierop terug als env.BASE_ASSET_URL ontbreekt. */
const DEFAULT_BASE_ASSET_URL = 'https://link.openvme.be';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
]);

const EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif'
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * @param {Object} env
 * @param {string} key - R2-sleutel zonder leidende slash
 * @returns {string}
 */
export function getPublicAssetUrl(env, key) {
  const base = String(env?.BASE_ASSET_URL || DEFAULT_BASE_ASSET_URL).replace(/\/$/, '');
  return `${base}/assets/${key}`;
}

/**
 * @param {string} contentType
 * @returns {boolean}
 */
export function isAllowedImageType(contentType) {
  return ALLOWED_IMAGE_TYPES.has(String(contentType || '').toLowerCase());
}

/**
 * Hero-beeld opslaan. De sleutel is stabiel per event, zodat de URL niet
 * verandert als het beeld vervangen wordt.
 *
 * @param {Object} env
 * @param {number} eventId
 * @param {ArrayBuffer} buffer
 * @param {string} contentType
 * @returns {Promise<{ key: string, url: string }>}
 */
export async function storeHeroImage(env, eventId, buffer, contentType) {
  const extension = EXTENSION_BY_TYPE[String(contentType).toLowerCase()] || 'jpg';
  const key = `events/${eventId}/hero.${extension}`;

  await putObject(env, key, buffer, {
    contentType,
    customMetadata: {
      eventId: String(eventId),
      source: 'event-operations-v2',
      storedAt: new Date().toISOString()
    }
  });

  return { key, url: getPublicAssetUrl(env, key) };
}
