/**
 * Koppelingen — publieke formulier-API
 *
 * Het contract met de WordPress-plugin mymmo-forms. Geen sessie, wel een
 * sitesleutel in een header. Twee routes en verder niets:
 *
 *   GET  /forminator-v2/public/v1/forms                 → lijst (shortcode-bouwer)
 *   GET  /forminator-v2/public/v1/forms/{slug}          → schema
 *   POST /forminator-v2/public/v1/forms/{slug}/submit   → inzending
 *
 * Er is bewust GEEN route die inzendingen teruggeeft, en geen route die iets
 * anders wijzigt dan een nieuwe inzending aanmaken. Een sitesleutel staat op
 * een webserver waar meer mensen bij kunnen dan bij de OM; ze mag dus nooit
 * meer kunnen dan wat een bezoeker van die site sowieso al kan.
 *
 * ETAG-REGEL: de ETag komt uit het versienummer van het formulier, nooit uit
 * een tijdstip. Zie meta.generated_at in de events-API: een timestamp in de
 * ETag betekent dat If-None-Match nooit matcht en elke verversing de volledige
 * body ophaalt terwijl er niets gewijzigd is.
 */

import { getFormBySlug, listPublishedForms } from './database.js';
import { getIntegrationById } from '../database.js';
import { toPublicFormPayload, toPublicFormListItem } from './schema.js';
import { submitFormEntry } from './submit.js';

const PUBLIC_PREFIX = '/forminator-v2/public/v1/forms';
const LOG_PREFIX = '[forms-public]';

// Per isolate, niet globaal. Voor het doel (iemand die de API platlegt) is dat
// genoeg, en het scheelt een KV-write per verzoek — exact de afweging die het
// leespad van de events-API ook maakt.
const RATE_LIMIT_READ   = { windowSeconds: 60, maxRequests: 240 };
const RATE_LIMIT_SUBMIT = { windowSeconds: 60, maxRequests: 20 };

// Twee kleine kopieën van helpers die ook in event-operations-v2/lib/cache.js
// staan. Bewust een kopie en geen import: die zou Koppelingen afhankelijk maken
// van de events-module. Zelfde afweging als bij de twee renderTemplate()-
// implementaties in mini-apps (zie de doc-comment daar).
const rateMemo = new Map();

function checkRateLimitLocal(identifier, { windowSeconds, maxRequests }) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `${identifier}:${bucket}`;

  if (rateMemo.size > 200) {
    for (const bestaande of [...rateMemo.keys()]) {
      if (!bestaande.endsWith(`:${bucket}`)) rateMemo.delete(bestaande);
    }
  }

  const current = rateMemo.get(key) || 0;
  if (current >= maxRequests) {
    const nextWindowMs = (bucket + 1) * windowSeconds * 1000;
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((nextWindowMs - Date.now()) / 1000)) };
  }

  rateMemo.set(key, current + 1);
  return { allowed: true, retryAfter: 0 };
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

/**
 * De sitesleutel valideren én de sitenaam eruit halen.
 *
 * FORMS_PUBLIC_SITE_KEYS is komma-gescheiden, elke sleutel optioneel met een
 * sitenaam ervoor:
 *
 *   "openvme:abc123,syndicoach:def456"
 *
 * De naam komt als meta_site mee in de payload, zodat een koppeling kan zien
 * van welke site een inzending komt zonder dat de site dat zelf mag beweren —
 * een queryparameter zou een site laten liegen over haar herkomst.
 *
 * Zonder ingestelde secret is de API DICHT, niet open.
 */
function validateSiteKey(request, env) {
  const submitted = request.headers.get('X-Mymmo-Site-Key') || '';
  if (!submitted) return null;

  const configured = String(env?.FORMS_PUBLIC_SITE_KEYS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    console.warn(`${LOG_PREFIX} FORMS_PUBLIC_SITE_KEYS is niet ingesteld; publieke formulier-API geweigerd`);
    return null;
  }

  for (const entry of configured) {
    const splitIndex = entry.indexOf(':');
    const naam = splitIndex === -1 ? null : entry.slice(0, splitIndex);
    const sleutel = splitIndex === -1 ? entry : entry.slice(splitIndex + 1);
    if (sleutel && timingSafeEqual(submitted, sleutel)) {
      return { site: naam, key: sleutel };
    }
  }

  return null;
}

