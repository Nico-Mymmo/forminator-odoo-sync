/**
 * Toegang tot D1 "om-core": de opvolger van Supabase.
 *
 * Plan en volgorde: docs/plan-supabase-uitfaseren.md.
 *
 * Deze laag spreekt DEZELFDE TAAL als de supabase-js query builder, voor het
 * deel dat de OM gebruikt:
 *
 *   const db = getCoreDb(env);
 *   const { data, error } = await db.from('tabel').select('id, naam')
 *     .eq('actief', true).order('naam').limit(20);
 *
 * Zo verandert er per module bij de verhuis bijna alleen
 * getSupabaseClient(env) -> getCoreDb(env), en blijven de query's zoals ze
 * zijn. Wat deze laag NIET kent (geneste selects als `tag:fs_v2_tags(id)`,
 * onbekende operatoren) geeft een duidelijke fout terug in plaats van stil
 * iets anders te doen: een verhuisde module die iets onbekends vraagt, moet
 * dat meteen laten zien.
 *
 * Omzettingen Postgres -> SQLite (zie ook het plan):
 *  - uuid: TEXT. Ontbreekt `id` bij een insert en is `id` een TEXT-sleutel,
 *    dan maakt deze laag een crypto.randomUUID().
 *  - timestamptz: kolomtype `TIMESTAMPTZ` in de migratie, bewaard als
 *    ISO-8601 in UTC met 'Z' (zoals toISOString()). Deze laag zet elke
 *    waarde voor zo'n kolom -- ook in een filter -- in precies die vorm, want
 *    als tekst sorteert en vergelijkt het enkel correct als ALLES dezelfde
 *    vorm heeft ('...+00:00' van Postgres naast '...Z' zou dat breken).
 *    Standaardwaarde in de migratie: (strftime('%Y-%m-%dT%H:%M:%fZ','now')).
 *  - jsonb: kolomtype `JSON_TEXT` in de migratie. Deze laag zet objecten om
 *    naar tekst bij het schrijven en terug bij het lezen.
 *  - boolean: kolomtype `BOOLEAN` (0/1 in SQLite), terug als true/false.
 *  - updated_at: heeft de tabel die kolom, dan zet update/upsert ze zelf
 *    (in Postgres deed een trigger dat).
 *  - fouten: `{ message, code }`, met code '23505' bij een dubbele sleutel en
 *    'PGRST116' als single() geen of meerdere rijen vindt -- dezelfde codes
 *    als Supabase, want bestaande code kijkt daarnaar.
 *  - .rpc(naam, args): enkel functies die hieronder in RPC staan.
 *
 * Kolomtypes worden EEN keer per isolate per tabel opgehaald (PRAGMA
 * table_info), niet per query.
 */

let cachedDb = null;
let cachedBinding = null;

export function hasCoreDb(env) {
  return !!env?.CORE_DB;
}

/** @returns {CoreDb} */
export function getCoreDb(env) {
  if (!env?.CORE_DB) throw new Error('CORE_DB-binding ontbreekt (D1 om-core).');
  if (!cachedDb || cachedBinding !== env.CORE_DB) {
    cachedDb = new CoreDb(env.CORE_DB);
    cachedBinding = env.CORE_DB;
  }
  return cachedDb;
}

// D1 aanvaardt maximaal 100 gebonden parameters per statement.
const MAX_PARAMS = 100;
// Rijen per batch bij een insert/upsert van veel rijen.
const BATCH = 50;

const IDENT = /^[a-z_][a-z0-9_]*$/i;
function ident(naam, wat = 'kolom') {
  const n = String(naam || '').trim();
  if (!IDENT.test(n)) throw dbFout(`core-db: ongeldige ${wat} "${naam}"`, 'CORE_DB_UNSUPPORTED');
  return '"' + n + '"';
}

function dbFout(message, code) {
  const e = new Error(message);
  e.code = code || 'CORE_DB_ERROR';
  return e;
}

/** SQLite-fout -> een fout met de Postgres-code die bestaande code verwacht. */
function vertaalFout(err) {
  const msg = String(err?.message || err || 'onbekende fout');
  if (/UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(msg)) return { message: msg, code: '23505' };
  if (/FOREIGN KEY constraint failed/i.test(msg)) return { message: msg, code: '23503' };
  if (/NOT NULL constraint failed/i.test(msg)) return { message: msg, code: '23502' };
  if (/CHECK constraint failed/i.test(msg)) return { message: msg, code: '23514' };
  return { message: msg, code: err?.code || 'CORE_DB_ERROR' };
}

