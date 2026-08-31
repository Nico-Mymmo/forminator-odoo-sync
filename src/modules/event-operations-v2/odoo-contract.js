/**
 * Event Operations v2 — Odoo-contract
 *
 * DIT IS DE ENIGE PLEK IN DE MODULE WAAR `x_`-VELDNAMEN MOGEN STAAN.
 * De rest van de module kent alleen nette namen en DTO's.
 *
 * Pure module: geen I/O, geen env, geen fetch. Alles is in/uit te testen
 * met een gewoon object. Alles wat Odoo moet aanroepen staat in lib/.
 *
 * Geverifieerd tegen de live Odoo-instantie op 2026-08-28 met fields_get
 * en ir.model.fields.
 */

import {
  TIMEZONE,
  LOCALE,
  EVENT_FORMAT,
  CAPACITY_UNLIMITED,
  DEFAULT_DURATION_MINUTES,
  PUBLIC_EVENT_PATH,
  PUBLICATION_STATE,
  STAGE_NAME_TO_STATE,
  EVENT_BRAND,
  EVENT_BRANDS,
  EVENT_TYPE_PRESENTATION,
  EVENT_TYPE_FALLBACK_COLOR,
  LOG_PREFIX
} from './constants.js';

export const ODOO_MODELS = {
  EVENT: 'x_webinar',
  REGISTRATION: 'x_webinarregistrations',
  EVENT_TYPE: 'x_webinar_event_type',
  EVENT_STAGE: 'x_webinar_stage',
  TAG: 'x_webinar_tag',
  PARTNER: 'res.partner',
  USER: 'res.users',
  MAIL_TEMPLATE: 'mail.template',
  MAIL: 'mail.mail'
};

// ─── Veldnamen ────────────────────────────────────────────────────────────────

export const EVENT_FIELDS = {
  ID: 'id',
  TITLE: 'x_name',
  ACTIVE: 'x_active',
  STARTS_AT: 'x_studio_event_datetime',
  DURATION_MINUTES: 'x_studio_event_duration_minutes',
  BODY: 'x_studio_webinar_info',
  SUMMARY: 'x_studio_summary',
  SLUG: 'x_studio_slug',
  // De publicatiestatus KOMT UIT DE STAGE. Zie stageToState().
  STAGE: 'x_studio_stage_id',
  // x_event_type_id is de ENIGE echte event-type-relatie. Geverifieerd:
  // x_studio_event_type en x_studio_many2one_field_4p8_1jhb7es30 zijn leeg
  // op elk record. Zie FORBIDDEN_FIELDS.
  EVENT_TYPE: 'x_event_type_id',
  TAGS: 'x_studio_tag_ids',
  HOST: 'x_studio_user_id',
  CO_HOST: 'x_studio_co_host',
  LOCATION: 'x_studio_live_event_location',
  ONLINE_URL: 'x_studio_webinar_link',
  CAPACITY: 'x_studio_capacity',
  REGISTRATION_ENABLED: 'x_studio_registration_enabled',
  REGISTRATION_OPENS_AT: 'x_studio_registration_opens_at',
  REGISTRATION_CLOSES_AT: 'x_studio_registration_closes_at',
  HERO_IMAGE_URL: 'x_studio_hero_image_url',
  SEO_TITLE: 'x_studio_seo_title',
  SEO_DESCRIPTION: 'x_studio_seo_description',
  // Optioneel: bestaat pas als het Studio-veld is aangemaakt.
  BRAND: 'x_studio_brand',
  VIDEO_URL: 'x_studio_vimeo_url',
  THUMBNAIL_URL: 'x_studio_vimeo_thumbnail_url',
  RECAP_BODY: 'x_studio_followup_html',
  RECAP_TEMPLATE: 'x_studio_recap_template_id',
  // Afgeleide weergavevelden. De mailtemplates 52 en 53 renderen deze
  // LETTERLIJK in hun subject, dus ze moeten altijd meeschrijven met
  // STARTS_AT. Nooit met de hand zetten.
  STARTING_DAY: 'x_studio_starting_day',
  STARTING_TIME: 'x_studio_starting_time',
  WRITE_DATE: 'write_date',
  CREATE_DATE: 'create_date'
};