/**
 * CORS. De plugin praat server-naar-server en heeft dit niet nodig; het staat
 * er voor een browser-embed later. Bewust GEEN wildcard-origin in combinatie
 * met credentials, en de headers gaan nooit mee de cache in.
 */
function corsHeaders(request, env) {
  const toegestaan = String(env?.FORMS_PUBLIC_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origin = request.headers.get('Origin') || '';

  return {
    'Access-Control-Allow-Origin': toegestaan.includes(origin) ? origin : (toegestaan[0] || 'null'),
    'Access-Control-Allow-Headers': 'Content-Type, X-Mymmo-Site-Key, If-None-Match',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body, status, request, env, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

/**
 * De ETag: alleen de identiteit en de versie van het formulier. Twee
 * antwoorden met dezelfde slug en dezelfde versie ZIJN identiek, dus mag dit
 * een sterke ETag zijn.
 */
function etagForForm(form) {
  return `"f${form.id}-v${form.version}"`;
}

export function isFormsPublicApiPath(pathname) {
  // Ook het pad zonder slug (met of zonder afsluitende slash): dat is de lijst.
  return pathname === PUBLIC_PREFIX || pathname.startsWith(`${PUBLIC_PREFIX}/`);
}

export async function handleFormsPublicApi(request, env, ctx, pathname) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const rest = pathname.slice(PUBLIC_PREFIX.length).replace(/^\//, '');
  const segmenten = rest.split('/').filter(Boolean);
  const slug = segmenten[0] || '';
  const actie = segmenten[1] || '';

  if (segmenten.length > 2 || (actie && actie !== 'submit')) {
    return json({ success: false, error: 'Not found' }, 404, request, env);
  }

  const site = validateSiteKey(request, env);
  if (!site) {
    return json({ success: false, error: 'Unauthorized' }, 401, request, env);
  }

  // ── De lijst: geen slug ────────────────────────────────────────────────────
  if (!slug) {
    if (request.method !== 'GET') {
      return json({ success: false, error: 'Method not allowed' }, 405, request, env);
    }
    const lijstLimiet = checkRateLimitLocal(`list:${site.key}`, RATE_LIMIT_READ);
    if (!lijstLimiet.allowed) {
      return json(
        { success: false, error: 'Te veel aanvragen. Probeer het zo meteen opnieuw.' },
        429, request, env,
        { 'Retry-After': String(lijstLimiet.retryAfter) }
      );
    }
    return handleLijst(request, env);
  }

  const isSubmit = actie === 'submit';
  if (isSubmit && request.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405, request, env);
  }
  if (!isSubmit && request.method !== 'GET') {
    return json({ success: false, error: 'Method not allowed' }, 405, request, env);
  }

  const limiet = checkRateLimitLocal(
    `${isSubmit ? 'submit' : 'read'}:${site.key}:${slug}`,
    isSubmit ? RATE_LIMIT_SUBMIT : RATE_LIMIT_READ
  );
  if (!limiet.allowed) {
    return json(
      { success: false, error: 'Te veel aanvragen. Probeer het zo meteen opnieuw.' },
      429, request, env,
      { 'Retry-After': String(limiet.retryAfter) }
    );
  }

  let bundle;
  try {
    bundle = await getFormBySlug(env, slug);
  } catch (err) {
    console.error(`${LOG_PREFIX} ophalen mislukt voor slug "${slug}":`, err.message);
    return json({ success: false, error: 'Tijdelijk niet beschikbaar' }, 503, request, env);
  }

  // Concept én onbestaand geven allebei 404: zie de toelichting bij
  // getFormBySlug().
  if (!bundle) {
    return json({ success: false, error: 'Formulier niet gevonden' }, 404, request, env);
  }

  return isSubmit
    ? handleSubmit(request, env, bundle, site)
    : handleSchema(request, env, bundle);
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * De lijst met gepubliceerde formulieren, voor de shortcode-bouwer in de
 * plugin-instellingen.
 *
 * Concepten staan er niet bij: die geven op de website toch niets, dus ze in
 * een keuzelijst zetten is een valstrik.
 */
async function handleLijst(request, env) {
  let rijen;
  try {
    rijen = await listPublishedForms(env);
  } catch (err) {
    console.error(`${LOG_PREFIX} oplijsten mislukt:`, err.message);
    return json({ success: false, error: 'Tijdelijk niet beschikbaar' }, 503, request, env);
  }

  const forms = rijen.map(({ form, fieldCount }) => toPublicFormListItem(form, fieldCount));

  // De ETag uit slug+versie van elke rij: verandert er iets aan een formulier,
  // dan verandert zijn versie, en dus deze ETag. Nooit een tijdstip erin --
  // zie de toelichting bovenaan dit bestand.
  const etag = `"lijst-${forms.length}-${forms.map((f) => `${f.slug}.${f.version}`).join('~')}"`;

  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=60', ...corsHeaders(request, env) },
    });
  }

  return json({ success: true, data: { forms } }, 200, request, env,
    { ETag: etag, 'Cache-Control': 'public, max-age=60' });
}

