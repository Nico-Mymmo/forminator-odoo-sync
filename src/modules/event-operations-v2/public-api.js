/**
 * Event Operations v2 — Publieke API
 *
 * Contract met de WordPress-plugin. Geen sessie, wel een sitesleutel.
 *
 * HARDE REGEL: elke event-respons komt uit toPublicEventDto(). Die
 * functie is de enige garantie dat x_studio_webinar_link nooit publiek
 * wordt — de link is voor ingeschrevenen en gaat alleen per mail.
 * Stel hier NOOIT zelf een object samen.
 */

import {
  LOG_PREFIX,
  PAGINATION,
  CACHE_TTL,
  PUBLIC_RATE_LIMIT,
  REGISTER_RATE_LIMIT,
  PUBLIC_SHAPE_VERSION,
  EVENT_FORMAT,
  PUBLIC_VISIBLE_STATES,
  EVENT_BRANDS
} from './constants.js';
import { toPublicEventDto, EVENT_FIELDS } from './odoo-contract.js';
import { listEvents, getEvent, listEventTypes } from './lib/events-service.js';
import { createRegistration } from './lib/registrations-service.js';
import { registrationStatus } from './odoo-contract.js';
import { weakEtag, checkRateLimit } from './lib/cache.js';
import { sanitizePublicHtml, summarize, buildMetaDescription } from './lib/blocks.js';

const PUBLIC_PREFIX = '/events-v2/public/v1';

// ─── Sitesleutel ──────────────────────────────────────────────────────────────

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
 * De sitesleutel valideren EN het merk eruit halen.
 *
 * EVENTS_PUBLIC_SITE_KEYS is een komma-gescheiden lijst waarin elke sleutel
 * optioneel met een merk geprefixt is:
 *
 *   "openvme:abc123,syndicoach:def456"
 *
 * Het merk bepaalt welke events die site mag zien. Zo kan een site nooit de
 * events van het andere merk opvragen — dat zou wel kunnen als het merk een
 * queryparameter was.
 *
 * Een sleutel zonder prefix ("abc123") krijgt geen merkfilter en ziet alles.
 * Handig voor een dev-sleutel.
 *
 * @returns {{ key: string, brand: string|null }|null}
 */
function validateSiteKey(request, env) {
  const submitted = request.headers.get('X-Mymmo-Site-Key') || '';
  if (!submitted) return null;

  const configured = String(env?.EVENTS_PUBLIC_SITE_KEYS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  if (configured.length === 0) {
    console.warn(`${LOG_PREFIX} EVENTS_PUBLIC_SITE_KEYS is niet ingesteld; publieke API geweigerd`);
    return null;
  }

  for (const entry of configured) {
    const separator = entry.indexOf(':');
    const brand = separator > 0 ? entry.slice(0, separator).trim().toLowerCase() : null;
    const key = separator > 0 ? entry.slice(separator + 1).trim() : entry;

    if (key !== '' && timingSafeEqual(submitted, key)) {
      return { key, brand: brand && EVENT_BRANDS.includes(brand) ? brand : null };
    }
  }
  return null;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env?.EVENTS_PUBLIC_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter((o) => o !== '');

  const headers = {
    'Vary': 'Origin, X-Mymmo-Site-Key, Accept-Encoding'
  };

  if (origin && allowed.includes(origin.replace(/\/$/, ''))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Mymmo-Site-Key, If-None-Match';
    headers['Access-Control-Max-Age'] = '86400';
  }

  return headers;
}

// ─── Responses ────────────────────────────────────────────────────────────────

function errorResponse(message, status, request, env, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
      ...extraHeaders
    }
  });
}

/**
 * JSON met ETag en publieke cache-headers. Bij een matchende
 * If-None-Match wordt het een 304 — dat maakt het pollen door de
 * WordPress-plugin goedkoop.
 */
