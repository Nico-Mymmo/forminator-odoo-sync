/**
 * Productfeatures op de websites: welke versie er staat, en op welke pagina's.
 *
 * Een feature komt NIET vanzelf op de sites. "Naar de sites sturen" bewaart
 * de publieke vorm van dat moment (product_feature_publicaties); het blok
 * "Mymmo productfeature" in WordPress leest enkel die versie. Wie de feature
 * daarna aanpast, ziet in de OM dat de sites achterlopen en wat er verschilt,
 * en stuurt opnieuw. Een versie per feature, voor alle pagina's samen
 * (beslissing Nico, 2026-10-22).
 *
 * Waarom bewaren en niet live: zo komt een halve aanpassing nooit per ongeluk
 * op de sites. Google ziet de tekst gewoon: de site schrijft hem server-side
 * in de pagina.
 *
 * Op welke pagina's een feature staat, meldt de plugin zelf
 * (product_feature_gebruik): bij elke bewaring van een pagina, en eens per dag
 * alles.
 *
 * Tabellen in D1 om-core (0010_product_features_websites.sql).
 */

import { getCoreDb } from '../../../lib/core-db.js';
import { LOG_PREFIX, CATEGORIEEN } from './constants.js';

const PUBLICATIES = 'product_feature_publicaties';
const GEBRUIK = 'product_feature_gebruik';

/** Wat de sites te zien krijgen, in de volgorde van het formulier. */
const VELDEN = [
  ['eyebrow', 'Label'],
  ['name', 'Titel'],
  ['header', 'Header'],
  ['summary', 'Korte uitleg'],
  ['why', 'Waarom we dit gemaakt hebben'],
  ['usps', 'USP\'s'],
  ['url', 'Link'],
  ['image_url', 'Beeld'],
  ['beelden', 'Beeld in andere vormen'],
];

/**
 * De ENIGE vorm die een site ooit ziet. Geen pakket, geen doelgroep, geen
 * wie-paste-aan: de sitesleutel is niet persoonsgebonden, dus alles wat hier
 * staat, staat ook bij wie de sleutel van een site heeft.
 */
export function toPubliekeFeature(f) {
  const cat = CATEGORIEEN.find((c) => c.key === f.category);
  const varianten = f.achtergrond && f.achtergrond.varianten && typeof f.achtergrond.varianten === 'object'
    ? Object.fromEntries(Object.entries(f.achtergrond.varianten).filter(([, v]) => v))
    : {};
  const uit = {
    id: f.id,
    code: f.code || '',
    name: f.name || '',
    eyebrow: f.eyebrow || '',
    summary: f.summary || '',
    why: f.why || '',
    usps: Array.isArray(f.usps) ? f.usps.filter(Boolean) : [],
    url: f.url || '',
    image_url: f.image_url || '',
    beelden: varianten,
    category: f.category || '',
    category_label: cat ? cat.label : '',
    brand: f.brand || 'openvme',
  };
  // De header (wat extern komt) enkel als hij ingevuld is: zo blijft de hash
  // van een eerder verstuurde versie zonder header dezelfde.
  if (String(f.header || '').trim()) uit.header = String(f.header).trim();
  return uit;
}

