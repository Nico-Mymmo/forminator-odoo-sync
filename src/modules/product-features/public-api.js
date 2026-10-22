/**
 * Productfeatures -- publieke API voor het blok "Mymmo productfeature"
 * (plugin Mymmo Componenten). Geen sessie, wel een sitesleutel in de header
 * X-Mymmo-Site-Key: DEZELFDE sleutels als de formulieren
 * (FORMS_PUBLIC_SITE_KEYS), want het blok gebruikt de verbinding die Mymmo
 * Forms op de site al heeft. Zo hoeft er op geen enkele site iets ingesteld.
 *
 *   GET  /productfeatures/public/v1/features        -> wat op de sites mag (keuzelijst)
 *   GET  /productfeatures/public/v1/features/{id}   -> de versie op de sites
 *   POST /productfeatures/public/v1/gebruik         -> op welke pagina's ze staan
 *
 * Enkel wat met "Naar de sites sturen" verstuurd werd, komt eruit: nooit de
 * werkversie in de OM. Een feature die nooit verstuurd werd, geeft 404.
 *
 * ETag = de hash van de verstuurde versie (geen tijdstip, zie de events-API).
 */

import { listPublicaties, getPublicatie, meldGebruik, hostVan } from './lib/websites.js';
import { LOG_PREFIX } from './lib/constants.js';

const PREFIX = '/productfeatures/public/v1';

// Per isolate (zoals het leespad van de formulieren): genoeg voor wie de API
// wil platleggen, en geen KV-write per verzoek.
const LIMIET = { windowSeconds: 60, maxRequests: 240 };
const rateMemo = new Map();

function binnenLimiet(sleutel) {
  const bucket = Math.floor(Date.now() / (LIMIET.windowSeconds * 1000));
  const k = `${sleutel}:${bucket}`;
  if (rateMemo.size > 200) for (const b of [...rateMemo.keys()]) if (!b.endsWith(`:${bucket}`)) rateMemo.delete(b);
  const n = (rateMemo.get(k) || 0) + 1;
  rateMemo.set(k, n);
  return n <= LIMIET.maxRequests;
}

function gelijk(a, b) {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i += 1) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}

/** Een kopie van validateSiteKey() in forms/public-api.js, op dezelfde sleutels. */
function siteVan(request, env) {
  const ingediend = request.headers.get('X-Mymmo-Site-Key') || '';
  if (!ingediend) return null;
  const sleutels = String(env?.FORMS_PUBLIC_SITE_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const regel of sleutels) {
    const i = regel.indexOf(':');
    const naam = i === -1 ? null : regel.slice(0, i);
    const sleutel = i === -1 ? regel : regel.slice(i + 1);
    if (sleutel && gelijk(ingediend, sleutel)) return { naam, sleutel };
  }
  return null;
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

export function isProductFeaturesPublicApiPath(pathname) {
  return pathname === PREFIX || pathname.startsWith(`${PREFIX}/`);
}

export async function handleProductFeaturesPublicApi(request, env, ctx, pathname) {
  const site = siteVan(request, env);
  if (!site) return json({ success: false, error: 'Unauthorized' }, 401);
  if (!binnenLimiet(site.sleutel)) return json({ success: false, error: 'Te veel aanvragen.' }, 429, { 'Retry-After': '30' });

  const delen = pathname.slice(PREFIX.length).split('/').filter(Boolean);

  try {
    // ── De keuzelijst in de editor ─────────────────────────────────────────
    if (request.method === 'GET' && delen.length === 1 && delen[0] === 'features') {
      const lijst = (await listPublicaties(env))
        .map((p) => p.data || {})
        .filter((d) => d.id)
        .map((d) => ({ id: d.id, name: d.name, eyebrow: d.eyebrow, category_label: d.category_label, brand: d.brand }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'nl'));
      return json({ success: true, data: lijst });
    }

    // ── De versie op de sites ──────────────────────────────────────────────
    if (request.method === 'GET' && delen.length === 2 && delen[0] === 'features') {
      const p = await getPublicatie(env, delen[1]);
      if (!p) return json({ success: false, error: 'Deze feature staat (nog) niet op de sites.' }, 404);
      const etag = `"${p.hash}"`;
      if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
      return json({ success: true, data: p.data, meta: { published_at: p.published_at } }, 200, { ETag: etag });
    }

    // ── Op welke pagina's ze staan ─────────────────────────────────────────
    if (request.method === 'POST' && delen.length === 1 && delen[0] === 'gebruik') {
      let body = {};
      try { body = await request.json(); } catch { /* leeg */ }
      const host = hostVan(body.site);
      if (!host) return json({ success: false, error: 'Geen geldige site.' }, 400);
      const aantal = await meldGebruik(env, host, body.posts, Boolean(body.volledig));
      return json({ success: true, data: { posts: aantal } });
    }

    return json({ success: false, error: 'Not found' }, 404);
  } catch (err) {
    console.error(LOG_PREFIX, 'publieke API:', err?.message || err);
    return json({ success: false, error: 'Tijdelijk niet beschikbaar' }, 503);
  }
}
