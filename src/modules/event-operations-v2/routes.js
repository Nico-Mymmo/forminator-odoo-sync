/**
 * Event Operations v2 — Beheer-API
 *
 * Deze laag legt alleen HTTP op de services. Alle logica en validatie zit
 * in lib/events-service.js en lib/validation.js.
 *
 * REGELS:
 *  - alleen JSON terug, nooit HTML-strings (GET / levert het statische bestand)
 *  - geen Supabase
 *  - geen eigen searchRead of write: alles via de services, zodat
 *    cache-invalidatie en het chatterbericht altijd meelopen
 */

import { LOG_PREFIX, PUBLICATION_STATE, PAGINATION, CACHE_NS } from './constants.js';
import { invalidateNamespace, invalidateEvents } from './lib/cache.js';
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  setPublicationState,
  setEventActive,
  duplicateEvent,
  deleteEvent,
  listEventTypes,
  getStages
} from './lib/events-service.js';
import { ValidationError, normalizePagination } from './lib/validation.js';
import {
  listRegistrations,
  createRegistration,
  setAttendance,
  setRegistrationState,
  getRegistration
} from './lib/registrations-service.js';
import { REGISTRATION_SOURCE, REGISTRATION_STATE } from './constants.js';
import { toPublicEventDto } from './odoo-contract.js';
import { sanitizePublicHtml, summarize, buildMetaDescription } from './lib/blocks.js';
import { storeHeroImage, isAllowedImageType, MAX_IMAGE_BYTES } from './lib/assets.js';

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

/**
 * Zet een ValidationError om naar de juiste statuscode. Alles zonder
 * status wordt een 500 en komt in de logs.
 *
 * @param {(context: Object) => Promise<Response>} handler
 * @returns {(context: Object) => Promise<Response>}
 */
export function withErrors(handler) {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (status >= 500) {
        console.error(`${LOG_PREFIX} onverwachte fout:`, error?.stack || error?.message);
      }
      return json(
        {
          success: false,
          error: error?.message || 'Interne fout',
          details: error?.details ?? null
        },
        status
      );
    }
  };
}

function cacheHeader(cached) {
  return { 'X-Cache': cached ? 'hit' : 'miss' };
}

function eventIdFrom(params) {
  const id = Number.parseInt(params?.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Ongeldig event-id', { status: 400 });
  }
  return id;
}

async function readJsonBody(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Body moet een JSON-object zijn');
    }
    return body;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Body is geen geldige JSON');
  }
}

function buildFilters(url) {
  const p = url.searchParams;
  const filters = {};

  if (p.get('state')) filters.publication_state = p.get('state');
  if (p.get('type')) filters.event_type_id = Number.parseInt(p.get('type'), 10);
  if (p.get('format')) filters.format = p.get('format');
  if (p.get('from')) filters.from = p.get('from');
  if (p.get('to')) filters.to = p.get('to');
  if (p.get('q')) filters.q = p.get('q');
  if (p.get('include_archived') === '1') filters.include_archived = true;

  return filters;
}

