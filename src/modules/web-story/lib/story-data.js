/**
 * Het volledige verhaal voor het scherm Webgedrag: per lead, per actieblad en
 * per bezoeker. Live uit D1 (alleen lezen) en Odoo (alleen lezen); de tijdlijn
 * rendert de tracker. Zie website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md §4.
 *
 * Hier wordt niets bewaard. Bevestigen/afwijzen gaat via saveLinks() (tracker).
 */

import { searchRead } from '../../../lib/odoo.js';
import { readWebEvents } from '../../../lib/web-events.js';
import { readVisitorSessions } from '../../dashboards/lib/web-visits.js';
import { buildJourney } from './journey.js';
import { fetchTimeline } from './tracker.js';
import { readIdentities, isShared, activeEmail, personKey } from './identities.js';

const ctx = { active_test: false };
const m2o = v => (Array.isArray(v) ? { id: v[0], name: v[1] } : null);
const MAX_UUIDS = 50;

/** Koppelingen van een of meer leads, met wat D1 over de bezoeker weet. */
export async function linksForLeads(env, leadIds) {
  if (!leadIds.length) return [];
  const out = [];
  for (let i = 0; i < leadIds.length; i += 90) {
    const part = leadIds.slice(i, i + 90);
    const res = await readWebEvents(env,
      `SELECT l.res_id, l.visitor_uuid, l.bron, l.sterkte, l.status, l.created_at,
              v.email, v.site, v.first_seen, v.last_seen, v.is_internal, v.is_bot
       FROM visitor_links l JOIN visitors v ON v.uuid = l.visitor_uuid
       WHERE l.model = 'crm.lead' AND l.res_id IN (${part.map(() => '?').join(',')})
       ORDER BY v.last_seen DESC`, part);
    out.push(...(res.results || []));
  }
  return out;
}

/** Sessies + verhaal + tijdlijn voor een set koppelingen (afgewezen tellen niet mee). */
async function assemble(env, links, conversionAt) {
  // Collega-browsers komen mee (gelabeld als intern / test): een test met een
  // formulier moet je op zijn lead kunnen volgen. Bots nooit.
  const actief = [];
  const seen = new Set();
  for (const l of links) {
    if (l.status === 'afgewezen' || l.is_bot || seen.has(l.visitor_uuid)) continue;
    seen.add(l.visitor_uuid);
    actief.push(l);
  }
  const uuids = actief.slice(0, MAX_UUIDS).map(l => l.visitor_uuid);
  const ids = uuids.length ? await readIdentities(env, uuids) : new Map();
  // Elke koppeling krijgt al haar adressen mee, en of de browser gedeeld is.
  for (const l of links) {
    const list = ids.get(l.visitor_uuid) || [];
    l.emails = list.map(i => i.email);
    l.gedeeld = isShared(list);
  }
  const persons = new Map(uuids.map(u => [u, personKey(ids.get(u), u)]));
  const sessions = uuids.length ? await readVisitorSessions(env, uuids, { includeInternal: true }) : [];
  const journey = buildJourney(sessions, { conversionAt, persons });
  const tl = uuids.length ? await fetchTimeline(env, uuids, { includeInternal: true }) : {};
  const intern = new Set(actief.filter(l => l.is_internal).map(l => l.visitor_uuid));
  return {
    journey,
    // Per bezoek het adres dat TOEN in gebruik was (bij een gedeelde browser een benadering).
    sessions: sessions.map(s => ({ ...s, person: activeEmail(ids.get(s.uuid), s.end), intern: intern.has(s.uuid), gedeeld: isShared(ids.get(s.uuid)) })),
    timeline_html: tl.timeline_html || null,
    kpi_html: tl.kpi_html || null,
    afgekapt: actief.length > MAX_UUIDS ? actief.length - MAX_UUIDS : 0,
  };
}

export async function leadStory(env, leadId) {
  const [lead] = await searchRead(env, { model: 'crm.lead', domain: [['id', '=', leadId]],
    fields: ['id', 'name', 'email_from', 'partner_id', 'user_id', 'create_date', 'stage_id', 'active', 'type'], context: ctx });
  if (!lead) return null;
  const links = await linksForLeads(env, [leadId]);
  const sheets = await searchRead(env, { model: 'x_sales_action_sheet', domain: [['x_studio_as_opportunity_ids', 'in', [leadId]]],
    fields: ['id', 'x_name'], context: ctx }).catch(() => []);
  return {
    kind: 'lead',
    record: {
      id: lead.id, name: lead.name, email: lead.email_from || null, partner: m2o(lead.partner_id),
      owner: m2o(lead.user_id), stage: m2o(lead.stage_id), created: lead.create_date, active: lead.active, type: lead.type,
    },
    sheets: (sheets || []).map(s => ({ id: s.id, name: s.x_name })),
    links,
    ...(await assemble(env, links, lead.create_date)),
  };
}

