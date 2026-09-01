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
/**
 * Welke optionele Studio-velden bestaan er?
 *
 * EEN fields_get voor alle velden samen, niet een per veld: dat waren twee
 * extra Odoo-rondes bij elke koude cache. En lang cachen — of een veld
 * bestaat verandert bijna nooit, en de verversknop gooit het toch leeg.
 *
 * @returns {Promise<Record<string, boolean>>}
 */
async function optionalFieldMap(env) {
  const wanted = [EVENT_FIELDS.BRAND, EVENT_FIELDS.ASK_QUESTION, EVENT_FIELDS.HIGHLIGHTED];

  const { value } = await readThrough(
    env,
    { namespace: CACHE_NS.STAGES, parts: ['optional-fields'], ttlSeconds: CACHE_TTL.SCHEMA },
    async () => {
      try {
        const fields = await executeKw(env, {
          model: ODOO_MODELS.EVENT,
          method: 'fields_get',
          args: [wanted],
          kwargs: { attributes: ['type'] }
        });

        const map = {};
        for (const field of wanted) {
          map[field] = Boolean(fields && fields[field]);
        }
        return { map };
      } catch (error) {
        console.warn(`${LOG_PREFIX} kon de optionele velden niet opvragen:`, error?.message);
        return { map: {} };
      }
    }
  );

  return value.map || {};
}

export async function optionalFieldAvailable(env, fieldName) {
  const map = await optionalFieldMap(env);
  return map[fieldName] === true;
}

/** Bestaat het merkveld? Dun laagje over optionalFieldAvailable. */
export async function brandFieldAvailable(env) {
  return optionalFieldAvailable(env, EVENT_FIELDS.BRAND);
}

async function stripUnavailableOptionalFields(env, payload) {
  const map = { brand: EVENT_FIELDS.BRAND, ask_question: EVENT_FIELDS.ASK_QUESTION, highlighted: EVENT_FIELDS.HIGHLIGHTED };

  for (const [key, field] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(payload, key) && !(await optionalFieldAvailable(env, field))) {
      console.warn(`${LOG_PREFIX} ${key} niet opgeslagen: ${field} bestaat niet in Odoo`);
      delete payload[key];
    }
  }
}

async function availableOptionalFields(env) {
  const map = await optionalFieldMap(env);
  return Object.keys(map).filter((field) => map[field] === true);
}

/**
 * Inschrijvingsaantallen voor alle events die aan een eventdomein voldoen.
 *
 * Het truc: we spiegelen het eventdomein naar het gerelateerde veld
 * `x_studio_linked_webinar.<veld>`. Daardoor hoeft deze call NIET te wachten
 * op de id's uit de eerste call, en kunnen beide parallel — dat halveert de
 * wachttijd van een lijst, want een Odoo-ronde kost ~300 ms.
 *
 * @param {Object} env
 * @param {Array} eventDomain - het domein zoals buildEventDomain het maakt
 * @returns {Promise<Record<number, number>>}
 */
