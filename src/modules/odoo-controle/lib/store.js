/**
 * Odoo-controle -- opslag in Supabase. De enige plek die de controle_*-tabellen
 * aanspreekt.
 *
 * Afspraken:
 * - Elke schrijfactie verhoogt `versie` en zet `rij_bijgewerkt`. Het scherm
 *   stuurt de versie mee die het kent (`expected`); klopt die niet meer, dan
 *   is iemand anders je voor geweest en komt er een 409 met de huidige rij.
 * - `bijgewerkt` is de laatste inhoudelijke wijziging door het team (wat het
 *   scherm toont als "Laatst bijgewerkt door ..."); `tekst_bijgewerkt` enkel
 *   als een van de vier teksten veranderde; `geverifieerd` wanneer Claude's
 *   voorstel beslist is of iemand "Mijn versie houden" koos.
 *   Een patroon is "gewijzigd, nog niet geverifieerd" zolang
 *   bijgewerkt > geverifieerd.
 * - Elke veldwijziging komt in controle_history, met wie en waarvandaan
 *   ('gebruiker', 'claude-voorstel-overgenomen', 'import').
 */

import { getSupabaseClient } from '../../../lib/database.js';
import {
  TABLES, PRIO, DOMEIN, SOORT, ZEKER, REF_MODELS, CASE_TEKSTEN, CASE_VINKJES, PATROON_TEKSTEN,
} from './constants.js';

