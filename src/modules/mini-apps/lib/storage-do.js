/**
 * Mini-Apps — Gedeelde opslag: één SQLite-database per mini-app
 *
 * Elke mini-app krijgt een eigen Durable Object (binding MINI_APP_STORAGE,
 * aangesproken met idFromName(appId)) met een eigen SQLite-database. Dit is
 * het Cloudflare-patroon voor "een database per klant": onbeperkt aantal,
 * tot 10 GB per object, en aan te spreken op naam tijdens het draaien --
 * anders dan D1, waar een Worker enkel databases kan gebruiken waarvoor een
 * binding in wrangler.jsonc staat (max ±5.000, en elke nieuwe vraagt een
 * deploy). Een collega die een mini-app uploadt, kan daar niet op wachten.
 *
 * Een Durable Object verwerkt één verzoek tegelijk. Gevolg: de quotumcontrole
 * en de schrijfactie erna zijn samen atomair, en twee collega's die tegelijk
 * schrijven, krijgen elk hun eigen beurt.
 *
 * VERHUIZING UIT R2. Tot 2026-10 stond deze opslag als losse objecten in R2
 * (mini-apps-storage/{appId}/kv/... en .../collections/...). Bij de EERSTE
 * aanroep voor een app haalt dit object die gegevens één keer binnen, met
 * dezelfde keys en dezelfde item-id's (apps bewaren die id's zelf), en zet
 * het `migrated_at` in `meta`. Daarna leest het nooit meer uit R2. De
 * R2-objecten blijven staan als back-up van de stand op dat moment; ze
 * worden alleen weggehaald als de app zelf verwijderd wordt (destroy()).
 *
 * Het object kent zijn eigen app-id niet (een id uit idFromName() geeft zijn
 * naam niet terug binnen het object). Elke methode krijgt het daarom mee, en
 * het eerste wordt in `meta` bewaard; een ander id daarna is een fout.
 *
 * Verwachte fouten (quotum, te groot resultaat, ongeldig filter) komen terug
 * als { ok: false, code, message } en niet als exception: een eigen
 * eigenschap als `code` overleeft de RPC-grens niet betrouwbaar.
 * lib/storage.js zet ze om naar een Error met `.code`.
 */

import { DurableObject } from 'cloudflare:workers';
import { compileQuery } from './storage-query.js';
import { MAX_OBJECTS_PER_APP, MAX_TOTAL_BYTES_PER_APP, MAX_RESULT_BYTES } from './storage.js';

const R2_PREFIX = 'mini-apps-storage/';
const SCHEMA_VERSION = '1';
const R2_GET_BATCH = 50;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS kv (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL,
     bytes INTEGER NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  // seq = volgorde van toevoegen (rowid). Vroeger kwam een collectie terug
  // in de volgorde van de UUID's (willekeurig); nu in de volgorde waarin de
  // items erbij kwamen.
  `CREATE TABLE IF NOT EXISTS items (
     seq INTEGER PRIMARY KEY,
     collection TEXT NOT NULL,
     id TEXT NOT NULL,
     value TEXT NOT NULL,
     bytes INTEGER NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     UNIQUE (collection, id)
   )`
];

function byteLength(str) {
  return new TextEncoder().encode(str).byteLength;
}

function fail(code, message) {
  return { ok: false, code, message };
}

function ok(data) {
  return { ok: true, data };
}

function tooLarge() {
  return fail(
    'RESULT_TOO_LARGE',
    `Het resultaat is groter dan ${MAX_RESULT_BYTES / 1024 / 1024} MB. Haal de gegevens in delen op met een filter (where) of met limit/offset.`
  );
}

export class MiniAppStorage extends DurableObject {
  // Privé (#): enkel de opslagmethodes hieronder zijn via RPC aan te roepen,
  // niet de verhuizing, het quotum of de meta-tabel.
  #sql;
  #schemaReady;
  #readyFor;