/** JSON met gesorteerde sleutels: anders telt een andere volgorde als wijziging. */
function vast(v) {
  if (Array.isArray(v)) return '[' + v.map(vast).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + vast(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}

export async function hashVan(data) {
  const bytes = new TextEncoder().encode(vast(data));
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Welke velden verschillen tussen de versie op de sites en de huidige, leesbaar. */
export function verschilMetSites(opDeSites, huidig) {
  if (!opDeSites) return [];
  return VELDEN.filter(([k]) => vast(opDeSites[k] ?? '') !== vast(huidig[k] ?? '')).map(([, label]) => label);
}

function check(error, wat) {
  if (error) throw new Error(`${wat}: ${error.message}`);
}

export async function listPublicaties(env) {
  const { data, error } = await getCoreDb(env).from(PUBLICATIES).select('*');
  check(error, 'Publicaties lezen');
  return data || [];
}

export async function getPublicatie(env, featureId) {
  const { data, error } = await getCoreDb(env).from(PUBLICATIES).select('*').eq('feature_id', featureId).maybeSingle();
  check(error, 'Publicatie lezen');
  return data || null;
}

/** De huidige versie naar de sites: overschrijft de vorige. */
export async function publiceer(env, feature, user) {
  const data = toPubliekeFeature(feature);
  const rij = {
    feature_id: feature.id,
    data,
    hash: await hashVan(data),
    published_at: new Date().toISOString(),
    published_by: user?.id || null,
    published_by_name: String(user?.full_name || user?.email || '').slice(0, 200),
  };
  const { error } = await getCoreDb(env).from(PUBLICATIES).upsert(rij, { onConflict: 'feature_id' });
  check(error, 'Naar de sites sturen');
  return rij;
}

/** Alle pagina's met een feature, per feature. */
export async function listGebruik(env) {
  const { data, error } = await getCoreDb(env).from(GEBRUIK).select('*').order('site').order('titel');
  check(error, 'Gebruik lezen');
  return data || [];
}

/**
 * Per feature: staat ze op de sites, loopt ze achter, wat verschilt, op welke
 * pagina's. `features` = de rijen uit product_features.
 */
export async function websitesStand(env, features) {
  const [pubs, gebruik] = await Promise.all([listPublicaties(env), listGebruik(env)]);
  const perFeature = new Map(pubs.map((p) => [p.feature_id, p]));
  const paginas = new Map();
  for (const g of gebruik) {
    if (!paginas.has(g.feature_id)) paginas.set(g.feature_id, []);
    paginas.get(g.feature_id).push({ site: g.site, post_id: g.post_id, url: g.url, titel: g.titel, status: g.status, seen_at: g.seen_at });
  }
  const uit = {};
  for (const f of features) {
    const p = perFeature.get(f.id);
    const huidig = toPubliekeFeature(f);
    const verschil = p ? verschilMetSites(p.data || {}, huidig) : [];
    uit[f.id] = {
      verstuurd: Boolean(p),
      published_at: p ? p.published_at : null,
      published_by_name: p ? p.published_by_name : '',
      achter: Boolean(p) && (p.hash !== await hashVan(huidig)),
      verschil,
      paginas: paginas.get(f.id) || [],
    };
  }
  return uit;
}

/** Een hostnaam zoals een site ze meestuurt: enkel letters, cijfers, punt en streepje. */
export function hostVan(waarde) {
  let s = String(waarde || '').trim().toLowerCase();
  try { if (/^https?:\/\//.test(s)) s = new URL(s).hostname; } catch { return ''; }
  return /^[a-z0-9.-]{3,120}$/.test(s) ? s : '';
}

const veiligeUrl = (v) => {
  const s = String(v || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s.slice(0, 1000) : '';
};

/**
 * Wat een site meldt: per pagina welke features erop staan. Een pagina zonder
 * features haalt haar oude rijen weg. `volledig` = de site stuurt ALLE pagina's
 * met een feature; wat er dan niet bij staat, staat er niet meer op.
 */
export async function meldGebruik(env, site, posten, volledig = false) {
  const db = getCoreDb(env);
  const nu = new Date().toISOString();
  const lijst = (Array.isArray(posten) ? posten : []).slice(0, 2000);
  const gemeld = new Set();
  for (const p of lijst) {
    const postId = Number(p?.post_id);
    if (!Number.isInteger(postId) || postId <= 0) continue;
    gemeld.add(postId);
    const ids = [...new Set((Array.isArray(p.features) ? p.features : []).map((x) => String(x || '').trim()).filter(Boolean))].slice(0, 50);
    const { error: wegFout } = await db.from(GEBRUIK).delete().eq('site', site).eq('post_id', postId);
    check(wegFout, 'Gebruik bijwerken');
    if (!ids.length) continue;
    const rijen = ids.map((featureId) => ({
      site, post_id: postId, feature_id: featureId,
      url: veiligeUrl(p.url), titel: String(p.titel || '').slice(0, 200),
      status: ['publish', 'draft', 'private', 'pending', 'future'].includes(p.status) ? p.status : 'publish',
      seen_at: nu,
    }));
    const { error } = await db.from(GEBRUIK).upsert(rijen, { onConflict: 'site,post_id,feature_id' });
    check(error, 'Gebruik bewaren');
  }
  if (volledig) {
    const { data, error } = await db.from(GEBRUIK).select('post_id').eq('site', site);
    check(error, 'Gebruik lezen');
    const oud = [...new Set((data || []).map((r) => r.post_id))].filter((id) => !gemeld.has(id));
    for (const postId of oud) {
      const { error: e } = await db.from(GEBRUIK).delete().eq('site', site).eq('post_id', postId);
      check(e, 'Gebruik opruimen');
    }
  }
  return gemeld.size;
}

/**
 * ELKE site een seintje geven dat er een nieuwe versie is, niet enkel de sites
 * waar de feature al op een bewaarde pagina staat: wie het blok net op een
 * pagina zette en nog niet bewaarde, zou anders een kwartier de oude versie
 * zien (2026-10-22). Welke sites: die ooit een blok meldden, plus de sites
 * van de formulieren (FORMS_PUBLIC_ORIGINS) en de afspraaklinks
 * (BOOKING_LINK_SITES). Het seintje draagt geen inhoud: de site haalt zelf op
 * wat hier bewaard staat. Een site zonder deze feature doet er niets mee.
 * Mislukt het, dan neemt de site de nieuwe versie hoogstens een kwartier
 * later (de bewaartijd op de site).
 */
export async function seinSites(env, featureId) {
  const { data } = await getCoreDb(env).from(GEBRUIK).select('site');
  const uitConfig = [env?.FORMS_PUBLIC_ORIGINS, env?.BOOKING_LINK_SITES]
    .flatMap((v) => String(v || '').split(','))
    .map((r) => r.trim().replace(/^[a-z0-9-]+:(?=https?:\/\/)/i, ''));
  const hosts = [...new Set([...(data || []).map((r) => r.site), ...uitConfig]
    .map((h) => hostVan(h).replace(/^www\./, '')).filter(Boolean))];
  await Promise.all(hosts.map(async (host) => {
    try {
      const res = await fetch(`https://${host}/wp-json/mymmo-cards/v1/productfeature/ververs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: featureId }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) console.warn(LOG_PREFIX, `seintje naar ${host}: ${res.status}`);
    } catch (err) {
      console.warn(LOG_PREFIX, `seintje naar ${host} mislukt:`, err?.message);
    }
  }));
  return hosts;
}
