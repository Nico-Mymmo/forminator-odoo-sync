/**
 * Event Operations v2 — Constants
 *
 * ARCHITECTUURREGEL: Odoo is de enige database. Deze module bezit geen data.
 * Er mag geen enkele Supabase-tabel voor deze module bestaan en
 * `getSupabaseClient` mag hier nergens geimporteerd worden.
 * Cache (KV) en assets (R2) zijn wegwerpbaar: altijd herbouwbaar uit Odoo.
 */

export const LOG_PREFIX = '[events-v2]';

export const TIMEZONE = 'Europe/Brussels';
export const LOCALE = 'nl-BE';

export const DEFAULT_DURATION_MINUTES = 60;

/**
 * Publicatiestatus — komt uit `x_studio_stage_id` (many2one naar
 * x_webinar_stage), NIET uit een selection-veld.
 *
 * De stage is de enige levenscyclus: Odoo's kanban en de website lezen
 * dezelfde waarde, dus ze kunnen niet uit elkaar lopen. Stages in Odoo
 * (geverifieerd 2026-08-31): Draft(1), Published(2), Done(3), Cancelled(4).
 *
 * `x_studio_publication_state` wordt bewust NIET meer gebruikt — zie
 * FORBIDDEN_FIELDS in odoo-contract.js.
 */
export const PUBLICATION_STATE = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  DONE: 'done',
  CANCELLED: 'cancelled'
};

export const PUBLICATION_STATES = Object.values(PUBLICATION_STATE);

/**
 * Toegestane overgangen. Elke andere combinatie is een 409.
 *
 * `done` is niet definitief: een event heropenen moet kunnen, bijvoorbeeld
 * als een sessie verplaatst wordt nadat ze al was afgerond.
 */
export const PUBLICATION_TRANSITIONS = {
  [PUBLICATION_STATE.DRAFT]: [PUBLICATION_STATE.PUBLISHED, PUBLICATION_STATE.CANCELLED],
  [PUBLICATION_STATE.PUBLISHED]: [
    PUBLICATION_STATE.DRAFT,
    PUBLICATION_STATE.DONE,
    PUBLICATION_STATE.CANCELLED
  ],
  [PUBLICATION_STATE.DONE]: [PUBLICATION_STATE.PUBLISHED, PUBLICATION_STATE.CANCELLED],
  [PUBLICATION_STATE.CANCELLED]: [PUBLICATION_STATE.DRAFT]
};

/**
 * Welke statussen zichtbaar zijn op de website.
 *
 * `done` blijft staan: een afgelopen event houdt zijn pagina, want daar
 * hangt de recap aan. De datumfilter in de publieke API bepaalt of het in
 * de kalender opduikt; `include_past=1` haalt het archief erbij.
 */
export const PUBLIC_VISIBLE_STATES = [PUBLICATION_STATE.PUBLISHED, PUBLICATION_STATE.DONE];

/**
 * Stagenamen in Odoo → statuscode. Wordt genormaliseerd vergeleken
 * (kleine letters, zonder accenten), dus "Gepubliceerd" en "published"
 * komen op hetzelfde uit. Onbekende stages vallen terug op draft met een
 * waarschuwing in de logs.
 *
 * Te overschrijven met env.EVENT_STAGE_MAP in de vorm "1:draft,2:published".
 */
export const STAGE_NAME_TO_STATE = {
  draft: PUBLICATION_STATE.DRAFT,
  concept: PUBLICATION_STATE.DRAFT,
  nieuw: PUBLICATION_STATE.DRAFT,
  new: PUBLICATION_STATE.DRAFT,
  published: PUBLICATION_STATE.PUBLISHED,
  gepubliceerd: PUBLICATION_STATE.PUBLISHED,
  live: PUBLICATION_STATE.PUBLISHED,
  done: PUBLICATION_STATE.DONE,
  afgelopen: PUBLICATION_STATE.DONE,
  afgerond: PUBLICATION_STATE.DONE,
  gereed: PUBLICATION_STATE.DONE,
  klaar: PUBLICATION_STATE.DONE,
  cancelled: PUBLICATION_STATE.CANCELLED,
  canceled: PUBLICATION_STATE.CANCELLED,
  geannuleerd: PUBLICATION_STATE.CANCELLED,
  geschrapt: PUBLICATION_STATE.CANCELLED
};

/**
 * Registratiestatus — letterlijk uit Odoo:
 * ir.model.fields id 16619, x_webinarregistrations.x_studio_registration_state
 */
export const REGISTRATION_STATE = {
  REGISTERED: 'registered',
  WAITLISTED: 'waitlisted',
  CANCELLED: 'cancelled'
};

