/**
 * Regio's -- opslag in D1 om-core (d1/om-core/migrations/0012_regios.sql).
 *
 * Elke postcode is een eigen rij. Toewijzen schrijft enkel de postcodes die
 * je aanklikte; zo kunnen twee mensen tegelijk aan de kaart werken zonder
 * elkaars werk te overschrijven (de mini-app bewaarde alles als een blob).
 */

import { getCoreDb } from '../../../lib/core-db.js';
import { naamUitEmail } from '../../../lib/medewerkers.js';
import { RegioError, PALET, MAX_NAAM, KLEUR_RE, normaliseerPostcode, LOG_PREFIX } from './constants.js';

const db = (env) => getCoreDb(env);

function check(res, wat) {
  if (res?.error) throw new Error(`${wat}: ${res.error.message}`);
  return res?.data;
}

export function naamVanGebruiker(user) {
  return (user?.full_name || '').trim() || naamUitEmail(user?.email || '') || 'onbekend';
}

// ── Lezen ─────────────────────────────────────────────────────────────────

export async function listSyndicoaches(env) {
  const rijen = check(await db(env).from('regio_syndicoaches')
    .select('id, naam, kleur, position, created_at')
    .order('position').order('created_at'), 'Syndicoaches lezen') || [];
  return rijen;
}

export async function getSyndicoach(env, id) {
  return check(await db(env).from('regio_syndicoaches').select('*').eq('id', id).maybeSingle(), 'Syndicoach lezen');
}

/** Alles wat de pagina nodig heeft, in een keer. */
export async function stand(env) {
  const [syndicoaches, toew, extra, overname] = await Promise.all([
    listSyndicoaches(env),
    db(env).from('regio_postcodes').select('postcode, syndicoach_id'),
    db(env).from('regio_extra_postcodes').select('postcode, nis'),
    getMeta(env, 'overname'),
  ]);
  const toewijzingen = {};
  (check(toew, 'Toewijzingen lezen') || []).forEach((r) => { toewijzingen[r.postcode] = r.syndicoach_id; });
  const extraPostcodes = {};
  (check(extra, 'Extra postcodes lezen') || []).forEach((r) => {
    (extraPostcodes[r.nis] = extraPostcodes[r.nis] || []).push(r.postcode);
  });
  return { syndicoaches, toewijzingen, extra_postcodes: extraPostcodes, overname };
}

export async function getMeta(env, sleutel) {
  const r = check(await db(env).from('regio_meta').select('waarde').eq('sleutel', sleutel).maybeSingle(), 'Meta lezen');
  return r ? r.waarde : null;
}

export async function zetMeta(env, sleutel, waarde) {
  check(await db(env).from('regio_meta').upsert({ sleutel, waarde }), 'Meta bewaren');
}

export async function listWijzigingen(env, limiet = 100) {
  return check(await db(env).from('regio_wijzigingen')
    .select('soort, tekst, aantal, user_naam, created_at')
    .order('created_at', { ascending: false }).limit(limiet), 'Logboek lezen') || [];
}

/** De syndicoach van een postcode, of null. */
export async function syndicoachVoorPostcode(env, raw) {
  const pc = normaliseerPostcode(raw);
  if (!pc) return null;
  const r = check(await db(env).from('regio_postcodes').select('syndicoach_id').eq('postcode', pc).maybeSingle(), 'Postcode lezen');
  if (!r) return null;
  const s = await getSyndicoach(env, r.syndicoach_id);
  return s ? { postcode: pc, id: s.id, naam: s.naam, kleur: s.kleur } : null;
}

// ── Logboek ───────────────────────────────────────────────────────────────

export async function log(env, user, soort, tekst, aantal = 0) {
  try {
    await db(env).from('regio_wijzigingen').insert({
      soort, tekst: String(tekst).slice(0, 500), aantal,
      user_id: user?.id || null, user_naam: user ? naamVanGebruiker(user) : 'systeem',
    });
  } catch (err) {
    // Het logboek mag een wijziging nooit tegenhouden.
    console.error(LOG_PREFIX, 'logboek', err);
  }
}