export async function sheetStory(env, sheetId) {
  const [sheet] = await searchRead(env, { model: 'x_sales_action_sheet', domain: [['id', '=', sheetId]],
    fields: ['id', 'x_name', 'x_studio_as_opportunity_ids', 'create_date'], context: ctx });
  if (!sheet) return null;
  const leadIds = sheet.x_studio_as_opportunity_ids || [];
  const leads = leadIds.length ? await searchRead(env, { model: 'crm.lead', domain: [['id', 'in', leadIds]],
    fields: ['id', 'name', 'user_id', 'create_date'], context: ctx }) : [];
  const links = await linksForLeads(env, leadIds);
  const first = (leads || []).map(l => l.create_date).sort()[0] || sheet.create_date;
  return {
    kind: 'sheet',
    record: { id: sheet.id, name: sheet.x_name, created: sheet.create_date },
    leads: (leads || []).map(l => ({ id: l.id, name: l.name, owner: m2o(l.user_id) })),
    links,
    ...(await assemble(env, links, first)),
  };
}

export async function visitorStory(env, uuid) {
  const res = await readWebEvents(env, `SELECT * FROM visitors WHERE uuid = ?`, [uuid]);
  const v = (res.results || [])[0];
  if (!v) return null;
  const lres = await readWebEvents(env,
    `SELECT res_id, bron, sterkte, status, created_at FROM visitor_links WHERE model = 'crm.lead' AND visitor_uuid = ?`, [uuid]);
  const ll = lres.results || [];
  const leads = ll.length ? await searchRead(env, { model: 'crm.lead', domain: [['id', 'in', ll.map(l => l.res_id)]],
    fields: ['id', 'name', 'user_id'], context: ctx }) : [];
  const naam = new Map((leads || []).map(l => [l.id, l]));
  const self = [{ visitor_uuid: uuid, email: v.email, is_internal: v.is_internal, is_bot: v.is_bot, status: 'actief' }];
  const myIds = (await readIdentities(env, [uuid])).get(uuid) || [];
  return {
    kind: 'visitor',
    record: { uuid, email: v.email, site: v.site, first_seen: v.first_seen, last_seen: v.last_seen,
      internal: !!v.is_internal, bot: !!v.is_bot, ref_uuid: v.ref_uuid,
      emails: myIds.map(i => ({ email: i.email, first_seen: i.first_seen, last_seen: i.last_seen })), gedeeld: isShared(myIds) },
    leads: ll.map(l => ({ ...l, name: naam.get(l.res_id)?.name || null, owner: m2o(naam.get(l.res_id)?.user_id) })),
    ...(await assemble(env, self, null)),
  };
}

/** Zoeken op lead-id, e-mailadres of bezoeker-UUID. */
export async function search(env, q) {
  const s = String(q || '').trim();
  if (!s) return { leads: [], visitors: [] };
  if (/^\d+$/.test(s)) {
    const leads = await searchRead(env, { model: 'crm.lead', domain: [['id', '=', Number(s)]], fields: ['id', 'name', 'email_from'], context: ctx });
    return { leads: leads || [], visitors: [] };
  }
  if (/^[0-9a-f-]{36}$/i.test(s)) return { leads: [], visitors: [{ uuid: s.toLowerCase() }] };
  const like = s.toLowerCase();
  const leads = await searchRead(env, { model: 'crm.lead',
    domain: ['|', ['email_from', 'ilike', like], ['name', 'ilike', like]], fields: ['id', 'name', 'email_from'], limit: 20,
    order: 'create_date desc', context: ctx });
  const vis = like.includes('@') ? await readWebEvents(env,
    `SELECT uuid, email, site, last_seen FROM visitors WHERE email = ? ORDER BY last_seen DESC LIMIT 50`, [like]) : { results: [] };
  return { leads: leads || [], visitors: vis.results || [] };
}

/** Twijfelgevallen voor het bulkscherm: koppelingen 'middel' die nog niemand beoordeelde. */
export async function reviewQueue(env, { limit = 200 } = {}) {
  const res = await readWebEvents(env,
    `SELECT l.visitor_uuid, l.res_id, l.bron, l.sterkte, l.created_at, v.email, v.last_seen
     FROM visitor_links l JOIN visitors v ON v.uuid = l.visitor_uuid
     WHERE l.model = 'crm.lead' AND l.status = 'actief' AND l.sterkte = 'middel' AND v.is_internal = 0
     ORDER BY v.last_seen DESC LIMIT ?`, [limit]);
  const rows = res.results || [];
  const ids = [...new Set(rows.map(r => r.res_id))];
  const leads = ids.length ? await searchRead(env, { model: 'crm.lead', domain: [['id', 'in', ids]],
    fields: ['id', 'name', 'email_from', 'user_id', 'partner_id'], context: ctx }) : [];
  const per = new Map((leads || []).map(l => [l.id, l]));
  // Bij een gedeelde browser alle adressen erbij: daarop beslist de beoordelaar.
  const adressen = rows.length ? await readIdentities(env, rows.map(r => r.visitor_uuid)) : new Map();
  return rows.map(r => {
    const l = per.get(r.res_id);
    const list = adressen.get(r.visitor_uuid) || [];
    return { ...r, lead_name: l?.name || null, lead_email: l?.email_from || null, owner: m2o(l?.user_id), partner: m2o(l?.partner_id),
      emails: list.map(i => i.email), gedeeld: isShared(list) };
  });
}
