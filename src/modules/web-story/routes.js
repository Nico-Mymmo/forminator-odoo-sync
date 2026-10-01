/**
 * Webgedrag — routes. Enkel JSON (REGEL 4), behalve GET / (de pagina).
 *
 * Lezen mag iedereen met de module. Een koppeling bevestigen of afwijzen mag de
 * verantwoordelijke van de lead (in Odoo) en een beheerder; het bulkscherm met
 * twijfelgevallen is voor beheerders (marketing). Zie
 * website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md §2.1 en P2.
 */

import { searchRead } from '../../lib/odoo.js';
import { hasWebEvents } from '../../lib/web-events.js';
import { resolveOdooUser } from '../booking-links/lib/links.js';
import { leadStory, sheetStory, visitorStory, search, reviewQueue } from './lib/story-data.js';
import { saveLinks } from './lib/tracker.js';
import { pushOne } from './lib/push.js';
import { KLEUR } from './lib/journey.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSSEN = new Set(['actief', 'bevestigd', 'afgewezen']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const isAdmin = user => user?.role === 'admin';

async function guard(env, fn) {
  if (!hasWebEvents(env)) return json({ success: false, error: 'De D1-binding WEB_EVENTS ontbreekt.' }, 503);
  try { return await fn(); } catch (e) {
    console.error('[web-story]', e);
    return json({ success: false, error: e.message || 'Fout' }, 500);
  }
}

/** Mag deze gebruiker koppelingen van deze leads beoordelen? */
async function mayReview(env, user, leadIds) {
  if (isAdmin(user)) return true;
  const me = await resolveOdooUser(env, user);
  if (!me) return false;
  const leads = await searchRead(env, { model: 'crm.lead', domain: [['id', 'in', leadIds]], fields: ['user_id'], context: { active_test: false } });
  return (leads || []).length === leadIds.length && leads.every(l => Array.isArray(l.user_id) && l.user_id[0] === me.id);
}

export const routes = {
  'GET /': async (context) =>
    context.env.ASSETS.fetch(new Request(new URL('/webgedrag.html', context.request.url))),

  'GET /api/bootstrap': async ({ env, user }) => json({
    success: true,
    // De kanaalkleuren komen van de server: dezelfde als in het verhaal in Odoo.
    data: { is_admin: isAdmin(user), mode: env.WEB_STORY_MODE || '', d1: hasWebEvents(env), colors: KLEUR },
  }),

  'GET /api/search': async ({ env, request }) => guard(env, async () => {
    const q = new URL(request.url).searchParams.get('q') || '';
    return json({ success: true, data: await search(env, q) });
  }),

  'GET /api/lead/:id': async ({ env, params }) => guard(env, async () => {
    const data = await leadStory(env, Number(params.id));
    return data ? json({ success: true, data }) : json({ success: false, error: 'Lead niet gevonden' }, 404);
  }),

  'GET /api/sheet/:id': async ({ env, params }) => guard(env, async () => {
    const data = await sheetStory(env, Number(params.id));
    return data ? json({ success: true, data }) : json({ success: false, error: 'Actieblad niet gevonden' }, 404);
  }),

  'GET /api/visitor/:uuid': async ({ env, params }) => guard(env, async () => {
    if (!UUID.test(params.uuid)) return json({ success: false, error: 'Ongeldige bezoeker' }, 400);
    const data = await visitorStory(env, params.uuid.toLowerCase());
    return data ? json({ success: true, data }) : json({ success: false, error: 'Bezoeker niet gevonden' }, 404);
  }),

  'GET /api/review': async ({ env, user }) => guard(env, async () => {
    if (!isAdmin(user)) return json({ success: false, error: 'Alleen voor beheerders' }, 403);
    return json({ success: true, data: await reviewQueue(env) });
  }),

  /**
   * body: { changes: [{ uuid, res_id, status }] } — status: bevestigd | afgewezen | actief
   * Een menselijke keuze: de tracker laat ze staan bij elke volgende matching.
   */
  'POST /api/links': async ({ env, user, request }) => guard(env, async () => {
    const body = await request.json().catch(() => ({}));
    const changes = (Array.isArray(body.changes) ? body.changes : []).slice(0, 500)
      .filter(c => UUID.test(String(c.uuid || '')) && Number.isInteger(Number(c.res_id)) && STATUSSEN.has(c.status));
    if (!changes.length) return json({ success: false, error: 'Niets om te bewaren' }, 400);
    const leadIds = [...new Set(changes.map(c => Number(c.res_id)))];
    if (!(await mayReview(env, user, leadIds))) {
      return json({ success: false, error: 'Enkel de verantwoordelijke van de lead of een beheerder kan dit beoordelen.' }, 403);
    }
    const wie = user.email || user.id;
    const res = await saveLinks(env, changes.map(c => ({
      uuid: String(c.uuid).toLowerCase(), model: 'crm.lead', res_id: Number(c.res_id),
      bron: 'beoordeling', sterkte: 'middel', status: c.status, detail: `door ${wie}`,
    })));
    return json({ success: true, data: res });
  }),

  'POST /api/push/:kind/:id': async ({ env, params }) => guard(env, async () => {
    if (!['lead', 'sheet'].includes(params.kind)) return json({ success: false, error: 'Onbekend soort record' }, 400);
    const res = await pushOne(env, params.kind, Number(params.id));
    return json({ success: res.ok, data: res, error: res.ok ? undefined : res.reden }, res.ok ? 200 : 409);
  }),
};
