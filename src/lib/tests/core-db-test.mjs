/**
 * Spreekt core-db.js dezelfde taal als de supabase-js query builder?
 *
 *   node src/lib/tests/core-db-test.mjs
 *
 * Draait op node:sqlite (Node 22+) met een klein D1-omhulsel errond: dezelfde
 * SQLite die D1 gebruikt, zonder Cloudflare. Elke check hier is een vorm van
 * query die vandaag ergens in src/ staat; zie docs/plan-supabase-uitfaseren.md.
 */

import { DatabaseSync } from 'node:sqlite';
import { CoreDb, RPC } from '../core-db.js';

let geslaagd = 0;
let gefaald = 0;
function check(naam, ok, uitleg = '') {
  if (ok) { geslaagd += 1; console.log(`  ✓ ${naam}`); }
  else { gefaald += 1; console.error(`  ✗ ${naam}${uitleg ? `\n    ${uitleg}` : ''}`); }
}
const json = (v) => JSON.stringify(v);

// ── Een D1-omhulsel rond node:sqlite ─────────────────────────────────────────
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  function stmt(sql, params = []) {
    return {
      bind: (...p) => stmt(sql, p),
      all: async () => ({ results: db.prepare(sql).all(...params).map((r) => ({ ...r })) }),
      first: async () => { const r = db.prepare(sql).get(...params); return r ? { ...r } : null; },
      run: async () => { db.prepare(sql).run(...params); return { success: true }; },
      _sync: () => ({ results: db.prepare(sql).all(...params).map((r) => ({ ...r })) }),
    };
  }
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    // D1 voert een batch uit als een transactie: alles of niets.
    batch: async (stmts) => {
      db.exec('BEGIN');
      try { const uit = stmts.map((s) => s._sync()); db.exec('COMMIT'); return uit; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}

const d1 = fakeD1();
d1.raw.exec(`
  CREATE TABLE integraties (
    id TEXT PRIMARY KEY,
    naam TEXT NOT NULL,
    slug TEXT UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    instellingen JSON_TEXT NOT NULL DEFAULT '{}',
    gedeeld_met JSON_TEXT NOT NULL DEFAULT '[]',
    aantal INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ
  );
  CREATE TABLE tellers (prefix TEXT PRIMARY KEY, waarde INTEGER NOT NULL DEFAULT 0);
`);
const db = new CoreDb(d1);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nInvoegen');

let r = await db.from('integraties').insert({ naam: 'Contact', slug: 'contact', instellingen: { a: 1 }, gedeeld_met: ['u1', 'u2'] }).select().single();
check('insert().select().single() geeft de rij terug', !r.error && r.data && r.data.naam === 'Contact', json(r.error));
check('een id wordt gemaakt als het ontbreekt (uuid)', /^[0-9a-f-]{36}$/.test(r.data?.id || ''));
check('JSON komt terug als object', r.data?.instellingen?.a === 1);
check('een lijst komt terug als lijst', Array.isArray(r.data?.gedeeld_met) && r.data.gedeeld_met[1] === 'u2');
check('een boolean komt terug als true/false', r.data?.is_active === true);
check('created_at krijgt een ISO-tijdstip met Z', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.data?.created_at || ''), r.data?.created_at);
const eersteId = r.data.id;

r = await db.from('integraties').insert([
  { naam: 'Offerte', slug: 'offerte', is_active: false, aantal: 5, created_at: '2026-09-01T10:00:00+00:00' },
  { naam: 'Nieuwsbrief', slug: 'nieuws', aantal: 2, created_at: '2026-10-01T10:00:00Z' },
]);
check('insert van meerdere rijen zonder select: data null, geen fout', r.error === null && r.data === null, json(r.error));

r = await db.from('integraties').insert({ naam: 'Dubbel', slug: 'contact' });
check('een dubbele sleutel geeft code 23505 (zoals Postgres)', r.error?.code === '23505', json(r.error));

