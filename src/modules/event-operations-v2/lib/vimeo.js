/**
 * Event Operations v2 — Vimeo-videokiezer
 *
 * Haalt de video's uit HET VIMEO-ACCOUNT op, zodat de organisator van een
 * event er eentje uit een lijst kiest in plaats van een URL te plakken.
 *
 * WAAROM DIT ER APART BIJ ZIT
 * ---------------------------
 * De publieke oEmbed van Vimeo (`vimeo.com/api/v2/video/<id>.json`, gebruikt
 * door v1's recap-service) kan alleen een BEKENDE video opzoeken. Een lijst
 * van "onze video's" bestaat daar niet -- daarvoor is een account-token
 * nodig. Vandaar deze losse module.
 *
 * ZONDER TOKEN BLIJFT ALLES WERKEN. Ontbreekt `VIMEO_ACCESS_TOKEN`, dan geeft
 * `listVimeoVideos()` `{ configured: false, videos: [] }` terug en valt de UI
 * terug op een URL plakken. Geen fout, geen lege lijst zonder uitleg.
 *
 * Het token is een SECRET (`wrangler secret put VIMEO_ACCESS_TOKEN`), nooit
 * in wrangler.jsonc. Aanmaken op developer.vimeo.com met de scopes `public`
 * en `private` (alleen lezen volstaat).
 *
 * De cache is wegwerpbaar, zoals alle KV in deze module: hij bespaart alleen
 * een externe call en is altijd opnieuw op te bouwen.
 */

import { LOG_PREFIX, CACHE_PREFIX } from '../constants.js';

const API = 'https://api.vimeo.com';
const TIMEOUT_MS = 8000;
const CACHE_TTL_SECONDS = 300;
const MAX_PER_PAGE = 50;

/** Velden die we opvragen. Nooit het hele record: dat is een groot antwoord. */
const FIELDS = 'uri,name,description,link,duration,created_time,pictures.sizes,privacy.view';

/**
 * Is er een token ingesteld?
 * @param {Object} env @returns {boolean}
 */
export function vimeoConfigured(env) {
  return String(env?.VIMEO_ACCESS_TOKEN || '').trim() !== '';
}

/**
 * De video's uit het account.
 *
 * @param {Object} env
 * @param {Object} [options]
 * @param {string} [options.query] - zoekterm; leeg = de recentste
 * @param {number} [options.page]
 * @param {number} [options.perPage]
 * @returns {Promise<{ configured: boolean, videos: Object[], total: number, page: number, hasMore: boolean }>}
 */
export async function listVimeoVideos(env, { query = '', page = 1, perPage = 24 } = {}) {
  if (!vimeoConfigured(env)) {
    console.log(`${LOG_PREFIX} vimeo: geen VIMEO_ACCESS_TOKEN ingesteld, kiezer uitgeschakeld`);
    return { configured: false, videos: [], total: 0, page: 1, hasMore: false };
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safePerPage = Math.min(Math.max(1, Number(perPage) || 24), MAX_PER_PAGE);
  const term = String(query || '').trim();

  const cacheKey = `${CACHE_PREFIX}:vimeo:${safePage}:${safePerPage}:${term.toLowerCase()}`;
  const cached = await readCache(env, cacheKey);
  if (cached) return cached;

  const url = new URL(`${API}/me/videos`);
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('page', String(safePage));
  url.searchParams.set('per_page', String(safePerPage));
  url.searchParams.set('sort', term === '' ? 'date' : 'relevant');
  url.searchParams.set('direction', 'desc');
  if (term !== '') url.searchParams.set('query', term);

  const payload = await fetchVimeo(env, url.toString());

  const videos = (payload?.data || []).map(toVideoDto).filter((video) => video.id !== null);
  const result = {
    configured: true,
    videos,
    total: Number(payload?.total || videos.length),
    page: safePage,
    hasMore: Boolean(payload?.paging?.next)
  };

  await writeCache(env, cacheKey, result);
  return result;
}

/**
 * Eén video opzoeken op id — voor het geval iemand tóch een URL plakt en we
 * er de titel en thumbnail bij willen.
 *
 * @param {Object} env @param {string|number} videoId
 * @returns {Promise<Object|null>}
 */
export async function getVimeoVideo(env, videoId) {
  const id = String(videoId).replace(/\D/g, '');
  if (id === '') return null;
  if (!vimeoConfigured(env)) return null;

  try {
    const payload = await fetchVimeo(env, `${API}/videos/${id}?fields=${encodeURIComponent(FIELDS)}`);
    return toVideoDto(payload);
  } catch (error) {
    console.warn(`${LOG_PREFIX} vimeo: video ${id} niet gevonden: ${error?.message}`);
    return null;
  }
}

/**
 * Vimeo-antwoord → een platte vorm voor de UI en voor het event.
 *
 * `thumbnail_url` is de GROOTSTE beschikbare afbeelding: die belandt in de
 * recapmail en wordt daar op 624px getoond, dus een kleintje wordt lelijk.
 */
function toVideoDto(record) {
  const uri = String(record?.uri || '');
  const id = /\/videos\/(\d+)/.exec(uri)?.[1] || null;

  const sizes = Array.isArray(record?.pictures?.sizes) ? [...record.pictures.sizes] : [];
  sizes.sort((a, b) => Number(b?.width || 0) - Number(a?.width || 0));
  const largest = sizes[0]?.link || '';
  // Vimeo hangt er een query aan die de afbeelding bijsnijdt; die weghalen
  // levert de volle afbeelding op.
  const thumbnail = largest === '' ? '' : String(largest).split('?')[0];

  return {
    id,
    title: String(record?.name || '').trim() || `Video ${id || ''}`.trim(),
    url: String(record?.link || (id ? `https://vimeo.com/${id}` : '')),
    thumbnail_url: thumbnail,
    duration_seconds: Number(record?.duration || 0),
    created_at: record?.created_time || null,
    // Handig in de UI: een privévideo in een mail is een veelgemaakte fout.
    privacy: String(record?.privacy?.view || '')
  };
}

/** @returns {Promise<Object>} */
async function fetchVimeo(env, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${String(env.VIMEO_ACCESS_TOKEN).trim()}`,
        Accept: 'application/vnd.vimeo.*+json;version=3.4'
      },
      signal: controller.signal
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('Vimeo weigert het token (401/403). Controleer VIMEO_ACCESS_TOKEN en de scopes.');
    }
    if (!response.ok) {
      throw new Error(`Vimeo antwoordde met ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Cache (wegwerpbaar) ──────────────────────────────────────────────────────

async function readCache(env, key) {
  const store = env?.MAPPINGS_KV;
  if (!store) return null;
  try {
    const raw = await store.get(key, 'json');
    return raw || null;
  } catch (error) {
    return null;
  }
}

async function writeCache(env, key, value) {
  const store = env?.MAPPINGS_KV;
  if (!store) return;
  try {
    await store.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL_SECONDS });
  } catch (error) {
    console.warn(`${LOG_PREFIX} vimeo: cache niet geschreven: ${error?.message}`);
  }
}
