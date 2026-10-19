/**
 * Projecten -- opslag in D1 om-core (getCoreDb) en het nakijken van wat het
 * scherm stuurt. Geen HTML, geen Odoo.
 *
 * Tabellen: pm_projects, pm_sections, pm_tasks, pm_comments, pm_attachments,
 * pm_history (d1/om-core/migrations/0003_projecten.sql).
 *
 * Historiek: elke wijziging aan een taak schrijft een regel in pm_history met
 * de OUDE en de NIEUWE waarde als leesbare tekst (een naam, geen id), zodat de
 * historiek ook klopt als iemand later vertrekt of een sectie hernoemd wordt.
 */

import { getCoreDb } from '../../../lib/core-db.js';
import {
  PROJECT_STATUSSEN, PRIORITEITEN, KLEUREN, ODOO_MODELLEN,
  MAX_TITEL, MAX_BESCHRIJVING, MAX_OPMERKING, MAX_LABELS,
} from './constants.js';

export class PmError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const db = (env) => getCoreDb(env);
const nu = () => new Date().toISOString();

function check(error, wat) {
  if (error) throw new PmError(`${wat}: ${error.message}`, 500);
}

const kort = (v, max) => String(v ?? '').trim().slice(0, max);

/**
 * De beschrijving komt als HTML uit de tekstbewerker. Enkel collega's
 * schrijven ze, maar scripts en event-handlers horen er nooit in: weg ermee.
 */
export function schoonHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*/gi, '$1=$2#')
    .trim();
}
const STATUS_KEYS = new Set(PROJECT_STATUSSEN.map((s) => s.key));
const PRIO_KEYS = new Set(PRIORITEITEN.map((p) => p.key));
const KLEUR_KEYS = new Set(KLEUREN.map((k) => k.key));
const ODOO_KEYS = new Set(ODOO_MODELLEN.map((m) => m.key));

function datum(v) {
  if (v === null || v === '') return null;
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) {
    throw new PmError('Ongeldige datum.');
  }
  return s;
}

const persoon = (v) => (v === null || v === '' ? null : kort(v, 64));
const ids = (v) => (Array.isArray(v) ? v : []).map((x) => kort(x, 64)).filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 50);

// ── Projecten ───────────────────────────────────────────────────────────────

export function normaliseerProject(body = {}, { nieuw = false } = {}) {
  const uit = {};
  if (body.name !== undefined || nieuw) {
    uit.name = kort(body.name, 120);
    if (!uit.name) throw new PmError('Geef het project een naam.');
  }
  if (body.description !== undefined) uit.description = kort(body.description, MAX_BESCHRIJVING);
  if (body.color !== undefined) uit.color = KLEUR_KEYS.has(body.color) ? body.color : 'sky';
  if (body.icon !== undefined) uit.icon = /^[a-z0-9-]{1,40}$/.test(String(body.icon || '')) ? body.icon : 'folder-kanban';
  if (body.owner_id !== undefined) uit.owner_id = persoon(body.owner_id);
  if (body.status !== undefined) {
    if (!STATUS_KEYS.has(body.status)) throw new PmError('Onbekende status.');
    uit.status = body.status;
  }
  if (body.due_date !== undefined) uit.due_date = datum(body.due_date);
  if (body.archived !== undefined) uit.archived = Boolean(body.archived);
  return uit;
}

export async function listProjects(env) {
  const { data, error } = await db(env).from('pm_projects').select('*').order('position').order('name');
  check(error, 'Projecten lezen');
  return data || [];
}

export async function getProject(env, id) {
  const { data, error } = await db(env).from('pm_projects').select('*').eq('id', id).maybeSingle();
  check(error, 'Project lezen');
  return data;
}

