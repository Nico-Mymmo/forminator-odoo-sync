/**
 * Elk uur: koppelingen bijwerken en het verhaal op leads en actiebladen in Odoo
 * zetten, waar iets veranderde. Zie website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md §4.
 *
 * WEB_STORY_MODE (Worker-variabele) bepaalt wat er gebeurt -- leeg = NIETS, dus
 * een deploy op zich verandert nooit iets in Odoo:
 *   match  enkel koppelingen zoeken (schrijft naar D1 via de tracker, niet naar Odoo)
 *   dry    + berekenen wat er naar Odoo zou gaan, en dat loggen
 *   on     + echt schrijven
 *
 * Zolang de tracker zelf nog leadtijdlijnen schrijft (rebuildLeadTimeline), mag
 * deze niet op 'on': dan zijn er twee schrijvers op dezelfde velden. Zet in de
 * tracker eerst LEAD_TIMELINE_BY_OM=1.
 *
 * Wat er bovenaan staat, komt van hier (journey.js, met de kanalen van het
 * dashboard); de tijdlijn eronder rendert de tracker (derive.js + timeline.js).
 * Een record wordt enkel geschreven als de HTML echt veranderde (hash in KV).
 */

import { searchRead, write, executeKw, messagePost } from '../../../lib/odoo.js';
import { readWebEvents, hasWebEvents } from '../../../lib/web-events.js';
import { readVisitorSessions } from '../../dashboards/lib/web-visits.js';
import { runMatching } from './matching.js';
import { fetchTimeline } from './tracker.js';
import { buildJourney, journeyHtml } from './journey.js';

const KV = 'webstory:';
const MAX_PER_RUN = 120;
const MAX_UUIDS = 50;
const LEAD = {
  model: 'crm.lead', timeline: 'x_studio_merged_timeline_html', kpi: 'x_studio_merged_kpi_html',
  extra: now => ({ x_studio_has_web_activity: true, x_studio_last_web_activity_update: now }),
  titel: 'Hoe deze lead bij ons kwam',
};
// Nog aan te maken in Studio op het actieblad; zolang ze ontbreken wordt het actieblad overgeslagen.
const SHEET = {
  model: 'x_sales_action_sheet', timeline: 'x_studio_web_timeline_html', kpi: 'x_studio_web_kpi_html',
  extra: () => ({}), titel: 'Hoe deze VME bij ons kwam',
};