export const REGISTRATION_FIELDS = {
  ID: 'id',
  NAME: 'x_name',
  ACTIVE: 'x_active',
  EVENT: 'x_studio_linked_webinar',
  PARTNER: 'x_studio_registered_by',
  SUBMITTED_EMAIL: 'x_studio_webinar_registratie_email',
  QUESTIONS: 'x_studio_webinar_questions',
  STATE: 'x_studio_registration_state',
  SOURCE: 'x_studio_source',
  ATTENDED: 'x_studio_webinar_attended',
  ATTENDANCE_UPDATED_AT: 'x_studio_attendance_updated_at',
  ATTENDANCE_UPDATED_BY: 'x_studio_attendance_updated_by',
  ATTENDANCE_ORIGIN: 'x_studio_attendance_update_origin',
  CONTACT_CREATED: 'x_studio_contact_created',
  LEAD_CREATED: 'x_studio_lead_created',
  CONFIRMATION_SENT: 'x_studio_confirmation_email_sent',
  REMINDER_SENT: 'x_studio_reminder_email_sent',
  REMINDER_SENT_AT: 'x_studio_reminder_email_send_dt',
  RECAP_SENT: 'x_studio_recap_email_sent',
  CURRENT_SYNDIC: 'x_studio_current_syndic',
  WRITE_DATE: 'write_date',
  CREATE_DATE: 'create_date'
};

export const EVENT_STAGE_FIELDS = {
  ID: 'id',
  NAME: 'x_name',
  SEQUENCE: 'x_studio_sequence'
};

export const EVENT_TYPE_FIELDS = {
  ID: 'id',
  NAME: 'x_name',
  ACTIVE: 'x_active',
  SEQUENCE: 'x_studio_sequence'
};

/**
 * Dode velden. Geverifieerd leeg op elk bestaand record. Nooit lezen,
 * nooit schrijven, nooit in een veldenlijst opnemen.
 */
export const FORBIDDEN_FIELDS = Object.freeze([
  'x_studio_event_type',
  'x_studio_many2one_field_4p8_1jhb7es30',
  'x_studio_binary_field_43c_1ilec7eit',
  'x_studio_binary_field_43c_1ilec7eit_filename',
  'x_studio_datetime_field_7v5_1ilea618c',
  'x_studio_one2many_field_9hq_1ilea9sm6',
  // Ongebruikt: false op elk record, en de duur wordt uit STARTS_AT +
  // DURATION_MINUTES berekend. Niet aanraken zodat we geen tweede
  // datumwaarheid introduceren.
  'x_studio_date',
  // Bestaat niet op dit model; v1 gebruikte deze naam met een
  // runtime-detectie eromheen. Gebruik EVENT_FIELDS.EVENT_TYPE.
  'x_webinar_event_type_id',
  // Vervangen door x_studio_stage_id: de stage IS de publicatiestatus.
  // Twee velden voor hetzelfde gegeven is twee waarheden.
  'x_studio_publication_state'
]);

/**
 * Vangnet: gooit als een veldenlijst een dood veld bevat. Aanroepen in
 * elke service voor een searchRead of write, zodat een verkeerde naam
 * meteen opvalt in plaats van stil een leeg resultaat te geven.
 *
 * @param {string[]} fields
 * @param {string} context
 */
export function assertNoForbiddenFields(fields, context = 'field list') {
  const offenders = (fields || []).filter((f) => FORBIDDEN_FIELDS.includes(f));
  if (offenders.length > 0) {
    throw new Error(
      `${context} bevat velden die nooit gebruikt mogen worden: ${offenders.join(', ')}`
    );
  }
}

// ─── Veldenlijsten voor searchRead ────────────────────────────────────────────
// NOOIT `fields: []` gebruiken: dat haalt elk veld van elk record op.

export const EVENT_LIST_FIELDS = Object.freeze([
  EVENT_FIELDS.ID,
  EVENT_FIELDS.TITLE,
  EVENT_FIELDS.ACTIVE,
  EVENT_FIELDS.SLUG,
  EVENT_FIELDS.STARTS_AT,
  EVENT_FIELDS.DURATION_MINUTES,
  EVENT_FIELDS.SUMMARY,
  EVENT_FIELDS.STAGE,
  EVENT_FIELDS.EVENT_TYPE,
  EVENT_FIELDS.LOCATION,
  EVENT_FIELDS.ONLINE_URL,
  EVENT_FIELDS.CAPACITY,
  EVENT_FIELDS.REGISTRATION_ENABLED,
  EVENT_FIELDS.REGISTRATION_OPENS_AT,
  EVENT_FIELDS.REGISTRATION_CLOSES_AT,
  EVENT_FIELDS.HERO_IMAGE_URL,
  EVENT_FIELDS.HOST,
  EVENT_FIELDS.WRITE_DATE
]);