async function getRegistrationCountsByEventDomain(env, eventDomain) {
  const mirrored = eventDomain.map((term) => {
    // Operatoren ('&', '|', '!') gaan ongewijzigd mee.
    if (!Array.isArray(term)) return term;
    return [`${REGISTRATION_FIELDS.EVENT}.${term[0]}`, term[1], term[2]];
  });

  const domain = [
    ...mirrored,
    [REGISTRATION_FIELDS.STATE, '!=', REGISTRATION_STATE.CANCELLED]
  ];

  const grouped = await executeKw(env, {
    model: ODOO_MODELS.REGISTRATION,
    method: 'read_group',
    args: [domain, [REGISTRATION_FIELDS.EVENT], [REGISTRATION_FIELDS.EVENT]],
    kwargs: { lazy: false }
  });

  const counts = {};
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
  if (Array.isArray(filters.event_type_id)) {
    const ids = filters.event_type_id.map(Number).filter((n) => Number.isInteger(n));
    if (ids.length === 1) {
      domain.push([EVENT_FIELDS.EVENT_TYPE, '=', ids[0]]);
    } else if (ids.length > 1) {
      domain.push([EVENT_FIELDS.EVENT_TYPE, 'in', ids]);
    }
  } else if (filters.event_type_id) {
    domain.push([EVENT_FIELDS.EVENT_TYPE, '=', Number(filters.event_type_id)]);
  }
  if (filters.highlighted === true) {
    if (await optionalFieldAvailable(env, EVENT_FIELDS.HIGHLIGHTED)) {
      domain.push([EVENT_FIELDS.HIGHLIGHTED, '=', true]);
    } else {
      // Veld bestaat niet: geen resultaten in plaats van per ongeluk alles.
      domain.push([EVENT_FIELDS.ID, '=', 0]);
    }
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
  const fields = [...baseFields, ...(await availableOptionalFields(env))];
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
      // Beide calls PARALLEL. De tellers gebruiken hetzelfde domein via het
      // gerelateerde veld, dus ze hoeven niet op de id's te wachten.
      // Faalt die spiegeling (een Odoo-versie die het gerelateerde pad niet
      // aanvaardt), dan vallen we terug op de variant met de id's.
      // Ook het totaal hoeft niet te wachten: het gebruikt hetzelfde domein.
      // Alleen opvragen als er echt gepagineerd wordt.
      const needsTotal = Boolean(limit) && (offset > 0 || true);

      const [records, mirroredCounts, countedTotal] = await Promise.all([
        searchRead(env, {
          model: ODOO_MODELS.EVENT,
          domain,
          fields: [...fields],
          limit,
          offset,
          order,
          context: includeArchived ? { active_test: false } : undefined
        }),
        getRegistrationCountsByEventDomain(env, domain).catch((error) => {
          console.warn(`${LOG_PREFIX} gespiegeld teldomein mislukt, val terug:`, error?.message);
          return null;
        }),
        needsTotal
          ? executeKw(env, {
            model: ODOO_MODELS.EVENT,
            method: 'search_count',
            args: [domain],
            kwargs: includeArchived ? { context: { active_test: false } } : {}
          }).catch(() => null)
          : Promise.resolve(null)
      ]);

      const rows = Array.isArray(records) ? records : [];

      const counts = mirroredCounts !== null
        ? mirroredCounts
        : await getRegistrationCounts(env, rows.map((r) => r[EVENT_FIELDS.ID]));

      let events = rows.map((record) =>
        toEventDto(record, { registrationCount: counts[record[EVENT_FIELDS.ID]] || 0 })
      );

      // Afgeleid format is geen Odoo-veld, dus hier filteren.
      if (filters.format) {
        events = events.filter((e) => e.format === filters.format);
      }

      // Het totaal komt uit de parallelle call hierboven. Is de
      // formatfilter actief, dan is dat totaal niet meer waar — die filter
      // gebeurt na het ophalen, want format is afgeleid en geen Odoo-veld.
      let total = Number.isFinite(Number(countedTotal)) ? Number(countedTotal) : events.length;
      if (filters.format) {
        total = events.length;
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

  const detailFields = [...EVENT_DETAIL_FIELDS, ...(await availableOptionalFields(env))];
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
      // Kennen we het id al, dan kunnen de twee calls PARALLEL: het
      // aantal inschrijvingen hoeft niet op het event te wachten. Bij een
      // slug moet het wel na elkaar, want dan komt het id uit de eerste call.
      const knownId = selector?.id ? Number(selector.id) : null;

      const [records, presetCounts] = await Promise.all([
        searchRead(env, {
          model: ODOO_MODELS.EVENT,
          domain,
          fields: detailFields,
          limit: 1,
          context: { active_test: false }
        }),
        knownId ? getRegistrationCounts(env, [knownId]) : Promise.resolve(null)
      ]);

      const record = Array.isArray(records) && records.length > 0 ? records[0] : null;
      if (!record) return { event: null, raw: null };

      const eventId = record[EVENT_FIELDS.ID];
      const counts = presetCounts !== null
        ? presetCounts
        : await getRegistrationCounts(env, [eventId]);

      return {
        event: toEventDto(record, { registrationCount: counts[eventId] || 0 }),
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

  const createInput = { ...input, slug };
  await stripUnavailableOptionalFields(env, createInput);

  const values = toOdooEventValues(createInput);

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

  // Het merkveld bestaat pas sinds kort in Odoo. Bestaat het niet, dan
  // laten we het stil weg in plaats van de hele wijziging te laten falen.
  await stripUnavailableOptionalFields(env, patch);

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

  await logToChatter(
    env,
    eventId,
    active
      ? 'Teruggehaald uit het archief — staat weer in de lijst en, als het gepubliceerd is, op de website'
      : 'Gearchiveerd — niet meer op de website, inschrijvingen blijven bewaard',
    actor
  );
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
      brand: source.brand,
      ask_question: source.registration?.ask_question,
      seo_title: source.seo?.title,
      seo_description: source.seo?.description
    },
    actor
  );
}

/**
 * Een event definitief verwijderen uit Odoo.
 *
 * Alleen als er geen inschrijvingen aan hangen: die zouden verweesd
 * achterblijven, en dat is niet te herstellen. Zijn er inschrijvingen, dan
 * is annuleren of archiveren de juiste actie — dat zegt de foutmelding ook.
 *
 * @param {Object} env
 * @param {number} id
 * @param {Object} [actor]
 * @returns {Promise<{ deleted: true, id: number }>}
 */
export async function deleteEvent(env, id, actor = null, { cascade = false } = {}) {
  const eventId = Number(id);
  const { event } = await getEvent(env, { id: eventId }, { bypassCache: true });

  if (!event) {
    throw new ValidationError(`Event ${eventId} niet gevonden`, { status: 404 });
  }

  const registrationDomain = [[REGISTRATION_FIELDS.EVENT, '=', eventId]];
  const registrationCount = Number(
    await executeKw(env, {
      model: ODOO_MODELS.REGISTRATION,
      method: 'search_count',
      args: [registrationDomain],
      // Ook de gearchiveerde: anders is een gearchiveerde inschrijving
      // onzichtbaar voor deze controle en verwijderen we hem stil mee.
      kwargs: { context: { active_test: false } }
    })
  ) || 0;

  // Odoo's veld x_studio_linked_webinar staat op `set null`. Zouden we het
  // event zomaar verwijderen, dan blijven de inschrijvingen bestaan met een
  // leeg webinarveld — en juist dat veld lezen de mailautomations. Die
  // deelnemers krijgen dan nooit meer iets, zonder foutmelding.
  //
  // Daarom: weigeren, tenzij er expliciet om cascade gevraagd wordt.
  if (registrationCount > 0 && !cascade) {
    throw new ValidationError(
      `Dit event heeft ${registrationCount} inschrijving(en). Verwijder je het event, dan ` +
      'blijven die in Odoo staan zonder event eraan — en dan krijgen die deelnemers geen ' +
      'mails meer. Archiveer het event liever: dan blijft alles bewaard en kan je het ' +
      'altijd terughalen. Wil je het toch weg, verwijder dan de inschrijvingen mee.',
      { status: 409, details: { registrations: registrationCount, can_cascade: true } }
    );
  }

  const who = actor?.email || actor?.name || 'onbekende gebruiker';

  if (registrationCount > 0) {
    // Eerst de inschrijvingen, dan het event: andersom laat Odoo ze even
    // zonder event staan.
    const rows = await searchRead(env, {
      model: ODOO_MODELS.REGISTRATION,
      domain: registrationDomain,
      fields: [REGISTRATION_FIELDS.ID],
      limit: false,
      context: { active_test: false }
    });

    const ids = (Array.isArray(rows) ? rows : [])
      .map((row) => Number(row.id))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (ids.length > 0) {
      await executeKw(env, {
        model: ODOO_MODELS.REGISTRATION,
        method: 'unlink',
        args: [ids]
      });
      console.log(`${LOG_PREFIX} ${ids.length} inschrijving(en) van event ${eventId} verwijderd door ${who}`);
    }
  }

  // Wie het deed vastleggen vóór het verwijderen: daarna is er geen record
  // meer om een chatterbericht op te zetten.
  console.log(
    `${LOG_PREFIX} event ${eventId} "${event.title}" verwijderd door ${who}` +
    (registrationCount > 0 ? ` (met ${registrationCount} inschrijving(en))` : '')
  );

  await executeKw(env, {
    model: ODOO_MODELS.EVENT,
    method: 'unlink',
    args: [[eventId]]
  });

  await invalidateEvents(env);

  return { deleted: true, id: eventId, registrations_deleted: registrationCount };
}

/**
 * Interne Odoo-gebruikers, voor de hostkeuze.
 *
 * Domein `share = false` sluit portaalgebruikers uit — hetzelfde domein dat
 * het Studio-veld `x_studio_user_id` zelf gebruikt.
 *
 * De host is niet cosmetisch: de mailtemplates halen hun AFZENDER uit
 * `x_studio_linked_webinar.x_studio_user_id`. Is de host leeg, dan is
 * email_from leeg en faalt de mail in Odoo zonder dat de OM dat merkt.
 * Daarom is de host ook verplicht om te kunnen publiceren.
 *
 * @returns {Promise<{ users: Object[], cached: boolean }>}
 */
export async function listHostUsers(env, { bypassCache = false } = {}) {
  const { value, cached } = await readThrough(
    env,
    { namespace: CACHE_NS.STAGES, parts: ['host-users'], ttlSeconds: CACHE_TTL.EVENT_TYPES, bypass: bypassCache },
    async () => {
      const records = await searchRead(env, {
        model: ODOO_MODELS.USER,
        domain: [['share', '=', false], ['active', '=', true]],
        fields: ['id', 'name', 'email'],
        order: 'name asc'
      });

      const users = (Array.isArray(records) ? records : []).map((record) => ({
        id: Number(record.id),
        name: typeof record.name === 'string' ? record.name : null,
        email: typeof record.email === 'string' && record.email !== '' ? record.email : null
      }));

      return { users };
    }
  );

  return { ...value, cached };
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
