/**
 * Dashboards — tab "Marketing": routes. Enkel JSON (REGEL 4).
 *
 * Tot 2026-10-09 was dit de aparte module Webgedrag (/webgedrag, code
 * web_story). Het is het marketingdashboard en staat nu als tabblad in
 * Dashboards; de oude links uit Odoo (/webgedrag?lead=<id>) sturen door naar
 * /dashboards?tab=marketing&lead=<id> (src/router/public-routes.js).
 *
 * De motor erachter (matching, push naar Odoo, gedrag, uitsluitingen) blijft in
 * src/modules/web-story/lib/; hier staan enkel de routes van het scherm.
 *
 * Lezen mag iedereen met de module. Een koppeling bevestigen of afwijzen mag de
 * verantwoordelijke van de lead (in Odoo) en een beheerder; de twijfelgevallen
 * zijn voor beheerders (marketing). Uitsluiten uit de cijfers: beheerders en
 * marketing. Zie website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md §2.1 en P2.
 */

import { searchRead } from '../../../lib/odoo.js';
import { hasWebEvents } from '../../../lib/web-events.js';
import { resolveOdooUser } from '../../booking-links/lib/links.js';
import { leadStory, sheetStory, visitorStory, search, reviewQueue } from '../../web-story/lib/story-data.js';
import { saveLinks } from '../../web-story/lib/tracker.js';
import { pushOne } from '../../web-story/lib/push.js';
import { KLEUR } from '../../web-story/lib/journey.js';
import { getBehaviourCached } from '../../web-story/lib/behaviour.js';
import { loadExclusions, dropExcluded, listRules, describeRules, addRule, removeRule } from '../../web-story/lib/exclusions.js';
import { WEB_PERIODS } from './web-visits.js';
import { hasModuleSubRoleAccess } from '../../registry.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSSEN = new Set(['actief', 'bevestigd', 'afgewezen']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const isAdmin = user => user?.role === 'admin';
// Uitsluiten uit de cijfers (web-story/lib/exclusions.js) raakt ieders cijfers:
// Marketing, Website-bezoeken en de attributie. Daarom niet "iedereen", maar
// beheerders én marketing: de bestaande rol `marketing_signature`, dezelfde als in
// de handtekeningdesigner (hasModuleSubRoleAccess laat een beheerder altijd toe).
const mayExclude = user => hasModuleSubRoleAccess(user, 'marketing_signature');

async function guard(env, fn) {
  if (!hasWebEvents(env)) return json({ success: false, error: 'De D1-binding WEB_EVENTS ontbreekt.' }, 503);
  try { return await fn(); } catch (e) {
    console.error('[dashboards/marketing]', e);
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

export const marketingRoutes = {
  'GET /api/marketing/bootstrap': async ({ env, user }) => json({
    success: true,
    // De kanaalkleuren komen van de server: dezelfde als in het verhaal in Odoo.
    data: { is_admin: isAdmin(user), can_exclude: mayExclude(user), mode: env.WEB_STORY_MODE || '', d1: hasWebEvents(env), colors: KLEUR },
  }),

  // Trends en flows over alle bezoeken (web-story/lib/behaviour.js): compacte
  // sessies, de browser segmenteert. 10 minuten in de edge-cache; de uitgesloten
  // personen gaan er NA de cache uit, zodat een wijziging meteen telt.
  'GET /api/marketing/behaviour': async ({ env, request, ctx }) => guard(env, async () => {
    const p = new URL(request.url).searchParams.get('period');
    const period = WEB_PERIODS[p] ? p : '30d';
    const [data, excl] = await Promise.all([getBehaviourCached(env, ctx, { period }), loadExclusions(env)]);
    return json({ success: true, data: dropExcluded(data, excl) });
  }),

  // ── Instellingen: uitgesloten personen en browsers ────────────────────────
  // Lezen mag iedereen met de module: wie de cijfers bekijkt, moet kunnen zien wie
  // er niet in zit. Wijzigen raakt ieders cijfers: beheerders en marketing.
  'GET /api/marketing/exclusions': async ({ env, user }) => guard(env, async () => {
    const rules = await listRules(env);
    return json({ success: true, data: { can_exclude: mayExclude(user), rules: await describeRules(env, rules) } });
  }),

  /** body: { kind: 'email' | 'visitor', value, reason? } */
  'POST /api/marketing/exclusions': async ({ env, user, request }) => guard(env, async () => {
    if (!mayExclude(user)) return json({ success: false, error: 'Alleen een beheerder of marketing kan iemand uitsluiten.' }, 403);
    const body = await request.json().catch(() => ({}));
    try {
      return json({ success: true, data: await addRule(env, user, body || {}) });
    } catch (e) {
      return json({ success: false, error: e.message }, 400);
    }
  }),

  'DELETE /api/marketing/exclusions/:id': async ({ env, user, params }) => guard(env, async () => {
    if (!mayExclude(user)) return json({ success: false, error: 'Alleen een beheerder of marketing kan iemand weer laten meetellen.' }, 403);
    await removeRule(env, params.id);
    return json({ success: true });
  }),

  // ── Traject: één lead, actieblad of bezoeker ──────────────────────────────
  'GET /api/marketing/search': async ({ env, request }) => guard(env, async () => {
    const q = new URL(request.url).searchParams.get('q') || '';
    return json({ success: true, data: await search(env, q) });
  }),

  'GET /api/marketing/lead/:id': async ({ env, params }) => guard(env, async () => {
    const data = await leadStory(env, Number(params.id));
    return data ? json({ success: true, data }) : json({ success: false, error: 'Lead niet gevonden' }, 404);
  }),

  'GET /api/marketing/sheet/:id': async ({ env, params }) => guard(env, async () => {
    const data = await sheetStory(env, Number(params.id));
    return data ? json({ success: true, data }) : json({ success: false, error: 'Actieblad niet gevonden' }, 404);
  }),

  'GET /api/marketing/visitor/:uuid': async ({ env, params }) => guard(env, async () => {
    if (!UUID.test(params.uuid)) return json({ success: false, error: 'Ongeldige bezoeker' }, 400);
    const data = await visitorStory(env, params.uuid.toLowerCase());
    return data ? json({ success: true, data }) : json({ success: false, error: 'Bezoeker niet gevonden' }, 404);
  }),

  // ── Instellingen: twijfelgevallen (beheerders) ────────────────────────────
  'GET /api/marketing/review': async ({ env, user }) => guard(env, async () => {
    if (!isAdmin(user)) return json({ success: false, error: 'Alleen voor beheerders' }, 403);
    return json({ success: true, data: await reviewQueue(env) });
  }),

  /**
   * body: { changes: [{ uuid, res_id, status }] } — status: bevestigd | afgewezen | actief
   * Een menselijke keuze: de tracker laat ze staan bij elke volgende matching.
   */
  'POST /api/marketing/links': async ({ env, user, request }) => guard(env, async () => {
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

  'POST /api/marketing/push/:kind/:id': async ({ env, params }) => guard(env, async () => {
    if (!['lead', 'sheet'].includes(params.kind)) return json({ success: false, error: 'Onbekend soort record' }, 400);
    const res = await pushOne(env, params.kind, Number(params.id));
    return json({ success: res.ok, data: res, error: res.ok ? undefined : res.reden }, res.ok ? 200 : 409);
  }),
};
