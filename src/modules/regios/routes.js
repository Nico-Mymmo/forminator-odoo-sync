/**
 * Regio's -- routes. Alleen JSON, behalve `GET /` (de pagina).
 *
 * Rechten: wie de module heeft, ziet en bewerkt alles (zoals in de mini-app).
 * De overname uit de mini-app opnieuw starten kan enkel een beheerder: die
 * vervangt alles wat er in de module staat.
 */

import {
  stand, insertSyndicoach, updateSyndicoach, deleteSyndicoach, orderSyndicoaches,
  toewijzen, voegExtraPostcodeToe, listWijzigingen, syndicoachVoorPostcode,
  listSyndicoaches, zorgVoorSyndicoaches, schrijfRijen, verwijderPostcodes, log,
} from './lib/store.js';
import { bouwPlan } from './lib/import.js';
import { ensureOvername, neemOver } from './lib/overname.js';
import { RegioError, LOG_PREFIX } from './lib/constants.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fout(err) {
  const status = err instanceof RegioError ? err.status : 500;
  if (status >= 500) console.error(LOG_PREFIX, err);
  return json({ success: false, error: err?.message || 'Onbekende fout' }, status);
}

async function leesBody(request) {
  try { return await request.json(); } catch { return {}; }
}

const isAdmin = (user) => user?.role === 'admin';

/** Plan uitrekenen tegen de huidige stand (zelfde functie voor voorbeeld en import). */
async function plan(env, body) {
  const s = await stand(env);
  try {
    return bouwPlan({ tekst: body.tekst, modus: body.modus, syndicoaches: s.syndicoaches, toewijzingen: s.toewijzingen });
  } catch (err) {
    throw new RegioError(err.message);
  }
}

export const routes = {
  'GET /': async ({ env, request }) =>
    env.ASSETS.fetch(new Request(new URL('/regios.html', request.url))),

  'GET /api/stand': async ({ env, user }) => {
    try {
      const overgenomen = await ensureOvername(env, user);
      const s = await stand(env);
      return json({ success: true, data: { ...s, net_overgenomen: !!overgenomen, is_admin: isAdmin(user) } });
    } catch (err) { return fout(err); }
  },

  'POST /api/syndicoaches': async ({ env, request, user }) => {
    try {
      const nieuw = await insertSyndicoach(env, await leesBody(request), user);
      return json({ success: true, data: nieuw });
    } catch (err) { return fout(err); }
  },

  'PUT /api/syndicoaches/:id': async ({ env, request, user, params }) => {
    try {
      const s = await updateSyndicoach(env, params.id, await leesBody(request), user);
      return json({ success: true, data: s });
    } catch (err) { return fout(err); }
  },

  'DELETE /api/syndicoaches/:id': async ({ env, user, params }) => {
    try {
      await deleteSyndicoach(env, params.id, user);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  'POST /api/volgorde': async ({ env, request }) => {
    try {
      const body = await leesBody(request);
      await orderSyndicoaches(env, body.order);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  'POST /api/toewijzen': async ({ env, request, user }) => {
    try {
      const body = await leesBody(request);
      await toewijzen(env, body.postcodes, body.syndicoach_id || null, user, body.label);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  'POST /api/extra-postcodes': async ({ env, request, user }) => {
    try {
      const body = await leesBody(request);
      const pc = await voegExtraPostcodeToe(env, body.postcode, body.nis, user);
      return json({ success: true, data: { postcode: pc } });
    } catch (err) { return fout(err); }
  },

  'GET /api/wijzigingen': async ({ env }) => {
    try {
      return json({ success: true, data: await listWijzigingen(env, 150) });
    } catch (err) { return fout(err); }
  },


  // Wie is de syndicoach van deze postcode.
  'GET /api/postcode/:postcode': async ({ env, params }) => {
    try {
      return json({ success: true, data: await syndicoachVoorPostcode(env, params.postcode) });
    } catch (err) { return fout(err); }
  },

  'POST /api/import/voorbeeld': async ({ env, request }) => {
    try {
      return json({ success: true, data: await plan(env, await leesBody(request)) });
    } catch (err) { return fout(err); }
  },

  'POST /api/import': async ({ env, request, user }) => {
    try {
      const p = await plan(env, await leesBody(request));
      const namen = [...new Set(p.toewijzen.map((t) => t.naam))];
      const { map, nieuw } = await zorgVoorSyndicoaches(env, namen, user);
      await schrijfRijen(env, 'regio_postcodes', p.toewijzen.map((t) => ({
        postcode: t.postcode, syndicoach_id: map.get(t.naam.toLowerCase()), updated_by: user?.id || null,
      })));
      await verwijderPostcodes(env, p.vrijgeven);
      const t = p.tellingen;
      await log(env, user, 'import',
        `Import (${p.modus}): ${t.nieuw} nieuw toegewezen, ${t.verplaatst} verplaatst, ${t.vrijgeven} vrijgegeven` +
        (nieuw.length ? `, ${nieuw.length} nieuwe syndicoach(es)` : ''),
        t.nieuw + t.verplaatst + t.vrijgeven);
      return json({ success: true, data: { tellingen: t, nieuwe_syndicoaches: nieuw.length } });
    } catch (err) { return fout(err); }
  },

  'POST /api/overname': async ({ env, user }) => {
    try {
      if (!isAdmin(user)) throw new RegioError('Enkel een beheerder kan de mini-app opnieuw overnemen.', 403);
      return json({ success: true, data: await neemOver(env, user) });
    } catch (err) { return fout(err); }
  },

  'GET /api/syndicoaches': async ({ env }) => {
    try {
      return json({ success: true, data: await listSyndicoaches(env) });
    } catch (err) { return fout(err); }
  },
};
