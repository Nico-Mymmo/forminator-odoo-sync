/**
 * Productfeatures -- routes. Alleen JSON, behalve `GET /`.
 *
 * Wie de module heeft, mag lezen; bewerken kan enkel een beheerder of
 * marketing (`mag Bewerken`). De nieuwsbrief leest de bibliotheek NIET via
 * deze routes maar rechtstreeks via lib/store.js (eigen module, eigen rechten).
 */

import {
  FeatureError, listFeatures, getFeature, insertFeature, updateFeature, deleteFeature,
  herorden, normaliseer, controleerOuder, boom, slug,
} from './lib/store.js';
import {
  LOG_PREFIX, CATEGORIEEN, VOORDELEN, DOELGROEPEN, PAKKETTEN, MERKEN, FEATURE_VORMEN, MAX_USPS,
} from './lib/constants.js';
import {
  ASSET_CATEGORY_PREFIXES, isWithinAssetNamespace, canReadAssetPrefix, listDynamicAssetCategories,
} from '../asset-manager/lib/namespace.js';
import { bouwerGegevens } from '../../lib/achtergrond.js';
import { inhoudVanSoort } from '../newsletters/lib/store.js';
import { verschillen, logWijziging, listWijzigingen } from './lib/changelog.js';
import { websitesStand, publiceer, seinSites, listPublicaties } from './lib/websites.js';

const MAX_BEELD = 3 * 1024 * 1024;
const BEELD_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
// Binnen de Asset Manager (map Publiek > productfeatures): daar zie je ze
// ook terug, en de beeldkiezer hieronder toont ze aan iedereen die bewerkt.
const BEELDEN_MAP = 'public/productfeatures/';
const BEELD_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
// Dezelfde publieke oorsprong als de beelden van de nieuwsbrief (R2 via /assets/).
const ASSET_ORIGIN = 'https://link.openvme.be';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * Een achtergrond hoort bij EEN beeld: de PNG die ze maakte. Wordt het beeld
 * vervangen of weggehaald, dan vervalt ze (anders bewaar je keuzes bij een
 * beeld dat er niet meer staat).
 */
function houdAchtergrondBijBeeld(waarden, huidig = {}) {
  const ag = waarden.achtergrond !== undefined ? waarden.achtergrond : huidig.achtergrond;
  const beeld = waarden.image_url !== undefined ? waarden.image_url : huidig.image_url;
  if (ag && ag.url !== beeld) waarden.achtergrond = null;
}

// ── Opruimen ──────────────────────────────────────────────────────────────

