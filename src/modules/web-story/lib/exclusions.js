/**
 * Webgedrag — UITGESLOTEN personen en browsers (2026-10-02).
 *
 * Een partner of een vaste klant die de site intensief gebruikt, kleurt elk klein
 * segment: in Gedrag kwamen 7 van de 7 bezoeken van één persoon. Zo iemand zet je
 * op deze lijst; die bezoeken tellen dan nergens meer mee in de CIJFERS (Gedrag,
 * het dashboard Website-bezoeken, de attributie), net als een collega-browser.
 * Het eigen verhaal (Traject, de lead in Odoo) blijft volledig: dat gaat over die persoon.
 * Weer meetellen = de regel weghalen.
 *
 * Twee soorten regels (tabel web_story_exclusions, migratie 20261003110000):
 *   email    een HERLEID adres (visitor_emails.email_norm): elke browser die dat
 *            adres ooit gebruikte, ook een nieuwe na een gewiste cookie.
 *   visitor  één browser (UUID): voor een anonieme bezoeker, of een gedeelde
 *            browser waar je de andere persoon niet mee wil uitsluiten.
 *
 * De lijst staat in Supabase en niet in D1: D1 heeft één schrijver (de tracker),
 * en dit is een keuze van de OM over hoe ze telt, geen gegeven over de bezoeker.
 *
 * Het filter werkt NA de edge-cache (dropExcluded): een wijziging telt meteen, er
 * hoeft geen cache te vervallen. Mislukt het lezen van de lijst (tabel nog niet
 * gemigreerd, Supabase weg), dan tellen de cijfers ZONDER uitsluiting en zegt het
 * antwoord dat erbij -- liever een persoon te veel dan een leeg scherm.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { readWebEvents } from '../../../lib/web-events.js';

const TABLE = 'web_story_exclusions';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KOLOMMEN = 'id, kind, value, label, reason, created_by_email, created_at';

function inList(n) { return Array.from({ length: n }, () => '?').join(','); }

/** Alle regels, nieuwste eerst. Gooit bij een fout (voor het beheerscherm). */
export async function listRules(env) {
  const { data, error } = await getSupabaseClient(env).from(TABLE).select(KOLOMMEN).order('created_at', { ascending: false });
  if (error) throw new Error(`Uitgesloten lijst: ${error.message}`);
  return data || [];
}

/**
 * De regels, uitgerold naar browsers. Gooit NOOIT: zonder lijst tellen de cijfers
 * gewoon alles, en `error` zegt waarom.
 * @returns {{ rules: Array, uuids: Map<string,string>, key: string, error: string|null }}
 *          uuids = bezoeker-UUID -> id van de regel die hem uitsluit
 */
export async function loadExclusions(env) {
  try {
    const rules = await listRules(env);
    const uuids = new Map();
    for (const r of rules) if (r.kind === 'visitor') uuids.set(r.value, r.id);
    const perAdres = rules.filter(r => r.kind === 'email');
    for (let i = 0; i < perAdres.length; i += 90) {
      const part = perAdres.slice(i, i + 90);
      const regelVan = new Map(part.map(r => [r.value, r.id]));
      const res = await readWebEvents(env,
        `SELECT visitor_uuid AS u, email_norm AS n FROM visitor_emails WHERE email_norm IN (${inList(part.length)})`,
        part.map(r => r.value));
      for (const x of res.results || []) if (!uuids.has(x.u)) uuids.set(x.u, regelVan.get(x.n));
    }
    return { rules, uuids, key: rules.map(r => r.id).sort().join(','), error: null };
  } catch (e) {
    console.error('[web-story] uitgesloten lijst niet gelezen:', e.message);
    return { rules: [], uuids: new Map(), key: '', error: e.message };
  }
}

/** De regel die deze browser uitsluit, in de vorm die het scherm toont -- of null. */
export function ruleFor(excl, uuid) {
  const id = excl && excl.uuids.get(uuid);
  if (!id) return null;
  const r = excl.rules.find(x => x.id === id);
  return r ? { id: r.id, kind: r.kind, label: r.label || r.value, reason: r.reason || '' } : null;
}

/**
 * Haalt de sessies van uitgesloten browsers uit een compact antwoord (Gedrag en het
 * dashboard hebben dezelfde vorm: `cols` met 'v' en 'flags', `dict.v` met de UUID's,
 * `flags.previous` voor de vorige periode). `excluded` telt enkel de HUIDIGE periode.
 */
