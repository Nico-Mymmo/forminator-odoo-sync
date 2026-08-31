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
 * Publicatiestatus — letterlijk uit Odoo:
 * ir.model.fields id 16593, x_webinar.x_studio_publication_state
 * [('draft','draft'),('published','published'),('cancelled','cancelled')]
 */
export const PUBLICATION_STATE = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CANCELLED: 'cancelled'
};

export const PUBLICATION_STATES = Object.values(PUBLICATION_STATE);

/**
 * Toegestane overgangen. Elke andere combinatie is een 409.
 */
export const PUBLICATION_TRANSITIONS = {
  [PUBLICATION_STATE.DRAFT]: [PUBLICATION_STATE.PUBLISHED],
  [PUBLICATION_STATE.PUBLISHED]: [PUBLICATION_STATE.DRAFT, PUBLICATION_STATE.CANCELLED],
  [PUBLICATION_STATE.CANCELLED]: [PUBLICATION_STATE.DRAFT]
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
  ADMIN_LIST: 15,
  ADMIN_DETAIL: 15
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
  EVENT_TYPES: 'event_types'
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

/** Basispad van de publieke eventpagina op de website. */
export const PUBLIC_EVENT_PATH = '/events';