// ── Syndicoaches ──────────────────────────────────────────────────────────

function schoonNaam(v) {
  const n = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAAM);
  if (!n) throw new RegioError('Geef een naam op.');
  return n;
}

function schoonKleur(v, terugval) {
  const k = String(v ?? '').trim();
  return KLEUR_RE.test(k) ? k.toLowerCase() : terugval;
}

export function volgendeKleur(bestaande) {
  const gebruikt = new Set(bestaande.map((s) => String(s.kleur).toLowerCase()));
  return PALET.find((k) => !gebruikt.has(k)) || PALET[bestaande.length % PALET.length];
}

async function eisUniekeNaam(env, naam, behalveId = null) {
  const alle = await listSyndicoaches(env);
  const dubbel = alle.find((s) => s.id !== behalveId && s.naam.toLowerCase() === naam.toLowerCase());
  if (dubbel) throw new RegioError(`Er bestaat al een syndicoach "${dubbel.naam}".`, 409);
  return alle;
}

export async function insertSyndicoach(env, waarden, user) {
  const naam = schoonNaam(waarden.naam);
  const alle = await eisUniekeNaam(env, naam);
  const rij = {
    naam,
    kleur: schoonKleur(waarden.kleur, volgendeKleur(alle)),
    position: alle.length ? Math.max(...alle.map((s) => s.position || 0)) + 1 : 0,
    created_by: user?.id || null,
  };
  const [nieuw] = check(await db(env).from('regio_syndicoaches').insert(rij).select('*'), 'Syndicoach bewaren');
  await log(env, user, 'syndicoach', `Syndicoach "${naam}" toegevoegd`);
  return nieuw;
}

export async function updateSyndicoach(env, id, waarden, user) {
  const huidig = await getSyndicoach(env, id);
  if (!huidig) throw new RegioError('Syndicoach niet gevonden.', 404);
  const upd = {};
  const wat = [];
  if (waarden.naam !== undefined) {
    const naam = schoonNaam(waarden.naam);
    if (naam !== huidig.naam) {
      await eisUniekeNaam(env, naam, id);
      upd.naam = naam;
      wat.push(`hernoemd naar "${naam}"`);
    }
  }
  if (waarden.kleur !== undefined) {
    const kleur = schoonKleur(waarden.kleur, null);
    if (!kleur) throw new RegioError('Ongeldige kleur.');
    if (kleur !== huidig.kleur) { upd.kleur = kleur; wat.push('andere kleur'); }
  }
  if (!wat.length) return huidig;
  check(await db(env).from('regio_syndicoaches').update(upd).eq('id', id), 'Syndicoach bewaren');
  await log(env, user, 'syndicoach', `Syndicoach "${huidig.naam}": ${wat.join(', ')}`);
  return { ...huidig, ...upd };
}

export async function deleteSyndicoach(env, id, user) {
  const huidig = await getSyndicoach(env, id);
  if (!huidig) throw new RegioError('Syndicoach niet gevonden.', 404);
  const { count } = await db(env).from('regio_postcodes').select('postcode', { count: 'exact', head: true }).eq('syndicoach_id', id);
  // Eerst de postcodes vrijgeven (ook zonder ON DELETE CASCADE correct).
  check(await db(env).from('regio_postcodes').delete().eq('syndicoach_id', id), 'Postcodes vrijgeven');
  check(await db(env).from('regio_syndicoaches').delete().eq('id', id), 'Syndicoach verwijderen');
  await log(env, user, 'syndicoach', `Syndicoach "${huidig.naam}" verwijderd, ${count || 0} postcode(s) terug vrij`, count || 0);
}

export async function orderSyndicoaches(env, ids) {
  const lijst = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
  for (let i = 0; i < lijst.length; i++) {
    check(await db(env).from('regio_syndicoaches').update({ position: i }).eq('id', lijst[i]), 'Volgorde bewaren');
  }
}

// ── Toewijzen ─────────────────────────────────────────────────────────────

/**
 * Geeft `postcodes` aan `syndicoachId`, of geeft ze vrij (`null`).
 * `label` (bv. de gemeente) komt enkel in het logboek.
 */
