/**
 * Content Feed — Wegwerpcache
 *
 * Odoo is de enige database. Deze cache mag op elk moment volledig
 * leeggegooid worden zonder dat er iets verloren gaat. Is dat ooit niet meer
 * waar, dan is het geen cache en hoort het hier niet.
 *
 * BEWUST EEN EIGEN KOPIE en geen import uit event-operations-v2: die versie
 * hangt aan de constants van díé module (CACHE_PREFIX 'evtv2',
 * invalidateEvents). Een gedeelde util zou van beide modules één ding maken
 * dat niemand meer los kan wijzigen. Zelfde afweging als de twee
 * renderTemplate()-kopieën bij mini-apps.
 *
 * Invalidatie werkt met een versienummer per namespace: KV kan niet
 * wildcard-verwijderen, dus een schrijfactie verhoogt de versie en alle
 * bestaande sleutels in die namespace worden in één keer onbereikbaar.
 *
 * Een fout in de cache mag NOOIT een verzoek laten falen: bij elke
 * uitzondering vallen we terug op Odoo.
 */

import { CACHE_PREFIX, CACHE_NS, LOG_PREFIX } from '../constants.js';

/** KV-minimum voor expirationTtl is 60s; korter regelen we in de waarde zelf. */
const KV_MIN_TTL = 60;

/** LAAG 0: het geheugen van deze isolate. Nul KV-reads. */
const valueMemo = new Map();
const versionMemo = new Map();
const rateMemo = new Map();

/** Maakt een ANDERE isolate iets ongeldig, dan ziet deze dat na deze tijd. */
const VERSION_MEMO_MS = 5000;
const MEMO_MAX = 200;

function memoSet(map, key, entry) {
  if (map.size >= MEMO_MAX) {
    const oudste = map.keys().next().value;
    map.delete(oudste);
  }
  map.set(key, entry);
}

function kv(env) {
  return env?.MAPPINGS_KV || null;
}

function versionKey(namespace) {
  return `${CACHE_PREFIX}:ver:${namespace}`;
}

async function getVersion(env, namespace) {
  const onthouden = versionMemo.get(namespace);
  if (onthouden && onthouden.exp > Date.now()) return onthouden.version;

  const store = kv(env);
  if (!store) return 0;

  let version = 0;
  try {
    const raw = await store.get(versionKey(namespace));
    version = Number(raw) || 0;
  } catch (error) {
    console.warn(`${LOG_PREFIX} cache: versie lezen mislukt (${namespace}):`, error?.message);
  }
  memoSet(versionMemo, namespace, { version, exp: Date.now() + VERSION_MEMO_MS });
  return version;
}

/** Verhoog de versie: alles in deze namespace is per direct ongeldig. */
export async function invalidateNamespace(env, namespace) {
  const store = kv(env);
  if (!store) return;
  try {
    // NIET uit het geheugen lezen: bij een schrijfactie moet je van de echte
    // waarde vertrekken, anders verhoog je een verouderd nummer en maak je de
    // cache van een andere isolate niet ongeldig.
    versionMemo.delete(namespace);
    const next = (await getVersion(env, namespace)) + 1;
    await store.put(versionKey(namespace), String(next));
    memoSet(versionMemo, namespace, { version: next, exp: Date.now() + VERSION_MEMO_MS });
    valueMemo.clear();
    console.log(`${LOG_PREFIX} cache: ${namespace} ongeldig gemaakt (v${next})`);
  } catch (error) {
    console.warn(`${LOG_PREFIX} cache: invalidatie mislukt (${namespace}):`, error?.message);
  }
}

/**
 * Alles wat met berichten te maken heeft ongeldig maken.
 * Bij twijfel tussen te veel en te weinig purgen: te veel. Een extra
 * Odoo-call is goedkoper dan een bezoeker die een verdwenen bericht ziet.
 */
export async function invalidateItems(env) {
  await invalidateNamespace(env, CACHE_NS.ITEMS);
}

export async function invalidateTaxonomy(env) {
  await invalidateNamespace(env, CACHE_NS.TAXONOMY);
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
 * De TTL zit ook IN de waarde, zodat TTL's onder het KV-minimum van 60s
 * (bv. de 15s voor beheerlijsten) echt werken.
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

/** Het versienummer, voor wie er zelf een edge-cachesleutel mee bouwt. */
export async function namespaceVersion(env, namespace) {
  return getVersion(env, namespace);
}

/**
 * Rate limit ZONDER KV: een teller in het geheugen van deze isolate.
 *
 * Bedoeld voor het LEESPAD. De KV-variant deed een write bij élk verzoek --
 * een write per pageview, terwijl KV per sleutel maar één write per seconde
 * aanneemt en de rest stil weggooit. Duur én onbetrouwbaar. De grens geldt
 * hierdoor per isolate; voor waar dit voor dient (iemand die de API
 * platlegt) volstaat dat, want zo'n stroom landt op dezelfde isolate.
 */
export function checkRateLimitLocal(identifier, { windowSeconds, maxRequests }) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `${identifier}:${bucket}`;

  if (rateMemo.size > 500) rateMemo.clear();

  const count = (rateMemo.get(key) || 0) + 1;
  rateMemo.set(key, count);

  if (count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: windowSeconds - Math.floor((Date.now() % (windowSeconds * 1000)) / 1000)
    };
  }
  return { allowed: true, remaining: maxRequests - count, retryAfter: 0 };
}

/** Zwakke ETag over een body. */
export async function weakEtag(body) {
  const data = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest('SHA-1', data);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `W/"${hex.slice(0, 27)}"`;
}