async function cachedJsonResponse(payload, request, env, { ttl, cacheHit }) {
  const body = JSON.stringify(payload);
  const etag = await weakEtag(body);

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${ttl}, stale-while-revalidate=${ttl * 5}`,
    'ETag': etag,
    'X-Cache': cacheHit ? 'hit' : 'miss',
    ...corsHeaders(request, env)
  };

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim() === etag)) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, { status: 200, headers });
}

function meta(count, brand = null) {
  return {
    shape_version: PUBLIC_SHAPE_VERSION,
    count,
    brand,
    generated_at: new Date().toISOString()
  };
}

// ─── Verrijking ───────────────────────────────────────────────────────────────

/**
 * Publieke DTO uit een ruw Odoo-record, met de aanvullingen die de
 * website nodig heeft: opgeschoonde HTML, en een samenvatting die nooit
 * leeg is zodat een kaart altijd tekst heeft.
 */
function toPublicPayload(record, { registrationCount, detail }) {
  const dto = toPublicEventDto(record, { registrationCount, detail });

  if (detail) {
    dto.body_html = sanitizePublicHtml(dto.body_html);
    dto.seo = {
      title: dto.seo?.title || dto.title,
      description: buildMetaDescription({
        seo: dto.seo,
        summary: dto.summary,
        body_html: dto.body_html
      })
    };
    dto.recap.body_html = sanitizePublicHtml(dto.recap.body_html);
  }

  if (!dto.summary) {
    const source = detail ? dto.body_html : record[EVENT_FIELDS.BODY];
    dto.summary = summarize(sanitizePublicHtml(source), 200) || null;
  }

  return dto;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleEventList(request, env, brand) {
  const url = new URL(request.url);
  const p = url.searchParams;

  const requestedLimit = Number.parseInt(p.get('limit'), 10);
  const limit = Math.min(
    PAGINATION.PUBLIC_MAX_LIMIT,
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? requestedLimit
      : PAGINATION.PUBLIC_DEFAULT_LIMIT
  );

  const includePast = p.get('include_past') === '1';
  const format = p.get('format');

  // Gepubliceerd EN afgerond: een afgelopen event houdt zijn pagina, want
  // daar hangt de recap aan. Zie PUBLIC_VISIBLE_STATES.
  const filters = {
    publication_states: PUBLIC_VISIBLE_STATES,
    brand
  };
  // Komma-lijst voor de type-chips op de publieke kalender/lijst (meerdere
  // types tegelijk aan); een los getal blijft ook gewoon werken.
  if (p.get('type')) {
    const typeIds = p.get('type').split(',').map((v) => Number.parseInt(v.trim(), 10)).filter(Number.isInteger);
    if (typeIds.length === 1) {
      filters.event_type_id = typeIds[0];
    } else if (typeIds.length > 1) {
      filters.event_type_id = typeIds;
    }
  }
  if (format && Object.values(EVENT_FORMAT).includes(format)) filters.format = format;
  if (p.get('from')) filters.from = p.get('from');
  if (p.get('to')) filters.to = p.get('to');
  // Voor de aankondiging-shortcode: enkel het/de gehighlighte event(s).
  // Geen highlight ingesteld -> lege lijst, de shortcode valt dan zelf
  // terug op een gewone (niet-gefilterde) lijstoproep.
  if (p.get('highlighted') === '1') filters.highlighted = true;

  // Standaard geen events uit het verleden: een kalender met dode
  // pagina's is voor niemand nuttig.
  if (!includePast && !filters.from) {
    filters.from = new Date().toISOString();
  }

  const { events, rawById, cached } = await listEvents(env, {
    filters,
    limit,
    order: `${EVENT_FIELDS.STARTS_AT} asc`,
    detail: false,
    cacheTtl: CACHE_TTL.PUBLIC_LIST
  });

  // Een event zonder slug heeft geen pagina; dat wordt op de site een dode
  // link. Dat gebeurt als iemand de fase rechtstreeks in Odoo op Published
  // zet in plaats van via de OM te publiceren, want dan wordt er geen slug
  // afgeleid. Hier weglaten en het aantal melden, zodat het opvalt.
  const withSlug = events.filter((internal) => Boolean(internal.slug));
  const skipped = events.length - withSlug.length;

  if (skipped > 0) {
    console.warn(
      `${LOG_PREFIX} ${skipped} gepubliceerd(e) event(s) zonder slug overgeslagen. ` +
      'Publiceer ze opnieuw via de Operations Manager, dan wordt er een slug afgeleid.'
    );
  }

  const payload = {
    meta: { ...meta(withSlug.length, brand), skipped_without_slug: skipped },
    events: withSlug.map((internal) =>
      toPublicPayload(rawById[internal.id], {
        registrationCount: internal.registration.count,
        detail: false,
        sharedCanonicalOrigin: env?.EVENTS_SHARED_CANONICAL_ORIGIN
      })
    )
  };

  return { payload, cached, ttl: CACHE_TTL.PUBLIC_LIST };
}

/**
 * Een event opzoeken op slug, of op Odoo-id als de segmentwaarde puur
 * numeriek is.
 *
 * Dat tweede pad bestaat voor de bestaande links: The Events Calendar
 * gebruikt vandaag `/event/{slug}/?owid={id}`, en zo blijft een oude link
 * werken ook als de slug intussen gewijzigd is.
 */
async function handleEventDetail(request, env, key, brand) {
  const selector = /^\d+$/.test(key) ? { id: Number.parseInt(key, 10) } : { slug: key };
  const { event, raw, cached } = await getEvent(env, selector, { cacheTtl: CACHE_TTL.PUBLIC_DETAIL });

  if (!event || !raw) return null;
  if (!PUBLIC_VISIBLE_STATES.includes(event.publication_state)) return null;

  // Een site mag geen event van het andere merk tonen, ook niet met een
  // rechtstreekse URL. Gedeelde events mogen wel.
  if (brand && event.brand && event.brand !== brand && event.brand !== 'both') {
    return null;
  }

  const dto = toPublicPayload(raw, {
    registrationCount: event.registration.count,
    detail: true,
    sharedCanonicalOrigin: env?.EVENTS_SHARED_CANONICAL_ORIGIN
  });

  return {
    payload: { meta: meta(1, brand), event: dto },
    cached,
    ttl: CACHE_TTL.PUBLIC_DETAIL
  };
}

/**
 * Het eerstvolgende event, of null.
 *
 * Bestaat zodat de kalender op de juiste maand kan openen. Zonder dit opent
 * hij op de huidige maand, en als daar niets staat lijkt de kalender leeg
 * terwijl er verderop wel events zijn.
 */
async function handleNextEvent(request, env, brand) {
  const { events, cached } = await listEvents(env, {
    filters: {
      publication_states: PUBLIC_VISIBLE_STATES,
      brand,
      from: new Date().toISOString()
    },
    limit: 5,
    order: `${EVENT_FIELDS.STARTS_AT} asc`,
    detail: false,
    cacheTtl: CACHE_TTL.PUBLIC_LIST
  });

  const next = events.find((event) => Boolean(event.slug)) || null;

  return {
    payload: {
      meta: meta(next ? 1 : 0, brand),
      next: next ? { slug: next.slug, starts_at: next.starts_at, month: String(next.starts_at).slice(0, 7) } : null
    },
    cached,
    ttl: CACHE_TTL.PUBLIC_LIST
  };
}

async function handleEventTypes(request, env, brand) {
  const { types, cached } = await listEventTypes(env);

  return {
    payload: {
      meta: meta(types.length, brand),
      event_types: types.map((t) => ({ id: t.id, name: t.name }))
    },
    cached,
    ttl: CACHE_TTL.EVENT_TYPES
  };
}

// ─── Inschrijven ─────────────────────────────────────────────────────────────

/**
 * POST /events-v2/public/v1/events/{slug}/register
 *
 * Het event zit in het PAD. Daardoor is de koppeling naar het juiste webinar
 * bij constructie gegarandeerd — precies het probleem dat in de
 * Forminator-route een configuratiekwestie was, en waar een lege waarde stil
 * een registratie zonder webinar opleverde.
 *
 * @returns {Promise<Response>}
 */
async function handleRegister(request, env, slug, brand, ctx) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return errorResponse('Onleesbare aanvraag.', 400, request, env);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse('Onleesbare aanvraag.', 400, request, env);
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (email === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return errorResponse('Vul een geldig e-mailadres in.', 400, request, env);
  }

  // Tweede emmer op het e-mailadres: anders kan een adres alle events
  // volschrijven binnen de limiet per site.
  const perEmail = await checkRateLimit(env, `reg:${await hashForRate(email)}`, {
    windowSeconds: REGISTER_RATE_LIMIT.EMAIL_WINDOW_SECONDS,
    maxRequests: REGISTER_RATE_LIMIT.EMAIL_MAX_REQUESTS
  });
  if (!perEmail.allowed) {
    return errorResponse(
      'Er zijn net veel inschrijvingen met dit e-mailadres gedaan. Probeer het later opnieuw.',
      429,
      request,
      env,
      { 'Retry-After': String(perEmail.retryAfter) }
    );
  }

  const { event } = await getEvent(env, { slug }, { bypassCache: true });

  if (!event) {
    return errorResponse('Dit event bestaat niet.', 404, request, env);
  }
  if (!PUBLIC_VISIBLE_STATES.includes(event.publication_state)) {
    return errorResponse('Dit event is niet beschikbaar.', 404, request, env);
  }
  // Dezelfde merkcontrole als op de detailroute: een site mag niet
  // inschrijven op een event van het andere merk, ook niet met een
  // rechtstreekse POST.
  if (brand && event.brand && event.brand !== brand && event.brand !== 'both') {
    return errorResponse('Dit event is niet beschikbaar.', 404, request, env);
  }

  // Eén bron voor de vraag "mag er ingeschreven worden": dezelfde pure
  // functie die de beheer-UI en de publieke lijst gebruiken.
  const status = registrationStatus(event);
  if (!status.open) {
    const messages = {
      not_published: 'Inschrijven is voor dit event niet mogelijk.',
      disabled: 'Inschrijven is voor dit event niet mogelijk.',
      not_yet_open: 'Inschrijven is nog niet open voor dit event.',
      closed: 'Inschrijven is gesloten voor dit event.',
      event_started: 'Dit event is al begonnen.',
      event_done: 'Dit event is voorbij.',
      cancelled: 'Dit event is geannuleerd.',
      full: 'Dit event is volzet.'
    };
    return errorResponse(messages[status.reason] || 'Inschrijven is niet mogelijk.', 409, request, env);
  }

  const result = await createRegistration(env, {
    event,
    input: {
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      phone: body.phone,
      company: body.company,
      questions: body.questions,
      consent: Boolean(body.consent),
      utm: body.utm
    },
    ctx
  });

  const payload = {
    ok: true,
    registration: { id: result.id, state: result.state },
    message: result.waitlisted
      ? 'Je staat op de wachtlijst: de laatste plaats was net bezet. We laten je weten als er iemand afzegt.'
      : 'Je inschrijving is bevestigd.'
  };

  return new Response(JSON.stringify(payload), {
    status: 201,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env)
    }
  });
}

async function hashForRate(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Alle publieke events-routes. Aangeroepen vanuit
 * src/router/public-routes.js, dus buiten de auth-gate.
 *
 * @param {Request} request
 * @param {Object} env
 * @param {Object} ctx
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleEventsPublicApi(request, env, ctx, pathname) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const registerMatch = pathname
    .slice(PUBLIC_PREFIX.length)
    .match(/^\/events\/([^/]+)\/register\/?$/);

  // Alleen dit ene pad accepteert een POST. Al het andere blijft lezen.
  if (request.method === 'POST' && !registerMatch) {
    return errorResponse('Method not allowed', 405, request, env, { Allow: 'GET, OPTIONS' });
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse('Method not allowed', 405, request, env, { Allow: 'GET, POST, OPTIONS' });
  }

  const site = validateSiteKey(request, env);
  if (!site) {
    return errorResponse('Ongeldige of ontbrekende sitesleutel', 401, request, env);
  }

  // Schrijven is strenger begrensd dan lezen.
  const rate = registerMatch
    ? await checkRateLimit(env, `regsite:${site.key}`, {
      windowSeconds: REGISTER_RATE_LIMIT.WINDOW_SECONDS,
      maxRequests: REGISTER_RATE_LIMIT.MAX_REQUESTS
    })
    : await checkRateLimit(env, `pub:${site.key}`, {
      windowSeconds: PUBLIC_RATE_LIMIT.WINDOW_SECONDS,
      maxRequests: PUBLIC_RATE_LIMIT.MAX_REQUESTS
    });
  if (!rate.allowed) {
    return errorResponse('Te veel verzoeken', 429, request, env, {
      'Retry-After': String(rate.retryAfter)
    });
  }

  const subPath = pathname.slice(PUBLIC_PREFIX.length) || '/';

  try {
    if (registerMatch) {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405, request, env, { Allow: 'POST' });
      }
      return await handleRegister(request, env, decodeURIComponent(registerMatch[1]), site.brand, ctx);
    }

    let result = null;

    if (subPath === '/events' || subPath === '/events/') {
      result = await handleEventList(request, env, site.brand);
    } else if (subPath === '/next' || subPath === '/next/') {
      result = await handleNextEvent(request, env, site.brand);
    } else if (subPath === '/event-types' || subPath === '/event-types/') {
      result = await handleEventTypes(request, env, site.brand);
    } else {
      const match = subPath.match(/^\/events\/([^/]+)\/?$/);
      if (match) {
        result = await handleEventDetail(request, env, decodeURIComponent(match[1]), site.brand);
        if (!result) {
          return errorResponse('Event niet gevonden', 404, request, env);
        }
      }
    }

    if (!result) {
      return errorResponse('Onbekend endpoint', 404, request, env);
    }

    const response = await cachedJsonResponse(result.payload, request, env, {
      ttl: result.ttl,
      cacheHit: result.cached
    });

    response.headers.set('X-RateLimit-Remaining', String(rate.remaining));
    return response;
  } catch (error) {
    // Een ValidationError is een verwachte uitkomst met een leesbare tekst:
    // die geven we door, want de bezoeker moet weten wat er mis is.
    if (Number.isInteger(error?.status) && error.status < 500) {
      return errorResponse(error.message, error.status, request, env);
    }

    // Alles daarboven is onverwacht. Log met CONTEXT: een kale 503 zonder
    // aanwijzing kostte eerder een halve dag zoeken.
    console.error(
      `${LOG_PREFIX} onverwachte fout op ${request.method} ${pathname}`,
      JSON.stringify({
        query: Object.fromEntries(new URL(request.url).searchParams),
        brand: site.brand,
        message: error?.message
      }),
      error?.stack
    );

    return errorResponse(
      env?.EVENTS_PUBLIC_DEBUG === '1'
        ? `Interne fout: ${error?.message || 'onbekend'}`
        : 'Tijdelijk niet beschikbaar',
      503,
      request,
      env
    );
  }
}

/** @param {string} pathname */
export function isEventsPublicApiPath(pathname) {
  return pathname.startsWith(`${PUBLIC_PREFIX}/`) || pathname === PUBLIC_PREFIX;
}