export async function insertProject(env, waarden, userId) {
  const lijst = await listProjects(env);
  const rij = {
    ...waarden,
    owner_id: waarden.owner_id === undefined ? userId : waarden.owner_id,
    position: lijst.reduce((m, p) => Math.max(m, p.position || 0), 0) + 10,
    created_by: userId,
  };
  const { data, error } = await db(env).from('pm_projects').insert(rij).select('*').single();
  check(error, 'Project bewaren');
  // Elk nieuw project begint met drie secties: dan staat het bord meteen goed.
  for (const [i, naam] of ['Te doen', 'Bezig'].entries()) {
    await insertSection(env, { project_id: data.id, name: naam, position: (i + 1) * 10 });
  }
  await zorgVoorEindfases(env, data.id);
  await historiek(env, { project_id: data.id, user_id: userId, action: 'project_aangemaakt', new_value: data.name });
  return data;
}

export async function updateProject(env, id, waarden, userId) {
  const oud = await getProject(env, id);
  if (!oud) throw new PmError('Project niet gevonden.', 404);
  const { data, error } = await db(env).from('pm_projects').update(waarden).eq('id', id).select('*').single();
  check(error, 'Project bewaren');
  for (const k of ['name', 'status', 'owner_id', 'due_date', 'archived']) {
    if (waarden[k] !== undefined && String(oud[k] ?? '') !== String(data[k] ?? '')) {
      await historiek(env, { project_id: id, user_id: userId, action: 'project_gewijzigd', field: k, old_value: oud[k] ?? null, new_value: data[k] ?? null });
    }
  }
  return data;
}

export async function deleteProject(env, id) {
  const { error } = await db(env).from('pm_projects').delete().eq('id', id);
  check(error, 'Project verwijderen');
}

export async function orderProjects(env, volgorde) {
  for (const [i, id] of volgorde.entries()) {
    const { error } = await db(env).from('pm_projects').update({ position: (i + 1) * 10 }).eq('id', id);
    check(error, 'Volgorde bewaren');
  }
}

// ── Secties ─────────────────────────────────────────────────────────────────

export async function listSections(env, projectId) {
  let q = db(env).from('pm_sections').select('*');
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q.order('position');
  check(error, 'Secties lezen');
  return data || [];
}

export async function getSection(env, id) {
  const { data, error } = await db(env).from('pm_sections').select('*').eq('id', id).maybeSingle();
  check(error, 'Sectie lezen');
  return data;
}

/**
 * De twee vaste eindfases van elk project. Ze staan altijd achteraan
 * (position 9000+), heten altijd zo, en kunnen niet weg. Een gewone sectie
 * ('open') komt er altijd voor.
 */
export const EINDFASES = [
  { kind: 'opgeleverd', name: 'Opgeleverd', position: 9000 },
  { kind: 'gearchiveerd', name: 'Gearchiveerd', position: 9100 },
];

export async function insertSection(env, { project_id, name, position, kind = 'open' }) {
  const naam = kort(name, 80);
  if (!naam) throw new PmError('Geef de sectie een naam.');
  let pos = position;
  if (pos === undefined) {
    const bestaand = (await listSections(env, project_id)).filter((s) => s.kind === 'open');
    pos = bestaand.reduce((m, s) => Math.max(m, s.position || 0), 0) + 10;
  }
  const { data, error } = await db(env).from('pm_sections').insert({ project_id, name: naam, position: pos, kind }).select('*').single();
  check(error, 'Sectie bewaren');
  return data;
}

/** Zorgt dat een project zijn twee eindfases heeft; geeft alle secties terug. */
export async function zorgVoorEindfases(env, projectId) {
  let secties = await listSections(env, projectId);
  let erbij = false;
  for (const f of EINDFASES) {
    if (secties.some((s) => s.kind === f.kind)) continue;
    await insertSection(env, { project_id: projectId, name: f.name, position: f.position, kind: f.kind });
    erbij = true;
  }
  if (erbij) secties = await listSections(env, projectId);
  return secties;
}