export class ControleError extends Error {
  constructor(message, status = 400, extra = null) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const db = (env) => getSupabaseClient(env);
const nu = () => new Date().toISOString();

function check(error, wat) {
  if (error) throw new Error(`${wat}: ${error.message}`);
}

/** Een e-mailadres is nooit een naam (zie src/lib/medewerkers.js). */
export function naamVan(user) {
  if (!user) return null;
  const n = String(user.full_name || user.username || '').trim();
  if (n) return n;
  const local = String(user.email || '').split('@')[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : null;
}

const TEKST_VELDEN = CASE_TEKSTEN.map((f) => f[0]);
const PATROON_VELDEN = PATROON_TEKSTEN.map((f) => f[0]);
const inLijst = (lijst, v) => lijst.some((x) => x[0] === v);
const isDatum = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// ─── Lezen ──────────────────────────────────────────────────────────────────

async function linksVoor(env, caseIds = null) {
  let q = db(env).from(TABLES.links).select('case_id, pattern_id, pos').order('pos');
  if (caseIds) q = q.in('case_id', caseIds);
  const { data, error } = await q;
  check(error, 'Koppelingen lezen');
  const per = new Map();
  for (const l of data || []) {
    if (!per.has(l.case_id)) per.set(l.case_id, []);
    per.get(l.case_id).push(l.pattern_id);
  }
  return per;
}

function metPatronen(rij, per) {
  return { ...rij, patterns: per.get(rij.id) || [] };
}

export async function alles(env) {
  const [cases, patterns, meta, per] = await Promise.all([
    db(env).from(TABLES.cases).select('*').order('prio_rang').order('nr'),
    db(env).from(TABLES.patterns).select('*').order('nr').order('titel'),
    db(env).from(TABLES.meta).select('*'),
    linksVoor(env),
  ]);
  check(cases.error, 'Cases lezen');
  check(patterns.error, 'Patronen lezen');
  check(meta.error, 'Meta lezen');
  const metaObj = {};
  for (const m of meta.data || []) metaObj[m.key] = m.value;
  return {
    cases: (cases.data || []).map((c) => metPatronen(c, per)),
    patterns: patterns.data || [],
    meta: metaObj,
  };
}

export async function caseOp(env, id) {
  const { data, error } = await db(env).from(TABLES.cases).select('*').eq('id', id).maybeSingle();
  check(error, 'Case lezen');
  if (!data) return null;
  return metPatronen(data, await linksVoor(env, [id]));
}

export async function patroonOp(env, id) {
  const { data, error } = await db(env).from(TABLES.patterns).select('*').eq('id', id).maybeSingle();
  check(error, 'Patroon lezen');
  return data || null;
}

export async function allePatronen(env) {
  const { data, error } = await db(env).from(TABLES.patterns).select('*').order('nr').order('titel');
  check(error, 'Patronen lezen');
  return data || [];
}

export async function casesVanPatroon(env, patternId) {
  const { data: links, error } = await db(env).from(TABLES.links).select('case_id').eq('pattern_id', patternId);
  check(error, 'Koppelingen lezen');
  const ids = (links || []).map((l) => l.case_id);
  if (!ids.length) return [];
  const { data, error: e2 } = await db(env).from(TABLES.cases).select('*').in('id', ids).order('nr');
  check(e2, 'Cases lezen');
  const per = await linksVoor(env, ids);
  return (data || []).map((c) => metPatronen(c, per));
}

/** Wat er veranderde sinds een tijdstip (voor het scherm dat elke halve minuut kijkt). */
export async function sinds(env, iso) {
  const [cases, patterns, ids] = await Promise.all([
    db(env).from(TABLES.cases).select('*').gt('rij_bijgewerkt', iso),
    db(env).from(TABLES.patterns).select('*').gt('rij_bijgewerkt', iso),
    db(env).from(TABLES.patterns).select('id'),
  ]);
  check(cases.error, 'Cases lezen');
  check(patterns.error, 'Patronen lezen');
  check(ids.error, 'Patronen lezen');
  const per = cases.data && cases.data.length ? await linksVoor(env, cases.data.map((c) => c.id)) : new Map();
  return {
    cases: (cases.data || []).map((c) => metPatronen(c, per)),
    patterns: patterns.data || [],
    pattern_ids: (ids.data || []).map((p) => p.id),
  };
}

export async function historiek(env, entity, id) {
  const { data, error } = await db(env).from(TABLES.history).select('*')
    .eq('entity', entity).eq('entity_id', id).order('tijd', { ascending: false }).limit(200);
  check(error, 'Historiek lezen');
  return data || [];
}

async function logHistoriek(env, rijen) {
  if (!rijen.length) return;
  const { error } = await db(env).from(TABLES.history).insert(rijen);
  check(error, 'Historiek schrijven');
}

const alsTekst = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 'ja' : 'nee';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
};

// ─── Cases ──────────────────────────────────────────────────────────────────

/**
 * Een case bijwerken. `patch` mag bevatten: de vinkjes, de vier teksten,
 * `soort`, `patterns` (volledige lijst patroon-id's) en `geverifieerd: true`.
 */
export async function wijzigCase(env, user, id, { patch = {}, expected = null, bron = 'gebruiker' } = {}) {
  const huidig = await caseOp(env, id);
  if (!huidig) throw new ControleError('Deze case bestaat niet (meer).', 404);
  if (expected !== null && expected !== undefined && Number(expected) !== Number(huidig.versie)) {
    throw new ControleError('Deze case werd intussen door iemand anders gewijzigd.', 409, { current: huidig });
  }

  const tijd = nu();
  const update = {};
  const wijzigingen = [];
  const noteer = (veld, oud, nieuw) => wijzigingen.push({ entity: 'case', entity_id: id, veld, oud: alsTekst(oud), nieuw: alsTekst(nieuw) });

  for (const veld of CASE_VINKJES) {
    if (veld in patch) {
      const v = !!patch[veld];
      if (v !== !!huidig[veld]) { update[veld] = v; noteer(veld, !!huidig[veld], v); }
    }
  }
  let tekstGewijzigd = false;
  for (const veld of TEKST_VELDEN) {
    if (veld in patch) {
      const v = String(patch[veld] ?? '');
      if (v !== (huidig[veld] || '')) { update[veld] = v; tekstGewijzigd = true; noteer(veld, huidig[veld], v); }
    }
  }
  if ('soort' in patch) {
    if (!inLijst(SOORT, patch.soort)) throw new ControleError('Onbekende soort fout.');
    if (patch.soort !== huidig.soort) { update.soort = patch.soort; noteer('soort', huidig.soort, patch.soort); }
  }

  let nieuwePatronen = null;
  if ('patterns' in patch) {
    if (!Array.isArray(patch.patterns)) throw new ControleError('patterns moet een lijst zijn.');
    const uniek = patch.patterns.map(String).filter((x, i, a) => x && a.indexOf(x) === i);
    if (uniek.length) {
      const { data, error } = await db(env).from(TABLES.patterns).select('id').in('id', uniek);
      check(error, 'Patronen lezen');
      const bestaand = new Set((data || []).map((p) => p.id));
      const onbekend = uniek.filter((p) => !bestaand.has(p));
      if (onbekend.length) throw new ControleError(`Onbekend patroon: ${onbekend.join(', ')}.`);
    }
    if (uniek.join('|') !== (huidig.patterns || []).join('|')) { nieuwePatronen = uniek; noteer('patronen', huidig.patterns, uniek); }
  }

  const verifieer = patch.geverifieerd === true;
  if (!wijzigingen.length && !verifieer) return huidig;

  if (wijzigingen.length) {
    update.bijgewerkt = tijd;
    update.door_user_id = user?.id || null;
    update.door_naam = naamVan(user);
    if (tekstGewijzigd && !verifieer) update.tekst_bijgewerkt = tijd;
  }
  if (verifieer) { update.geverifieerd = tijd; noteer('geverifieerd', huidig.geverifieerd, tijd); }
  update.versie = (huidig.versie || 0) + 1;
  update.rij_bijgewerkt = tijd;

  const { data, error } = await db(env).from(TABLES.cases).update(update).eq('id', id).eq('versie', huidig.versie).select('*');
  check(error, 'Case bijwerken');
  if (!data || !data.length) {
    const vers = await caseOp(env, id);
    throw new ControleError('Deze case werd intussen door iemand anders gewijzigd.', 409, { current: vers });
  }

  if (nieuwePatronen) {
    const { error: e1 } = await db(env).from(TABLES.links).delete().eq('case_id', id);
    check(e1, 'Koppelingen wissen');
    if (nieuwePatronen.length) {
      const { error: e2 } = await db(env).from(TABLES.links).insert(nieuwePatronen.map((pid, pos) => ({ case_id: id, pattern_id: pid, pos })));
      check(e2, 'Koppelingen schrijven');
    }
  }

  await logHistoriek(env, wijzigingen.map((w) => ({ ...w, door_user_id: user?.id || null, door_naam: naamVan(user), bron, tijd })));
  return { ...data[0], patterns: nieuwePatronen || huidig.patterns };
}

/** Een case met de hand toevoegen (de controle-run uit de oude pagina bestaat in de OM nog niet). */
export async function maakCase(env, user, invoer = {}) {
  const klant = String(invoer.klant || '').trim();
  if (!klant) throw new ControleError('Geef de klant op.');
  const prio = PRIO.find((p) => p.id === invoer.prio);
  if (!prio) throw new ControleError('Kies een prioriteit.');
  if (!inLijst(DOMEIN, invoer.domein)) throw new ControleError('Kies een domein.');
  const zekerheid = inLijst(ZEKER, invoer.zekerheid) ? invoer.zekerheid : 'na te kijken';
  const soort = inLijst(SOORT, invoer.soort) ? invoer.soort : 'onbekend';
  const refs = (Array.isArray(invoer.refs) ? invoer.refs : [])
    .map((r) => ({ id: Number(r && r.id), label: String((r && r.label) || '').trim(), model: String((r && r.model) || '') }))
    .filter((r) => Number.isInteger(r.id) && r.id > 0 && r.label && REF_MODELS.includes(r.model));
  for (const d of ['deadline', 'vervaldag']) {
    if (invoer[d] && !isDatum(invoer[d])) throw new ControleError(`${d} moet een datum zijn (JJJJ-MM-DD).`);
  }

  const { data: top, error } = await db(env).from(TABLES.cases).select('nr').order('nr', { ascending: false }).limit(1);
  check(error, 'Cases lezen');
  let nr = ((top && top[0] && top[0].nr) || 0) + 1;
  let id = `c${String(nr).padStart(3, '0')}`;
  // Een id dat toch al bestaat (bv. uit een import met gaten): doorschuiven.
  for (let i = 0; i < 50 && await caseOp(env, id); i++) { nr += 1; id = `c${String(nr).padStart(3, '0')}`; }

  const tijd = nu();
  const rij = {
    id, nr, klant,
    klanttype: String(invoer.klanttype || '').trim() || null,
    titel: String(invoer.titel || '').trim() || null,
    bedrag: String(invoer.bedrag || '').trim() || null,
    categorie: String(invoer.categorie || '').trim() || null,
    domein: invoer.domein, prio: prio.id, prio_rang: prio.rang, zekerheid, soort,
    deadline: invoer.deadline || null, vervaldag: invoer.vervaldag || null,
    bevinding: String(invoer.bevinding || '').trim() || null,
    voorstel: String(invoer.voorstel || '').trim() || null,
    refs,
    aangemaakt: tijd, rij_bijgewerkt: tijd, versie: 0,
    door_user_id: user?.id || null, door_naam: naamVan(user),
  };
  const { data, error: e2 } = await db(env).from(TABLES.cases).insert(rij).select('*').single();
  check(e2, 'Case aanmaken');
  await logHistoriek(env, [{ entity: 'case', entity_id: id, veld: 'aangemaakt', oud: null, nieuw: `${klant}: ${rij.titel || ''}`, door_user_id: user?.id || null, door_naam: naamVan(user), bron: 'gebruiker', tijd }]);
  return { ...data, patterns: [] };
}

// ─── Patronen ───────────────────────────────────────────────────────────────

export function slugVoor(titel) {
  return String(titel || 'patroon').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'patroon';
}

export async function wijzigPatroon(env, user, id, { patch = {}, expected = null, bron = 'gebruiker' } = {}) {
  const huidig = await patroonOp(env, id);
  if (!huidig) throw new ControleError('Dit patroon bestaat niet (meer).', 404);
  if (expected !== null && expected !== undefined && Number(expected) !== Number(huidig.versie)) {
    throw new ControleError('Dit patroon werd intussen door iemand anders gewijzigd.', 409, { current: huidig });
  }
  const tijd = nu();
  const update = {};
  const wijzigingen = [];
  const noteer = (veld, oud, nieuw) => wijzigingen.push({ entity: 'pattern', entity_id: id, veld, oud: alsTekst(oud), nieuw: alsTekst(nieuw) });

  if ('titel' in patch) {
    const t = String(patch.titel || '').trim();
    if (!t) throw new ControleError('Een patroon heeft een titel nodig.');
    if (t !== huidig.titel) { update.titel = t; noteer('titel', huidig.titel, t); }
  }
  for (const veld of PATROON_VELDEN) {
    if (veld in patch) {
      const v = String(patch[veld] ?? '');
      if (v !== (huidig[veld] || '')) { update[veld] = v; noteer(veld, huidig[veld], v); }
    }
  }
  const verifieer = patch.geverifieerd === true;
  if (!wijzigingen.length && !verifieer) return huidig;

  if (wijzigingen.length) {
    update.bijgewerkt = tijd;
    update.door_user_id = user?.id || null;
    update.door_naam = naamVan(user);
  }
  if (verifieer) { update.geverifieerd = tijd; noteer('geverifieerd', huidig.geverifieerd, tijd); }
  update.versie = (huidig.versie || 0) + 1;
  update.rij_bijgewerkt = tijd;

  const { data, error } = await db(env).from(TABLES.patterns).update(update).eq('id', id).eq('versie', huidig.versie).select('*');
  check(error, 'Patroon bijwerken');
  if (!data || !data.length) {
    throw new ControleError('Dit patroon werd intussen door iemand anders gewijzigd.', 409, { current: await patroonOp(env, id) });
  }
  await logHistoriek(env, wijzigingen.map((w) => ({ ...w, door_user_id: user?.id || null, door_naam: naamVan(user), bron, tijd })));
  return data[0];
}

export async function maakPatroon(env, user, invoer = {}) {
  const titel = String(invoer.titel || '').trim();
  if (!titel) throw new ControleError('Geef het patroon een titel.');
  const bestaande = await allePatronen(env);
  const ids = new Set(bestaande.map((p) => p.id));
  const basis = slugVoor(titel);
  let id = basis;
  for (let i = 2; ids.has(id); i++) id = `${basis}-${i}`;
  const nr = bestaande.reduce((m, p) => (p.nr && p.nr < 99 ? Math.max(m, p.nr) : m), 0) + 1;
  const tijd = nu();
  const rij = {
    id, nr, titel,
    uitleg: String(invoer.uitleg || '').trim(),
    regel: String(invoer.regel || '').trim(),
    controle: String(invoer.controle || '').trim(),
    bron_case: invoer.bron_case ? String(invoer.bron_case) : null,
    aangemaakt: tijd, bijgewerkt: tijd, rij_bijgewerkt: tijd, versie: 0,
    door_user_id: user?.id || null, door_naam: naamVan(user),
  };
  const { data, error } = await db(env).from(TABLES.patterns).insert(rij).select('*').single();
  check(error, 'Patroon aanmaken');
  await logHistoriek(env, [{ entity: 'pattern', entity_id: id, veld: 'aangemaakt', oud: null, nieuw: titel, door_user_id: user?.id || null, door_naam: naamVan(user), bron: invoer.bron || 'gebruiker', tijd }]);
  return data;
}

export async function verwijderPatroon(env, user, id) {
  const p = await patroonOp(env, id);
  if (!p) throw new ControleError('Dit patroon bestaat niet (meer).', 404);
  const { count, error } = await db(env).from(TABLES.links).select('case_id', { count: 'exact', head: true }).eq('pattern_id', id);
  check(error, 'Koppelingen tellen');
  if (count) throw new ControleError(`Dit patroon hangt nog aan ${count} case(s). Haal het daar eerst weg.`, 409);
  const { error: e2 } = await db(env).from(TABLES.patterns).delete().eq('id', id);
  check(e2, 'Patroon verwijderen');
  await logHistoriek(env, [{ entity: 'pattern', entity_id: id, veld: 'verwijderd', oud: p.titel, nieuw: null, door_user_id: user?.id || null, door_naam: naamVan(user), bron: 'gebruiker', tijd: nu() }]);
}

// ─── Import uit de claude.ai-export ─────────────────────────────────────────

const BATCH = 50;

/** Zet de rijen uit lib/import.js in de database: bestaande rijen worden overschreven (de export is het recentste werk van het team). */
export async function importeer(env, user, { patterns, cases, links, meta }) {
  const d = db(env);
  for (let i = 0; i < patterns.length; i += BATCH) {
    const { error } = await d.from(TABLES.patterns).upsert(patterns.slice(i, i + BATCH), { onConflict: 'id' });
    check(error, 'Patronen importeren');
  }
  for (let i = 0; i < cases.length; i += BATCH) {
    const { error } = await d.from(TABLES.cases).upsert(cases.slice(i, i + BATCH), { onConflict: 'id' });
    check(error, 'Cases importeren');
  }
  const caseIds = cases.map((c) => c.id);
  for (let i = 0; i < caseIds.length; i += BATCH) {
    const { error } = await d.from(TABLES.links).delete().in('case_id', caseIds.slice(i, i + BATCH));
    check(error, 'Koppelingen wissen');
  }
  for (let i = 0; i < links.length; i += BATCH) {
    const { error } = await d.from(TABLES.links).insert(links.slice(i, i + BATCH));
    check(error, 'Koppelingen importeren');
  }
  if (meta.length) {
    const { error } = await d.from(TABLES.meta).upsert(meta, { onConflict: 'key' });
    check(error, 'Meta importeren');
  }
  await logHistoriek(env, [{
    entity: 'import', entity_id: '-', veld: '-', oud: null,
    nieuw: `${cases.length} cases, ${patterns.length} patronen, ${links.length} koppelingen uit de claude.ai-export`,
    door_user_id: user?.id || null, door_naam: naamVan(user), bron: 'import', tijd: nu(),
  }]);
}