/** De pagina in de OM met het volledige verhaal (filters, bevestigen, alle bezoeken). */
export function omStoryUrl(env, kind, id) {
  const base = (env.APP_BASE_URL || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/webgedrag?${kind.model === 'crm.lead' ? 'lead' : 'sheet'}=${id}`;
}

function nowTs() { return new Date().toISOString().substring(0, 19).replace('T', ' '); }

async function sha(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function linkedUuids(env, leadIds) {
  if (!leadIds.length) return new Map();
  const out = new Map();
  for (let i = 0; i < leadIds.length; i += 90) {
    const part = leadIds.slice(i, i + 90);
    const res = await readWebEvents(env,
      `SELECT l.res_id, l.visitor_uuid, v.email, v.last_seen FROM visitor_links l JOIN visitors v ON v.uuid = l.visitor_uuid
       WHERE l.model = 'crm.lead' AND l.status <> 'afgewezen' AND v.is_internal = 0 AND v.is_bot = 0
         AND l.res_id IN (${part.map(() => '?').join(',')})`, part);
    for (const r of res.results || []) {
      if (!out.has(r.res_id)) out.set(r.res_id, []);
      out.get(r.res_id).push(r);
    }
  }
  return out;
}

async function hasFields(env, model, names) {
  try {
    const f = await executeKw(env, { model, method: 'fields_get', args: [names], kwargs: { attributes: ['type'] } });
    return names.every(n => f && f[n]);
  } catch (_) { return false; }
}

/** Eén record: verhaal + tijdlijn opbouwen, en schrijven als het veranderde. */
async function pushRecord(env, kind, id, rows, conversionAt, { mode, stats, force = false }) {
  const recent = rows.slice().sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1)).slice(0, MAX_UUIDS);
  const uuids = recent.map(r => r.visitor_uuid);
  const persons = new Map(recent.map(r => [r.visitor_uuid, r.email || r.visitor_uuid]));
  const sessions = await readVisitorSessions(env, uuids);
  if (!sessions.length) { stats.leeg++; return; }
  const tl = await fetchTimeline(env, uuids);
  if (!tl.timeline_html) { stats.leeg++; return; }
  const journey = buildJourney(sessions, { conversionAt, persons });
  const omUrl = omStoryUrl(env, kind, id);
  const html = journeyHtml(journey, { titel: kind.titel, omUrl }) + tl.timeline_html;
  const hash = await sha(html + '\u0000' + tl.kpi_html);
  const key = `${KV}hash:${kind.model}:${id}`;
  if (!force && (await env.MAPPINGS_KV.get(key)) === hash) { stats.ongewijzigd++; return; }
  if (mode !== 'on') { stats.zou_schrijven++; return; }
  await write(env, { model: kind.model, ids: [id], values: { [kind.timeline]: html, [kind.kpi]: tl.kpi_html, ...kind.extra(nowTs()) } });
  await env.MAPPINGS_KV.put(key, hash);
  stats.geschreven++;
  // EEN keer per record een notitie in de chatter met de link -- niet bij elke
  // update, dat wordt ruis (docs/ontwerp-odoo-zonder-bezoekers.md §4).
  const noted = `${KV}noted:${kind.model}:${id}`;
  if (omUrl && !(await env.MAPPINGS_KV.get(noted))) {
    try {
      await messagePost(env, { model: kind.model, id, isHtml: true,
        body: `<p>Er hangt webgedrag aan dit record. <a href="${omUrl}" target="_blank" rel="noopener">Bekijk het volledige verhaal in de Operations Manager</a>.</p>` });
      await env.MAPPINGS_KV.put(noted, nowTs());
    } catch (e) { console.warn(`[web-story] chatter ${kind.model} ${id}:`, e.message); }
  }
}

/**
 * Eén lead of actieblad nu bijwerken ("Odoo nu bijwerken" in het scherm).
 * Enkel als WEB_STORY_MODE 'on' is: anders schrijft de tracker de lead nog zelf.
 */
export async function pushOne(env, kindName, id) {
  if (env.WEB_STORY_MODE !== 'on') return { ok: false, reden: `WEB_STORY_MODE staat op "${env.WEB_STORY_MODE || ''}", niet op "on"` };
  const stats = { geschreven: 0, zou_schrijven: 0, ongewijzigd: 0, leeg: 0 };
  if (kindName === 'lead') {
    const [lead] = await searchRead(env, { model: 'crm.lead', domain: [['id', '=', id]], fields: ['create_date'], context: { active_test: false } });
    if (!lead) return { ok: false, reden: 'lead niet gevonden' };
    const rows = (await linkedUuids(env, [id])).get(id) || [];
    await pushRecord(env, LEAD, id, rows, lead.create_date, { mode: 'on', stats, force: true });
  } else {
    if (!(await hasFields(env, SHEET.model, [SHEET.timeline, SHEET.kpi]))) return { ok: false, reden: 'velden op het actieblad bestaan nog niet' };
    const [s] = await searchRead(env, { model: SHEET.model, domain: [['id', '=', id]], fields: ['x_studio_as_opportunity_ids', 'create_date'], context: { active_test: false } });
    if (!s) return { ok: false, reden: 'actieblad niet gevonden' };
    const per = await linkedUuids(env, s.x_studio_as_opportunity_ids || []);
    const seen = new Map();
    for (const rows of per.values()) for (const r of rows) if (!seen.has(r.visitor_uuid)) seen.set(r.visitor_uuid, r);
    await pushRecord(env, SHEET, id, [...seen.values()], s.create_date, { mode: 'on', stats, force: true });
  }
  return { ok: true, ...stats };
}

export async function runWebStoryCron(env, { scheduledTime } = {}) {
  const mode = env.WEB_STORY_MODE;
  if (!['match', 'dry', 'on'].includes(mode) || !hasWebEvents(env) || !env.MAPPINGS_KV) return null;

  // Elk uur, of in de kwartieren erna zolang er nog werk ligt.
  const pending = JSON.parse((await env.MAPPINGS_KV.get(`${KV}pending`)) || '[]');
  const minute = new Date(scheduledTime || Date.now()).getUTCMinutes();
  if (minute >= 15 && !pending.length) return null;

  const log = { mode };
  let todo = pending;
  let startedAt = await env.MAPPINGS_KV.get(`${KV}run_started`);
  if (!todo.length) {
    log.matching = await runMatching(env);
    if (mode === 'match') { console.log('[web-story]', JSON.stringify(log)); return log; }
    // Leads waarvan een gekoppelde bezoeker iets deed, of die een nieuwe koppeling kregen.
    const since = await env.MAPPINGS_KV.get(`${KV}push_since`);
    startedAt = nowTs();
    const res = await readWebEvents(env,
      `SELECT DISTINCT l.res_id FROM visitor_links l JOIN visitors v ON v.uuid = l.visitor_uuid
       WHERE l.model = 'crm.lead' AND l.status <> 'afgewezen'
         AND (? IS NULL OR v.last_seen > ? OR l.created_at > ?)`, [since, since, since]);
    todo = (res.results || []).map(r => r.res_id);
    await env.MAPPINGS_KV.put(`${KV}run_started`, startedAt);
  } else if (mode === 'match') {
    todo = [];
  }

  const batch = todo.slice(0, MAX_PER_RUN);
  const rest = todo.slice(MAX_PER_RUN);
  const stats = { leads: batch.length, geschreven: 0, zou_schrijven: 0, ongewijzigd: 0, leeg: 0, fouten: 0, actiebladen: 0, rest: rest.length };

  const leads = batch.length ? await searchRead(env, { model: 'crm.lead', domain: [['id', 'in', batch]],
    fields: ['id', 'create_date'], context: { active_test: false } }) : [];
  const created = new Map((leads || []).map(l => [l.id, l.create_date]));
  const rowsPerLead = await linkedUuids(env, batch);
  for (const id of batch) {
    if (!created.has(id)) continue; // lead bestaat niet meer
    try { await pushRecord(env, LEAD, id, rowsPerLead.get(id) || [], created.get(id), { mode, stats }); }
    catch (e) { stats.fouten++; console.error(`[web-story] lead ${id}:`, e.message); }
  }

  // Actiebladen: alle bezoekers van al hun leads samen.
  if (batch.length && await hasFields(env, SHEET.model, [SHEET.timeline, SHEET.kpi])) {
    const sheets = await searchRead(env, { model: SHEET.model, domain: [['x_studio_as_opportunity_ids', 'in', batch]],
      fields: ['id', 'x_studio_as_opportunity_ids', 'create_date'], context: { active_test: false } });
    for (const s of sheets || []) {
      try {
        const leadIds = s.x_studio_as_opportunity_ids || [];
        const per = await linkedUuids(env, leadIds);
        const seen = new Map();
        for (const rows of per.values()) for (const r of rows) if (!seen.has(r.visitor_uuid)) seen.set(r.visitor_uuid, r);
        const lc = leadIds.length ? await searchRead(env, { model: 'crm.lead', domain: [['id', 'in', leadIds]],
          fields: ['create_date'], context: { active_test: false } }) : [];
        const firstLead = (lc || []).map(l => l.create_date).sort()[0] || s.create_date;
        await pushRecord(env, SHEET, s.id, [...seen.values()], firstLead, { mode, stats });
        stats.actiebladen++;
      } catch (e) { stats.fouten++; console.error(`[web-story] actieblad ${s.id}:`, e.message); }
    }
  } else if (batch.length) {
    stats.actiebladen_overgeslagen = `velden ${SHEET.timeline}/${SHEET.kpi} bestaan nog niet op ${SHEET.model}`;
  }

  await env.MAPPINGS_KV.put(`${KV}pending`, JSON.stringify(rest));
  // Pas als de hele ronde af is, schuift het startpunt op: wat tijdens de ronde
  // gebeurde, komt in de volgende.
  if (!rest.length && startedAt && mode === 'on') await env.MAPPINGS_KV.put(`${KV}push_since`, startedAt);
  log.push = stats;
  console.log('[web-story]', JSON.stringify(log));
  return log;
}