/**
 * Database-functies die in Postgres als SQL-functie bestonden. Elke functie
 * krijgt (db, args) en geeft de `data` terug die supabase.rpc() gaf.
 * Wordt per module gevuld wanneer die verhuist.
 */
export const RPC = Object.create(null);

export class CoreDb {
  constructor(d1) {
    this.d1 = d1;
    this._kolommen = new Map(); // tabel -> Map(kolom -> { type, pk })
  }

  from(tabel) {
    return new Query(this, tabel);
  }

  async rpc(naam, args = {}) {
    const fn = RPC[naam];
    if (!fn) return { data: null, error: { message: `core-db: onbekende rpc "${naam}"`, code: 'CORE_DB_UNSUPPORTED' } };
    try {
      return { data: await fn(this, args), error: null };
    } catch (e) {
      return { data: null, error: vertaalFout(e) };
    }
  }

  /** Kolomtypes van een tabel, gecachet. */
  async kolommen(tabel) {
    if (this._kolommen.has(tabel)) return this._kolommen.get(tabel);
    const res = await this.d1.prepare(`PRAGMA table_info(${ident(tabel, 'tabel')})`).all();
    const rijen = res?.results || [];
    if (!rijen.length) throw dbFout(`core-db: tabel "${tabel}" bestaat niet in om-core`, '42P01');
    const m = new Map();
    rijen.forEach((r) => m.set(r.name, { type: String(r.type || '').toUpperCase(), pk: Number(r.pk) > 0 }));
    this._kolommen.set(tabel, m);
    return m;
  }
}

// ── Waarden heen en terug ──────────────────────────────────────────────────

function naarDb(waarde, info) {
  if (waarde === undefined) return null;
  if (waarde === null) return null;
  const type = info?.type || '';
  if (type === 'JSON_TEXT') return typeof waarde === 'string' ? waarde : JSON.stringify(waarde);
  if (type === 'BOOLEAN' || typeof waarde === 'boolean') return waarde ? 1 : 0;
  if (type === 'TIMESTAMPTZ') {
    const t = waarde instanceof Date ? waarde.getTime() : Date.parse(String(waarde));
    return isFinite(t) ? new Date(t).toISOString() : waarde;
  }
  if (waarde instanceof Date) return waarde.toISOString();
  if (typeof waarde === 'object') return JSON.stringify(waarde);
  return waarde;
}

function uitDb(rij, kolommen) {
  if (!rij) return rij;
  const uit = {};
  Object.keys(rij).forEach((k) => {
    const v = rij[k];
    const info = kolommen.get(k);
    if (v === null || v === undefined || !info) { uit[k] = v; return; }
    if (info.type === 'JSON_TEXT') {
      try { uit[k] = JSON.parse(v); } catch (_) { uit[k] = v; }
    } else if (info.type === 'BOOLEAN') {
      uit[k] = v === 1 || v === true || v === '1' || v === 'true';
    } else {
      uit[k] = v;
    }
  });
  return uit;
}

// ── Kolomlijst van select() ────────────────────────────────────────────────

/**
 * 'id, naam' / '*' / 'alias:kolom' -> SQL. Geneste selects (`tabel(kol)`)
 * bestaan in SQLite niet zo: die worden bij de verhuis met de hand
 * herschreven, dus hier een duidelijke fout.
 */
function selectSql(kolomLijst) {
  const s = String(kolomLijst == null ? '*' : kolomLijst).trim() || '*';
  if (s.includes('(')) {
    throw dbFout(`core-db: geneste select wordt niet ondersteund ("${s}") -- herschrijf als aparte query`, 'CORE_DB_UNSUPPORTED');
  }
  if (s === '*') return '*';
  return s.split(',').map((deel) => {
    const d = deel.trim();
    if (d === '*') return '*';
    const m = d.match(/^([a-z_][a-z0-9_]*)\s*:\s*([a-z_][a-z0-9_]*)$/i);
    if (m) return `${ident(m[2])} AS ${ident(m[1])}`;
    return ident(d);
  }).join(', ');
}

// ── De query zelf ──────────────────────────────────────────────────────────

