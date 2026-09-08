/**
 * Event Operations v2 — Cache- en KV-verbruikstests
 *
 *   node src/modules/event-operations-v2/tests/cache-test.mjs
 *
 * Deze tests bestaan om ÉÉN reden: KV kost geld per read en per write, en dat
 * verbruik liep op zonder dat er iets nuttigs gebeurde. Ze tellen de
 * KV-operaties per verzoek. Een verandering die er weer meer van maakt, hoort
 * hier te falen.
 */

import assert from 'node:assert/strict';
import {
  readThrough,
  invalidateNamespace,
  namespaceVersion,
  checkRateLimitLocal
} from '../lib/cache.js';
import { etagForPayload } from '../public-api.js';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error?.message}`);
    process.exitCode = 1;
  }
}

/** Een KV-namespace die elke operatie meetelt. */
function stubKv(initieel = {}) {
  const opslag = new Map(Object.entries(initieel));
  const telling = { get: 0, put: 0 };
  return {
    telling,
    store: {
      async get(key, options) {
        telling.get += 1;
        const raw = opslag.get(key);
        if (raw === undefined) return null;
        return options && options.type === 'json' ? JSON.parse(raw) : raw;
      },
      async put(key, value) {
        telling.put += 1;
        opslag.set(key, value);
      }
    }
  };
}

console.log('\nKV-verbruik van de cache');

await test('een tweede verzoek in dezelfde isolate kost NUL KV-operaties', async () => {
  const { store, telling } = stubKv();
  const env = { MAPPINGS_KV: store };
  let geproduceerd = 0;
  const producer = async () => { geproduceerd += 1; return { events: [1, 2, 3] }; };

  const eerste = await readThrough(env, { namespace: 'events', parts: ['list', 'x'], ttlSeconds: 60 }, producer);
  assert.equal(eerste.cached, false);
  const naEerste = { ...telling };
  assert.ok(naEerste.get >= 1, 'de eerste keer hoort KV wél te raken');

  const tweede = await readThrough(env, { namespace: 'events', parts: ['list', 'x'], ttlSeconds: 60 }, producer);
  assert.equal(tweede.cached, true, 'de tweede keer komt niet uit de cache');
  assert.deepEqual(tweede.value, { events: [1, 2, 3] });
  assert.equal(geproduceerd, 1, 'de producer is twee keer gedraaid');

  // Dit is de kern: geen enkele extra read of write. Vóór de geheugenlaag
  // waren dit twee reads (versie + waarde) per verzoek.
  assert.equal(telling.get, naEerste.get, `${telling.get - naEerste.get} extra KV-read(s)`);
  assert.equal(telling.put, naEerste.put, 'extra KV-write');
});

await test('het versienummer wordt niet bij elk verzoek opnieuw gelezen', async () => {
  const { store, telling } = stubKv();
  const env = { MAPPINGS_KV: store };

  await namespaceVersion(env, 'events');
  const na = telling.get;
  await namespaceVersion(env, 'events');
  await namespaceVersion(env, 'events');
  assert.equal(telling.get, na, 'het versienummer wordt nog steeds elke keer uit KV gehaald');
});

await test('na een schrijfactie serveert dezelfde isolate geen oude waarde meer', async () => {
  const { store } = stubKv();
  const env = { MAPPINGS_KV: store };

  await readThrough(env, { namespace: 'events', parts: ['list'], ttlSeconds: 60 }, async () => 'oud');
  await invalidateNamespace(env, 'events');

  const na = await readThrough(env, { namespace: 'events', parts: ['list'], ttlSeconds: 60 }, async () => 'nieuw');
  // Zonder het leegmaken van het geheugen bij invalidatie zou hier "oud"
  // staan: de sleutel verandert wel, maar het geheugen niet.
  assert.equal(na.value, 'nieuw');
});

await test('een cache-storing laat het verzoek doorgaan', async () => {
  const env = { MAPPINGS_KV: { async get() { throw new Error('KV stuk'); }, async put() { throw new Error('KV stuk'); } } };
  const uit = await readThrough(env, { namespace: 'events', parts: ['x'], ttlSeconds: 60 }, async () => 'uit Odoo');
  assert.equal(uit.value, 'uit Odoo');
});

console.log('\nde leeslimiet zonder KV');

await test('remt af na het maximum, en raakt KV niet aan', async () => {
  const regels = { windowSeconds: 60, maxRequests: 3 };
  const sleutel = `pub:test-${Date.now()}`;

  assert.equal(checkRateLimitLocal(sleutel, regels).allowed, true);
  assert.equal(checkRateLimitLocal(sleutel, regels).allowed, true);
  assert.equal(checkRateLimitLocal(sleutel, regels).allowed, true);

  const vierde = checkRateLimitLocal(sleutel, regels);
  assert.equal(vierde.allowed, false, 'de vierde hoort geweigerd te worden');
  assert.ok(vierde.retryAfter > 0, 'geen Retry-After');
  // De functie is synchroon en heeft geen env: ze KAN geen KV raken. Dat is
  // precies de bedoeling -- de KV-variant deed een write per pageview.
  assert.equal(checkRateLimitLocal.length, 2);
});

console.log('\nde ETag van een publieke respons');

await test('dezelfde data geeft dezelfde ETag, ook op een later moment', async () => {
  const eerste = { data: [{ id: 1, title: 'Q&A' }], meta: { count: 1, generated_at: '2026-09-07T10:00:00.000Z' } };
  const later = { data: [{ id: 1, title: 'Q&A' }], meta: { count: 1, generated_at: '2026-09-07T10:05:00.000Z' } };

  // Dit was de bug: generated_at maakte elke ETag uniek, dus het
  // If-None-Match van de WordPress-plugin matchte nooit en elke verversing
  // haalde de volledige body op.
  assert.equal(await etagForPayload(eerste), await etagForPayload(later));
});

await test('gewijzigde data geeft een andere ETag', async () => {
  const a = { data: [{ id: 1, title: 'Q&A' }], meta: { generated_at: 'x' } };
  const b = { data: [{ id: 1, title: 'Q&A (verplaatst)' }], meta: { generated_at: 'x' } };
  assert.notEqual(await etagForPayload(a), await etagForPayload(b));
});

console.log(`\n${passed} test(en) geslaagd${process.exitCode ? ' — MET FOUTEN' : ''}\n`);