export async function toewijzen(env, postcodes, syndicoachId, user, label = '') {
  const pcs = [...new Set((Array.isArray(postcodes) ? postcodes : []).map(normaliseerPostcode))];
  if (!pcs.length || pcs.includes(null)) throw new RegioError('Geef geldige postcodes op (vier cijfers).');
  if (pcs.length > 2000) throw new RegioError('Te veel postcodes in een keer.');
  const plek = String(label || '').slice(0, 120) || pcs.join(', ');
  if (!syndicoachId) {
    check(await db(env).from('regio_postcodes').delete().in('postcode', pcs), 'Postcodes vrijgeven');
    await log(env, user, 'vrijgegeven', `${plek} vrijgegeven`, pcs.length);
    return;
  }
  const s = await getSyndicoach(env, syndicoachId);
  if (!s) throw new RegioError('Syndicoach niet gevonden (misschien net verwijderd). Herlaad de pagina.', 404);
  check(await db(env).from('regio_postcodes').upsert(
    pcs.map((postcode) => ({ postcode, syndicoach_id: s.id, updated_by: user?.id || null })),
  ), 'Toewijzing bewaren');
  await log(env, user, 'toegewezen', `${plek} naar ${s.naam}`, pcs.length);
}

export async function voegExtraPostcodeToe(env, raw, nis, user) {
  const pc = normaliseerPostcode(raw);
  if (!pc) throw new RegioError('Geef een geldige postcode van vier cijfers op (bv. 2000).');
  const n = String(nis || '').trim();
  if (!/^[0-9]{5}$/.test(n)) throw new RegioError('Ongeldige gemeente.');
  const bestaand = check(await db(env).from('regio_extra_postcodes').select('nis').eq('postcode', pc).maybeSingle(), 'Postcode lezen');
  if (bestaand && bestaand.nis !== n) throw new RegioError(`Postcode ${pc} is al aan een andere gemeente gekoppeld.`, 409);
  if (!bestaand) {
    check(await db(env).from('regio_extra_postcodes').insert({ postcode: pc, nis: n, created_by: user?.id || null }), 'Postcode bewaren');
    await log(env, user, 'syndicoach', `Postcode ${pc} met de hand toegevoegd aan gemeente ${n}`, 1);
  }
  return pc;
}

// ── Alles vervangen (import / overname) ───────────────────────────────────

/** Maakt syndicoaches aan die nog niet bestaan; geeft naam(lowercase) -> id. */
export async function zorgVoorSyndicoaches(env, namen, user) {
  const alle = await listSyndicoaches(env);
  const map = new Map(alle.map((s) => [s.naam.toLowerCase(), s.id]));
  let pos = alle.length ? Math.max(...alle.map((s) => s.position || 0)) + 1 : 0;
  const nieuw = [];
  for (const ruw of namen) {
    const naam = schoonNaam(ruw);
    if (map.has(naam.toLowerCase())) continue;
    const rij = { id: crypto.randomUUID(), naam, kleur: volgendeKleur([...alle, ...nieuw]), position: pos++, created_by: user?.id || null };
    nieuw.push(rij);
    map.set(naam.toLowerCase(), rij.id);
  }
  if (nieuw.length) check(await db(env).from('regio_syndicoaches').insert(nieuw), 'Syndicoaches bewaren');
  return { map, nieuw };
}

export async function wisAlles(env) {
  check(await db(env).from('regio_postcodes').delete().neq('postcode', ''), 'Toewijzingen wissen');
  check(await db(env).from('regio_extra_postcodes').delete().neq('postcode', ''), 'Extra postcodes wissen');
  check(await db(env).from('regio_syndicoaches').delete().neq('id', ''), 'Syndicoaches wissen');
}

export async function schrijfRijen(env, tabel, rijen) {
  if (rijen.length) check(await db(env).from(tabel).upsert(rijen), `${tabel} bewaren`);
}

export async function verwijderPostcodes(env, pcs) {
  if (pcs.length) check(await db(env).from('regio_postcodes').delete().in('postcode', pcs), 'Postcodes vrijgeven');
}