r = await db.from('integraties').insert({ naam: 'X', bestaatniet: 1 });
check('een onbekende kolom is een fout, geen stille weglating', !!r.error && /bestaatniet/.test(r.error.message));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nLezen en filteren');

r = await db.from('integraties').select('id, naam').eq('is_active', true).order('naam');
check('eq op een boolean', !r.error && r.data.map((x) => x.naam).join() === 'Contact,Nieuwsbrief', json(r));
check('select met kolommen geeft enkel die kolommen', r.data && Object.keys(r.data[0]).join() === 'id,naam');

r = await db.from('integraties').select('*').eq('is_active', false).maybeSingle();
check('maybeSingle met een rij', r.data?.naam === 'Offerte');
r = await db.from('integraties').select('*').eq('slug', 'nope').maybeSingle();
check('maybeSingle zonder rij: null, geen fout', r.data === null && r.error === null);
r = await db.from('integraties').select('*').eq('slug', 'nope').single();
check('single zonder rij: fout PGRST116 (zoals Supabase)', r.error?.code === 'PGRST116');
r = await db.from('integraties').select('*').single();
check('single met meerdere rijen: fout PGRST116', r.error?.code === 'PGRST116');

r = await db.from('integraties').select('naam').in('slug', ['contact', 'nieuws']).order('naam', { ascending: false });
check('in() en order desc', r.data?.map((x) => x.naam).join() === 'Nieuwsbrief,Contact', json(r));
r = await db.from('integraties').select('naam').in('slug', []);
check('in() met een lege lijst: geen rijen, geen fout', !r.error && r.data.length === 0);

r = await db.from('integraties').select('naam').gte('created_at', '2026-09-15').lt('created_at', '2026-10-02T00:00:00+00:00');
check('tijdstippen vergelijken over vormen heen (Z, +00:00, enkel datum)', r.data?.map((x) => x.naam).join() === 'Nieuwsbrief', json(r));

r = await db.from('integraties').select('naam').order('created_at').limit(1);
check('+00:00 bij het schrijven wordt Z, dus sorteren klopt', r.data?.[0]?.naam === 'Offerte', json(r));

r = await db.from('integraties').select('naam').is('aantal', null);
check('is(null)', r.data?.map((x) => x.naam).join() === 'Contact');
r = await db.from('integraties').select('naam').not('aantal', 'is', null).order('aantal');
check("not('x', 'is', null)", r.data?.map((x) => x.naam).join() === 'Nieuwsbrief,Offerte', json(r));

r = await db.from('integraties').select('naam').ilike('naam', '%OFF%');
check('ilike is hoofdletterongevoelig', r.data?.[0]?.naam === 'Offerte');

r = await db.from('integraties').select('naam').contains('gedeeld_met', ['u2']);
check('contains() op een JSON-lijst', r.data?.map((x) => x.naam).join() === 'Contact', json(r));

r = await db.from('integraties').select('naam').or('slug.eq.offerte,gedeeld_met.cs.{u1},is_active.eq.false').order('naam');
check('or() met eq, cs en een boolean', r.data?.map((x) => x.naam).join() === 'Contact,Offerte', json(r));
r = await db.from('integraties').select('naam').or('naam.eq."Nieuwsbrief",aantal.gt.4').order('naam');
check('or() met aanhalingstekens en gt', r.data?.map((x) => x.naam).join() === 'Nieuwsbrief,Offerte', json(r));

r = await db.from('integraties').select('naam').match({ slug: 'offerte', is_active: false });
check('match()', r.data?.length === 1);
r = await db.from('integraties').select('naam').filter('aantal', 'gte', 3);
check('filter(k, op, v)', r.data?.map((x) => x.naam).join() === 'Offerte');

r = await db.from('integraties').select('naam').order('naam').range(1, 2);
check('range()', r.data?.map((x) => x.naam).join() === 'Nieuwsbrief,Offerte', json(r));