export async function eindfase(env, projectId, kind) {
  const secties = await zorgVoorEindfases(env, projectId);
  return secties.find((s) => s.kind === kind) || null;
}

export async function renameSection(env, id, name) {
  const naam = kort(name, 80);
  if (!naam) throw new PmError('Geef de sectie een naam.');
  const s = await getSection(env, id);
  if (s && s.kind !== 'open') throw new PmError('Opgeleverd en Gearchiveerd heten altijd zo.');
  const { data, error } = await db(env).from('pm_sections').update({ name: naam }).eq('id', id).select('*').single();
  check(error, 'Sectie bewaren');
  return data;
}

/** Een sectie weghalen: haar taken blijven, zonder sectie (ON DELETE SET NULL). */
export async function deleteSection(env, id) {
  const s = await getSection(env, id);
  if (s && s.kind !== 'open') throw new PmError('Opgeleverd en Gearchiveerd kan je niet weghalen: elk project heeft ze.');
  const { error } = await db(env).from('pm_sections').delete().eq('id', id);
  check(error, 'Sectie verwijderen');
}

export async function orderSections(env, volgorde) {
  for (const [i, id] of volgorde.entries()) {
    const s = await getSection(env, id);
    if (!s || s.kind !== 'open') continue;
    const { error } = await db(env).from('pm_sections').update({ position: (i + 1) * 10 }).eq('id', id);
    check(error, 'Volgorde bewaren');
  }
}

// ── Taken ───────────────────────────────────────────────────────────────────

/**
 * Wat het scherm voor een taak mag bewaren. project_id, section_id en
 * parent_id worden in de route nagekeken (bestaan ze, horen ze samen).
 */
export function normaliseerTaak(body = {}, { nieuw = false } = {}) {
  const uit = {};
  if (body.title !== undefined || nieuw) {
    uit.title = kort(body.title, MAX_TITEL);
    if (!uit.title) throw new PmError('Een taak heeft een titel nodig.');
  }
  if (body.description !== undefined) uit.description = schoonHtml(kort(body.description, MAX_BESCHRIJVING));
  if (body.assignee_id !== undefined) uit.assignee_id = persoon(body.assignee_id);
  if (body.due_date !== undefined) uit.due_date = datum(body.due_date);
  if (body.priority !== undefined) {
    if (!PRIO_KEYS.has(body.priority)) throw new PmError('Onbekende prioriteit.');
    uit.priority = body.priority;
  }
  if (body.milestone_id !== undefined) uit.milestone_id = body.milestone_id ? kort(body.milestone_id, 64) : null;
  if (body.labels !== undefined) {
    uit.labels = (Array.isArray(body.labels) ? body.labels : [])
      .map((l) => kort(l, 30)).filter((l, i, a) => l && a.findIndex((x) => x.toLowerCase() === l.toLowerCase()) === i)
      .slice(0, MAX_LABELS);
  }
  if (body.followers !== undefined) uit.followers = ids(body.followers);
  if (body.done !== undefined) uit.done = Boolean(body.done);
  for (const k of ['project_id', 'section_id', 'parent_id']) {
    if (body[k] !== undefined) uit[k] = body[k] ? kort(body[k], 64) : null;
  }
  if (body.odoo_model !== undefined) {
    if (body.odoo_model === null || body.odoo_model === '') {
      uit.odoo_model = null; uit.odoo_id = null; uit.odoo_name = null;
    } else {
      if (!ODOO_KEYS.has(body.odoo_model)) throw new PmError('Dat soort Odoo-record kan je niet koppelen.');
      const oid = Number(body.odoo_id);
      if (!Number.isInteger(oid) || oid <= 0) throw new PmError('Kies een record in Odoo.');
      uit.odoo_model = body.odoo_model;
      uit.odoo_id = oid;
      uit.odoo_name = kort(body.odoo_name, 200) || `#${oid}`;
    }
  }
  return uit;
}

