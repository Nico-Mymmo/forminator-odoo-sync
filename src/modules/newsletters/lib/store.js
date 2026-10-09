/**
 * Nieuwsbrieven -- opslag in Supabase. Enige plek die de tabellen aanspreekt.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { TABLES, CONTRIBUTION_STATUS, EDITION_STATUS, KINDS, isKind } from './constants.js';

export class NewsletterError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const db = (env) => getSupabaseClient(env);

function check(error, wat) {
  if (error) throw new Error(`${wat}: ${error.message}`);
}

const nu = () => new Date().toISOString();

// ─── Reeksen ────────────────────────────────────────────────────────────────

export async function listSeries(env, { activeOnly = false } = {}) {
  let q = db(env).from(TABLES.series).select('*').order('name');
  if (activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  check(error, 'Reeksen lezen');
  return data || [];
}

export async function getSeries(env, id) {
  const { data, error } = await db(env).from(TABLES.series).select('*').eq('id', id).maybeSingle();
  check(error, 'Reeks lezen');
  return data || null;
}

const SERIES_FIELDS = [
  'name', 'description', 'audience', 'tone', 'odoo_list_ids', 'from_name', 'from_email', 'reply_to',
  'logo_url', 'tint', 'cadence', 'send_day', 'send_hour', 'deadline_workdays', 'create_days_ahead',
  'chat_channel', 'answers_integration_id', 'editor_user_ids', 'sections', 'is_active',
];

export function normalizeSeriesPayload(body = {}) {
  const uit = {};
  for (const k of SERIES_FIELDS) {
    if (body[k] === undefined) continue;
    uit[k] = body[k];
  }
  if (uit.odoo_list_ids !== undefined) {
    uit.odoo_list_ids = (Array.isArray(uit.odoo_list_ids) ? uit.odoo_list_ids : String(uit.odoo_list_ids).split(','))
      .map((v) => Number(String(v).trim())).filter((n) => Number.isInteger(n) && n > 0);
  }
  for (const k of ['send_day', 'send_hour', 'deadline_workdays', 'create_days_ahead']) {
    if (uit[k] !== undefined) uit[k] = Number(uit[k]);
  }
  if (uit.answers_integration_id === '') uit.answers_integration_id = null;
  if (uit.tint !== undefined && uit.tint && !/^#[0-9a-f]{6}$/i.test(uit.tint)) {
    throw new NewsletterError('De tint moet een kleur zijn zoals #fdf2f8.');
  }
  if (uit.sections !== undefined) uit.sections = normalizeSections(uit.sections);
  return uit;
}

export function normalizeSections(list) {
  if (!Array.isArray(list)) throw new NewsletterError('Rubrieken moeten een lijst zijn.');
  const gezien = new Set();
  return list.map((s, i) => {
    const kind = String(s?.kind || '');
    if (!isKind(kind)) throw new NewsletterError(`Onbekende soort in rubriek ${i + 1}: ${kind}`);
    let key = String(s?.key || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!key) key = `rubriek-${i + 1}`;
    while (gezien.has(key)) key += '-2';
    gezien.add(key);
    return {
      key,
      title: String(s?.title || KINDS[kind].label).trim().slice(0, 120),
      kind,
      owner_user_id: s?.owner_user_id || null,
      hint: String(s?.hint || '').trim().slice(0, 300),
    };
  });
}

export async function updateSeries(env, id, values) {
  const { data, error } = await db(env).from(TABLES.series)
    .update({ ...values, updated_at: nu() }).eq('id', id).select('*').single();
  check(error, 'Reeks bewaren');
  return data;
}

export async function createSeries(env, values) {
  const { data, error } = await db(env).from(TABLES.series).insert(values).select('*').single();
  check(error, 'Reeks aanmaken');
  return data;
}

// ─── Edities ────────────────────────────────────────────────────────────────

export async function listEditions(env, { seriesId = null, statuses = null, limit = 50 } = {}) {
  let q = db(env).from(TABLES.editions).select('*').order('send_at', { ascending: false }).limit(limit);
  if (seriesId) q = q.eq('series_id', seriesId);
  if (statuses) q = q.in('status', statuses);
  const { data, error } = await q;
  check(error, 'Edities lezen');
  return data || [];
}

export async function getEdition(env, id) {
  const { data, error } = await db(env).from(TABLES.editions).select('*').eq('id', id).maybeSingle();
  check(error, 'Editie lezen');
  return data || null;
}

export async function insertEdition(env, values) {
  const { data, error } = await db(env).from(TABLES.editions).insert(values).select('*').single();
  if (error && /duplicate key|uq_newsletter_editions_series_send/i.test(error.message)) return null;
  check(error, 'Editie aanmaken');
  return data;
}

export async function updateEdition(env, id, values) {
  const { data, error } = await db(env).from(TABLES.editions)
    .update({ ...values, updated_at: nu() }).eq('id', id).select('*').single();
  check(error, 'Editie bewaren');
  return data;
}

// ─── Bijdragen ──────────────────────────────────────────────────────────────

export async function listContributions(env, editionId) {
  const { data, error } = await db(env).from(TABLES.contributions).select('*')
    .eq('edition_id', editionId).order('position').order('created_at');
  check(error, 'Stukjes lezen');
  return data || [];
}

export async function listContributionsForEditions(env, editionIds) {
  if (!editionIds.length) return [];
  const { data, error } = await db(env).from(TABLES.contributions)
    .select('id, edition_id, kind, status, owner_user_id, title, section_key, position')
    .in('edition_id', editionIds);
  check(error, 'Stukjes lezen');
  return data || [];
}

export async function listPool(env) {
  const { data, error } = await db(env).from(TABLES.contributions).select('*')
    .is('edition_id', null).order('created_at', { ascending: false }).limit(200);
  check(error, 'Voorraad lezen');
  return data || [];
}

export async function listMine(env, userId) {
  const { data, error } = await db(env).from(TABLES.contributions).select('*')
    .eq('owner_user_id', userId).in('status', [CONTRIBUTION_STATUS.OPEN, CONTRIBUTION_STATUS.DRAFT])
    .not('edition_id', 'is', null).order('created_at', { ascending: false }).limit(50);
  check(error, 'Mijn opdrachten lezen');
  return data || [];
}

export async function getContribution(env, id) {
  const { data, error } = await db(env).from(TABLES.contributions).select('*').eq('id', id).maybeSingle();
  check(error, 'Stukje lezen');
  return data || null;
}

export async function insertContributions(env, rows) {
  if (!rows.length) return [];
  const { data, error } = await db(env).from(TABLES.contributions).insert(rows).select('*');
  check(error, 'Stukjes aanmaken');
  return data || [];
}

export async function updateContribution(env, id, values) {
  const { data, error } = await db(env).from(TABLES.contributions)
    .update({ ...values, updated_at: nu() }).eq('id', id).select('*').single();
  check(error, 'Stukje bewaren');
  return data;
}

export async function deleteContribution(env, id) {
  const { error } = await db(env).from(TABLES.contributions).delete().eq('id', id);
  check(error, 'Stukje verwijderen');
}

// ─── Opmerkingen en activiteit ──────────────────────────────────────────────

export async function listComments(env, contributionId) {
  const { data, error } = await db(env).from(TABLES.comments).select('*')
    .eq('contribution_id', contributionId).order('created_at');
  check(error, 'Opmerkingen lezen');
  return data || [];
}

export async function countComments(env, contributionIds) {
  if (!contributionIds.length) return {};
  const { data, error } = await db(env).from(TABLES.comments).select('contribution_id').in('contribution_id', contributionIds);
  check(error, 'Opmerkingen tellen');
  const uit = {};
  for (const r of data || []) uit[r.contribution_id] = (uit[r.contribution_id] || 0) + 1;
  return uit;
}

export async function addComment(env, contributionId, userId, body) {
  const tekst = String(body || '').trim().slice(0, 2000);
  if (!tekst) throw new NewsletterError('Een opmerking mag niet leeg zijn.');
  const { data, error } = await db(env).from(TABLES.comments)
    .insert({ contribution_id: contributionId, user_id: userId, body: tekst }).select('*').single();
  check(error, 'Opmerking bewaren');
  return data;
}

/** Nooit fataal: een activiteitregel die niet lukt, mag niets tegenhouden. */
export async function logActivity(env, { editionId = null, contributionId = null, userId = null, kind, text = '' }) {
  try {
    await db(env).from(TABLES.activity).insert({
      edition_id: editionId, contribution_id: contributionId, user_id: userId, kind, text: String(text).slice(0, 500),
    });
  } catch (error) {
    console.warn('[newsletters] activiteit niet bewaard:', error?.message);
  }
}

export async function listActivity(env, editionId, limit = 30) {
  const { data, error } = await db(env).from(TABLES.activity).select('*')
    .eq('edition_id', editionId).order('created_at', { ascending: false }).limit(limit);
  check(error, 'Activiteit lezen');
  return data || [];
}

// ─── Gebruikers ─────────────────────────────────────────────────────────────

export async function listUsers(env) {
  const { data, error } = await db(env).from('users')
    .select('id, email, full_name, role, odoo_uid, is_active').eq('is_active', true).order('full_name');
  check(error, 'Gebruikers lezen');
  return data || [];
}

export function isActiveEdition(edition) {
  return edition && ![EDITION_STATUS.SENT, EDITION_STATUS.CANCELLED].includes(edition.status);
}