export const REGISTRATION_STATES = Object.values(REGISTRATION_STATE);

/**
 * Herkomst — letterlijk uit Odoo:
 * ir.model.fields id 16617, x_webinarregistrations.x_studio_source
 */
export const REGISTRATION_SOURCE = {
  PUBLIC_FORM: 'public_form',
  MANUAL: 'manual',
  FORMINATOR: 'forminator',
  IMPORT: 'import'
};

export const REGISTRATION_SOURCES = Object.values(REGISTRATION_SOURCE);

/**
 * Format wordt AFGELEID uit locatie + link, nooit opgeslagen.
 * Zie deriveFormat() in odoo-contract.js.
 */
export const EVENT_FORMAT = {
  ONLINE: 'online',
  ONSITE: 'onsite',
  HYBRID: 'hybrid'
};

/** 0 in x_studio_capacity betekent onbeperkt. */
export const CAPACITY_UNLIMITED = 0;

/**
 * Cache-TTL's in seconden. De cache is wegwerpbaar; bij twijfel korter.
 */
export const CACHE_TTL = {
  PUBLIC_LIST: 60,
  PUBLIC_DETAIL: 60,
  EVENT_TYPES: 300,
  // 0 = niet cachen. De beheerkant leest ALTIJD rechtstreeks uit Odoo:
  // wie in Odoo iets wijzigt, moet dat na een verversing meteen zien.
  // Een cache van een paar seconden is die verwarring niet waard, en de
  // twee-calls-regel houdt het toch snel. De publieke API houdt zijn
  // cache wel — daar zit de belasting.
  ADMIN_LIST: 0,
  ADMIN_DETAIL: 0,
  // Stages veranderen bijna nooit, maar wel binnen een isolate-leven.
  STAGES: 120
};

/** KV-sleutelruimte. Alles onder dit prefix is veilig te wissen. */
export const CACHE_PREFIX = 'evtv2';

/**
 * Cache-namespaces. Een schrijfactie verhoogt de versie van een namespace,
 * waardoor alle sleutels erin in een keer ongeldig worden. KV kan niet
 * wildcard-verwijderen, dus versiebump is het invalidatiemechanisme.
 */
export const CACHE_NS = {
  EVENTS: 'events',
  EVENT_TYPES: 'event_types',
  STAGES: 'stages'
};

/** Paginering. Geen verborgen plafond zoals de `limit: 100` in v1. */
export const PAGINATION = {
  DEFAULT_PER_PAGE: 25,
  MAX_PER_PAGE: 100,
  PUBLIC_MAX_LIMIT: 200,
  PUBLIC_DEFAULT_LIMIT: 50
};

/** Rate limit voor de publieke API, per sitesleutel. */
export const PUBLIC_RATE_LIMIT = {
  WINDOW_SECONDS: 60,
  MAX_REQUESTS: 120
};

/** Versie van de publieke responsvorm. Contract met de WordPress-plugin. */
export const PUBLIC_SHAPE_VERSION = 1;

/**
 * Basispad van de publieke eventpagina.
 *
 * Enkelvoud, met sluitende slash: dat is exact de vorm die The Events
 * Calendar vandaag gebruikt (`/event/{slug}/?owid={id}`), geverifieerd op
 * openvme.be. Zo blijven bestaande links en zoekresultaten werken na de
 * omschakeling. Het archief staat op /events/.
 */
export const PUBLIC_EVENT_PATH = '/event';
export const PUBLIC_ARCHIVE_PATH = '/events';

/**
 * Vaste kleur en slug per event type, voor de kalender op de website.
 *
 * De slugs komen overeen met de bestaande tribe_events_cat-taxonomie op
 * openvme.be (qa, opleiding, webinar, live), zodat bestaande categorie-
 * links en styling blijven kloppen. Onbekende types krijgen de neutrale
 * waarde en een slug uit hun naam.
 */
export const EVENT_TYPE_PRESENTATION = {
  'q&a': { slug: 'qa', color: '#0D9488' },
  'qa': { slug: 'qa', color: '#0D9488' },
  'groepsopleiding': { slug: 'opleiding', color: '#DB2777' },
  'opleiding': { slug: 'opleiding', color: '#DB2777' },
  'infosessie': { slug: 'webinar', color: '#0369A1' },
  'webinar': { slug: 'webinar', color: '#0369A1' },
  'live event': { slug: 'live', color: '#B45309' },
  'productsessie': { slug: 'productsessie', color: '#7C3AED' }
};

export const EVENT_TYPE_FALLBACK_COLOR = '#475569';
