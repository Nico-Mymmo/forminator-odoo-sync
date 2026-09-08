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

/**
 * LAAG 0: het geheugen van deze isolate.
 *
 * KV kost geld per read en per write, en die twee liepen hier op zonder dat
 * er iets nuttigs gebeurde:
 *
 *  - elke readThrough deed EERST een read om het versienummer op te halen en
 *    DAARNA de echte read. Twee reads voor één cachetreffer, bij elk verzoek.
 *  - checkRateLimit deed een read EN een write bij elk publiek verzoek. Een
 *    write per pageview is de duurste soort KV-verkeer die er is, en boven de
 *    één-write-per-seconde-per-sleutel van KV worden ze zelfs stil
 *    weggegooid -- dus je betaalde ervoor en de teller was ook niet
 *    betrouwbaar.
 *
 * Een Cloudflare-isolate blijft minuten tot uren leven en bedient in die tijd
 * veel verzoeken. Alles wat we daar even vasthouden, hoeft niet uit KV te
 * komen. De prijs is staleness binnen één isolate; die is hier begrensd tot
 * VERSION_MEMO_MS voor het versienummer, en tot de eigen TTL van de waarde.
 */
const valueMemo = new Map();
const versionMemo = new Map();

/**
 * Hoe lang een versienummer in het geheugen mag blijven staan.
 *
 * Dit is de enige echte concessie: maakt een ANDERE isolate iets ongeldig,
 * dan ziet deze dat pas na deze tijd. Vijf seconden op publieke data die
 * toch al 60s gecached wordt, tegen een gehalveerd KV-verbruik.
 */
const VERSION_MEMO_MS = 5000;

/** Grens op het geheugen: een isolate mag niet onbeperkt volgroeien. */
const MEMO_MAX = 200;

function memoSet(map, key, entry) {
  // Simpele afkap: bij een volle map de oudste invoer eruit. Geen echte LRU
  // -- dat is hier niet de kosten waard, de map is klein en kortlevend.
  if (map.size >= MEMO_MAX) {
    const oudste = map.keys().next().value;
    if (oudste !== undefined) map.delete(oudste);
  }
  map.set(key, entry);
}

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

  const onthouden = versionMemo.get(namespace);
  if (onthouden && onthouden.exp > Date.now()) return onthouden.version;

  try {
    const raw = await store.get(versionKey(namespace));
    const parsed = Number.parseInt(raw || '', 10);
    const version = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    memoSet(versionMemo, namespace, { version, exp: Date.now() + VERSION_MEMO_MS });
    return version;
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
    // Het versienummer NIET uit het geheugen halen: bij een schrijfactie moet
    // je van de echte waarde vertrekken, anders verhoog je een verouderd
    // nummer en maak je de cache van een andere isolate niet ongeldig.
    versionMemo.delete(namespace);
    const next = (await getVersion(env, namespace)) + 1;
    await store.put(versionKey(namespace), String(next));
    // Deze isolate ziet het nieuwe nummer per direct; de andere na
    // VERSION_MEMO_MS.
    memoSet(versionMemo, namespace, { version: next, exp: Date.now() + VERSION_MEMO_MS });
    valueMemo.clear();
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

    // Eerst het geheugen van deze isolate: nul KV-reads.
    const onthouden = valueMemo.get(key);
    if (onthouden && onthouden.exp > Date.now()) {
      return { value: onthouden.v, cached: true };
    }

    const raw = await store.get(key, { type: 'json' });
    if (raw && typeof raw.exp === 'number' && raw.exp > Date.now()) {
      memoSet(valueMemo, key, { v: raw.v, exp: raw.exp });
      return { value: raw.v, cached: true };
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} cache: lezen mislukt (${key}):`, error?.message);
  }

  const value = await producer();

  if (key) {
    memoSet(valueMemo, key, { v: value, exp: Date.now() + ttlSeconds * 1000 });
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
 * Het versienummer van een namespace, voor wie er zelf een sleutel mee bouwt
 * (de edge-cache in public-api.js). Gaat via hetzelfde geheugen, dus dit
 * kost normaal geen KV-read.
 *
 * @returns {Promise<number>}
 */
export async function namespaceVersion(env, namespace) {
  return getVersion(env, namespace);
}

/**
 * Rate limit ZONDER KV: een teller in het geheugen van deze isolate.
 *
 * Bedoeld voor het LEESPAD van de publieke API. Daar deed de KV-variant een
 * write bij elk verzoek -- een write per pageview, terwijl KV per sleutel
 * maar één write per seconde aanneemt en de rest stil weggooit. Duur én
 * onbetrouwbaar.
 *
 * De grens geldt hierdoor per isolate in plaats van globaal. Voor waar dit
 * voor bedoeld is -- iemand die de API platlegt -- verandert dat weinig: zo'n
 * stroom landt op dezelfde isolate en wordt daar afgeremd. Het SCHRIJFPAD
 * (inschrijven) houdt bewust de KV-variant: daar is de grens een
 * beveiliging die echt globaal moet zijn, en het volume is laag genoeg dat
 * het niets kost.
 *
 * @returns {{ allowed: boolean, remaining: number, retryAfter: number }}
 */
const rateMemo = new Map();

export function checkRateLimitLocal(identifier, { windowSeconds, maxRequests }) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `${identifier}:${bucket}`;

  // Oude vensters opruimen: anders groeit de map met elk venster mee.
  if (rateMemo.size > MEMO_MAX) {
    for (const bestaande of [...rateMemo.keys()]) {
      if (!bestaande.endsWith(`:${bucket}`)) rateMemo.delete(bestaande);
    }
  }

  const current = rateMemo.get(key) || 0;
  if (current >= maxRequests) {
    const nextWindowMs = (bucket + 1) * windowSeconds * 1000;
    return { allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((nextWindowMs - Date.now()) / 1000)) };
  }

  rateMemo.set(key, current + 1);
  return { allowed: true, remaining: maxRequests - current - 1, retryAfter: 0 };
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