/**
 * Taken lezen. Zonder filter: alles. `projectId: null` = losse to-do's.
 * Subtaken komen mee (met parent_id); het scherm zet ze onder hun taak.
 */
export async function listTasks(env, { projectId, assigneeId, parentId, ids: idLijst } = {}) {
  let q = db(env).from('pm_tasks').select('*');
  if (projectId === null) q = q.is('project_id', null);
  else if (projectId) q = q.eq('project_id', projectId);
  if (assigneeId) q = q.eq('assignee_id', assigneeId);
  if (parentId) q = q.eq('parent_id', parentId);
  if (idLijst) q = q.in('id', idLijst);
  const { data, error } = await q.order('position').order('created_at');
  check(error, 'Taken lezen');
  return data || [];
}

export async function getTask(env, id) {
  const { data, error } = await db(env).from('pm_tasks').select('*').eq('id', id).maybeSingle();
  check(error, 'Taak lezen');
  return data;
}

/** Hoeveel taken (zonder subtaken) open en af zijn, per project. */
export async function tellingen(env) {
  const { data, error } = await db(env).from('pm_tasks').select('project_id, done, due_date, assignee_id').is('parent_id', null);
  check(error, 'Taken tellen');
  const uit = {};
  for (const t of data || []) {
    if (!t.project_id) continue;
    const r = uit[t.project_id] || (uit[t.project_id] = { open: 0, af: 0, te_laat: 0 });
    if (t.done) r.af += 1; else r.open += 1;
  }
  return { perProject: uit, rijen: data || [] };
}

async function volgendePositie(env, { project_id, section_id, parent_id }) {
  let q = db(env).from('pm_tasks').select('position');
  q = parent_id ? q.eq('parent_id', parent_id) : q.is('parent_id', null);
  q = project_id ? q.eq('project_id', project_id) : q.is('project_id', null);
  if (!parent_id) q = section_id ? q.eq('section_id', section_id) : q.is('section_id', null);
  const { data, error } = await q.order('position', { ascending: false }).limit(1);
  check(error, 'Positie bepalen');
  return ((data && data[0] && data[0].position) || 0) + 10;
}

export async function insertTask(env, waarden, userId) {
  const rij = { ...waarden, created_by: userId };
  if (rij.done) rij.done_at = nu();
  // Wie een taak maakt of krijgt, volgt ze vanzelf.
  rij.followers = ids([...(rij.followers || []), userId, rij.assignee_id].filter(Boolean));
  if (rij.position === undefined) rij.position = await volgendePositie(env, rij);
  const { data, error } = await db(env).from('pm_tasks').insert(rij).select('*').single();
  check(error, 'Taak bewaren');
  await historiek(env, { task_id: data.id, project_id: data.project_id, user_id: userId, action: 'aangemaakt', new_value: data.title });
  return data;
}

// Velden die in de historiek komen, met hoe hun waarde leesbaar wordt.
const GEVOLGD = ['title', 'assignee_id', 'due_date', 'priority', 'done', 'section_id', 'project_id', 'milestone_id', 'labels', 'odoo_name', 'description'];

/**
 * Een taak bijwerken. `leesbaar(veld, waarde)` maakt van een id een naam
 * (de route kent de mensen, secties en projecten).
 */
