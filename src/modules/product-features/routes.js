/**
 * Productfeatures -- routes. Alleen JSON, behalve `GET /`.
 *
 * Wie de module heeft, mag lezen; bewerken kan enkel een beheerder of
 * marketing (`mag Bewerken`). De nieuwsbrief leest de bibliotheek NIET via
 * deze routes maar rechtstreeks via lib/store.js (eigen module, eigen rechten).
 */

import {
  FeatureError, listFeatures, getFeature, insertFeature, updateFeature, deleteFeature,
  herorden, normaliseer, controleerOuder, boom,
} from './lib/store.js';
import {
  LOG_PREFIX, CATEGORIEEN, VOORDELEN, DOELGROEPEN, PAKKETTEN, MERKEN, FEATURE_VORMEN, MAX_USPS,
} from './lib/constants.js';

const MAX_BEELD = 3 * 1024 * 1024;
const BEELD_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const BEELDEN_MAP = 'public/productfeatures/';
// Dezelfde publieke oorsprong als de beelden van de nieuwsbrief (R2 via /assets/).
const ASSET_ORIGIN = 'https://link.openvme.be';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fout(err) {
  const status = err instanceof FeatureError ? err.status : 500;
  if (status >= 500) console.error(LOG_PREFIX, err);
  return json({ success: false, error: err?.message || 'Onbekende fout' }, status);
}

async function leesBody(request) {
  try { return await request.json(); } catch { return {}; }
}

const magBewerken = (user) => user?.role === 'admin' || user?.role === 'marketing_signature';
function eisBewerken(user) {
  if (!magBewerken(user)) throw new FeatureError('Enkel beheerders en marketing bewerken de bibliotheek.', 403);
}

export const routes = {
  'GET /': async (context) =>
    context.env.ASSETS.fetch(new Request(new URL('/productfeatures.html', context.request.url))),

  'GET /api/bootstrap': async ({ user }) => json({
    success: true,
    data: {
      me: { id: user.id, name: user.full_name || user.email, role: user.role, can_edit: magBewerken(user) },
      categorieen: CATEGORIEEN,
      voordelen: VOORDELEN,
      doelgroepen: DOELGROEPEN,
      pakketten: PAKKETTEN,
      merken: MERKEN,
      vormen: FEATURE_VORMEN,
      max_usps: MAX_USPS,
    },
  }),

  /** Alles, plat (met position en parent_id) EN als boom. */
  'GET /api/features': async ({ env }) => {
    try {
      const lijst = await listFeatures(env);
      return json({ success: true, data: { items: lijst, tree: boom(lijst) } });
    } catch (err) { return fout(err); }
  },

  'GET /api/features/:id': async ({ env, params }) => {
    try {
      const f = await getFeature(env, params.id);
      if (!f) throw new FeatureError('Feature niet gevonden.', 404);
      return json({ success: true, data: f });
    } catch (err) { return fout(err); }
  },

  'POST /api/features': async ({ env, user, request }) => {
    try {
      eisBewerken(user);
      const waarden = normaliseer(await leesBody(request), { nieuw: true });
      waarden.parent_id = await controleerOuder(env, null, waarden.parent_id);
      if (waarden.position === undefined) {
        const broers = (await listFeatures(env)).filter((f) => (f.parent_id || null) === (waarden.parent_id || null));
        waarden.position = broers.reduce((m, f) => Math.max(m, f.position || 0), 0) + 10;
      }
      return json({ success: true, data: await insertFeature(env, waarden, user.id) }, 201);
    } catch (err) { return fout(err); }
  },

  'PUT /api/features/:id': async ({ env, user, params, request }) => {
    try {
      eisBewerken(user);
      const f = await getFeature(env, params.id);
      if (!f) throw new FeatureError('Feature niet gevonden.', 404);
      const waarden = normaliseer(await leesBody(request));
      if (waarden.parent_id !== undefined) waarden.parent_id = await controleerOuder(env, f.id, waarden.parent_id);
      if (waarden.name === '') throw new FeatureError('De titel mag niet leeg zijn.');
      return json({ success: true, data: await updateFeature(env, f.id, waarden, user.id) });
    } catch (err) { return fout(err); }
  },

  /** Volgorde van de kinderen van één ouder (of van de hoofdfeatures): de ids in de nieuwe volgorde. */
  'POST /api/features/order': async ({ env, user, request }) => {
    try {
      eisBewerken(user);
      const b = await leesBody(request);
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String);
      if (!ids.length) throw new FeatureError('Geen volgorde ontvangen.');
      await herorden(env, ids);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  'DELETE /api/features/:id': async ({ env, user, params }) => {
    try {
      eisBewerken(user);
      const f = await getFeature(env, params.id);
      if (!f) throw new FeatureError('Feature niet gevonden.', 404);
      await deleteFeature(env, f.id);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  /** Een beeld bij een feature: naar R2, publiek via /assets/. */
  'POST /api/upload': async ({ env, user, request }) => {
    try {
      eisBewerken(user);
      const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      const ext = BEELD_TYPES[type];
      if (!ext) throw new FeatureError('Enkel PNG, JPEG, GIF of WebP.');
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_BEELD) throw new FeatureError('Het beeld is leeg of groter dan 3 MB.');
      const key = `${BEELDEN_MAP}${crypto.randomUUID()}.${ext}`;
      await env.R2_ASSETS.put(key, bytes, { httpMetadata: { contentType: type } });
      return json({ success: true, data: { url: `${ASSET_ORIGIN}/assets/${key}` } }, 201);
    } catch (err) { return fout(err); }
  },
};
