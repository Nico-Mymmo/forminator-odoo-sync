/**
 * Werkt de verhuis van een tabel (src/lib/verhuis.js) zoals Beheer -> Verhuis
 * belooft?
 *
 *   node src/lib/tests/verhuis-test.mjs
 *
 * Twee SQLite-databanken: een speelt Supabase (via dezelfde querytaal), de
 * andere is om-core met de echte migraties uit d1/om-core/migrations/.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeD1 } from './fake-d1.mjs';
import { CoreDb } from '../core-db.js';
import { dbVoor, overzicht, kopieer, schakelOver, zetTerug } from '../verhuis.js';

const hier = dirname(fileURLToPath(import.meta.url));
const migDir = join(hier, '..', '..', '..', 'd1', 'om-core', 'migrations');
const migraties = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(migDir, f), 'utf8')).join('\n');

let geslaagd = 0, gefaald = 0;
function check(naam, ok, uitleg = '') {
  if (ok) { geslaagd += 1; console.log(`  ✓ ${naam}`); }
  else { gefaald += 1; console.error(`  ✗ ${naam}${uitleg ? `\n    ${uitleg}` : ''}`); }
}
async function faalt(fn) { try { await fn(); return null; } catch (e) { return e; } }

// "Supabase": hetzelfde schema, met een rij zoals Postgres ze teruggeeft.
const bronD1 = fakeD1(migraties);
const supabase = new CoreDb(bronD1);
const core = fakeD1(migraties);
const env = { CORE_DB: core, VERHUIS_BRON: supabase };

// Een KIND met een id dat VOOR zijn ouder sorteert: de kopie gaat op id, dus
// zonder de tweede ronde weigert de foreign key het kind.
const ins = await supabase.from('product_features').insert([
  { id: 'ffffffff-0000-0000-0000-000000000009', code: 'ouder', name: 'Ouder', updated_at: '2026-10-16T09:00:00Z' },
  { id: '00000000-0000-0000-0000-000000000001', code: 'kind', name: 'Kind', parent_id: 'ffffffff-0000-0000-0000-000000000009',
    usps: ['a', 'b'], benefits: ['tijdswinst'], is_active: true, updated_at: '2026-10-16T10:00:00+00:00' },
  { id: '55555555-0000-0000-0000-000000000005', code: 'uit', name: 'Uitgeschakeld', is_active: false, updated_at: '2026-10-16T08:00:00Z' },
]);
if (ins.error) throw new Error('testgegevens: ' + ins.error.message);

console.log('\nVoor de verhuis');
check('de module gebruikt Supabase', (await dbVoor(env, 'product_features')) === supabase);
let o = await overzicht(env);
check('het overzicht toont de tabel als "nog niet"', o[0]?.status === 'nog niet' && o[0].rijen_supabase === 3 && o[0].rijen_core === 0, JSON.stringify(o));
check('overschakelen zonder kopie wordt geweigerd', !!(await faalt(() => schakelOver(env, 'product_features'))));
check('een tabel buiten de lijst wordt geweigerd', (await faalt(() => kopieer(env, 'users')))?.status === 404);

console.log('\nKopieren');
const k = await kopieer(env, 'product_features');
check('alle rijen gekopieerd, aantallen gelijk', k.gelijk && k.rijen_core === 3, JSON.stringify(k));
const cdb = new CoreDb(core);
const kind = (await cdb.from('product_features').select('*').eq('code', 'kind').single()).data;
check('de verwijzing naar de ouder staat er (tweede ronde)', kind?.parent_id === 'ffffffff-0000-0000-0000-000000000009');
check('lijsten en booleans komen goed over', Array.isArray(kind?.usps) && kind.usps[1] === 'b' && kind.is_active === true);
check('updated_at blijft wat het was (geen "nu")', kind?.updated_at === '2026-10-16T10:00:00.000Z', kind?.updated_at);
const uit = (await cdb.from('product_features').select('is_active').eq('code', 'uit').single()).data;
check('false blijft false', uit?.is_active === false);
check('de module gebruikt nog altijd Supabase na het kopieren', (await dbVoor(env, 'product_features')) === supabase);

const k2 = await kopieer(env, 'product_features');
check('opnieuw kopieren maakt geen dubbele rijen', k2.rijen_core === 3);

console.log('\nOverschakelen');
await supabase.from('product_features').update({ name: 'Ouder (gewijzigd)' }).eq('code', 'ouder');
const geweigerd = await faalt(() => schakelOver(env, 'product_features'));
check('een wijziging in Supabase na het kopieren houdt het overschakelen tegen', geweigerd?.status === 409, geweigerd?.message);
await kopieer(env, 'product_features');
const s = await schakelOver(env, 'product_features');
check('na opnieuw kopieren lukt het overschakelen', s.status === 'live');
check('de module gebruikt nu om-core', (await dbVoor(env, 'product_features')) !== supabase);
check('kopieren na het overschakelen wordt geweigerd (zou nieuwe gegevens overschrijven)',
  (await faalt(() => kopieer(env, 'product_features')))?.status === 409);

console.log('\nTerugzetten');
const t = await zetTerug(env, 'product_features');
check('terugzetten zet de module terug op Supabase', t.status === 'teruggezet' && (await dbVoor(env, 'product_features')) === supabase);
o = await overzicht(env);
check('het overzicht waarschuwt wat terugzetten betekent', /staat niet in Supabase/.test(o[0]?.fout || ''));

console.log('\nZonder nieuwe databank');
check('zonder CORE_DB blijft alles op Supabase', (await dbVoor({ VERHUIS_BRON: supabase }, 'product_features')) === supabase);

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald\n`);
process.exit(gefaald === 0 ? 0 : 1);