export const routes = {
  /**
   * GET /events-v2
   * Statische UI. Geen server-gerenderde HTML in de Worker.
   */
  'GET /': async (context) => {
    return context.env.ASSETS.fetch(
      new Request(new URL('/events-v2.html', context.request.url))
    );
  },

  /**
   * GET /events-v2/api/health
   * Bewijst dat de module en het contract laden, zonder Odoo aan te raken.
   */
  'GET /api/health': withErrors(async () => {
    const contract = await import('./odoo-contract.js');
    return json({
      success: true,
      data: {
        module: 'event_operations_v2',
        phase: 'fase 1 — fundament, beheer-API en publieke API',
        contract_models: Object.values(contract.ODOO_MODELS).length,
        forbidden_fields: contract.FORBIDDEN_FIELDS.length,
        routes_implemented: true
      }
    });
  }),

  /**
   * GET /events-v2/api/events
   * Query: state, type, format, from, to, q, include_archived, page, per_page
   */
  'GET /api/events': withErrors(async (context) => {
    const url = new URL(context.request.url);
    const { page, perPage, offset } = normalizePagination({
      page: url.searchParams.get('page'),
      per_page: url.searchParams.get('per_page')
    });

    // De beheerkant leest altijd rechtstreeks uit Odoo (ADMIN_LIST-TTL is 0).
    // `fresh=1` gooit daarbovenop de stage- en publieke cache leeg, zodat de
    // verversknop ook een hernoemde of nieuwe fase in Odoo meteen oppikt.
    if (url.searchParams.get('fresh') === '1') {
      await invalidateNamespace(context.env, CACHE_NS.STAGES);
      await invalidateNamespace(context.env, CACHE_NS.EVENT_TYPES);
      await invalidateEvents(context.env);
    }

    const { events, total, cached } = await listEvents(context.env, {
      filters: buildFilters(url),
      limit: perPage,
      offset
    });

    return json(
      {
        success: true,
        data: events,
        pagination: { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) }
      },
      200,
      cacheHeader(cached)
    );
  }),

  /**
   * POST /events-v2/api/events
   */
  'POST /api/events': withErrors(async (context) => {
    const body = await readJsonBody(context.request);
    const event = await createEvent(context.env, body, context.user);
    return json({ success: true, data: event }, 201);
  }),

  /**
   * GET /events-v2/api/events/:id
   */
  'GET /api/events/:id': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const { event, cached } = await getEvent(context.env, { id });

    if (!event) {
      return json({ success: false, error: `Event ${id} niet gevonden` }, 404);
    }

    return json({ success: true, data: event }, 200, cacheHeader(cached));
  }),

  /**
   * PATCH /events-v2/api/events/:id
   * Publicatiestatus loopt NIET via deze route — zie /publish en /unpublish.
   */
  'PATCH /api/events/:id': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const body = await readJsonBody(context.request);
    const event = await updateEvent(context.env, id, body, context.user);
    return json({ success: true, data: event });
  }),

  /**
   * POST /events-v2/api/events/:id/publish
   * Weigert met 409 en een lijst van wat er mist als het event niet compleet is.
   */
  'POST /api/events/:id/publish': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setPublicationState(context.env, id, PUBLICATION_STATE.PUBLISHED, context.user);
    return json({ success: true, data: event });
  }),

  'POST /api/events/:id/unpublish': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setPublicationState(context.env, id, PUBLICATION_STATE.DRAFT, context.user);
    return json({ success: true, data: event });
  }),

  /**
   * POST /events-v2/api/events/:id/done
   * Event afronden. De pagina blijft publiek staan voor de recap.
   */
  'POST /api/events/:id/done': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setPublicationState(context.env, id, PUBLICATION_STATE.DONE, context.user);
    return json({ success: true, data: event });
  }),

  'POST /api/events/:id/cancel': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setPublicationState(context.env, id, PUBLICATION_STATE.CANCELLED, context.user);
    return json({ success: true, data: event });
  }),

  'POST /api/events/:id/archive': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setEventActive(context.env, id, false, context.user);
    return json({ success: true, data: event });
  }),

  'POST /api/events/:id/unarchive': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setEventActive(context.env, id, true, context.user);
    return json({ success: true, data: event });
  }),

  'POST /api/events/:id/duplicate': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await duplicateEvent(context.env, id, context.user);
    return json({ success: true, data: event }, 201);
  }),

  /**
   * DELETE /events-v2/api/events/:id
   * Definitief verwijderen. Weigert als er inschrijvingen aan hangen.
   */
  'DELETE /api/events/:id': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const data = await deleteEvent(context.env, id, context.user);
    return json({ success: true, data });
  }),

  /**
   * GET /events-v2/api/event-types
   */
  'GET /api/event-types': withErrors(async (context) => {
    const { types, cached } = await listEventTypes(context.env);
    return json({ success: true, data: types }, 200, cacheHeader(cached));
  }),

  /**
   * GET /events-v2/api/stages
   * De Odoo-stages met de statuscode die eruit volgt. Handig om te zien
   * of een stage niet herkend wordt.
   */
  'GET /api/stages': withErrors(async (context) => {
    const { stages } = await getStages(context.env);
    return json({ success: true, data: stages });
  }),

  /**
   * GET /events-v2/api/events/:id/public-preview
   *
   * De publieke respons zoals de WordPress-plugin die krijgt, maar
   * opgevraagd met de sessie van een ingelogde beheerder. Zo kan je in de
   * UI meekijken zonder dat de sitesleutel in de browser terechtkomt.
   *
   * Gebruikt exact dezelfde serializer als de publieke API, dus als de
   * online link hier niet in staat, staat hij daar ook niet in.
   */
  'GET /api/events/:id/public-preview': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const { event, raw } = await getEvent(context.env, { id }, { bypassCache: true });

    if (!event || !raw) {
      return json({ success: false, error: `Event ${id} niet gevonden` }, 404);
    }

    const dto = toPublicEventDto(raw, {
      registrationCount: event.registration.count,
      detail: true
    });

    dto.body_html = sanitizePublicHtml(dto.body_html);
    dto.recap.body_html = sanitizePublicHtml(dto.recap.body_html);
    dto.seo = {
      title: dto.seo?.title || dto.title,
      description: buildMetaDescription({ seo: dto.seo, summary: dto.summary, body_html: dto.body_html })
    };
    if (!dto.summary) {
      dto.summary = summarize(dto.body_html, 200) || null;
    }

    return json({
      success: true,
      data: {
        note: 'Zelfde serializer als /events-v2/public/v1/events/{slug}. '
          + 'De echte publieke route vraagt bovendien een sitesleutel, ETag en rate limit.',
        published: event.publication_state === 'published',
        event: dto
      }
    });
  }),

  /**
   * GET /events-v2/api/events/:id/registrations
   * Query: page, per_page
   */
  'GET /api/events/:id/registrations': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const url = new URL(context.request.url);

    const { rows, total, page, perPage } = await listRegistrations(context.env, id, {
      page: url.searchParams.get('page'),
      per_page: url.searchParams.get('per_page')
    });

    return json({
      success: true,
      data: rows,
      pagination: { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) }
    });
  }),

  /**
   * POST /events-v2/api/events/:id/registrations
   * Een deelnemer met de hand toevoegen. Zelfde dubbelcontrole als publiek.
   */
  'POST /api/events/:id/registrations': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const body = await readJsonBody(context.request);

    const { event } = await getEvent(context.env, { id }, { bypassCache: true });
    if (!event) {
      return json({ success: false, error: `Event ${id} niet gevonden` }, 404);
    }

    const result = await createRegistration(context.env, {
      event,
      input: body,
      source: REGISTRATION_SOURCE.MANUAL,
      actor: context.user
    });

    return json({ success: true, data: result }, 201);
  }),

  /**
   * POST /events-v2/api/registrations/:id/attendance
   * Body: { attended: boolean }
   */
  'POST /api/registrations/:id/attendance': withErrors(async (context) => {
    const id = Number.parseInt(context.params?.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Ongeldig inschrijvings-id', { status: 400 });
    }

    const body = await readJsonBody(context.request);
    if (typeof body.attended !== 'boolean') {
      throw new ValidationError('attended moet true of false zijn');
    }

    const data = await setAttendance(context.env, id, {
      attended: body.attended,
      actor: context.user,
      origin: body.origin
    });

    return json({ success: true, data });
  }),

  /**
   * PATCH /events-v2/api/registrations/:id
   * Body: { state: 'registered' | 'waitlisted' | 'cancelled' }
   */
  'PATCH /api/registrations/:id': withErrors(async (context) => {
    const id = Number.parseInt(context.params?.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Ongeldig inschrijvings-id', { status: 400 });
    }

    const body = await readJsonBody(context.request);
    if (!Object.values(REGISTRATION_STATE).includes(body.state)) {
      throw new ValidationError(
        `state moet een van ${Object.values(REGISTRATION_STATE).join(', ')} zijn`
      );
    }

    const data = await setRegistrationState(context.env, id, body.state, context.user);
    return json({ success: true, data });
  }),

  /**
   * GET /events-v2/api/registrations/:id
   */
  'GET /api/registrations/:id': withErrors(async (context) => {
    const id = Number.parseInt(context.params?.id, 10);
    const data = await getRegistration(context.env, id);

    if (!data) {
      return json({ success: false, error: `Inschrijving ${id} niet gevonden` }, 404);
    }
    return json({ success: true, data });
  }),

  /**
   * POST /events-v2/api/events/:id/hero-image
   * Multipart met veld `file`.
   */
  'POST /api/events/:id/hero-image': withErrors(async (context) => {
    const id = eventIdFrom(context.params);

    const formData = await context.request.formData();
    const file = formData.get('file');

    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new ValidationError('Veld "file" ontbreekt');
    }
    if (!isAllowedImageType(file.type)) {
      throw new ValidationError(
        `Bestandstype ${file.type || 'onbekend'} is niet toegestaan. Gebruik JPEG, PNG, WebP of AVIF.`,
        { status: 415 }
      );
    }
    if (typeof file.size === 'number' && file.size > MAX_IMAGE_BYTES) {
      throw new ValidationError(
        `Afbeelding is ${Math.round(file.size / 1024 / 1024)} MB; het maximum is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
        { status: 413 }
      );
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new ValidationError('Afbeelding is te groot', { status: 413 });
    }

    const { url } = await storeHeroImage(context.env, id, buffer, file.type);

    // Via de service, zodat cache-invalidatie en chatter meelopen.
    const event = await updateEvent(context.env, id, { hero_image_url: url }, context.user);

    return json({ success: true, data: { hero_image_url: url, event } });
  })
};

export const PUBLIC_MAX_LIMIT = PAGINATION.PUBLIC_MAX_LIMIT;
