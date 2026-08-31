/**
 * Event Operations v2 — Events-service
 *
 * Alle Odoo-toegang voor events. Odoo is de enige database; er is geen
 * projectie. Discipline in het aantal calls is daarom het enige wat de
 * snelheid nog beschermt:
 *
 *   HARDE REGEL — elke lijst is TWEE Odoo-calls:
 *     1. searchRead op x_webinar met een EXPLICIETE veldenlijst
 *     2. read_group op x_webinarregistrations voor de aantallen
 *
 * Nooit een call per event. Nooit `fields: []`. v1 doet tot ~200 externe
 * calls per sync door beide regels te overtreden.
 */

import { searchRead, executeKw, create, write, messagePost } from '../../../lib/odoo.js';
import { brandsVisibleTo, EVENT_BRAND } from '../constants.js';
import {
  ODOO_MODELS,
  EVENT_FIELDS,
  REGISTRATION_FIELDS,
  EVENT_TYPE_FIELDS,
  EVENT_STAGE_FIELDS,
  EVENT_LIST_FIELDS,
  EVENT_DETAIL_FIELDS,
  toEventDto,
  toEventTypeDto,
  toOdooEventValues,
  assertNoForbiddenFields,
  stageToState,
  parseStageMapOverride,
  parseBoundaryDatetime
} from '../odoo-contract.js';
import {
  LOG_PREFIX,
  PUBLICATION_STATE,
  PUBLICATION_STATES,
  REGISTRATION_STATE,
  CACHE_NS,
  CACHE_TTL
} from '../constants.js';
import { readThrough, invalidateEvents } from './cache.js';
import { ensureUniqueSlug } from './slug.js';
import {
  ValidationError,
  validateEventInput,
  checkPublishReadiness,
  assertPublicationTransition
} from './validation.js';

/**
 * Aantal inschrijvingen per event, in EEN call voor alle events samen.
 *
 * Geannuleerde inschrijvingen tellen niet mee: die geven anders een
 * verkeerd aantal vrije plaatsen.
 *
 * @param {Object} env
 * @param {number[]} eventIds
 * @returns {Promise<Record<number, number>>}
 */