class Query {
  constructor(db, tabel) {
    this.db = db;
    this.tabel = tabel;
    this.soort = 'select';   // select | insert | update | upsert | delete
    this.kolomLijst = '*';
    this.teruggeven = false; // .select() na een schrijfactie
    this.telling = null;     // 'exact' | null
    this.alleenTelling = false;
    this.filters = [];       // { sql, params } of uitgestelde functie(kolommen)
    this.volgorde = [];
    this.limiet = null;
    this.vanaf = null;
    this.enkel = null;       // 'single' | 'maybe'
    this.waarden = null;
    this.opties = {};
  }

  // Lezen
  select(kolommen = '*', opties = {}) {
    if (this.soort === 'select') {
      this.kolomLijst = kolommen;
      if (opties.count) this.telling = opties.count;
      if (opties.head) this.alleenTelling = true;
    } else {
      this.teruggeven = true;
      this.kolomLijst = kolommen;
    }
    return this;
  }

  // Schrijven
  insert(rijen, opties = {}) { this.soort = 'insert'; this.waarden = rijen; this.opties = opties; return this; }
  upsert(rijen, opties = {}) { this.soort = 'upsert'; this.waarden = rijen; this.opties = opties; return this; }
  update(waarden, opties = {}) { this.soort = 'update'; this.waarden = waarden; this.opties = opties; return this; }
  delete(opties = {}) { this.soort = 'delete'; this.opties = opties; return this; }

  // Filters -- uitgesteld tot de kolomtypes gekend zijn (voor booleans/JSON).
  _f(maker) { this.filters.push(maker); return this; }
  eq(k, v)   { return this._f((kol) => vergelijk(k, '=', v, kol)); }
  neq(k, v)  { return this._f((kol) => vergelijk(k, '<>', v, kol)); }
  gt(k, v)   { return this._f((kol) => vergelijk(k, '>', v, kol)); }
  gte(k, v)  { return this._f((kol) => vergelijk(k, '>=', v, kol)); }
  lt(k, v)   { return this._f((kol) => vergelijk(k, '<', v, kol)); }
  lte(k, v)  { return this._f((kol) => vergelijk(k, '<=', v, kol)); }
  like(k, v) { return this._f(() => ({ sql: `${ident(k)} LIKE ?`, params: [v] })); }
  // SQLite's LIKE is al hoofdletterongevoelig voor ASCII; lower() aan beide
  // kanten maakt het ook voor é/É e.d. gelijk aan Postgres' ILIKE.
  ilike(k, v) { return this._f(() => ({ sql: `lower(${ident(k)}) LIKE lower(?)`, params: [v] })); }
  is(k, v)   { return this._f(() => isFilter(k, v, false)); }
  in(k, lijst) { return this._f((kol) => inFilter(k, lijst, kol, false)); }
  contains(k, v) { return this._f(() => containsFilter(k, v)); }
  match(obj) { Object.keys(obj || {}).forEach((k) => this.eq(k, obj[k])); return this; }
  not(k, op, v) { return this._f((kol) => negeer(operatorFilter(k, op, v, kol))); }
  filter(k, op, v) { return this._f((kol) => operatorFilter(k, op, v, kol)); }
  or(uitdrukking) { return this._f((kol) => orFilter(uitdrukking, kol)); }

  // Volgorde en grenzen
  order(k, opties = {}) {
    const richting = opties.ascending === false ? 'DESC' : 'ASC';
    // Postgres zet NULL standaard achteraan bij ASC en vooraan bij DESC;
    // SQLite doet het omgekeerd. Expliciet maken houdt de volgorde gelijk.
    const nullsFirst = opties.nullsFirst != null ? !!opties.nullsFirst : richting === 'DESC';
    this.volgorde.push(`${ident(k)} ${richting} NULLS ${nullsFirst ? 'FIRST' : 'LAST'}`);
    return this;
  }
  limit(n) { this.limiet = Math.max(0, Number(n) || 0); return this; }
  range(van, tot) { this.vanaf = Number(van) || 0; this.limiet = Math.max(0, Number(tot) - Number(van) + 1); return this; }
  single() { this.enkel = 'single'; return this; }
  maybeSingle() { this.enkel = 'maybe'; return this; }

  then(ok, nok) { return this._voerUit().then(ok, nok); }
  catch(nok) { return this._voerUit().catch(nok); }

