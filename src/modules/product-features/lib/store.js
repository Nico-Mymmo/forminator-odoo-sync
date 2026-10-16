/**
 * Productfeatures -- opslag (tabel product_features) en het normaliseren van
 * wat het scherm stuurt. Puur: geen HTML, geen Odoo.
 *
 * De boom zit in parent_id; `boom()` zet de platte lijst om in geneste
 * knopen (kinderen op volgorde van position, dan naam).
 */

import { getSupabaseClient } from '../../../lib/database.js';
import {
  TABLE, CATEGORIE_KEYS, VOORDEEL_KEYS, DOELGROEP_KEYS, PAKKET_KEYS, MERKEN, MAX_USPS,
} from './constants.js';
import { boom, platteBoom } from './boom.js';

export class FeatureError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const db = (env) => getSupabaseClient(env);
const nu = () => new Date().toISOString();

function check(error, wat) {
  if (error) throw new FeatureError(`${wat}: ${error.message}`, 500);
}

const kort = (v, max) => String(v ?? '').trim().slice(0, max);
const url = (v) => {
  const s = String(v || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s.slice(0, 1000) : '';
};

export function slug(tekst) {
  return String(tekst || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'feature';
}

const uitLijst = (waarden, toegelaten) => (Array.isArray(waarden) ? waarden : [])
  .map((v) => String(v || '').trim()).filter((v, i, a) => v && toegelaten.has(v) && a.indexOf(v) === i);

/**
 * Wat het scherm mag bewaren. Onbekende velden vallen weg; lijsten worden
 * gefilterd op de vaste sleutels. `parent_id` wordt apart gecontroleerd
 * (bestaat, geen lus) in `controleerOuder`.
 */
export function normaliseer(body = {}, { nieuw = false } = {}) {
  const uit = {};
  const tekst = (k, max) => { if (body[k] !== undefined) uit[k] = kort(body[k], max); };
  tekst('name', 120);
  tekst('eyebrow', 60);
  tekst('summary', 600);
  tekst('why', 800);
  if (body.image_url !== undefined) uit.image_url = url(body.image_url);
  if (body.url !== undefined) uit.url = url(body.url);
  if (body.usps !== undefined) {
    uit.usps = (Array.isArray(body.usps) ? body.usps : String(body.usps || '').split('\n'))
      .map((u) => kort(u, 200)).filter(Boolean).slice(0, MAX_USPS);
  }
  if (body.category !== undefined) {
    const c = String(body.category || '').trim();
    if (c && !CATEGORIE_KEYS.has(c)) throw new FeatureError('Onbekende categorie.');
    uit.category = c || null;
  }
  if (body.benefits !== undefined) uit.benefits = uitLijst(body.benefits, VOORDEEL_KEYS);
  if (body.audiences !== undefined) uit.audiences = uitLijst(body.audiences, DOELGROEP_KEYS);
  if (body.plan !== undefined) {
    const p = String(body.plan || '').trim();
    if (!PAKKET_KEYS.has(p)) throw new FeatureError('Onbekend pakket.');
    uit.plan = p;
  }
  if (body.brand !== undefined) {
    if (!MERKEN.includes(body.brand)) throw new FeatureError('Onbekend merk.');
    uit.brand = body.brand;
  }
  if (body.is_active !== undefined) uit.is_active = Boolean(body.is_active);
  if (body.position !== undefined && Number.isInteger(Number(body.position))) uit.position = Number(body.position);
  if (body.parent_id !== undefined) uit.parent_id = body.parent_id ? String(body.parent_id) : null;
  if (nieuw && !uit.name) throw new FeatureError('Geef de feature een titel.');
  return uit;
}

export async function listFeatures(env, { activeOnly = false, brand = null } = {}) {
  let q = db(env).from(TABLE).select('*').order('position').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  if (brand) q = q.eq('brand', brand);
  const { data, error } = await q;
  check(error, 'Features lezen');
  return data || [];
}

export async function getFeature(env, id) {
  const { data, error } = await db(env).from(TABLE).select('*').eq('id', id).maybeSingle();
  check(error, 'Feature lezen');
  return data || null;
}

/** Een unieke code uit de naam: bij een botsing komt er een cijfer achter. */
async function vrijeCode(env, naam) {
  const basis = slug(naam);
  const { data, error } = await db(env).from(TABLE).select('code').like('code', `${basis}%`);
  check(error, 'Codes lezen');
  const bezet = new Set((data || []).map((r) => r.code));
  if (!bezet.has(basis)) return basis;
  for (let n = 2; n < 100; n += 1) if (!bezet.has(`${basis}-${n}`)) return `${basis}-${n}`;
  throw new FeatureError('Geen vrije code gevonden.');
}

/** De ouder moet bestaan en mag geen (klein)kind van de feature zelf zijn. */
export async function controleerOuder(env, id, parentId) {
  if (!parentId) return null;
  if (id && parentId === id) throw new FeatureError('Een feature kan niet onder zichzelf staan.');
  const alles = await listFeatures(env);
  const perId = new Map(alles.map((f) => [f.id, f]));
  if (!perId.has(parentId)) throw new FeatureError('De bovenliggende feature bestaat niet.', 404);
  if (id) {
    let p = perId.get(parentId);
    while (p) {
      if (p.parent_id === id) throw new FeatureError('Dat zou een lus in de boom maken.');
      p = p.parent_id ? perId.get(p.parent_id) : null;
    }
  }
  return parentId;
}

export async function insertFeature(env, waarden, userId) {
  const code = await vrijeCode(env, waarden.name);
  const { data, error } = await db(env).from(TABLE)
    .insert({ ...waarden, code, updated_by: userId || null }).select('*').single();
  check(error, 'Feature aanmaken');
  return data;
}

export async function updateFeature(env, id, waarden, userId) {
  const { data, error } = await db(env).from(TABLE)
    .update({ ...waarden, updated_by: userId || null, updated_at: nu() }).eq('id', id).select('*').single();
  check(error, 'Feature bewaren');
  return data;
}

export async function deleteFeature(env, id) {
  // Kinderen schuiven een niveau omhoog (ON DELETE SET NULL), dus niets gaat verloren.
  const { error } = await db(env).from(TABLE).delete().eq('id', id);
  check(error, 'Feature weghalen');
}

/** Volgorde van de kinderen van één ouder: posities 10, 20, 30... */
export async function herorden(env, ids) {
  let pos = 10;
  for (const id of ids) {
    const { error } = await db(env).from(TABLE).update({ position: pos, updated_at: nu() }).eq('id', id);
    check(error, 'Volgorde bewaren');
    pos += 10;
  }
}

export { boom, platteBoom } from './boom.js';