// Een adres op onze /assets/ in de map van deze module, waar het ook staat.
const EIGEN_BEELD = /\/assets\/(public\/productfeatures\/[^"'\s?#)]+)/g;
const GRATIE_MS = 24 * 3600 * 1000;

function sleutelsIn(waarde) {
  const uit = new Set();
  for (const m of JSON.stringify(waarde ?? null).matchAll(EIGEN_BEELD)) {
    try { uit.add(decodeURIComponent(m[1])); } catch { uit.add(m[1]); }
  }
  return uit;
}
const sleutelsVan = (f) => sleutelsIn([f?.image_url, f?.achtergrond]);

/**
 * Haalt beelden uit de map van deze module weg die NIEMAND nog gebruikt:
 * geen feature (beeld, opmaak, voorgrond) en geen stukje in een nieuwsbrief
 * (een mail die al vertrok, wijst ernaar). Enkel wat deze module zelf
 * oplaadde (customMetadata.module); wat iemand met de hand in de map zette,
 * blijft. `weg` = net vervangen door een bewaring: meteen weg. De rest pas
 * na een dag: dan kan het geen beeld zijn waaraan iemand nog werkt zonder
 * te bewaren. Faalt het lezen van wat in gebruik is, dan gaat er niets weg.
 */
async function ruimBeeldenOp(env, weg = new Set()) {
  const inGebruik = new Set();
  for (const f of await listFeatures(env)) for (const k of sleutelsVan(f)) inGebruik.add(k);
  for (const c of await inhoudVanSoort(env, 'feature')) for (const k of sleutelsIn(c)) inGebruik.add(k);
  // De versie op de websites wijst naar haar eigen beeld, ook als de feature
  // intussen een ander kreeg.
  for (const p of await listPublicaties(env)) for (const k of sleutelsIn(p.data)) inGebruik.add(k);
  const grens = Date.now() - GRATIE_MS;
  const kandidaten = [];
  let cursor;
  do {
    const lijst = await env.R2_ASSETS.list({ prefix: BEELDEN_MAP, cursor, limit: 1000, include: ['customMetadata'] });
    for (const o of lijst.objects || []) {
      if (o.customMetadata?.module !== 'product_features' || inGebruik.has(o.key)) continue;
      if (weg.has(o.key) || new Date(o.uploaded).getTime() < grens) kandidaten.push(o.key);
    }
    cursor = lijst.truncated ? lijst.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < kandidaten.length; i += 1000) await env.R2_ASSETS.delete(kandidaten.slice(i, i + 1000));
  if (kandidaten.length) console.log(LOG_PREFIX, `${kandidaten.length} ongebruikte beelden opgeruimd`);
  return kandidaten.length;
}

/** Na het antwoord opruimen: een bewaring wacht er niet op en faalt er nooit door. */
function ruimOpNa(ctx, env, weg) {
  const taak = ruimBeeldenOp(env, weg).catch((err) => console.error(LOG_PREFIX, 'opruimen mislukt:', err?.message));
  if (ctx?.waitUntil) ctx.waitUntil(taak);
}

function fout(err) {
  const status = err instanceof FeatureError ? err.status : 500;
  if (status >= 500) console.error(LOG_PREFIX, err);
  return json({ success: false, error: err?.message || 'Onbekende fout' }, status);
}

async function leesBody(request) {
  try { return await request.json(); } catch { return {}; }
}

/**
 * Wie de bibliotheek mag bewerken: beheerders, marketing, en wie hieronder
 * staat. Een eigen lijst en geen rol: de rol marketing geeft ook rechten op
 * handtekeningen, nieuwsbrieven en de cijfers in Marketing (Niels, 2026-10-20).
 */
const EXTRA_BEWERKERS = new Set(['niels@mymmo.com']);
const magBewerken = (user) => user?.role === 'admin' || user?.role === 'marketing_signature'
  || EXTRA_BEWERKERS.has(String(user?.email || '').toLowerCase());
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

  /**
   * Op de websites: per feature of ze verstuurd is, of de sites achterlopen
   * (en wat er verschilt), en op welke pagina's ze staat. Zie lib/websites.js.
   */
  'GET /api/websites': async ({ env }) => {
    try {
      return json({ success: true, data: await websitesStand(env, await listFeatures(env)) });
    } catch (err) { return fout(err); }
  },

  /**
   * "Naar de sites sturen": de huidige versie wordt de versie op ELKE pagina
   * waar de feature staat. De sites krijgen daarna een seintje (zonder
   * inhoud) en halen ze zelf op.
   */
  'POST /api/features/:id/publiceer': async ({ env, ctx, user, params }) => {
    try {
      eisBewerken(user);
      const f = await getFeature(env, params.id);
      if (!f) throw new FeatureError('Feature niet gevonden.', 404);
      if (!f.name) throw new FeatureError('Geef de feature eerst een titel.');
      await publiceer(env, f, user);
      const sein = seinSites(env, f.id).catch((err) => console.error(LOG_PREFIX, 'seintje:', err?.message));
      if (ctx?.waitUntil) ctx.waitUntil(sein);
      const stand = await websitesStand(env, [f]);
      return json({ success: true, data: stand[f.id] });
    } catch (err) { return fout(err); }
  },

  /** Het logboek van een feature: wie paste wat aan, nieuwste eerst. */
  'GET /api/features/:id/wijzigingen': async ({ env, params }) => {
    try {
      return json({ success: true, data: await listWijzigingen(env, params.id) });
    } catch (err) { return fout(err); }
  },

  'POST /api/features': async ({ env, user, request }) => {
    try {
      eisBewerken(user);
      const waarden = normaliseer(await leesBody(request), { nieuw: true });
      waarden.parent_id = await controleerOuder(env, null, waarden.parent_id);
      houdAchtergrondBijBeeld(waarden);
      if (waarden.position === undefined) {
        const broers = (await listFeatures(env)).filter((f) => (f.parent_id || null) === (waarden.parent_id || null));
        waarden.position = broers.reduce((m, f) => Math.max(m, f.position || 0), 0) + 10;
      }
      const nieuw = await insertFeature(env, waarden, user.id);
      await logWijziging(env, { feature: nieuw, action: 'aangemaakt', user });
      return json({ success: true, data: nieuw }, 201);
    } catch (err) { return fout(err); }
  },

  'PUT /api/features/:id': async ({ env, ctx, user, params, request }) => {
    try {
      eisBewerken(user);
      const f = await getFeature(env, params.id);
      if (!f) throw new FeatureError('Feature niet gevonden.', 404);
      const waarden = normaliseer(await leesBody(request));
      if (waarden.parent_id !== undefined) waarden.parent_id = await controleerOuder(env, f.id, waarden.parent_id);
      if (waarden.name === '') throw new FeatureError('De titel mag niet leeg zijn.');
      houdAchtergrondBijBeeld(waarden, f);
      const bij = await updateFeature(env, f.id, waarden, user.id);
      const nogNodig = sleutelsVan(bij);
      ruimOpNa(ctx, env, new Set([...sleutelsVan(f)].filter((k) => !nogNodig.has(k))));
      const namen = new Map((await listFeatures(env)).map((x) => [x.id, x.name]));
      const wat = verschillen(f, waarden, namen);
      if (wat.length) await logWijziging(env, { feature: bij, action: 'gewijzigd', changes: wat, user });
      return json({ success: true, data: bij });
    } catch (err) { return fout(err); }
  },

  /** Volgorde van de kinderen van één ouder (of van de hoofdfeatures): de ids in de nieuwe volgorde. */
  'POST /api/features/order': async ({ env, user, request }) => {
    try {
      eisBewerken(user);
      const b = await leesBody(request);
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String);
      if (!ids.length) throw new FeatureError('Geen volgorde ontvangen.');
      const voor = new Map((await listFeatures(env)).map((x) => [x.id, x]));
      const oudeIndex = new Map([...ids].sort((a, b) => ((voor.get(a)?.position || 0) - (voor.get(b)?.position || 0)) || String(voor.get(a)?.name || '').localeCompare(String(voor.get(b)?.name || ''), 'nl')).map((id, i) => [id, i]));
      await herorden(env, ids);
      // Enkel wie echt van plaats veranderde, komt in het logboek.
      for (const [i, id] of ids.entries()) {
        const f = voor.get(id);
        if (f && oudeIndex.get(id) !== i) {
          await logWijziging(env, { feature: f, action: 'volgorde', changes: [{ veld: 'position', label: 'Plaats', van: String(oudeIndex.get(id) + 1), naar: String(i + 1) }], user });
        }
      }
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  'DELETE /api/features/:id': async ({ env, ctx, user, params }) => {
    try {
      eisBewerken(user);
      const f = await getFeature(env, params.id);
      if (!f) throw new FeatureError('Feature niet gevonden.', 404);
      await deleteFeature(env, f.id);
      ruimOpNa(ctx, env, sleutelsVan(f));
      await logWijziging(env, { feature: f, action: 'weggehaald', user });
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  /** De achtergrondbouwer: merkkleuren, vormen van het vlak en de swirls (brand/swirls/). */
  // Ook voor wie enkel leest: het voorbeeld in andere vormen tekent ermee.
  'GET /api/achtergrond': async ({ env }) => {
    try {
      return json({ success: true, data: await bouwerGegevens(env) });
    } catch (err) { return fout(err); }
  },

  /**
   * De beeldkiezer: mappen en beelden uit de Asset Manager. De rechten zijn
   * die van de Asset Manager (namespace.js), met EEN uitzondering: de eigen
   * map van de productfeatures mag iedereen die bewerkt altijd zien -- daar
   * staan de beelden die hij hier zelf opgeladen heeft.
   */
  'GET /api/beelden': async ({ env, user, request }) => {
    try {
      eisBewerken(user);
      const prefix = new URL(request.url).searchParams.get('prefix') || '';
      if (!prefix) {
        const dynamisch = await listDynamicAssetCategories(env);
        const anderen = [
          ...ASSET_CATEGORY_PREFIXES.map((p) => ({ prefix: p, name: p === 'public/' ? 'Publiek' : p.replace(/\/$/, '') })),
          ...dynamisch.map((c) => ({ prefix: c.prefix, name: c.label || c.prefix.replace(/\/$/, '') })),
          { prefix: `users/${user.id}/`, name: 'Mijn bestanden' },
        ].filter((f) => canReadAssetPrefix(user, f.prefix));
        return json({ success: true, data: { prefix: '', folders: [{ prefix: BEELDEN_MAP, name: 'Productfeatures' }, ...anderen], files: [] } });
      }
      const eigen = prefix.startsWith(BEELDEN_MAP) && !prefix.includes('..');
      if (!eigen && (!isWithinAssetNamespace(prefix) || !canReadAssetPrefix(user, prefix))) {
        throw new FeatureError('Geen toegang tot deze map in de Asset Manager.', 403);
      }
      const lijst = await env.R2_ASSETS.list({ prefix, delimiter: '/', limit: 500 });
      const files = (lijst.objects || [])
        .filter((o) => String(o.httpMetadata?.contentType || '').startsWith('image/') || BEELD_EXT.test(o.key))
        .sort((a, b) => String(b.uploaded || '').localeCompare(String(a.uploaded || '')))
        .map((o) => ({ key: o.key, name: o.key.split('/').pop(), url: `${ASSET_ORIGIN}/assets/${o.key}` }));
      const folders = (lijst.delimitedPrefixes || []).map((p) => ({ prefix: p, name: p.slice(prefix.length).replace(/\/$/, '') }));
      return json({ success: true, data: { prefix, folders, files } });
    } catch (err) { return fout(err); }
  },

  /**
   * Een beeld bij een feature: naar R2 (in de Asset Manager, map Publiek >
   * productfeatures), publiek via /assets/. De naam van de feature zit in de
   * bestandsnaam, zodat je het daar terugvindt; daarachter een hash van de
   * BYTES, zodat hetzelfde beeld nooit twee bestanden wordt. Een gewijzigd
   * beeld heeft andere bytes, dus een ander adres: geen oude versie uit een
   * cache (public/ wordt een jaar bewaard).
   */
  'POST /api/upload': async ({ env, user, request }) => {
    try {
      eisBewerken(user);
      const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
      const ext = BEELD_TYPES[type];
      if (!ext) throw new FeatureError('Enkel PNG, JPEG, GIF of WebP.');
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > MAX_BEELD) throw new FeatureError('Het beeld is leeg of groter dan 3 MB.');
      const naam = new URL(request.url).searchParams.get('naam');
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].slice(0, 8)
        .map((b) => b.toString(16).padStart(2, '0')).join('');
      const key = `${BEELDEN_MAP}${slug(naam)}-${hash}.${ext}`;
      // Altijd (opnieuw) wegschrijven: dat zet de datum van het bestand op nu,
      // zodat het opruimen het niet meteen als oud en ongebruikt ziet.
      await env.R2_ASSETS.put(key, bytes, {
        httpMetadata: { contentType: type },
        customMetadata: { uploadedBy: user.id, module: 'product_features', uploadedAt: new Date().toISOString() },
      });
      return json({ success: true, data: { url: `${ASSET_ORIGIN}/assets/${key}` } }, 201);
    } catch (err) { return fout(err); }
  },
};