  async _voerUit() {
    try {
      const kol = await this.db.kolommen(this.tabel);
      switch (this.soort) {
        case 'select': return await this._select(kol);
        case 'insert': return await this._schrijf(kol, false);
        case 'upsert': return await this._schrijf(kol, true);
        case 'update': return await this._update(kol);
        case 'delete': return await this._delete(kol);
        default: throw dbFout(`core-db: onbekende actie ${this.soort}`);
      }
    } catch (e) {
      return { data: null, error: vertaalFout(e), count: null };
    }
  }

  _waar(kol) {
    const delen = this.filters.map((maker) => maker(kol));
    if (!delen.length) return { sql: '', params: [] };
    return {
      sql: ' WHERE ' + delen.map((d) => `(${d.sql})`).join(' AND '),
      params: delen.flatMap((d) => d.params),
    };
  }

  _resultaat(rijen, kol, count = null) {
    const data = rijen.map((r) => uitDb(r, kol));
    if (this.enkel) {
      if (data.length === 1) return { data: data[0], error: null, count };
      if (data.length === 0 && this.enkel === 'maybe') return { data: null, error: null, count };
      return {
        data: null,
        error: { message: `JSON object requested, multiple (or no) rows returned (${data.length})`, code: 'PGRST116' },
        count,
      };
    }
    return { data, error: null, count };
  }

  async _select(kol) {
    const t = ident(this.tabel, 'tabel');
    const w = this._waar(kol);
    let count = null;
    if (this.telling) {
      const r = await this._stmt(`SELECT COUNT(*) AS n FROM ${t}${w.sql}`, w.params).first();
      count = Number(r?.n || 0);
      if (this.alleenTelling) return { data: null, error: null, count };
    }
    let sql = `SELECT ${selectSql(this.kolomLijst)} FROM ${t}${w.sql}`;
    if (this.volgorde.length) sql += ' ORDER BY ' + this.volgorde.join(', ');
    // single() zonder limiet: twee rijen ophalen is genoeg om "meer dan een" te zien.
    const lim = this.limiet != null ? this.limiet : (this.enkel ? 2 : null);
    if (lim != null) sql += ` LIMIT ${lim}`;
    if (this.vanaf) sql += (lim == null ? ' LIMIT -1' : '') + ` OFFSET ${this.vanaf}`;
    const res = await this._stmt(sql, w.params).all();
    return this._resultaat(res?.results || [], kol, count);
  }

  _returning() {
    return this.teruggeven ? ' RETURNING ' + selectSql(this.kolomLijst) : '';
  }

  _rijVoorbereiden(rij, kol) {
    const r = Object.assign({}, rij);
    const idInfo = kol.get('id');
    if (idInfo && idInfo.pk && /TEXT/.test(idInfo.type) && (r.id === undefined || r.id === null)) {
      r.id = crypto.randomUUID();
      // Bij een upsert op een andere sleutel mag een nieuw id een BESTAANDE
      // rij nooit een ander id geven: zie bij in _schrijf().
      Object.defineProperty(r, '__nieuwId', { value: true, enumerable: false });
    }
    Object.keys(r).forEach((k) => { if (!kol.has(k)) throw dbFout(`core-db: kolom "${k}" bestaat niet in ${this.tabel}`, '42703'); });
    return r;
  }

