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

import { putObject, deleteObject } from '../../asset-manager/lib/r2-client.js';

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

/**
 * Het hero-beeld weghalen.
 *
 * We proberen alle bekende extensies: de sleutel hangt van het bestandstype
 * af, en welke er ooit gebruikt is weten we niet uit Odoo — daar staat alleen
 * de URL. Ontbreken van een object is geen fout.
 *
 * @param {Object} env
 * @param {number} eventId
 * @returns {Promise<{ removed: string[] }>}
 */
export async function removeHeroImage(env, eventId) {
  const removed = [];

  for (const extension of Object.values(EXTENSION_BY_TYPE)) {
    const key = `events/${eventId}/hero.${extension}`;
    try {
      await deleteObject(env, key);
      removed.push(key);
    } catch (error) {
      // Bestond niet, of R2 gaf een fout: geen van beide mag de actie laten
      // mislukken. De verwijzing in Odoo wissen is wat echt telt.
      void error;
    }
  }

  return { removed };
}