export const EVENT_DETAIL_FIELDS = Object.freeze([
  ...EVENT_LIST_FIELDS,
  EVENT_FIELDS.BODY,
  EVENT_FIELDS.CO_HOST,
  EVENT_FIELDS.TAGS,
  EVENT_FIELDS.SEO_TITLE,
  EVENT_FIELDS.SEO_DESCRIPTION,
  EVENT_FIELDS.VIDEO_URL,
  EVENT_FIELDS.THUMBNAIL_URL,
  EVENT_FIELDS.RECAP_BODY,
  EVENT_FIELDS.STARTING_DAY,
  EVENT_FIELDS.STARTING_TIME,
  EVENT_FIELDS.CREATE_DATE
]);

export const REGISTRATION_LIST_FIELDS = Object.freeze([
  REGISTRATION_FIELDS.ID,
  REGISTRATION_FIELDS.NAME,
  REGISTRATION_FIELDS.EVENT,
  REGISTRATION_FIELDS.PARTNER,
  REGISTRATION_FIELDS.SUBMITTED_EMAIL,
  REGISTRATION_FIELDS.QUESTIONS,
  REGISTRATION_FIELDS.STATE,
  REGISTRATION_FIELDS.SOURCE,
  REGISTRATION_FIELDS.ATTENDED,
  REGISTRATION_FIELDS.ATTENDANCE_UPDATED_AT,
  REGISTRATION_FIELDS.ATTENDANCE_UPDATED_BY,
  REGISTRATION_FIELDS.CONTACT_CREATED,
  REGISTRATION_FIELDS.LEAD_CREATED,
  REGISTRATION_FIELDS.CONFIRMATION_SENT,
  REGISTRATION_FIELDS.REMINDER_SENT,
  REGISTRATION_FIELDS.RECAP_SENT,
  REGISTRATION_FIELDS.CREATE_DATE,
  REGISTRATION_FIELDS.WRITE_DATE
]);

// ─── many2one helpers ─────────────────────────────────────────────────────────