  constructor(ctx, env) {
    super(ctx, env);
    this.#sql = ctx.storage.sql;
    this.#schemaReady = false;
    this.#readyFor = null;
  }

  // ─── Opstart: schema + eenmalige verhuizing uit R2 ──────────────────────

  #ensureSchema() {
    if (this.#schemaReady) return;
    for (const statement of SCHEMA) this.#sql.exec(statement);
    this.#sql.exec(`INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', ?)`, SCHEMA_VERSION);
    this.#schemaReady = true;
  }

  #metaGet(key) {
    const rows = this.#sql.exec(`SELECT value FROM meta WHERE key = ?`, key).toArray();
    return rows.length ? rows[0].value : null;
  }

  #metaSet(key, value) {
    this.#sql.exec(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, String(value));
  }

  async #ready(appId) {
    if (this.#readyFor === appId) return;
    if (typeof appId !== 'string' || !appId) throw new Error('MiniAppStorage: appId ontbreekt.');
    this.#ensureSchema();

    const known = this.#metaGet('app_id');
    if (known && known !== appId) {
      throw new Error(`MiniAppStorage: dit object hoort bij app ${known}, niet bij ${appId}.`);
    }
    if (!known) this.#metaSet('app_id', appId);

    if (!this.#metaGet('migrated_at')) {
      // Niets anders mag dit object aanspreken tot de verhuizing klaar is:
      // anders ziet een gelijktijdig verzoek een halflege database.
      await this.ctx.blockConcurrencyWhile(() => this.#importFromR2(appId));
    }
    this.#readyFor = appId;
  }

  async #importFromR2(appId) {
    if (this.#metaGet('migrated_at')) return; // een ander verzoek was ons voor

    const prefix = `${R2_PREFIX}${appId}/`;
    const objects = [];
    let cursor;
    do {
      const page = await this.env.R2_ASSETS.list({ prefix, cursor });
      objects.push(...page.objects);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    // Eerst alles ophalen, dan in één transactie wegschrijven: een verhuizing
    // die halverwege stopt, mag geen halve app achterlaten.
    const fetched = [];
    for (let i = 0; i < objects.length; i += R2_GET_BATCH) {
      const batch = objects.slice(i, i + R2_GET_BATCH);
      const bodies = await Promise.all(batch.map(async (o) => {
        const obj = await this.env.R2_ASSETS.get(o.key);
        return obj ? await obj.text() : null;
      }));
      batch.forEach((o, j) => {
        if (bodies[j] !== null) fetched.push({ object: o, value: bodies[j] });
      });
    }

    const kv = [];
    const items = [];
    let skipped = 0;
    for (const { object, value } of fetched) {
      const rest = object.key.slice(prefix.length);
      const uploaded = (object.uploaded instanceof Date ? object.uploaded : new Date()).toISOString();
      try {
        if (rest.startsWith('kv/')) {
          kv.push({ key: decodeURIComponent(rest.slice(3)), value, uploaded });
        } else if (rest.startsWith('collections/')) {
          const tail = rest.slice('collections/'.length);
          const slash = tail.indexOf('/');
          if (slash === -1) { skipped++; continue; }
          items.push({
            collection: decodeURIComponent(tail.slice(0, slash)),
            id: decodeURIComponent(tail.slice(slash + 1)),
            value,
            uploaded
          });
        } else {
          skipped++;
        }
      } catch (err) {
        skipped++;
        console.error(`[mini-apps][storage] verhuizing ${appId}: key niet te lezen, overgeslagen: ${object.key}`);
      }
    }
    // Volgorde van toevoegen bestaat in R2 niet; het tijdstip van de laatste
    // schrijfactie komt er het dichtst bij.
    items.sort((a, b) => (a.uploaded < b.uploaded ? -1 : a.uploaded > b.uploaded ? 1 : 0));

    this.ctx.storage.transactionSync(() => {
      for (const r of kv) {
        this.#sql.exec(
          `INSERT OR REPLACE INTO kv (key, value, bytes, updated_at) VALUES (?, ?, ?, ?)`,
          r.key, r.value, byteLength(r.value), r.uploaded
        );
      }
      for (const r of items) {
        this.#sql.exec(
          `INSERT OR REPLACE INTO items (collection, id, value, bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          r.collection, r.id, r.value, byteLength(r.value), r.uploaded, r.uploaded
        );
      }
      this.#metaSet('migrated_at', new Date().toISOString());
      this.#metaSet('migrated_objects', kv.length + items.length);
    });

    console.log(`[mini-apps][storage] verhuisd uit R2: app ${appId}, ${kv.length} keys, ${items.length} items${skipped ? `, ${skipped} overgeslagen` : ''}`);
  }

  // ─── Quotum ─────────────────────────────────────────────────────────────

  #totals() {
    return this.#sql.exec(
      `SELECT (SELECT COUNT(*) FROM kv) + (SELECT COUNT(*) FROM items) AS objects,
              (SELECT COALESCE(SUM(bytes), 0) FROM kv) + (SELECT COALESCE(SUM(bytes), 0) FROM items) AS bytes`
    ).one();
  }

  /** null als het past, anders een fail()-object. */
  #checkQuota(previousBytes, newBytes, isNew) {
    const t = this.#totals();
    if (isNew && t.objects >= MAX_OBJECTS_PER_APP) {
      return fail('TOO_MANY_KEYS', `Maximum aantal keys/items per app (${MAX_OBJECTS_PER_APP}) bereikt.`);
    }
    if (t.bytes - previousBytes + newBytes > MAX_TOTAL_BYTES_PER_APP) {
      return fail('STORAGE_QUOTA_EXCEEDED', `Totale opslag-limiet per app (${MAX_TOTAL_BYTES_PER_APP / 1024 / 1024} MB) bereikt.`);
    }
    return null;
  }

  // ─── Platte key/value ───────────────────────────────────────────────────

  async kvList(appId) {
    await this.#ready(appId);
    const result = {};
    let bytes = 0;
    for (const row of this.#sql.exec(`SELECT key, value, bytes FROM kv ORDER BY key`)) {
      bytes += row.bytes;
      if (bytes > MAX_RESULT_BYTES) return tooLarge();
      result[row.key] = row.value;
    }
    return ok(result);
  }

  async kvGet(appId, key) {
    await this.#ready(appId);
    const rows = this.#sql.exec(`SELECT value FROM kv WHERE key = ?`, key).toArray();
    return ok(rows.length ? rows[0].value : null);
  }

  async kvSet(appId, key, value) {
    await this.#ready(appId);
    const bytes = byteLength(value);
    const prev = this.#sql.exec(`SELECT bytes FROM kv WHERE key = ?`, key).toArray();
    const over = this.#checkQuota(prev.length ? prev[0].bytes : 0, bytes, prev.length === 0);
    if (over) return over;
    this.#sql.exec(
      `INSERT INTO kv (key, value, bytes, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, bytes = excluded.bytes, updated_at = excluded.updated_at`,
      key, value, bytes, new Date().toISOString()
    );
    return ok(null);
  }

  async kvDelete(appId, key) {
    await this.#ready(appId);
    this.#sql.exec(`DELETE FROM kv WHERE key = ?`, key);
    return ok(null);
  }

  // ─── Collecties ─────────────────────────────────────────────────────────

  /** query = uitvoer van normalizeQuery() (of null: alles, in volgorde van toevoegen). */
  async itemsList(appId, collection, query) {
    await this.#ready(appId);
    const q = compileQuery(query);
    const cursor = this.#sql.exec(
      `SELECT id, value, bytes FROM items WHERE collection = ?${q.where} ORDER BY ${q.order}${q.limit}`,
      collection, ...q.params, ...q.limitParams
    );
    const items = [];
    let bytes = 0;
    for (const row of cursor) {
      bytes += row.bytes;
      if (bytes > MAX_RESULT_BYTES) return tooLarge();
      items.push({ id: row.id, value: row.value });
    }
    return ok(items);
  }

  async itemsCount(appId, collection, query) {
    await this.#ready(appId);
    const q = compileQuery(query ? { ...query, limit: null, offset: 0 } : null);
    const row = this.#sql.exec(
      `SELECT COUNT(*) AS n FROM items WHERE collection = ?${q.where}`,
      collection, ...q.params
    ).one();
    return ok(row.n);
  }

  async itemAdd(appId, collection, value) {
    await this.#ready(appId);
    const bytes = byteLength(value);
    const over = this.#checkQuota(0, bytes, true);
    if (over) return over;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.#sql.exec(
      `INSERT INTO items (collection, id, value, bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      collection, id, value, bytes, now, now
    );
    return ok({ id, value });
  }

  /**
   * Upsert onder hetzelfde id, zoals vroeger in R2: bestaat het item niet
   * (meer), dan komt het er opnieuw bij. Een bestaand item houdt zijn plaats
   * in de volgorde (seq) en zijn created_at.
   */
  async itemUpdate(appId, collection, itemId, value) {
    await this.#ready(appId);
    const bytes = byteLength(value);
    const prev = this.#sql.exec(`SELECT bytes FROM items WHERE collection = ? AND id = ?`, collection, itemId).toArray();
    const over = this.#checkQuota(prev.length ? prev[0].bytes : 0, bytes, prev.length === 0);
    if (over) return over;
    const now = new Date().toISOString();
    this.#sql.exec(
      `INSERT INTO items (collection, id, value, bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(collection, id) DO UPDATE SET value = excluded.value, bytes = excluded.bytes, updated_at = excluded.updated_at`,
      collection, itemId, value, bytes, now, now
    );
    return ok({ id: itemId, value });
  }

  async itemRemove(appId, collection, itemId) {
    await this.#ready(appId);
    this.#sql.exec(`DELETE FROM items WHERE collection = ? AND id = ?`, collection, itemId);
    return ok(null);
  }

  /**
   * Alle collecties gegroepeerd per naam -- { naam: [{ id, value }] } -- voor
   * de context van een geplande taak of criteria-taak. Begrensd op
   * MAX_RESULT_BYTES: met het ruimere quotum kan een app meer bevatten dan
   * een Worker in één keer in het geheugen kan houden.
   */
  async allCollections(appId) {
    await this.#ready(appId);
    const grouped = {};
    let bytes = 0;
    for (const row of this.#sql.exec(`SELECT collection, id, value, bytes FROM items ORDER BY collection, seq`)) {
      bytes += row.bytes;
      if (bytes > MAX_RESULT_BYTES) return tooLarge();
      (grouped[row.collection] = grouped[row.collection] || []).push({ id: row.id, value: row.value });
    }
    return ok(grouped);
  }

  async usage(appId) {
    await this.#ready(appId);
    const t = this.#totals();
    return ok({
      usedBytes: t.bytes,
      maxBytes: MAX_TOTAL_BYTES_PER_APP,
      objectCount: t.objects,
      maxObjects: MAX_OBJECTS_PER_APP
    });
  }

  /**
   * Bij het verwijderen van de app: eerst de R2-back-up weg (anders haalt
   * een volgende aanroep die bij de verhuizing opnieuw binnen), dan de hele
   * database van dit object.
   */
  async destroy(appId) {
    if (typeof appId !== 'string' || !appId) throw new Error('MiniAppStorage: appId ontbreekt.');
    const prefix = `${R2_PREFIX}${appId}/`;
    let cursor;
    do {
      const page = await this.env.R2_ASSETS.list({ prefix, cursor });
      const keys = page.objects.map(o => o.key);
      if (keys.length) await this.env.R2_ASSETS.delete(keys);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    await this.ctx.storage.deleteAll();
    this.#schemaReady = false;
    this.#readyFor = null;
    return ok(null);
  }
}
