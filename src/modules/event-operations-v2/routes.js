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
  setEventTypeColor,
  listHostUsers,
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
import { storeHeroImage, removeHeroImage, isAllowedImageType, MAX_IMAGE_BYTES } from './lib/assets.js';
import { getLegacyWpPagesByEventId } from './lib/legacy-wp-pages.js';
import {
  loadMailBlocks,
  saveMailBlocks,
  renderMailForRegistration,
  resolveSender,
  queueMails,
  ownsMail,
  MailError
} from './lib/mail-service.js';
import { MAIL_KIND, MAIL_KINDS, emptyMailBlocks, normalizeMailBlocks, BLOCK_TYPES, BLOCK_SITES } from './lib/mail-blocks.js';
import { listRegistrationsForMail } from './lib/registrations-service.js';

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
    const startedAt = Date.now();

    try {
      const response = await handler(context);
      // Meetbaar maken hoe lang een actie duurt: zonder cijfer is "het is
      // traag" niet op te lossen.
      response.headers.set('X-Duration-Ms', String(Date.now() - startedAt));
      return response;
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
    const event = await createEvent(context.env, body, context.user, { ctx: context.ctx });
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

    // Geen samenvatting maar wel pagina-inhoud: zelfde fallback als de
    // publieke API (public-preview hieronder, en buildMetaDescription),
    // hier puur ter info voor de admin-UI -- niet geschreven naar Odoo, en
    // summary zelf blijft leeg (dus nog steeds bewerkbaar als "nog niet
    // ingevuld", niet als "toevallig gelijk aan de pagina-inhoud").
    if (!event.summary && event.body_html) {
      event.summary_from_body = summarize(event.body_html, 200) || '';
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
    const event = await updateEvent(context.env, id, body, context.user, { ctx: context.ctx });
    return json({ success: true, data: event });
  }),

  /**
   * POST /events-v2/api/events/:id/publish
   * Weigert met 409 en een lijst van wat er mist als het event niet compleet is.
   */
  'POST /api/events/:id/publish': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setPublicationState(context.env, id, PUBLICATION_STATE.PUBLISHED, context.user, { ctx: context.ctx });
    return json({ success: true, data: event });
  }),

  'POST /api/events/:id/unpublish': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setPublicationState(context.env, id, PUBLICATION_STATE.DRAFT, context.user, { ctx: context.ctx });
    return json({ success: true, data: event });
  }),

  /**
   * POST /events-v2/api/events/:id/done
   * Event afronden. De pagina blijft publiek staan voor de recap.
   */
  'POST /api/events/:id/done': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setPublicationState(context.env, id, PUBLICATION_STATE.DONE, context.user, { ctx: context.ctx });
    return json({ success: true, data: event });
  }),

  'POST /api/events/:id/cancel': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setPublicationState(context.env, id, PUBLICATION_STATE.CANCELLED, context.user, { ctx: context.ctx });
    return json({ success: true, data: event });
  }),

  'POST /api/events/:id/archive': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setEventActive(context.env, id, false, context.user, { ctx: context.ctx });
    return json({ success: true, data: event });
  }),

  'POST /api/events/:id/unarchive': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await setEventActive(context.env, id, true, context.user, { ctx: context.ctx });
    return json({ success: true, data: event });
  }),

  'POST /api/events/:id/duplicate': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const event = await duplicateEvent(context.env, id, context.user, { ctx: context.ctx });
    return json({ success: true, data: event }, 201);
  }),

  /**
   * DELETE /events-v2/api/events/:id
   * Definitief verwijderen. Weigert als er inschrijvingen aan hangen.
   */
  'DELETE /api/events/:id': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const url = new URL(context.request.url);

    // ?cascade=1 verwijdert de inschrijvingen mee. Bewust expliciet: zonder
    // die vlag weigert de service, want anders blijven inschrijvingen in
    // Odoo staan zonder event eraan.
    const cascade = url.searchParams.get('cascade') === '1';

    const data = await deleteEvent(context.env, id, context.user, { cascade, ctx: context.ctx });
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
   * PATCH /events-v2/api/event-types/:id
   * Body: { color: '#rrggbb' }
   *
   * Kleur van één event type wijzigen (x_studio_type_color_hex in Odoo,
   * door Nico toegevoegd via Studio). Zie setEventTypeColor() voor de
   * validatie en cache-invalidatie.
   */
  'PATCH /api/event-types/:id': withErrors(async (context) => {
    const id = Number.parseInt(context.params?.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Ongeldig event-type-id', { status: 400 });
    }

    const body = await readJsonBody(context.request);
    const { types } = await setEventTypeColor(context.env, id, body.color, context.user);
    return json({ success: true, data: types });
  }),

  /**
   * GET /events-v2/api/hosts
   * Interne Odoo-gebruikers, voor de hostkeuze. De host is de afzender van
   * de mails, dus dit is geen cosmetisch veld.
   */
  'GET /api/hosts': withErrors(async (context) => {
    const { users, cached } = await listHostUsers(context.env);
    return json({ success: true, data: users }, 200, cacheHeader(cached));
  }),

  /**
   * GET /events-v2/api/wp-legacy-pages
   * Welke Odoo-events nog een oude WordPress Tribe Events-pagina hebben
   * (v1-publicatie, gematcht via odoo_webinar_id in de WP-post-meta).
   * Verwijdert niets -- enkel een markering zodat een beheerder zelf kan
   * beslissen of die oude pagina blijft staan of handmatig in WordPress
   * verwijderd wordt.
   */
  'GET /api/wp-legacy-pages': withErrors(async (context) => {
    const { pages, cached } = await getLegacyWpPagesByEventId(context.env);
    return json({ success: true, data: pages }, 200, cacheHeader(cached));
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
      actor: context.user,
      ctx: context.ctx
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
      origin: body.origin,
      ctx: context.ctx
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
   * DELETE /events-v2/api/events/:id/hero-image
   * Verwijdert het bestand uit R2 en wist de verwijzing in Odoo.
   */
  'DELETE /api/events/:id/hero-image': withErrors(async (context) => {
    const id = eventIdFrom(context.params);

    await removeHeroImage(context.env, id);
    const event = await updateEvent(context.env, id, { hero_image_url: null }, context.user, { ctx: context.ctx });

    return json({ success: true, data: event });
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
    const event = await updateEvent(context.env, id, { hero_image_url: url }, context.user, { ctx: context.ctx });

    return json({ success: true, data: { hero_image_url: url, event } });
  }),

  // ─── Communicatie-studio ────────────────────────────────────────────────
  //
  // De blokken WONEN IN ODOO (x_webinar_event_type.x_studio_mail_blocks en
  // x_webinar.x_studio_mail_blocks_override). Deze routes lezen en schrijven
  // die velden; er is geen Supabase-tabel en geen KV-bron. Zie de doc-kop van
  // lib/mail-service.js.

  /**
   * GET /events-v2/api/mail/schema
   * Wat de editor mag aanbieden. Uit één bron, zodat de client geen eigen
   * kopie van de bloktypes bijhoudt (zelfde principe als loadGraph() in de
   * Sales Insight Explorer).
   */
  'GET /api/mail/schema': withErrors(async () => {
    return json({
      success: true,
      data: {
        kinds: MAIL_KINDS,
        block_types: BLOCK_TYPES,
        sites: BLOCK_SITES,
        placeholders: [
          'event.title', 'event.summary', 'event.day', 'event.time', 'event.starts_at',
          'event.location', 'event.link', 'event.url', 'event.type',
          'host.name', 'host.email',
          'registration.name', 'registration.first_name', 'registration.email'
        ]
      }
    });
  }),

  /**
   * GET /events-v2/api/event-types/:id/mail-blocks
   * De standaardblokken van een event-type.
   */
  'GET /api/event-types/:id/mail-blocks': withErrors(async (context) => {
    const id = Number.parseInt(context.params?.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Ongeldig event-type-id', { status: 400 });
    }

    const { typeDoc } = await loadMailBlocks(context.env, { id: 0, event_type: { id } });
    return json({ success: true, data: typeDoc || emptyMailBlocks() });
  }),

  /**
   * PUT /events-v2/api/event-types/:id/mail-blocks
   * Body: het volledige blokkendocument.
   */
  'PUT /api/event-types/:id/mail-blocks': withErrors(async (context) => {
    const id = Number.parseInt(context.params?.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ValidationError('Ongeldig event-type-id', { status: 400 });
    }

    const body = await readJsonBody(context.request);
    const saved = await saveMailBlocks(context.env, { eventTypeId: id }, body, context.user);
    await invalidateNamespace(context.env, CACHE_NS.EVENT_TYPES);

    return json({ success: true, data: saved });
  }),

  /**
   * GET /events-v2/api/events/:id/mail-blocks
   * De standaard van het type én de override van dit event, plus per soort
   * welke van de twee er geldt.
   */
  'GET /api/events/:id/mail-blocks': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const { event } = await getEvent(context.env, { id }, { bypassCache: true });
    if (!event) {
      return json({ success: false, error: `Event ${id} niet gevonden` }, 404);
    }

    const { typeDoc, eventDoc } = await loadMailBlocks(context.env, event);
    const sources = {};
    for (const kind of MAIL_KINDS) {
      const hasOverride = Array.isArray(eventDoc?.[kind]?.blocks) && eventDoc[kind].blocks.length > 0;
      const hasType = Array.isArray(typeDoc?.[kind]?.blocks) && typeDoc[kind].blocks.length > 0;
      sources[kind] = hasOverride ? 'event' : hasType ? 'event_type' : 'none';
    }

    return json({
      success: true,
      data: {
        event_type: { id: event.event_type?.id ?? null, name: event.event_type?.name ?? null },
        type_doc: typeDoc || emptyMailBlocks(),
        event_doc: eventDoc || emptyMailBlocks(),
        sources,
        owned_by_om: ownsMail(context.env, event)
      }
    });
  }),

  /**
   * PUT /events-v2/api/events/:id/mail-blocks
   * De override van dit ene event. Een lege blokkenlijst per soort betekent
   * "erf weer van het event-type" -- zie resolveSection().
   */
  'PUT /api/events/:id/mail-blocks': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const body = await readJsonBody(context.request);
    const saved = await saveMailBlocks(context.env, { eventId: id }, body, context.user);
    await invalidateEvents(context.env);

    return json({ success: true, data: saved });
  }),

  /**
   * POST /events-v2/api/events/:id/mail-preview
   * Body: { kind, site?, registration_id? }
   *
   * Rendert exact wat er verstuurd zou worden, met een echte inschrijving
   * als die meegegeven wordt en anders met een voorbeeldontvanger. Geen
   * enkele schrijfactie -- dit raakt mail.mail niet aan.
   */
  'POST /api/events/:id/mail-preview': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const body = await readJsonBody(context.request);

    const kind = String(body?.kind || '');
    if (!MAIL_KINDS.includes(kind)) {
      throw new ValidationError(`kind moet een van ${MAIL_KINDS.join(', ')} zijn`);
    }

    const { event } = await getEvent(context.env, { id }, { bypassCache: true });
    if (!event) {
      return json({ success: false, error: `Event ${id} niet gevonden` }, 404);
    }

    let { typeDoc, eventDoc } = await loadMailBlocks(context.env, event);

    // De editor stuurt zijn NOG NIET BEWAARDE document mee, zodat het
    // voorbeeld toont wat er nu op het scherm staat in plaats van wat er
    // toevallig al in Odoo zit. Dat is puur render-invoer: deze route
    // schrijft niets.
    if (body?.draft && typeof body.draft === 'object') {
      const draft = normalizeMailBlocks(body.draft, 'voorbeeld');
      if (body?.scope === 'event') {
        eventDoc = draft;
      } else {
        typeDoc = draft;
        // Een bestaande override zou de standaard-preview overstemmen; bij
        // het bewerken van de type-standaard willen we die net zien.
        eventDoc = null;
      }
    }

    let registration = {
      id: 0,
      name: 'Jan Voorbeeld',
      submitted_email: 'voorbeeld@example.com',
      site: body?.site || null,
      state: REGISTRATION_STATE.REGISTERED
    };
    if (body?.registration_id) {
      const real = await getRegistration(context.env, Number(body.registration_id));
      if (real) registration = real;
    }

    // De afzender mag hier ontbreken: een preview van een event zonder host
    // moet nog steeds iets tonen, met de reden erbij.
    let sender = null;
    let senderError = null;
    try {
      sender = await resolveSender(context.env, event);
    } catch (error) {
      senderError = error?.message || 'afzender onbekend';
    }

    const rendered = renderMailForRegistration({
      event,
      registration,
      kind,
      typeDoc,
      eventDoc,
      hostEmail: sender?.email || '',
      publicBaseUrl: context.env?.EVENTS_PUBLIC_BASE_URL
    });

    return json({
      success: true,
      data: {
        ...rendered,
        email_from: sender?.formatted || null,
        email_to: registration.submitted_email,
        sender_error: senderError
      }
    });
  }),

  /**
   * POST /events-v2/api/events/:id/mails/:kind/send
   * Body: { registration_ids?: number[] }
   *
   * Zet mails klaar in mail.mail; Odoo's eigen mailqueue verstuurt ze. Zonder
   * registration_ids: iedereen die deze soort nog niet gehad heeft.
   *
   * Dit vervangt de handmatige Odoo-knop (server action 1099) voor de recap.
   * Die actie markeerde ALLE registraties als verzonden -- ook de records
   * waarvoor de verzending een uitzondering gooide, en ook de duplicaten die
   * ze net op e-mailadres had weggefilterd. Hier is de vlag een gevolg van
   * een aangemaakt mail.mail-record, niet een aanname vooraf.
   */
  'POST /api/events/:id/mails/:kind/send': withErrors(async (context) => {
    const id = eventIdFrom(context.params);
    const kind = String(context.params?.kind || '');
    if (!MAIL_KINDS.includes(kind)) {
      throw new ValidationError(`kind moet een van ${MAIL_KINDS.join(', ')} zijn`);
    }

    const body = await readJsonBody(context.request).catch(() => ({}));
    const { event } = await getEvent(context.env, { id }, { bypassCache: true });
    if (!event) {
      return json({ success: false, error: `Event ${id} niet gevonden` }, 404);
    }

    const registrations = await listRegistrationsForMail(context.env, id, {
      kind,
      registrationIds: Array.isArray(body?.registration_ids) ? body.registration_ids.map(Number) : null
    });

    if (registrations.length === 0) {
      return json({ success: true, data: { queued: [], skipped: [], message: 'Geen inschrijvingen die deze mail nog moeten krijgen.' } });
    }

    const result = await queueMails(context.env, {
      event,
      registrations,
      kind,
      actor: context.user
    });

    return json({ success: true, data: result });
  })
};

export const PUBLIC_MAX_LIMIT = PAGINATION.PUBLIC_MAX_LIMIT;