export async function updateTask(env, id, waarden, userId, leesbaar = (_, v) => v) {
  const oud = await getTask(env, id);
  if (!oud) throw new PmError('Taak niet gevonden.', 404);
  const nieuw = { ...waarden };
  if (nieuw.done === true && !oud.done) nieuw.done_at = nu();
  if (nieuw.done === false) nieuw.done_at = null;
  if (nieuw.assignee_id && nieuw.assignee_id !== oud.assignee_id) {
    nieuw.followers = ids([...(nieuw.followers || oud.followers || []), nieuw.assignee_id]);
  }
  // Naar een ander project: de sectie van het oude project geldt niet meer.
  if (nieuw.project_id !== undefined && nieuw.project_id !== oud.project_id && nieuw.section_id === undefined) {
    nieuw.section_id = null;
  }
  const { data, error } = await db(env).from('pm_tasks').update(nieuw).eq('id', id).select('*').single();
  check(error, 'Taak bewaren');
  // Subtaken verhuizen mee naar het nieuwe project.
  if (nieuw.project_id !== undefined && nieuw.project_id !== oud.project_id) {
    const { error: e2 } = await db(env).from('pm_tasks').update({ project_id: nieuw.project_id, section_id: null }).eq('parent_id', id);
    check(e2, 'Subtaken verhuizen');
  }
  for (const k of GEVOLGD) {
    if (nieuw[k] === undefined) continue;
    const a = JSON.stringify(oud[k] ?? null);
    const b = JSON.stringify(data[k] ?? null);
    if (a === b) continue;
    if (k === 'description') {
      await historiek(env, { task_id: id, project_id: data.project_id, user_id: userId, action: 'gewijzigd', field: k });
      continue;
    }
    await historiek(env, {
      task_id: id, project_id: data.project_id, user_id: userId, action: 'gewijzigd', field: k,
      old_value: await leesbaar(k, oud[k]), new_value: await leesbaar(k, data[k]),
    });
  }
  return data;
}

export async function deleteTask(env, id) {
  const { error } = await db(env).from('pm_tasks').delete().eq('id', id);
  check(error, 'Taak verwijderen');
}

/**
 * Taken verschuiven (bord of lijst): `items` = [{ id, section_id }] in de
 * nieuwe volgorde, voor EEN sectie (of de lijst zonder sectie).
 */
export async function moveTasks(env, items, userId, leesbaar) {
  for (const [i, it] of items.entries()) {
    const oud = await getTask(env, it.id);
    if (!oud) continue;
    const waarden = { position: (i + 1) * 10 };
    if (it.section_id !== undefined && it.section_id !== oud.section_id) waarden.section_id = it.section_id || null;
    if (waarden.section_id !== undefined) {
      await updateTask(env, it.id, waarden, userId, leesbaar);
    } else if (oud.position !== waarden.position) {
      const { error } = await db(env).from('pm_tasks').update(waarden).eq('id', it.id);
      check(error, 'Volgorde bewaren');
    }
  }
}

// ── Mijlpalen ───────────────────────────────────────────────────────────────
//
// Een mijlpaal hangt BOVEN de taken: taken wijzen ernaar (milestone_id), en ze
// is gehaald zodra alle taken eronder af zijn. `gehaald` wordt afgeleid, niet
// bewaard: dan kan het nooit uit de pas lopen met de taken.

export function normaliseerMijlpaal(body = {}, { nieuw = false } = {}) {
  const uit = {};
  if (body.name !== undefined || nieuw) {
    uit.name = kort(body.name, 120);
    if (!uit.name) throw new PmError('Geef de mijlpaal een naam.');
  }
  if (body.description !== undefined) uit.description = kort(body.description, 2000);
  if (body.due_date !== undefined) uit.due_date = datum(body.due_date);
  return uit;
}

export async function listMilestones(env, projectId) {
  const { data, error } = await db(env).from('pm_milestones').select('*').eq('project_id', projectId).order('due_date').order('position');
  check(error, 'Mijlpalen lezen');
  return data || [];
}

export async function getMilestone(env, id) {
  const { data, error } = await db(env).from('pm_milestones').select('*').eq('id', id).maybeSingle();
  check(error, 'Mijlpaal lezen');
  return data;
}

/** Mijlpalen met de stand van hun taken (hoofdtaken, geen subtaken). */
export function mijlpalenMetStand(mijlpalen, taken) {
  return mijlpalen.map((m) => {
    const eigen = taken.filter((t) => t.milestone_id === m.id && !t.parent_id);
    const af = eigen.filter((t) => t.done).length;
    return { ...m, totaal: eigen.length, af, gehaald: eigen.length > 0 && af === eigen.length };
  });
}