  async _schrijf(kol, isUpsert) {
    const lijst = (Array.isArray(this.waarden) ? this.waarden : [this.waarden]).filter(Boolean);
    if (!lijst.length) return { data: this.teruggeven ? [] : null, error: null, count: null };
    const t = ident(this.tabel, 'tabel');
    const nu = new Date().toISOString();
    let conflict = [];
    if (isUpsert) {
      conflict = String(this.opties.onConflict || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!conflict.length) conflict = Array.from(kol.entries()).filter(([, i]) => i.pk).map(([n]) => n);
      if (!conflict.length) throw dbFout(`core-db: upsert op ${this.tabel} zonder onConflict en zonder primaire sleutel`, 'CORE_DB_UNSUPPORTED');
    }

    const stmts = lijst.map((rij) => {
      const r = this._rijVoorbereiden(rij, kol);
      if (isUpsert && kol.has('updated_at') && r.updated_at === undefined) r.updated_at = nu;
      const namen = Object.keys(r);
      if (namen.length > MAX_PARAMS) throw dbFout(`core-db: te veel kolommen (${namen.length}) voor een rij`, 'CORE_DB_UNSUPPORTED');
      let sql = `INSERT INTO ${t} (${namen.map((n) => ident(n)).join(', ')}) VALUES (${namen.map(() => '?').join(', ')})`;
      if (isUpsert) {
        const bij = namen.filter((n) => !conflict.includes(n) && !(n === 'id' && r.__nieuwId));
        sql += ` ON CONFLICT (${conflict.map((n) => ident(n)).join(', ')}) ` +
          (this.opties.ignoreDuplicates || !bij.length
            ? 'DO NOTHING'
            : 'DO UPDATE SET ' + bij.map((n) => `${ident(n)} = excluded.${ident(n)}`).join(', '));
      }
      sql += this._returning();
      return this._stmt(sql, namen.map((n) => naarDb(r[n], kol.get(n))));
    });

    const rijen = [];
    for (let i = 0; i < stmts.length; i += BATCH) {
      const res = await this.db.d1.batch(stmts.slice(i, i + BATCH));
      res.forEach((x) => (x?.results || []).forEach((r) => rijen.push(r)));
    }
    if (!this.teruggeven) return { data: null, error: null, count: null };
    return this._resultaat(rijen, kol);
  }

  async _update(kol) {
    const r = Object.assign({}, this.waarden || {});
    if (kol.has('updated_at') && r.updated_at === undefined) r.updated_at = new Date().toISOString();
    const namen = Object.keys(r);
    namen.forEach((k) => { if (!kol.has(k)) throw dbFout(`core-db: kolom "${k}" bestaat niet in ${this.tabel}`, '42703'); });
    if (!namen.length) return { data: this.teruggeven ? [] : null, error: null, count: null };
    if (!this.filters.length) throw dbFout('core-db: update zonder filter geweigerd', 'CORE_DB_UNSUPPORTED');
    const w = this._waar(kol);
    const sql = `UPDATE ${ident(this.tabel, 'tabel')} SET ${namen.map((n) => `${ident(n)} = ?`).join(', ')}${w.sql}${this._returning()}`;
    const res = await this._stmt(sql, namen.map((n) => naarDb(r[n], kol.get(n))).concat(w.params)).all();
    if (!this.teruggeven) return { data: null, error: null, count: null };
    return this._resultaat(res?.results || [], kol);
  }

  async _delete(kol) {
    // Supabase weigert een delete zonder filter ook; een vergeten .eq()
    // mag nooit een hele tabel leegmaken.
    if (!this.filters.length) throw dbFout('core-db: delete zonder filter geweigerd', 'CORE_DB_UNSUPPORTED');
    const w = this._waar(kol);
    const sql = `DELETE FROM ${ident(this.tabel, 'tabel')}${w.sql}${this._returning()}`;
    const res = await this._stmt(sql, w.params).all();
    if (!this.teruggeven) return { data: null, error: null, count: null };
    return this._resultaat(res?.results || [], kol);
  }

  _stmt(sql, params) {
    if (params.length > MAX_PARAMS) throw dbFout(`core-db: ${params.length} parameters, D1 aanvaardt er ${MAX_PARAMS}`, 'CORE_DB_UNSUPPORTED');
    const s = this.db.d1.prepare(sql);
    return params.length ? s.bind(...params) : s;
  }
}

// ── Filterbouwers ──────────────────────────────────────────────────────────

function vergelijk(k, op, v, kol) {
  if (v === null && (op === '=' || op === '<>')) return isFilter(k, null, op === '<>');
  return { sql: `${ident(k)} ${op} ?`, params: [naarDb(v, kol.get(k))] };
}

function isFilter(k, v, negatief) {
  const n = negatief ? 'IS NOT' : 'IS';
  if (v === null || v === 'null') return { sql: `${ident(k)} ${n} NULL`, params: [] };
  if (v === true || v === 'true') return { sql: `${ident(k)} ${n} 1`, params: [] };
  if (v === false || v === 'false') return { sql: `${ident(k)} ${n} 0`, params: [] };
  throw dbFout(`core-db: is() met waarde ${v} wordt niet ondersteund`, 'CORE_DB_UNSUPPORTED');
}