function handleSchema(request, env, { form, fields }) {
  const etag = etagForForm(form);

  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'public, max-age=60', ...corsHeaders(request, env) },
    });
  }

  return json(
    { success: true, data: toPublicFormPayload(form, fields) },
    200, request, env,
    { ETag: etag, 'Cache-Control': 'public, max-age=60' }
  );
}

async function handleSubmit(request, env, { form, fields }, site) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ success: false, error: 'Ongeldige aanvraag' }, 400, request, env);
  }

  const integration = await getIntegrationById(env, form.integration_id);
  if (!integration) {
    // Kan alleen als iemand de koppeling verwijderde terwijl het formulier nog
    // bestond. De FK staat op CASCADE, dus dit hoort onmogelijk te zijn — maar
    // een 500 met een leesbare log is beter dan een crash in de pipeline.
    console.error(`${LOG_PREFIX} formulier ${form.id} verwijst naar een onbestaande koppeling ${form.integration_id}`);
    return json({ success: false, error: 'Tijdelijk niet beschikbaar' }, 503, request, env);
  }

  // De site komt uit de SLEUTEL, niet uit de body: zo kan een site niet beweren
  // dat ze een andere is. Wat de plugin zelf meestuurt (pagina-URL, UTM's) mag
  // ze wel bepalen — dat is per definitie haar eigen context.
  const meta = { ...(body?.meta && typeof body.meta === 'object' ? body.meta : {}) };
  if (site.site) meta.site = site.site;
  if (!meta.submitted_at) meta.submitted_at = new Date().toISOString();

  try {
    const { response } = await submitFormEntry(env, {
      integration, form, fields,
      body: { ...body, meta },
      request,
    });

    // De pipeline-respons bevat submission_id en status. Die zijn nuttig in de
    // logs van de plugin, maar de bezoeker krijgt alleen te zien of het lukte.
    const uitkomst = await response.json().catch(() => ({}));
    const gelukt = response.ok && uitkomst?.success !== false;

    return json(
      gelukt
        ? { success: true, data: { status: uitkomst?.data?.status || 'received' } }
        : { success: false, error: uitkomst?.error || 'De inzending kon niet verwerkt worden.' },
      gelukt ? 200 : (response.status === 422 ? 422 : 502),
      request, env
    );
  } catch (err) {
    console.error(`${LOG_PREFIX} inzending mislukt voor "${form.slug}":`, err.message);
    return json({ success: false, error: 'De inzending kon niet verwerkt worden.' }, 502, request, env);
  }
}