r = await db.from('integraties').select('*', { count: 'exact', head: true }).eq('is_active', true);
check("select('*', { count: 'exact', head: true })", r.count === 2 && r.data === null, json(r));
r = await db.from('integraties').select('naam', { count: 'exact' }).limit(1);
check('count samen met rijen', r.count === 3 && r.data.length === 1);

r = await db.from('integraties').select('naam').order('aantal');
check('NULL achteraan bij oplopend, zoals Postgres', r.data?.map((x) => x.naam).join() === 'Nieuwsbrief,Offerte,Contact', json(r));
r = await db.from('integraties').select('naam').order('aantal', { ascending: false });
check('NULL vooraan bij aflopend, zoals Postgres', r.data?.[0]?.naam === 'Contact', json(r));

r = await db.from('integraties').select('sleutel:slug').eq('naam', 'Contact').single();
check('alias in select (sleutel:slug)', r.data?.sleutel === 'contact');

r = await db.from('integraties').select('id, tag:fs_v2_tags(id, name)');
check('geneste select: duidelijke fout, geen stille misser', r.error?.code === 'CORE_DB_UNSUPPORTED');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nBijwerken, upsert en verwijderen');

r = await db.from('integraties').update({ naam: 'Contact NL', instellingen: { a: 2 } }).eq('id', eersteId).select().single();
check('update().eq().select().single()', r.data?.naam === 'Contact NL' && r.data.instellingen.a === 2, json(r));
check('update zet updated_at zelf (zoals de trigger in Postgres)', /Z$/.test(r.data?.updated_at || ''));

r = await db.from('integraties').update({ naam: 'Alles' });
check('update zonder filter wordt geweigerd', r.error?.code === 'CORE_DB_UNSUPPORTED');
r = await db.from('integraties').delete();
check('delete zonder filter wordt geweigerd', r.error?.code === 'CORE_DB_UNSUPPORTED');

r = await db.from('integraties').upsert({ slug: 'contact', naam: 'Contact (upsert)' }, { onConflict: 'slug' }).select().single();
check('upsert op een andere sleutel werkt de bestaande rij bij', r.data?.naam === 'Contact (upsert)', json(r));
check('en houdt het bestaande id', r.data?.id === eersteId, `${r.data?.id} ≠ ${eersteId}`);

r = await db.from('integraties').upsert({ slug: 'contact', naam: 'Genegeerd' }, { onConflict: 'slug', ignoreDuplicates: true });
const naUpsert = await db.from('integraties').select('naam').eq('slug', 'contact').single();
check('upsert met ignoreDuplicates laat de rij staan', naUpsert.data?.naam === 'Contact (upsert)');

r = await db.from('integraties').delete().eq('slug', 'nieuws').select('naam');
check('delete().eq().select() geeft de verwijderde rijen', r.data?.[0]?.naam === 'Nieuwsbrief', json(r));
r = await db.from('integraties').select('*', { count: 'exact', head: true });
check('en de rij is weg', r.count === 2);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nrpc()');

RPC.test_volgende = async (cdb, { p_prefix }) => {
  const rij = await cdb.d1.prepare(
    'INSERT INTO tellers (prefix, waarde) VALUES (?, 1) ON CONFLICT (prefix) DO UPDATE SET waarde = waarde + 1 RETURNING waarde'
  ).bind(p_prefix).first();
  return rij.waarde;
};
const a = await db.rpc('test_volgende', { p_prefix: 'OFF' });
const b = await db.rpc('test_volgende', { p_prefix: 'OFF' });
check('rpc voert een geregistreerde functie uit', a.data === 1 && b.data === 2, json([a, b]));
r = await db.rpc('bestaat_niet');
check('een onbekende rpc is een duidelijke fout', r.error?.code === 'CORE_DB_UNSUPPORTED');

r = await db.from('geen_tabel').select('*');
check('een onbekende tabel is een fout', r.error?.code === '42P01');

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald === 0 ? 0 : 1);
