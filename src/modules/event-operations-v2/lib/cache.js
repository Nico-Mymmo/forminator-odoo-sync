/**
 * Event Operations v2 — Wegwerpcache
 *
 * Odoo is de enige database. Deze cache mag op elk moment volledig
 * leeggegooid worden zonder dat er iets verloren gaat. Is dat ooit niet
 * meer waar, dan is het geen cache en hoort het hier niet.
 *
 * Invalidatie werkt met een versienummer per namespace: KV kan niet
 * wildcard-verwijderen, dus een schrijfactie verhoogt de versie en alle
 * bestaande sleutels in die namespace worden in een keer onbereikbaar.
 * Ze verlopen daarna zelf.
 *
 * Een fout in de cache mag NOOIT een verzoek laten falen: bij elke
 * uitzondering vallen we terug op Odoo.
 */

import { CACHE_PREFIX, CACHE_NS, LOG_PREFIX } from '../constants.js';

/** KV-minimum voor expirationTtl is 60s; korter regelen we in de waarde zelf. */
const KV_MIN_TTL = 60;

function kv(env) {
  return env?.MAPPINGS_KV || null;
}

function versionKey(namespace) {
  return `${CACHE_PREFIX}:ver:${namespace}`;
}

/**
 * Huidige versie van een namespace. Onbekend = 1.
 * @returns {Promise<number>}
 */
async function getVersion(env, namespace) {
  const store = kv(env);
  if (!store) return 1;

  try {
    const raw = await store.get(versionKey(namespace));
    const parsed = Number.parseInt(raw || '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  } catch (error) {
    console.warn(`${LOG_PREFIX} cache: versie lezen mislukt voor ${namespace}:`, error?.message);
    return 1;
  }
}

/**
 * Verhoog de versie: alles in deze namespace is per direct ongeldig.
 * @returns {Promise<void>}
 */
export async function invalidateNamespace(env, namespace) {
  const store = kv(env);
  if (!store) return;

  try {
    const next = (await getVersion(env, namespace)) + 1;
    await store.put(versionKey(namespace), String(next));
    console.log(`${LOG_PREFIX} cache: ${namespace} ongeldig gemaakt (v${next})`);
  } catch (error) {
    console.warn(`${LOG_PREFIX} cache: invalidatie mislukt voor ${namespace}:`, error?.message);
  }
}

/**
 * Alles wat met events te maken heeft ongeldig maken.
 *
 * Bij twijfel tussen te veel en te weinig purgen: te veel. Een extra
 * Odoo-call is goedkoper dan een bezoeker die een verkeerd aantal vrije
 * plaatsen ziet.
 *
 * @returns {Promise<void>}
 */
export async function invalidateEvents(env) {
  await invalidateNamespace(env, CACHE_NS.EVENTS);
}

async function buildKey(env, namespace, parts) {
  const version = await getVersion(env, namespace);
  const suffix = parts
    .map((p) => (p === null || p === undefined ? '' : String(p)))
    .join('|');
  return `${CACHE_PREFIX}:${namespace}:v${version}:${suffix}`;
}

/**
 * Lees uit de cache, of produceer en sla op.
 *
 * De TTL zit ook in de waarde, zodat TTL's onder het KV-minimum van 60s
 * (bv. de 15s voor beheerlijsten) echt werken.
 *
 * @template T
 * @param {Object} env
 * @param {Object} options
 * @param {string} options.namespace
 * @param {Array} options.parts - alles wat de sleutel onderscheidt
 * @param {number} options.ttlSeconds
 * @param {boolean} [options.bypass] - true = altijd verse data (na een schrijfactie)
 * @param {() => Promise<T>} producer
 * @returns {Promise<{ value: T, cached: boolean }>}
 */
export async function readThrough(env, options, producer) {
  const { namespace, parts = [], ttlSeconds, bypass = false } = options;
  const store = kv(env);

  if (!store || bypass || !(ttlSeconds > 0)) {
    return { value: await producer(), cached: false };
  }

  let key = null;
  try {
    key = await buildKey(env, namespace, parts);
    const raw = await store.get(key, { type: 'json' });
    if (raw && typeof raw.exp === 'number' && raw.exp > Date.now()) {
      return { value: raw.v, cached: true };
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} cache: lezen mislukt (${key}):`, error?.message);
  }

  const value = await producer();

  if (key) {
    try {
      await store.put(
        key,
        JSON.stringify({ v: value, exp: Date.now() + ttlSeconds * 1000 }),
        { expirationTtl: Math.max(KV_MIN_TTL, ttlSeconds * 2) }
      );
    } catch (error) {
      console.warn(`${LOG_PREFIX} cache: schrijven mislukt (${key}):`, error?.message);
    }
  }

  return { value, cached: false };
}

/**
 * Zwakke ETag over een responsbody. Genoeg om een 304 te kunnen geven en
 * daarmee het pollen door de WordPress-plugin goedkoop te houden.
 *
 * @param {string} body
 * @returns {Promise<string>}
 */
export async function weakEtag(body) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(body));
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `W/"${hex.slice(0, 27)}"`;
}

/**
 * Rate limit per sleutel, in een vast venster. Bewust simpel: dit hoeft
 * geen sliding window te zijn, het moet alleen misbruik afremmen.
 *
 * @returns {Promise<{ allowed: boolean, remaining: number, retryAfter: number }>}
 */
export async function checkRateLimit(env, identifier, { windowSeconds, maxRequests }) {
  const store = kv(env);
  if (!store) return { allowed: true, remaining: maxRequests, retryAfter: 0 };

  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `${CACHE_PREFIX}:rl:${identifier}:${bucket}`;

  try {
    const current = Number.parseInt((await store.get(key)) || '0', 10) || 0;
    if (current >= maxRequests) {
      const nextWindowMs = (bucket + 1) * windowSeconds * 1000;
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((nextWindowMs - Date.now()) / 1000))
      };
    }

    await store.put(key, String(current + 1), { expirationTtl: Math.max(KV_MIN_TTL, windowSeconds * 2) });
    return { allowed: true, remaining: maxRequests - current - 1, retryAfter: 0 };
  } catch (error) {
    // Bij een KV-storing liever doorlaten dan de website breken.
    console.warn(`${LOG_PREFIX} rate limit: KV-fout, verzoek doorgelaten:`, error?.message);
    return { allowed: true, remaining: maxRequests, retryAfter: 0 };
  }
}