function inFilter(k, lijst, kol, negatief) {
  const waarden = Array.isArray(lijst) ? lijst : [];
  // IN () is in Postgres een fout en hier altijd onwaar: geen rijen.
  if (!waarden.length) return { sql: negatief ? '1 = 1' : '1 = 0', params: [] };
  return {
    sql: `${ident(k)} ${negatief ? 'NOT IN' : 'IN'} (${waarden.map(() => '?').join(', ')})`,
    params: waarden.map((v) => naarDb(v, kol.get(k))),
  };
}

/** .contains(kolom, [a, b]) op een JSON-lijst: alle waarden moeten erin zitten. */
function containsFilter(k, v) {
  const lijst = Array.isArray(v) ? v : [v];
  if (!lijst.length) return { sql: '1 = 1', params: [] };
  return {
    sql: lijst.map(() => `EXISTS (SELECT 1 FROM json_each(${ident(k)}) WHERE json_each.value = ?)`).join(' AND '),
    params: lijst,
  };
}

function negeer(f) {
  return { sql: `NOT (${f.sql})`, params: f.params };
}

/** PostgREST-operatoren zoals .filter() en .not() ze krijgen. */
function operatorFilter(k, op, v, kol) {
  switch (String(op)) {
    case 'eq':  return vergelijk(k, '=', v, kol);
    case 'neq': return vergelijk(k, '<>', v, kol);
    case 'gt':  return vergelijk(k, '>', v, kol);
    case 'gte': return vergelijk(k, '>=', v, kol);
    case 'lt':  return vergelijk(k, '<', v, kol);
    case 'lte': return vergelijk(k, '<=', v, kol);
    case 'like':  return { sql: `${ident(k)} LIKE ?`, params: [v] };
    case 'ilike': return { sql: `lower(${ident(k)}) LIKE lower(?)`, params: [v] };
    case 'is':  return isFilter(k, v, false);
    case 'in':  return inFilter(k, Array.isArray(v) ? v : parseLijst(v), kol, false);
    case 'cs':  return containsFilter(k, Array.isArray(v) ? v : parseLijst(v));
    default: throw dbFout(`core-db: operator "${op}" wordt niet ondersteund`, 'CORE_DB_UNSUPPORTED');
  }
}

/** '(a,b)' of '{a,b}' -> ['a','b'], aanhalingstekens eraf. */
function parseLijst(s) {
  const binnen = String(s || '').trim().replace(/^[({]/, '').replace(/[)}]$/, '');
  if (!binnen) return [];
  return binnen.split(',').map((x) => x.trim().replace(/^"(.*)"$/, '$1'));
}

/** Waarde uit een or()-tekst: "x" -> x, true/false/null blijven tekst voor isFilter. */
function orWaarde(s) {
  const t = String(s).trim();
  const m = t.match(/^"(.*)"$/);
  return m ? m[1] : t;
}

/**
 * .or('a.eq.1,b.cs.{x},c.is.null'). Splitsen op komma's die NIET binnen
 * {}, () of aanhalingstekens staan.
 */
function orFilter(uitdrukking, kol) {
  const delen = [];
  let diepte = 0, inQuote = false, huidig = '';
  for (const ch of String(uitdrukking || '')) {
    if (ch === '"') inQuote = !inQuote;
    if (!inQuote && (ch === '{' || ch === '(')) diepte += 1;
    if (!inQuote && (ch === '}' || ch === ')')) diepte -= 1;
    if (ch === ',' && diepte === 0 && !inQuote) { delen.push(huidig); huidig = ''; continue; }
    huidig += ch;
  }
  if (huidig.trim()) delen.push(huidig);
  if (!delen.length) throw dbFout('core-db: lege or()', 'CORE_DB_UNSUPPORTED');

  const stukken = delen.map((deel) => {
    const m = deel.trim().match(/^([a-z_][a-z0-9_]*)\.(not\.)?([a-z]+)\.([\s\S]*)$/i);
    if (!m) throw dbFout(`core-db: or()-deel "${deel}" niet begrepen`, 'CORE_DB_UNSUPPORTED');
    const [, k, not, op, ruw] = m;
    let waarde = orWaarde(ruw);
    if (op === 'eq' || op === 'neq') {
      if (waarde === 'true') waarde = true;
      else if (waarde === 'false') waarde = false;
      else if (waarde === 'null') waarde = null;
    }
    const f = operatorFilter(k, op, waarde, kol);
    return not ? negeer(f) : f;
  });
  return {
    sql: stukken.map((s) => `(${s.sql})`).join(' OR '),
    params: stukken.flatMap((s) => s.params),
  };
}
