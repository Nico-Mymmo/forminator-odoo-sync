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
  listSyndicoaches, pasImportToe,
} from './lib/store.js';
import { toonWijziging, maakOngedaan } from './lib/ongedaan.js';
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
    return {
      plan: bouwPlan({ tekst: body.tekst, modus: body.modus, syndicoaches: s.syndicoaches, toewijzingen: s.toewijzingen }),
      voor: s.toewijzingen,
    };
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

  // Wat een logboekregel veranderde, en wat er sindsdien opnieuw veranderde.
  'GET /api/wijzigingen/:id': async ({ env, params }) => {
    try {
      return json({ success: true, data: await toonWijziging(env, params.id) });
    } catch (err) { return fout(err); }
  },

  // { alles: true } zet ook terug wat sindsdien opnieuw veranderde.
  'POST /api/wijzigingen/:id/ongedaan': async ({ env, request, user, params }) => {
    try {
      const body = await leesBody(request);
      return json({ success: true, data: await maakOngedaan(env, params.id, user, { alles: !!body.alles }) });
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
      return json({ success: true, data: (await plan(env, await leesBody(request))).plan });
    } catch (err) { return fout(err); }
  },

  'POST /api/import': async ({ env, request, user }) => {
    try {
      const { plan: p, voor } = await plan(env, await leesBody(request));
      return json({ success: true, data: await pasImportToe(env, p, voor, user) });
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