export function dropExcluded(data, excl) {
  if (!data || !data.available) return data;
  const leeg = { sessions: 0, persons: 0, rules: excl ? excl.rules.length : 0, error: excl ? excl.error : null };
  if (!excl || !excl.uuids.size) return { ...data, excluded: leeg };
  const vi = data.cols.indexOf('v');
  const fi = data.cols.indexOf('flags');
  const vorige = data.flags.previous;
  const weg = new Map();   // index in dict.v -> regel-id
  data.dict.v.forEach((u, i) => { const r = excl.uuids.get(u); if (r) weg.set(i, r); });
  if (!weg.size) return { ...data, excluded: leeg };
  let n = 0;
  const regels = new Set();
  const sessions = data.sessions.filter(s => {
    const r = weg.get(s[vi]);
    if (!r) return true;
    if (!(s[fi] & vorige)) { n++; regels.add(r); }
    return false;
  });
  return { ...data, sessions, excluded: { ...leeg, sessions: n, persons: regels.size } };
}

/**
 * Een regel toevoegen. Een adres wordt opgezocht in D1 en als HERLEID adres bewaard
 * (nico+test@x.be en nico@x.be zijn dezelfde persoon); bestaat het daar niet, dan
 * in kleine letters. Bestaat de regel al, dan wordt enkel de reden bijgewerkt.
 */
export async function addRule(env, user, { kind, value, reason }) {
  let v = String(value || '').trim().toLowerCase();
  let label;
  if (kind === 'email') {
    if (!EMAIL.test(v)) throw new Error('Geen geldig e-mailadres.');
    const res = await readWebEvents(env,
      `SELECT email_norm AS n FROM visitor_emails WHERE email = ? OR email_norm = ? LIMIT 1`, [v, v]);
    v = (res.results || [])[0]?.n || v;
    label = v;
  } else if (kind === 'visitor') {
    if (!UUID.test(v)) throw new Error('Geen geldige bezoeker.');
    const res = await readWebEvents(env,
      `SELECT email_norm AS n FROM visitor_emails WHERE visitor_uuid = ? ORDER BY first_seen LIMIT 1`, [v]);
    const adres = (res.results || [])[0]?.n;
    label = `browser ${v.slice(0, 8)}` + (adres ? ` (${adres})` : '');
  } else {
    throw new Error('Onbekende soort regel.');
  }
  const rij = {
    kind, value: v, label, reason: String(reason || '').trim().slice(0, 300),
    created_by: user?.id || null, created_by_email: user?.email || '',
  };
  const { data, error } = await getSupabaseClient(env).from(TABLE)
    .upsert(rij, { onConflict: 'kind,value' }).select(KOLOMMEN).single();
  if (error) throw new Error(`Bewaren mislukt: ${error.message}`);
  return data;
}

export async function removeRule(env, id) {
  if (!UUID.test(String(id || ''))) throw new Error('Onbekende regel.');
  const { error } = await getSupabaseClient(env).from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`Weghalen mislukt: ${error.message}`);
}

/** Per regel: hoeveel browsers ze raakt en wanneer daar het laatst iemand op de site was. */
export async function describeRules(env, rules) {
  const adressen = rules.filter(r => r.kind === 'email').map(r => r.value);
  const browsers = rules.filter(r => r.kind === 'visitor').map(r => r.value);
  const perAdres = new Map();
  const perBrowser = new Map();
  for (let i = 0; i < adressen.length; i += 90) {
    const part = adressen.slice(i, i + 90);
    const res = await readWebEvents(env,
      `SELECT ve.email_norm AS n, COUNT(DISTINCT ve.visitor_uuid) AS b, MAX(v.last_seen) AS l, MIN(ve.visitor_uuid) AS u
       FROM visitor_emails ve JOIN visitors v ON v.uuid = ve.visitor_uuid
       WHERE ve.email_norm IN (${inList(part.length)}) GROUP BY ve.email_norm`, part);
    for (const x of res.results || []) perAdres.set(x.n, x);
  }
  for (let i = 0; i < browsers.length; i += 90) {
    const part = browsers.slice(i, i + 90);
    const res = await readWebEvents(env,
      `SELECT uuid AS u, last_seen AS l FROM visitors WHERE uuid IN (${inList(part.length)})`, part);
    for (const x of res.results || []) perBrowser.set(x.u, x);
  }
  return rules.map(r => {
    const x = r.kind === 'email' ? perAdres.get(r.value) : perBrowser.get(r.value);
    return {
      ...r,
      browsers: r.kind === 'email' ? (x ? x.b : 0) : (x ? 1 : 0),
      last_seen: x ? x.l : null,
      // Om het traject te openen: bij een adres een van de browsers.
      visitor: r.kind === 'visitor' ? r.value : (x ? x.u : null),
    };
  });
}

/** Een korte sleutel voor de lijst, voor in een cachesleutel (de lijst verandert zelden). */
export function exclusionKey(excl) {
  let h = 5381;
  const s = excl ? excl.key : '';
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return s ? h.toString(36) : '0';
}
