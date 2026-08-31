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
  PUBLICATION_STATE,
  PAGINATION,
  CACHE_TTL,
  PUBLIC_RATE_LIMIT,
  PUBLIC_SHAPE_VERSION,
  EVENT_FORMAT
} from './constants.js';
import { toPublicEventDto, EVENT_FIELDS } from './odoo-contract.js';
import { listEvents, getEvent, listEventTypes } from './lib/events-service.js';
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
 * @returns {string|null} de geldige sleutel, of null
 */
function validateSiteKey(request, env) {
  const submitted = request.headers.get('X-Mymmo-Site-Key') || '';
  if (!submitted) return null;

  const configured = String(env?.EVENTS_PUBLIC_SITE_KEYS || '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k !== '');

  if (configured.length === 0) {
    console.warn(`${LOG_PREFIX} EVENTS_PUBLIC_SITE_KEYS is niet ingesteld; publieke API geweigerd`);
    return null;
  }

  for (const key of configured) {
    if (timingSafeEqual(submitted, key)) return key;
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

function meta(count) {
  return {
    shape_version: PUBLIC_SHAPE_VERSION,
    count,
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

async function handleEventList(request, env) {
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

  const filters = {
    publication_state: PUBLICATION_STATE.PUBLISHED
  };
  if (p.get('type')) filters.event_type_id = Number.parseInt(p.get('type'), 10);
  if (format && Object.values(EVENT_FORMAT).includes(format)) filters.format = format;
  if (p.get('from')) filters.from = p.get('from');
  if (p.get('to')) filters.to = p.get('to');

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

  const payload = {
    meta: meta(events.length),
    events: events.map((internal) =>
      toPublicPayload(rawById[internal.id], {
        registrationCount: internal.registration.count,
        detail: false
      })
    )
  };

  return { payload, cached, ttl: CACHE_TTL.PUBLIC_LIST };
}

async function handleEventDetail(request, env, slug) {
  const { event, raw, cached } = await getEvent(env, { slug }, { cacheTtl: CACHE_TTL.PUBLIC_DETAIL });

  if (!event || !raw) return null;
  if (event.publication_state !== PUBLICATION_STATE.PUBLISHED) return null;

  const dto = toPublicPayload(raw, {
    registrationCount: event.registration.count,
    detail: true
  });

  return {
    payload: { meta: meta(1), event: dto },
    cached,
    ttl: CACHE_TTL.PUBLIC_DETAIL
  };
}

async function handleEventTypes(request, env) {
  const { types, cached } = await listEventTypes(env);

  return {
    payload: {
      meta: meta(types.length),
      event_types: types.map((t) => ({ id: t.id, name: t.name }))
    },
    cached,
    ttl: CACHE_TTL.EVENT_TYPES
  };
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

  if (request.method !== 'GET') {
    return errorResponse('Method not allowed', 405, request, env, { Allow: 'GET, OPTIONS' });
  }

  const siteKey = validateSiteKey(request, env);
  if (!siteKey) {
    return errorResponse('Ongeldige of ontbrekende sitesleutel', 401, request, env);
  }

  const rate = await checkRateLimit(env, `pub:${siteKey}`, {
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
    let result = null;

    if (subPath === '/events' || subPath === '/events/') {
      result = await handleEventList(request, env);
    } else if (subPath === '/event-types' || subPath === '/event-types/') {
      result = await handleEventTypes(request, env);
    } else {
      const match = subPath.match(/^\/events\/([^/]+)\/?$/);
      if (match) {
        result = await handleEventDetail(request, env, decodeURIComponent(match[1]));
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
    console.error(`${LOG_PREFIX} publieke API fout op ${pathname}:`, error?.stack || error?.message);
    return errorResponse('Tijdelijk niet beschikbaar', 503, request, env);
  }
}

/** @param {string} pathname */
export function isEventsPublicApiPath(pathname) {
  return pathname.startsWith(`${PUBLIC_PREFIX}/`) || pathname === PUBLIC_PREFIX;
}
