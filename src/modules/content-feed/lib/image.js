/**
 * Content Feed — afbeeldingen serveren
 *
 * WAAROM DIT BESTAAT: het beeld staat als BINAIR veld in Odoo, en Odoo kent
 * voor een gewoon Studio-binary geen verkleinde varianten (die bestaan alleen
 * op modellen met `image.mixin`). Elke opvraging haalt dus de VOLLEDIGE
 * originele afbeelding op -- een PNG van 1 à 2 MB wordt als base64 nog een
 * derde groter, en die moet daarna byte per byte gedecodeerd worden.
 *
 * Zonder cache deed de lijst dat voor ELKE kaart opnieuw, allemaal tegelijk,
 * bij elke paginaweergave. Dat is tientallen megabytes en evenveel
 * JSON-RPC-rondes per bezoek; de eerste versie van dit scherm deed precies
 * dat.
 *
 * De oplossing is de cache, niet een kleinere afbeelding: de URL draagt een
 * versiedeel uit `write_date`, dus een gewijzigd beeld krijgt vanzelf een
 * andere URL. Daarom mag hier `immutable` staan en hoeft Odoo per afbeelding
 * maar één keer per datacenter bevraagd te worden.
 */

import { LOG_PREFIX, CACHE_TTL } from '../constants.js';
import { getSnippetImage } from './content-service.js';

/**
 * De cachesleutel. Bewust een verzonnen host en NIET de echte URL: zo kan een
 * beeld dat via de beheerroute is opgehaald ook de publieke route bedienen en
 * omgekeerd -- het zijn dezelfde bytes, en er zit geen rechteninformatie in
 * het beeld zelf. De toegangscontrole gebeurt VOOR deze functie.
 */
function cacheKeyFor(id, version) {
  return new Request(`https://content-feed.cache/image/${id}/${version || '0'}`, {
    method: 'GET'
  });
}

/**
 * Serveer de afbeelding van een bericht, met cache.
 *
 * @param {Object} env
 * @param {Object} ctx - voor waitUntil; mag ontbreken
 * @param {number|string} id
 * @param {string} version - het versiedeel uit de URL (`?v=`)
 * @param {Object} [options]
 * @param {Object} [options.extraHeaders] - bv. CORS op de publieke route
 * @returns {Promise<Response|null>} null = geen afbeelding (de route maakt er 404 van)
 */
export async function serveSnippetImage(env, ctx, id, version, { extraHeaders = {} } = {}) {
  const sleutel = cacheKeyFor(id, version);
  const cache = caches.default;

  try {
    const treffer = await cache.match(sleutel);
    if (treffer) {
      const headers = new Headers(treffer.headers);
      for (const [naam, waarde] of Object.entries(extraHeaders)) headers.set(naam, waarde);
      headers.set('X-Cache', 'hit');
      return new Response(treffer.body, { status: 200, headers });
    }
  } catch (error) {
    // Een kapotte cache mag nooit betekenen dat er geen beeld komt.
    console.warn(`${LOG_PREFIX} beeldcache lezen mislukt (${id}):`, error?.message);
  }

  const beeld = await getSnippetImage(env, id);
  if (!beeld) return null;

  // Wat we BEWAREN krijgt publieke, lange cache-headers; wat we TERUGGEVEN
  // krijgt daarbovenop de headers van dit verzoek (CORS). Die twee scheiden,
  // anders bewaar je de Origin van de eerste bezoeker voor iedereen.
  const opslagHeaders = {
    'Content-Type': beeld.contentType,
    'Cache-Control': `public, max-age=${CACHE_TTL.IMAGE_SECONDS}, immutable`
  };

  try {
    const teBewaren = new Response(beeld.bytes, { status: 200, headers: opslagHeaders });
    if (ctx?.waitUntil) {
      ctx.waitUntil(cache.put(sleutel, teBewaren.clone()));
    } else {
      await cache.put(sleutel, teBewaren.clone());
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} beeldcache schrijven mislukt (${id}):`, error?.message);
  }

  return new Response(beeld.bytes, {
    status: 200,
    headers: { ...opslagHeaders, 'X-Cache': 'miss', ...extraHeaders }
  });
}