export async function insertMilestone(env, projectId, waarden, userId) {
  const bestaand = await listMilestones(env, projectId);
  const rij = { ...waarden, project_id: projectId, position: bestaand.reduce((m, x) => Math.max(m, x.position || 0), 0) + 10 };
  const { data, error } = await db(env).from('pm_milestones').insert(rij).select('*').single();
  check(error, 'Mijlpaal bewaren');
  await historiek(env, { project_id: projectId, user_id: userId, action: 'mijlpaal_aangemaakt', new_value: data.name });
  return data;
}

export async function updateMilestone(env, id, waarden) {
  const { data, error } = await db(env).from('pm_milestones').update(waarden).eq('id', id).select('*').single();
  check(error, 'Mijlpaal bewaren');
  return data;
}

export async function deleteMilestone(env, id) {
  const { error } = await db(env).from('pm_milestones').delete().eq('id', id);
  check(error, 'Mijlpaal verwijderen');
}

// ── Opmerkingen ─────────────────────────────────────────────────────────────

export async function listComments(env, taskId) {
  const { data, error } = await db(env).from('pm_comments').select('*').eq('task_id', taskId).order('created_at');
  check(error, 'Opmerkingen lezen');
  return data || [];
}

export async function insertComment(env, { task_id, body, mentions }, userId) {
  const tekst = kort(body, MAX_OPMERKING);
  if (!tekst) throw new PmError('Een lege opmerking bewaar je niet.');
  const { data, error } = await db(env).from('pm_comments')
    .insert({ task_id, body: tekst, mentions: ids(mentions), author_id: userId }).select('*').single();
  check(error, 'Opmerking bewaren');
  return data;
}

export async function getComment(env, id) {
  const { data, error } = await db(env).from('pm_comments').select('*').eq('id', id).maybeSingle();
  check(error, 'Opmerking lezen');
  return data;
}

export async function deleteComment(env, id) {
  const { error } = await db(env).from('pm_comments').delete().eq('id', id);
  check(error, 'Opmerking verwijderen');
}

// ── Bijlagen ────────────────────────────────────────────────────────────────

export async function listAttachments(env, taskId) {
  const { data, error } = await db(env).from('pm_attachments').select('*').eq('task_id', taskId).order('created_at');
  check(error, 'Bijlagen lezen');
  return data || [];
}

export async function getAttachment(env, id) {
  const { data, error } = await db(env).from('pm_attachments').select('*').eq('id', id).maybeSingle();
  check(error, 'Bijlage lezen');
  return data;
}

export async function insertAttachment(env, rij, userId) {
  const { data, error } = await db(env).from('pm_attachments').insert({ ...rij, uploaded_by: userId }).select('*').single();
  check(error, 'Bijlage bewaren');
  await historiek(env, { task_id: rij.task_id, user_id: userId, action: 'bijlage', new_value: rij.name });
  return data;
}

export async function deleteAttachment(env, id) {
  const { error } = await db(env).from('pm_attachments').delete().eq('id', id);
  check(error, 'Bijlage verwijderen');
}

// ── Historiek ───────────────────────────────────────────────────────────────

export async function historiek(env, rij) {
  const tekst = (v) => (v === null || v === undefined ? null : String(v).slice(0, 500));
  try {
    await db(env).from('pm_history').insert({
      ...rij, old_value: tekst(rij.old_value), new_value: tekst(rij.new_value),
    });
  } catch (err) {
    // De historiek mag een wijziging nooit tegenhouden.
    console.error('[projecten] historiek', err);
  }
}

export async function listHistory(env, taskId) {
  const { data, error } = await db(env).from('pm_history').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(200);
  check(error, 'Historiek lezen');
  return data || [];
}