export async function getRegistrationCounts(env, eventIds) {
  const ids = (eventIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (ids.length === 0) return {};

  const grouped = await executeKw(env, {
    model: ODOO_MODELS.REGISTRATION,
    method: 'read_group',
    args: [
      [
        [REGISTRATION_FIELDS.EVENT, 'in', ids],
        [REGISTRATION_FIELDS.STATE, '!=', REGISTRATION_STATE.CANCELLED]
      ],
      [REGISTRATION_FIELDS.EVENT],
      [REGISTRATION_FIELDS.EVENT]
    ],
    kwargs: { lazy: false }
  });

  const counts = {};
  for (const id of ids) counts[id] = 0;

  for (const group of grouped || []) {
    const relation = group?.[REGISTRATION_FIELDS.EVENT];
    const eventId = Array.isArray(relation) ? Number(relation[0]) : Number(relation);
    if (!Number.isInteger(eventId) || eventId <= 0) continue;

    const count = Number(
      group?.[`${REGISTRATION_FIELDS.EVENT}_count`] ?? group?.__count ?? group?.id_count ?? 0
    );
    counts[eventId] = Number.isFinite(count) ? count : 0;
  }

  return counts;
}

/**
 * Alle stages uit Odoo, met per stage de statuscode die eruit volgt.
 *
 * De stage IS de publicatiestatus, dus dit is de brug tussen een code
 * ('published') en het Odoo-record dat we moeten wegschrijven.
 *
 * @param {Object} env
 * @returns {Promise<{ stages: Object[], idByState: Object, stateById: Object }>}
 */
export async function getStages(env) {
  const overrides = parseStageMapOverride(env?.EVENT_STAGE_MAP);

  const { value } = await readThrough(
    env,
    { namespace: CACHE_NS.STAGES, parts: ['all'], ttlSeconds: CACHE_TTL.STAGES },
    async () => {
      const records = await searchRead(env, {
        model: ODOO_MODELS.EVENT_STAGE,
        domain: [],
        fields: [EVENT_STAGE_FIELDS.ID, EVENT_STAGE_FIELDS.NAME, EVENT_STAGE_FIELDS.SEQUENCE],
        order: `${EVENT_STAGE_FIELDS.SEQUENCE} asc, ${EVENT_STAGE_FIELDS.ID} asc`
      });

      return { records: Array.isArray(records) ? records : [] };
    }
  );

  const stages = [];
  const idByState = {};
  const stateById = {};

  for (const record of value.records) {
    const id = Number(record[EVENT_STAGE_FIELDS.ID]);
    const name = record[EVENT_STAGE_FIELDS.NAME];
    const stateCode = stageToState([id, name], overrides);

    stages.push({ id, name, state: stateCode });
    stateById[id] = stateCode;
    // Bij meerdere stages met dezelfde code wint de eerste: dat is de
    // stage waar we naartoe schrijven.
    if (!idByState[stateCode]) idByState[stateCode] = id;
  }

  return { stages, idByState, stateById };
}

/**
 * Statuscode → Odoo stage-id.
 * @returns {Promise<number>}
 */
export async function resolveStageId(env, stateCode) {
  const { idByState, stages } = await getStages(env);
  const id = idByState[stateCode];

  if (!id) {
    const available = stages.map((st) => `${st.name} (${st.state})`).join(', ') || 'geen';
    throw new ValidationError(
      `Er is geen stage in Odoo die overeenkomt met "${stateCode}". Aanwezig: ${available}.`,
      { status: 409 }
    );
  }
  return id;
}

/**
 * Stage-id's die bij een statuscode horen. Meerdere stages kunnen op
 * dezelfde code uitkomen, dus dit is een lijst.
 * @returns {Promise<number[]>}
 */
async function stageIdsForStates(env, stateCodes) {
  const { stages } = await getStages(env);
  const wanted = new Set(stateCodes);
  return stages.filter((st) => wanted.has(st.state)).map((st) => st.id);
}

/**
 * Bestaat het Studio-veld voor het merk al?
 *
 * Het veld wordt met de hand in Odoo aangemaakt. Tot dat gebeurd is mag de
 * module er niet op filteren en niet naar vragen — een searchRead met een
 * onbekend veld gooit, en dan is de hele kalender stuk. Daarom eerst
 * kijken, en het antwoord cachen.
 *
 * @returns {Promise<boolean>}
 */
export async function brandFieldAvailable(env) {
  const { value } = await readThrough(
    env,
    { namespace: CACHE_NS.STAGES, parts: ['brand-field'], ttlSeconds: CACHE_TTL.STAGES },
    async () => {
      try {
        const fields = await executeKw(env, {
          model: ODOO_MODELS.EVENT,
          method: 'fields_get',
          args: [[EVENT_FIELDS.BRAND]],
          kwargs: { attributes: ['type'] }
        });
        return { available: Boolean(fields && fields[EVENT_FIELDS.BRAND]) };
      } catch (error) {
        console.warn(`${LOG_PREFIX} kon niet nagaan of ${EVENT_FIELDS.BRAND} bestaat:`, error?.message);
        return { available: false };
      }
    }
  );

  return value.available === true;
}

async function buildEventDomain(env, filters = {}) {
  const domain = [];

  // Status is geen veld meer maar een stage, dus filteren gebeurt op de
  // stage-id's die bij die code horen.
  if (filters.publication_state) {
    const ids = await stageIdsForStates(env, [filters.publication_state]);
    domain.push([EVENT_FIELDS.STAGE, 'in', ids.length > 0 ? ids : [0]]);
  }
  if (Array.isArray(filters.publication_states) && filters.publication_states.length > 0) {
    const ids = await stageIdsForStates(env, filters.publication_states);
    domain.push([EVENT_FIELDS.STAGE, 'in', ids.length > 0 ? ids : [0]]);
  }
  // Merkfilter. Alleen als het veld bestaat EN er een merk gevraagd is.
  // Een leeg merk in Odoo geldt als `both`, dus die moet expliciet mee.
  if (filters.brand && filters.brand !== EVENT_BRAND.BOTH) {
    const visible = brandsVisibleTo(filters.brand);
    if (visible && (await brandFieldAvailable(env))) {
      domain.push('|', [EVENT_FIELDS.BRAND, 'in', visible], [EVENT_FIELDS.BRAND, '=', false]);
    }
  }
  if (filters.event_type_id) {
    domain.push([EVENT_FIELDS.EVENT_TYPE, '=', Number(filters.event_type_id)]);
  }
  // Altijd normaliseren: een onleesbare grens wordt genegeerd in plaats van
  // doorgegeven aan Odoo, want daar wordt het een uitzondering.
  const from = parseBoundaryDatetime(filters.from);
  if (from) {
    domain.push([EVENT_FIELDS.STARTS_AT, '>=', from]);
  }
  const to = parseBoundaryDatetime(filters.to);
  if (to) {
    domain.push([EVENT_FIELDS.STARTS_AT, '<=', to]);
  }
  if (filters.q) {
    domain.push([EVENT_FIELDS.TITLE, 'ilike', String(filters.q)]);
  }
  if (filters.slug) {
    domain.push([EVENT_FIELDS.SLUG, '=', String(filters.slug)]);
  }

  // Format is afgeleid en dus niet filterbaar in een Odoo-domein.
  // Dat gebeurt na het ophalen, in listEvents.
  return domain;
}

/**
 * Lijst met events. Twee Odoo-calls, plus een search_count voor het
 * totaal wanneer er gepagineerd wordt.
 *
 * @param {Object} env
 * @param {Object} [options]
 * @param {Object} [options.filters]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 * @param {string} [options.order]
 * @param {boolean} [options.detail] - detailvelden meenemen
 * @param {boolean} [options.bypassCache]
 * @param {number} [options.cacheTtl]
 * @returns {Promise<{ events: Object[], total: number, rawById: Object, cached: boolean }>}
 */
export async function listEvents(env, options = {}) {
  const {
    filters = {},
    limit,
    offset = 0,
    order = `${EVENT_FIELDS.STARTS_AT} desc`,
    detail = false,
    bypassCache = false,
    cacheTtl = CACHE_TTL.ADMIN_LIST
  } = options;

  const baseFields = detail ? EVENT_DETAIL_FIELDS : EVENT_LIST_FIELDS;
  const fields = (await brandFieldAvailable(env))
    ? [...baseFields, EVENT_FIELDS.BRAND]
    : [...baseFields];
  assertNoForbiddenFields(fields, 'listEvents');

  const domain = await buildEventDomain(env, filters);
  const includeArchived = filters.include_archived === true;

  const { value, cached } = await readThrough(
    env,
    {
      namespace: CACHE_NS.EVENTS,
      parts: ['list', JSON.stringify(filters), limit, offset, order, detail, includeArchived],
      ttlSeconds: cacheTtl,
      bypass: bypassCache
    },
    async () => {
      // Call 1 — de events zelf.
      const records = await searchRead(env, {
        model: ODOO_MODELS.EVENT,
        domain,
        fields: [...fields],
        limit,
        offset,
        order,
        context: includeArchived ? { active_test: false } : undefined
      });

      const rows = Array.isArray(records) ? records : [];

      // Call 2 — alle aantallen in een keer.
      const counts = await getRegistrationCounts(env, rows.map((r) => r[EVENT_FIELDS.ID]));

      let events = rows.map((record) =>
        toEventDto(record, { registrationCount: counts[record[EVENT_FIELDS.ID]] || 0 })
      );

      // Afgeleid format is geen Odoo-veld, dus hier filteren.
      if (filters.format) {
        events = events.filter((e) => e.format === filters.format);
      }

      // Alleen een extra call als er echt gepagineerd wordt.
      let total = events.length;
      if (limit && (rows.length === limit || offset > 0)) {
        total = Number(
          await executeKw(env, {
            model: ODOO_MODELS.EVENT,
            method: 'search_count',
            args: [domain],
            kwargs: includeArchived ? { context: { active_test: false } } : {}
          })
        ) || events.length;
      }

      // Ruwe records meegeven: de publieke API serialiseert daaruit met
      // toPublicEventDto, zodat er nooit een record gereconstrueerd hoeft
      // te worden uit een intern DTO.
      const rawById = {};
      for (const record of rows) rawById[record[EVENT_FIELDS.ID]] = record;

      return { events, total, rawById };
    }
  );

  return { ...value, cached };
}

/**
 * Een event op id of slug. Twee Odoo-calls.
 *
 * @param {Object} env
 * @param {Object} selector - { id } of { slug }
 * @param {Object} [options]
 * @returns {Promise<{ event: Object|null, raw: Object|null, cached: boolean }>}
 */
export async function getEvent(env, selector, options = {}) {
  const { bypassCache = false, cacheTtl = CACHE_TTL.ADMIN_DETAIL } = options;

  const domain = [];
  if (selector?.id) {
    domain.push([EVENT_FIELDS.ID, '=', Number(selector.id)]);
  } else if (selector?.slug) {
    domain.push([EVENT_FIELDS.SLUG, '=', String(selector.slug)]);
  } else {
    throw new ValidationError('getEvent vereist een id of een slug');
  }

  const detailFields = (await brandFieldAvailable(env))
    ? [...EVENT_DETAIL_FIELDS, EVENT_FIELDS.BRAND]
    : [...EVENT_DETAIL_FIELDS];
  assertNoForbiddenFields(detailFields, 'getEvent');

  const { value, cached } = await readThrough(
    env,
    {
      namespace: CACHE_NS.EVENTS,
      parts: ['one', selector.id ?? '', selector.slug ?? ''],
      ttlSeconds: cacheTtl,
      bypass: bypassCache
    },
    async () => {
      const records = await searchRead(env, {
        model: ODOO_MODELS.EVENT,
        domain,
        fields: detailFields,
        limit: 1,
        context: { active_test: false }
      });

      const record = Array.isArray(records) && records.length > 0 ? records[0] : null;
      if (!record) return { event: null, raw: null };

      const counts = await getRegistrationCounts(env, [record[EVENT_FIELDS.ID]]);
      return {
        event: toEventDto(record, { registrationCount: counts[record[EVENT_FIELDS.ID]] || 0 }),
        raw: record
      };
    }
  );

  return { ...value, cached };
}

/**
 * Event aanmaken. De slug wordt afgeleid uit de titel als hij niet is
 * meegegeven, en altijd uniek gemaakt tegen Odoo.
 *
 * @returns {Promise<Object>} het DTO van het nieuwe event
 */
export async function createEvent(env, input, actor = null) {
  validateEventInput(input, { isCreate: true });

  const slug = await ensureUniqueSlug(env, input.slug || input.title);

  const values = toOdooEventValues({ ...input, slug });

  // Een nieuw event begint altijd als concept, ongeacht wat de client
  // stuurt. x_studio_stage_id is bovendien verplicht in Odoo.
  values[EVENT_FIELDS.STAGE] = await resolveStageId(env, PUBLICATION_STATE.DRAFT);

  const id = await create(env, { model: ODOO_MODELS.EVENT, values });
  console.log(`${LOG_PREFIX} event ${id} aangemaakt (slug=${slug})`);

  await logToChatter(env, id, `Event aangemaakt in Event Operations`, actor);
  await invalidateEvents(env);

  const { event } = await getEvent(env, { id }, { bypassCache: true });
  return event;
}

/**
 * Event bijwerken. Wordt de startdatum gewijzigd, dan gaan de afgeleide
 * weergavevelden automatisch mee — zie toOdooEventValues.
 *
 * @returns {Promise<Object>}
 */
export async function updateEvent(env, id, input, actor = null) {
  validateEventInput(input);

  const eventId = Number(id);
  const { event: current } = await getEvent(env, { id: eventId }, { bypassCache: true });
  if (!current) {
    throw new ValidationError(`Event ${eventId} niet gevonden`, { status: 404 });
  }

  const patch = { ...input };

  // Publicatiestatus loopt via setPublicationState, niet via een PATCH.
  delete patch.publication_state;

  if (Object.prototype.hasOwnProperty.call(patch, 'slug') && patch.slug !== current.slug) {
    patch.slug = await ensureUniqueSlug(env, patch.slug || current.title, eventId);
  }

  const values = toOdooEventValues(patch);
  if (Object.keys(values).length === 0) {
    return current;
  }

  await write(env, { model: ODOO_MODELS.EVENT, ids: [eventId], values });

  const changed = Object.keys(patch).join(', ');
  await logToChatter(env, eventId, `Gewijzigd via Event Operations: ${changed}`, actor);
  await invalidateEvents(env);

  const { event } = await getEvent(env, { id: eventId }, { bypassCache: true });
  return event;
}

/**
 * Publicatiestatus wijzigen. Schrijft de bijhorende STAGE in Odoo, want
 * de stage IS de status — Odoo's kanban en de website blijven daardoor
 * automatisch gelijk.
 *
 * Dwingt de toegestane overgangen af en geeft bij publiceren een controle
 * die zegt WAT er mist.
 *
 * @returns {Promise<Object>}
 */
export async function setPublicationState(env, id, nextState, actor = null) {
  const eventId = Number(id);
  const { event: current } = await getEvent(env, { id: eventId }, { bypassCache: true });
  if (!current) {
    throw new ValidationError(`Event ${eventId} niet gevonden`, { status: 404 });
  }

  assertPublicationTransition(current.publication_state, nextState);

  // Bestaande events uit Odoo hebben geen slug. Bij publiceren leiden we er
  // een af uit de titel in plaats van te weigeren — dat is de enige reden
  // dat je hem met de hand zou moeten invullen.
  if (nextState === PUBLICATION_STATE.PUBLISHED && !current.slug) {
    const slug = await ensureUniqueSlug(env, current.title, eventId);
    await write(env, {
      model: ODOO_MODELS.EVENT,
      ids: [eventId],
      values: { [EVENT_FIELDS.SLUG]: slug }
    });
    current.slug = slug;
    console.log(`${LOG_PREFIX} slug afgeleid voor event ${eventId}: ${slug}`);
  }

  if (nextState === PUBLICATION_STATE.PUBLISHED) {
    const { ready, missing } = checkPublishReadiness(current);
    if (!ready) {
      throw new ValidationError(
        `Dit event kan nog niet gepubliceerd worden. Ontbreekt: ${missing.join(', ')}`,
        { status: 409, details: missing }
      );
    }
  }

  const stageId = await resolveStageId(env, nextState);

  await write(env, {
    model: ODOO_MODELS.EVENT,
    ids: [eventId],
    values: { [EVENT_FIELDS.STAGE]: stageId }
  });

  await logToChatter(
    env,
    eventId,
    `Fase: ${current.stage?.name || current.publication_state} → ${nextState}`,
    actor
  );
  await invalidateEvents(env);

  const { event } = await getEvent(env, { id: eventId }, { bypassCache: true });
  return event;
}

/**
 * Archiveren of activeren via x_active.
 * @returns {Promise<Object>}
 */
export async function setEventActive(env, id, active, actor = null) {
  const eventId = Number(id);

  await write(env, {
    model: ODOO_MODELS.EVENT,
    ids: [eventId],
    values: { [EVENT_FIELDS.ACTIVE]: Boolean(active) }
  });

  await logToChatter(env, eventId, active ? 'Gedearchiveerd' : 'Gearchiveerd', actor);
  await invalidateEvents(env);

  const { event } = await getEvent(env, { id: eventId }, { bypassCache: true });
  return event;
}

/**
 * Kopie als concept, zonder inschrijvingen.
 * @returns {Promise<Object>}
 */
export async function duplicateEvent(env, id, actor = null) {
  const { event: source } = await getEvent(env, { id: Number(id) }, { bypassCache: true });
  if (!source) {
    throw new ValidationError(`Event ${id} niet gevonden`, { status: 404 });
  }

  return createEvent(
    env,
    {
      title: `${source.title} (kopie)`,
      starts_at: source.starts_at,
      duration_minutes: source.duration_minutes,
      summary: source.summary,
      body_html: source.body_html,
      event_type_id: source.event_type.id,
      host_id: source.host.id,
      co_host_id: source.co_host?.id ?? null,
      location_name: source.location.name,
      online_url: source.online_url,
      capacity: source.registration.capacity ?? 0,
      registration_enabled: source.registration.enabled,
      seo_title: source.seo?.title,
      seo_description: source.seo?.description
    },
    actor
  );
}

/**
 * Event types uit x_webinar_event_type. Bewust langer gecached: deze
 * lijst verandert bijna nooit.
 *
 * @returns {Promise<{ types: Object[], cached: boolean }>}
 */
export async function listEventTypes(env, { bypassCache = false } = {}) {
  const { value, cached } = await readThrough(
    env,
    {
      namespace: CACHE_NS.EVENT_TYPES,
      parts: ['all'],
      ttlSeconds: CACHE_TTL.EVENT_TYPES,
      bypass: bypassCache
    },
    async () => {
      const records = await searchRead(env, {
        model: ODOO_MODELS.EVENT_TYPE,
        domain: [[EVENT_TYPE_FIELDS.ACTIVE, '=', true]],
        fields: [EVENT_TYPE_FIELDS.ID, EVENT_TYPE_FIELDS.NAME, EVENT_TYPE_FIELDS.ACTIVE, EVENT_TYPE_FIELDS.SEQUENCE],
        order: `${EVENT_TYPE_FIELDS.SEQUENCE} asc, ${EVENT_TYPE_FIELDS.NAME} asc`
      });

      return { types: (Array.isArray(records) ? records : []).map(toEventTypeDto) };
    }
  );

  return { ...value, cached };
}

/**
 * Auditspoor. Gaat naar de Odoo-chatter, niet naar een eigen logtabel:
 * daar hoort het, en het is de enige plek die overleeft als de cache
 * leeggegooid wordt.
 *
 * Nooit fataal — een mislukte notitie mag een geslaagde wijziging niet
 * terugdraaien.
 */
export async function logToChatter(env, eventId, message, actor = null) {
  const who = actor?.email || actor?.name || 'onbekende gebruiker';
  try {
    await messagePost(env, {
      model: ODOO_MODELS.EVENT,
      id: Number(eventId),
      body: `${message} — door ${who}`
    });
  } catch (error) {
    console.warn(`${LOG_PREFIX} chatterbericht mislukt voor event ${eventId}:`, error?.message);
  }
}