/** @returns {number|null} */
export function m2oId(value) {
  if (Array.isArray(value) && value.length > 0) {
    const id = Number(value[0]);
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** @returns {string|null} */
export function m2oName(value) {
  if (Array.isArray(value) && value.length > 1 && value[1] != null) {
    return String(value[1]);
  }
  return null;
}

/** Odoo geeft leegte terug als `false`, niet als null. */
function str(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function int(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function bool(value) {
  return value === true;
}

// ─── Datetime ─────────────────────────────────────────────────────────────────
// Odoo levert en verwacht "YYYY-MM-DD HH:MM:SS" in UTC, ZONDER 'Z'.
// v1 doet deze conversie op drie plaatsen met drie uitkomsten; dat is de
// oorzaak van de statusverschillen tussen kalender en detailpaneel.
// Hier gebeurt het exact een keer.

/**
 * Odoo-datetime → ISO 8601 met Z.
 * @param {string|false|null} raw
 * @returns {string|null}
 */
export function fromOdooDatetime(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  let iso = trimmed;
  if (iso.includes(' ') && !iso.includes('T')) {
    iso = iso.replace(' ', 'T');
  }
  if (!/[Zz]$|[+-]\d{2}:?\d{2}$/.test(iso)) {
    iso += 'Z';
  }

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * ISO 8601 (of Date) → Odoo-datetime in UTC. `false` wist het veld in Odoo.
 * @param {string|Date|null|undefined} value
 * @returns {string|false}
 */
export function toOdooDatetime(value) {
  if (value === null || value === undefined || value === '') return false;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Ongeldige datum: ${String(value)}`);
  }

  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

/**
 * Een datumgrens uit een publieke queryparameter omzetten naar het formaat
 * dat Odoo verwacht.
 *
 * Nooit een ruwe parameterwaarde in een Odoo-domein zetten: dit is een
 * publiek endpoint, en Odoo gooit op een datum die het niet begrijpt. Dat
 * werd dan een 503 waar niemand iets aan kon zien.
 *
 * Repareert ook de klassieke `+`-val: in een querystring betekent `+` een
 * SPATIE. Een client die "2026-10-25T23:00:00+00:00" ongeëncodeerd
 * meestuurt — wat WordPress' add_query_arg doet — komt hier binnen als
 * "2026-10-25T23:00:00 00:00". Die vorm herstellen we.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null} Odoo-datetime, of null als het onbruikbaar is
 */
export function parseBoundaryDatetime(raw) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();
  if (value === '') return null;

  const candidates = [value];

  // "...T23:00:00 00:00" → "...T23:00:00+00:00"
  const mangled = value.match(/^(.*T\d{2}:\d{2}:\d{2}) (\d{2}:\d{2})$/);
  if (mangled) {
    candidates.push(`${mangled[1]}+${mangled[2]}`);
  }

  // "2026-10-25 23:00:00" zonder tijdzone: als UTC lezen, zoals Odoo doet.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    candidates.push(`${value.replace(' ', 'T')}Z`);
  }

  // Alleen een datum.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    candidates.push(`${value}T00:00:00Z`);
  }

  for (const candidate of candidates) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      return toOdooDatetime(date);
    }
  }

  console.warn(`${LOG_PREFIX} datumgrens genegeerd, niet te lezen: ${JSON.stringify(value)}`);
  return null;
}

function brusselsParts(date) {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: get('weekday'),
    day: get('day'),
    month: get('month'),
    hour: get('hour'),
    minute: get('minute')
  };
}

/**
 * De afgeleide weergavevelden, in Europe/Brussels.
 *
 * Formaat exact zoals de bestaande productiedata en de mailtemplates:
 *   x_studio_starting_day  → "woensdag, 16 december"
 *   x_studio_starting_time → "15:00"
 *
 * @param {string|Date} startsAt - ISO of Date (UTC)
 * @returns {{ x_studio_starting_day: string, x_studio_starting_time: string }}
 */
export function derivedDisplayFields(startsAt) {
  const date = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Ongeldige startdatum: ${String(startsAt)}`);
  }

  const { weekday, day, month, hour, minute } = brusselsParts(date);

  return {
    [EVENT_FIELDS.STARTING_DAY]: `${weekday}, ${day} ${month}`,
    [EVENT_FIELDS.STARTING_TIME]: `${hour}:${minute}`
  };
}

/**
 * Einde = start + duur. Odoo bewaart geen einddatum.
 * @returns {string|null} ISO
 */
export function computeEndsAt(startsAtIso, durationMinutes) {
  if (!startsAtIso) return null;
  const start = new Date(startsAtIso);
  if (Number.isNaN(start.getTime())) return null;
  const minutes = int(durationMinutes, DEFAULT_DURATION_MINUTES) || DEFAULT_DURATION_MINUTES;
  return new Date(start.getTime() + minutes * 60 * 1000).toISOString();
}

// ─── Merk ────────────────────────────────────────────────────────────────────

/**
 * Het merk van een event. Een lege waarde geldt als `both`, zodat de
 * kalender blijft werken zolang de velden nog niet ingevuld zijn.
 *
 * @param {Object} record
 * @returns {'openvme'|'syndicoach'|'both'}
 */
export function eventBrand(record) {
  const raw = record?.[EVENT_FIELDS.BRAND];
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  return EVENT_BRANDS.includes(value) ? value : EVENT_BRAND.BOTH;
}

// ─── Presentatie van het event type ──────────────────────────────────────────

/**
 * Slug en kleur voor een event type, voor gebruik op de website.
 *
 * De slug volgt de bestaande tribe_events_cat-taxonomie waar we die
 * kennen, zodat categorie-URL's blijven werken; anders wordt hij uit de
 * naam afgeleid.
 *
 * @param {string|null} name
 * @returns {{ slug: string|null, color: string }}
 */
export function eventTypePresentation(name) {
  if (!name) return { slug: null, color: EVENT_TYPE_FALLBACK_COLOR };

  const key = String(name).trim().toLowerCase();
  const preset = EVENT_TYPE_PRESENTATION[key];
  if (preset) return { slug: preset.slug, color: preset.color };

  const slug = key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'en')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return { slug: slug || null, color: EVENT_TYPE_FALLBACK_COLOR };
}

// ─── Stage → publicatiestatus ────────────────────────────────────────────────

/** Naam normaliseren voor de vergelijking: kleine letters, geen accenten. */
function normalizeStageName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * De publicatiestatus van een event, afgeleid uit `x_studio_stage_id`.
 *
 * De stage in Odoo IS de levenscyclus: Odoo's kanban en de website lezen
 * dezelfde waarde. Er is bewust geen tweede statusveld.
 *
 * Matcht op de genormaliseerde stagenaam, dus zowel "Published" als
 * "Gepubliceerd" werkt. Een onbekende stage valt terug op draft — dan is
 * het event onzichtbaar op de website, wat het veiligste is bij twijfel.
 *
 * @param {Array|number|false} stageValue - ruwe many2one-waarde
 * @param {Object} [overrides] - { [stageId]: stateCode }, uit env.EVENT_STAGE_MAP
 * @returns {string} PUBLICATION_STATE-waarde
 */
export function stageToState(stageValue, overrides = null) {
  const stageId = m2oId(stageValue);

  if (overrides && stageId && overrides[stageId]) {
    return overrides[stageId];
  }

  const name = normalizeStageName(m2oName(stageValue));
  if (!name) {
    return PUBLICATION_STATE.DRAFT;
  }

  const mapped = STAGE_NAME_TO_STATE[name];
  if (mapped) return mapped;

  console.warn(
    `${LOG_PREFIX} onbekende stage "${m2oName(stageValue)}" (id ${stageId}); ` +
    'val terug op draft. Voeg de naam toe aan STAGE_NAME_TO_STATE of zet env.EVENT_STAGE_MAP.'
  );
  return PUBLICATION_STATE.DRAFT;
}

/**
 * env.EVENT_STAGE_MAP ("1:draft,2:published") → { 1: 'draft', 2: 'published' }
 *
 * @param {string|undefined} raw
 * @returns {Object|null}
 */
export function parseStageMapOverride(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const map = {};
  for (const pair of raw.split(',')) {
    const [idPart, codePart] = pair.split(':').map((x) => String(x || '').trim());
    const id = Number.parseInt(idPart, 10);
    if (Number.isInteger(id) && id > 0 && codePart) {
      map[id] = codePart;
    }
  }
  return Object.keys(map).length > 0 ? map : null;
}

// ─── Afgeleid format ──────────────────────────────────────────────────────────

/**
 * Online, op locatie of hybride — AFGELEID, nooit opgeslagen.
 *
 * Er is bewust geen x_studio_format-veld en geen mapping van event type
 * naar format: dan hoeft er niets bijgewerkt te worden als er een type
 * bijkomt, en de uitkomst volgt altijd de data die echt bepaalt waar
 * iemand naartoe moet.
 *
 * @param {Object} record - ruw Odoo-record
 * @returns {'online'|'onsite'|'hybrid'}
 */
export function deriveFormat(record) {
  const hasLocation = str(record?.[EVENT_FIELDS.LOCATION]) !== null;
  const hasOnlineUrl = str(record?.[EVENT_FIELDS.ONLINE_URL]) !== null;

  if (hasLocation && hasOnlineUrl) return EVENT_FORMAT.HYBRID;
  if (hasLocation) return EVENT_FORMAT.ONSITE;
  return EVENT_FORMAT.ONLINE;
}

// ─── Capaciteit ───────────────────────────────────────────────────────────────

/**
 * @param {number} capacity - 0 of leeg = onbeperkt
 * @param {number} taken
 * @returns {number|null} null = onbeperkt
 */
export function seatsLeft(capacity, taken) {
  const cap = int(capacity, CAPACITY_UNLIMITED) || CAPACITY_UNLIMITED;
  if (cap === CAPACITY_UNLIMITED) return null;
  return Math.max(0, cap - int(taken, 0));
}

/**
 * Staat de inschrijving open? Puur, zodat de beheer-UI, de publieke API en
 * het inschrijf-endpoint uit fase 3 nooit uit elkaar kunnen lopen.
 *
 * @param {Object} dto - resultaat van toEventDto
 * @param {Date} [now]
 * @returns {{ open: boolean, reason: string|null }}
 */
export function registrationStatus(dto, now = new Date()) {
  if (dto.publication_state === PUBLICATION_STATE.CANCELLED) {
    return { open: false, reason: 'cancelled' };
  }
  if (dto.publication_state === PUBLICATION_STATE.DONE) {
    return { open: false, reason: 'event_done' };
  }
  if (dto.publication_state !== PUBLICATION_STATE.PUBLISHED) {
    return { open: false, reason: 'not_published' };
  }
  if (!dto.registration.enabled) {
    return { open: false, reason: 'disabled' };
  }
  if (dto.registration.opens_at && new Date(dto.registration.opens_at) > now) {
    return { open: false, reason: 'not_yet_open' };
  }
  if (dto.registration.closes_at && new Date(dto.registration.closes_at) < now) {
    return { open: false, reason: 'closed' };
  }
  if (dto.starts_at && new Date(dto.starts_at) < now) {
    return { open: false, reason: 'event_started' };
  }
  if (dto.registration.seats_left === 0) {
    return { open: false, reason: 'full' };
  }
  return { open: true, reason: null };
}

// ─── Serializers: Odoo → DTO ──────────────────────────────────────────────────

/**
 * Intern/beheer-DTO. Bevat WEL de online link.
 *
 * @param {Object} record
 * @param {Object} [extra]
 * @param {number} [extra.registrationCount]
 * @returns {Object}
 */
export function toEventDto(record, extra = {}) {
  const startsAt = fromOdooDatetime(record[EVENT_FIELDS.STARTS_AT]);
  const durationMinutes = int(record[EVENT_FIELDS.DURATION_MINUTES], null);
  const capacity = int(record[EVENT_FIELDS.CAPACITY], CAPACITY_UNLIMITED) || CAPACITY_UNLIMITED;
  const count = int(extra.registrationCount, 0);

  const dto = {
    id: int(record[EVENT_FIELDS.ID]),
    title: str(record[EVENT_FIELDS.TITLE]),
    slug: str(record[EVENT_FIELDS.SLUG]),
    summary: str(record[EVENT_FIELDS.SUMMARY]),
    active: record[EVENT_FIELDS.ACTIVE] !== false,
    brand: eventBrand(record),
    // Uit de stage, niet uit een apart statusveld.
    publication_state: stageToState(record[EVENT_FIELDS.STAGE], extra.stageOverrides),
    stage: {
      id: m2oId(record[EVENT_FIELDS.STAGE]),
      name: m2oName(record[EVENT_FIELDS.STAGE])
    },
    format: deriveFormat(record),
    starts_at: startsAt,
    ends_at: computeEndsAt(startsAt, durationMinutes),
    duration_minutes: durationMinutes,
    timezone: TIMEZONE,
    event_type: {
      id: m2oId(record[EVENT_FIELDS.EVENT_TYPE]),
      name: m2oName(record[EVENT_FIELDS.EVENT_TYPE])
    },
    location: {
      name: str(record[EVENT_FIELDS.LOCATION])
    },
    online_url: str(record[EVENT_FIELDS.ONLINE_URL]),
    host: {
      id: m2oId(record[EVENT_FIELDS.HOST]),
      name: m2oName(record[EVENT_FIELDS.HOST])
    },
    hero_image_url: str(record[EVENT_FIELDS.HERO_IMAGE_URL]),
    registration: {
      enabled: bool(record[EVENT_FIELDS.REGISTRATION_ENABLED]),
      opens_at: fromOdooDatetime(record[EVENT_FIELDS.REGISTRATION_OPENS_AT]),
      closes_at: fromOdooDatetime(record[EVENT_FIELDS.REGISTRATION_CLOSES_AT]),
      capacity: capacity === CAPACITY_UNLIMITED ? null : capacity,
      count,
      seats_left: seatsLeft(capacity, count)
    },
    write_date: fromOdooDatetime(record[EVENT_FIELDS.WRITE_DATE])
  };

  // Detailvelden alleen meesturen als ze zijn opgehaald.
  if (EVENT_FIELDS.BODY in record) {
    dto.body_html = str(record[EVENT_FIELDS.BODY]);
    dto.co_host = {
      id: m2oId(record[EVENT_FIELDS.CO_HOST]),
      name: m2oName(record[EVENT_FIELDS.CO_HOST])
    };
    dto.seo = {
      title: str(record[EVENT_FIELDS.SEO_TITLE]),
      description: str(record[EVENT_FIELDS.SEO_DESCRIPTION])
    };
    dto.recap = {
      video_url: str(record[EVENT_FIELDS.VIDEO_URL]),
      thumbnail_url: str(record[EVENT_FIELDS.THUMBNAIL_URL]),
      body_html: str(record[EVENT_FIELDS.RECAP_BODY])
    };
    dto.display = {
      starting_day: str(record[EVENT_FIELDS.STARTING_DAY]),
      starting_time: str(record[EVENT_FIELDS.STARTING_TIME])
    };
    dto.create_date = fromOdooDatetime(record[EVENT_FIELDS.CREATE_DATE]);
  }

  dto.registration.status = registrationStatus(dto);

  return dto;
}

/**
 * PUBLIEK DTO — contract met de WordPress-plugin.
 *
 * HARDE REGEL: hier komt NOOIT de online link in. Die is voor
 * ingeschrevenen en gaat alleen per mail. De regel staat hier in de
 * serializer en niet in de handler, zodat hij niet per ongeluk te
 * omzeilen is.
 *
 * @param {Object} record - ruw Odoo-record
 * @param {Object} [options]
 * @param {number} [options.registrationCount]
 * @param {boolean} [options.detail]
 * @param {string} [options.typeColor]
 * @param {string} [options.typeSlug]
 * @returns {Object}
 */
export function toPublicEventDto(record, options = {}) {
  const internal = toEventDto(record, { registrationCount: options.registrationCount });

  const publicDto = {
    id: internal.id,
    slug: internal.slug,
    title: internal.title,
    summary: internal.summary,
    type: (() => {
      const presentation = eventTypePresentation(internal.event_type.name);
      return {
        id: internal.event_type.id,
        name: internal.event_type.name,
        slug: options.typeSlug ?? presentation.slug,
        color: options.typeColor ?? presentation.color
      };
    })(),
    format: internal.format,
    starts_at: internal.starts_at,
    ends_at: internal.ends_at,
    timezone: internal.timezone,
    location: { name: internal.location.name },
    hero_image_url: internal.hero_image_url,
    registration: {
      open: internal.registration.status.open,
      capacity: internal.registration.capacity,
      seats_left: internal.registration.seats_left
    },
    url: internal.slug ? `${PUBLIC_EVENT_PATH}/${internal.slug}/` : null,
    brand: internal.brand,
    /**
     * Absolute canonical voor een GEDEELD event.
     *
     * Een event met merk `both` bestaat op beide sites op hetzelfde pad. Zonder
     * canonical is dat dubbele content. `options.sharedCanonicalOrigin` komt uit
     * env.EVENTS_SHARED_CANONICAL_ORIGIN; is die niet gezet, dan blijft dit null
     * en gebruikt de site zijn eigen URL.
     */
    canonical_url:
      internal.brand === EVENT_BRAND.BOTH && internal.slug && options.sharedCanonicalOrigin
        ? `${String(options.sharedCanonicalOrigin).replace(/\/$/, '')}${PUBLIC_EVENT_PATH}/${internal.slug}/`
        : null
  };

  if (options.detail) {
    publicDto.body_html = internal.body_html ?? null;
    publicDto.speakers = [internal.host, internal.co_host]
      .filter((p) => p && p.id && p.name)
      .map((p) => ({ name: p.name }));
    publicDto.seo = internal.seo ?? { title: null, description: null };
    publicDto.recap = {
      video_url: internal.recap?.video_url ?? null,
      thumbnail_url: internal.recap?.thumbnail_url ?? null,
      body_html: internal.recap?.body_html ?? null
    };
  }

  return publicDto;
}

/** @returns {Object} */
export function toRegistrationDto(record) {
  return {
    id: int(record[REGISTRATION_FIELDS.ID]),
    name: str(record[REGISTRATION_FIELDS.NAME]),
    event_id: m2oId(record[REGISTRATION_FIELDS.EVENT]),
    partner: {
      id: m2oId(record[REGISTRATION_FIELDS.PARTNER]),
      name: m2oName(record[REGISTRATION_FIELDS.PARTNER])
    },
    submitted_email: str(record[REGISTRATION_FIELDS.SUBMITTED_EMAIL]),
    questions: str(record[REGISTRATION_FIELDS.QUESTIONS]),
    state: str(record[REGISTRATION_FIELDS.STATE]) || 'registered',
    source: str(record[REGISTRATION_FIELDS.SOURCE]),
    attended: bool(record[REGISTRATION_FIELDS.ATTENDED]),
    attendance: {
      updated_at: fromOdooDatetime(record[REGISTRATION_FIELDS.ATTENDANCE_UPDATED_AT]),
      updated_by: m2oName(record[REGISTRATION_FIELDS.ATTENDANCE_UPDATED_BY]),
      origin: str(record[REGISTRATION_FIELDS.ATTENDANCE_ORIGIN])
    },
    contact_created: bool(record[REGISTRATION_FIELDS.CONTACT_CREATED]),
    lead_created: bool(record[REGISTRATION_FIELDS.LEAD_CREATED]),
    mails: {
      confirmation_sent: bool(record[REGISTRATION_FIELDS.CONFIRMATION_SENT]),
      reminder_sent: bool(record[REGISTRATION_FIELDS.REMINDER_SENT]),
      recap_sent: bool(record[REGISTRATION_FIELDS.RECAP_SENT])
    },
    created_at: fromOdooDatetime(record[REGISTRATION_FIELDS.CREATE_DATE]),
    write_date: fromOdooDatetime(record[REGISTRATION_FIELDS.WRITE_DATE])
  };
}

export function toEventTypeDto(record) {
  return {
    id: int(record[EVENT_TYPE_FIELDS.ID]),
    name: str(record[EVENT_TYPE_FIELDS.NAME]),
    active: record[EVENT_TYPE_FIELDS.ACTIVE] !== false,
    sequence: int(record[EVENT_TYPE_FIELDS.SEQUENCE], 0)
  };
}

// ─── Serializer: DTO → Odoo ───────────────────────────────────────────────────

/**
 * Zet een (partiele) DTO om naar Odoo-values.
 *
 * De publicatiestatus zit hier NIET in: die is een stage, en de
 * code-naar-stage-id-vertaling vraagt een Odoo-lookup. Zie
 * setPublicationState in lib/events-service.js.
 *
 * Alleen aanwezige sleutels worden meegenomen, zodat dit ook voor PATCH
 * werkt. Wordt `starts_at` gezet, dan gaan de afgeleide weergavevelden
 * automatisch mee — dat is de hele reden dat deze functie bestaat.
 *
 * @param {Object} input
 * @returns {Object} Odoo values
 */
export function toOdooEventValues(input = {}) {
  const values = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  if (has('title')) values[EVENT_FIELDS.TITLE] = input.title;
  if (has('slug')) values[EVENT_FIELDS.SLUG] = input.slug || false;
  if (has('summary')) values[EVENT_FIELDS.SUMMARY] = input.summary || false;
  if (has('body_html')) values[EVENT_FIELDS.BODY] = input.body_html || false;
  if (has('active')) values[EVENT_FIELDS.ACTIVE] = Boolean(input.active);

  if (has('event_type_id')) {
    values[EVENT_FIELDS.EVENT_TYPE] = input.event_type_id || false;
  }
  if (has('stage_id')) values[EVENT_FIELDS.STAGE] = input.stage_id || false;
  if (has('host_id')) values[EVENT_FIELDS.HOST] = input.host_id || false;
  if (has('co_host_id')) values[EVENT_FIELDS.CO_HOST] = input.co_host_id || false;

  if (has('location_name')) values[EVENT_FIELDS.LOCATION] = input.location_name || false;
  if (has('online_url')) values[EVENT_FIELDS.ONLINE_URL] = input.online_url || false;

  if (has('duration_minutes')) {
    values[EVENT_FIELDS.DURATION_MINUTES] = int(input.duration_minutes, DEFAULT_DURATION_MINUTES);
  }
  if (has('capacity')) {
    values[EVENT_FIELDS.CAPACITY] = int(input.capacity, CAPACITY_UNLIMITED) || CAPACITY_UNLIMITED;
  }
  if (has('registration_enabled')) {
    values[EVENT_FIELDS.REGISTRATION_ENABLED] = Boolean(input.registration_enabled);
  }
  if (has('registration_opens_at')) {
    values[EVENT_FIELDS.REGISTRATION_OPENS_AT] = toOdooDatetime(input.registration_opens_at);
  }
  if (has('registration_closes_at')) {
    values[EVENT_FIELDS.REGISTRATION_CLOSES_AT] = toOdooDatetime(input.registration_closes_at);
  }

  if (has('hero_image_url')) values[EVENT_FIELDS.HERO_IMAGE_URL] = input.hero_image_url || false;
  if (has('seo_title')) values[EVENT_FIELDS.SEO_TITLE] = input.seo_title || false;
  if (has('seo_description')) values[EVENT_FIELDS.SEO_DESCRIPTION] = input.seo_description || false;

  if (has('video_url')) values[EVENT_FIELDS.VIDEO_URL] = input.video_url || false;
  if (has('thumbnail_url')) values[EVENT_FIELDS.THUMBNAIL_URL] = input.thumbnail_url || false;
  if (has('recap_body_html')) values[EVENT_FIELDS.RECAP_BODY] = input.recap_body_html || false;

  // Datum als laatste, zodat de afgeleide velden altijd bij de nieuwe
  // waarde horen en niet bij een oude.
  if (has('starts_at')) {
    if (!input.starts_at) {
      throw new Error('starts_at mag niet leeg zijn: het is een verplicht veld');
    }
    values[EVENT_FIELDS.STARTS_AT] = toOdooDatetime(input.starts_at);
    Object.assign(values, derivedDisplayFields(input.starts_at));
  }

  assertNoForbiddenFields(Object.keys(values), 'toOdooEventValues');
  return values;
}
