/**
 * Event Operations v2 — Validatie
 *
 * Odoo dwingt bijna niets af: er staan geen check-constraints op de
 * Studio-velden en geen unieke index op de slug. Alle regels leven dus
 * hier, en dit is de enige plek waar ze staan.
 */

import {
  PUBLICATION_STATE,
  PUBLICATION_STATES,
  PUBLICATION_TRANSITIONS,
  PAGINATION
} from '../constants.js';

export class ValidationError extends Error {
  constructor(message, { status = 400, details = null } = {}) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
    this.details = details;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isIsoDate(value) {
  if (!isNonEmptyString(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

/**
 * Payload voor aanmaken of wijzigen. Alleen aanwezige sleutels worden
 * gecontroleerd, zodat dit ook voor PATCH werkt.
 *
 * @param {Object} input
 * @param {Object} [options]
 * @param {boolean} [options.isCreate]
 * @returns {Object} het opgeschoonde resultaat
 */
export function validateEventInput(input, { isCreate = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Body moet een object zijn');
  }

  const errors = [];
  const has = (key) => Object.prototype.hasOwnProperty.call(input, key);

  if (isCreate) {
    if (!isNonEmptyString(input.title)) errors.push('title is verplicht');
    if (!isIsoDate(input.starts_at)) errors.push('starts_at is verplicht en moet een geldige datum zijn');
  }

  if (has('title') && !isNonEmptyString(input.title)) {
    errors.push('title mag niet leeg zijn');
  }
  if (has('starts_at') && !isIsoDate(input.starts_at)) {
    errors.push('starts_at moet een geldige ISO-datum zijn');
  }
  if (has('duration_minutes')) {
    const d = Number(input.duration_minutes);
    if (!Number.isInteger(d) || d <= 0 || d > 24 * 60) {
      errors.push('duration_minutes moet tussen 1 en 1440 liggen');
    }
  }
  if (has('capacity')) {
    const c = Number(input.capacity);
    if (!Number.isInteger(c) || c < 0) {
      errors.push('capacity moet 0 (onbeperkt) of een positief geheel getal zijn');
    }
  }
  if (has('publication_state') && !PUBLICATION_STATES.includes(input.publication_state)) {
    errors.push(`publication_state moet een van ${PUBLICATION_STATES.join(', ')} zijn`);
  }
  if (has('event_type_id') && input.event_type_id !== null) {
    const id = Number(input.event_type_id);
    if (!Number.isInteger(id) || id <= 0) errors.push('event_type_id moet een positief geheel getal zijn');
  }
  for (const key of ['registration_opens_at', 'registration_closes_at']) {
    if (has(key) && input[key] !== null && !isIsoDate(input[key])) {
      errors.push(`${key} moet een geldige ISO-datum of null zijn`);
    }
  }
  if (
    isIsoDate(input.registration_opens_at) &&
    isIsoDate(input.registration_closes_at) &&
    new Date(input.registration_opens_at) >= new Date(input.registration_closes_at)
  ) {
    errors.push('registration_opens_at moet voor registration_closes_at liggen');
  }
  if (has('online_url') && isNonEmptyString(input.online_url)) {
    try {
      new URL(input.online_url);
    } catch {
      errors.push('online_url moet een geldige URL zijn');
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Validatie mislukt', { details: errors });
  }

  return input;
}

/**
 * Mag dit event gepubliceerd worden? Geeft terug WAT er mist, niet
 * alleen dat er iets mist — v1 gaf "Sync validation failed" zonder te
 * zeggen welk event of welk veld, en dat kostte elke keer uitzoekwerk.
 *
 * @param {Object} dto - resultaat van toEventDto
 * @returns {{ ready: boolean, missing: string[] }}
 */
export function checkPublishReadiness(dto) {
  const missing = [];

  if (!isNonEmptyString(dto.title)) missing.push('titel');
  if (!isNonEmptyString(dto.slug)) missing.push('slug');
  if (!dto.starts_at) missing.push('startdatum');
  if (!dto.duration_minutes) missing.push('duurtijd');
  if (!dto.event_type?.id) missing.push('event type');
  if (!isNonEmptyString(dto.summary)) missing.push('samenvatting');

  // De host is de AFZENDER van de bevestigings-, herinnerings- en
  // recapmails: die templates lezen
  // x_studio_linked_webinar.x_studio_user_id. Zonder host is email_from leeg
  // en faalt de mail in Odoo — zonder dat iemand het ziet. Dus geen
  // publicatie zonder host.
  if (!dto.host?.id) missing.push('host (afzender van de mails)');

  // Een event op locatie zonder locatie, of online zonder link, is niet
  // publiceerbaar: de bezoeker weet dan niet waar hij moet zijn.
  if (dto.format === 'onsite' && !isNonEmptyString(dto.location?.name)) {
    missing.push('locatie');
  }
  if (dto.format === 'online' && !isNonEmptyString(dto.online_url)) {
    missing.push('online link');
  }

  return { ready: missing.length === 0, missing };
}

/**
 * @param {string} from
 * @param {string} to
 * @returns {void} gooit een ValidationError met status 409 bij een verboden overgang
 */
export function assertPublicationTransition(from, to) {
  const current = PUBLICATION_STATES.includes(from) ? from : PUBLICATION_STATE.DRAFT;

  if (!PUBLICATION_STATES.includes(to)) {
    throw new ValidationError(`Onbekende publicatiestatus: ${to}`, { status: 400 });
  }
  if (current === to) {
    return;
  }
  if (!(PUBLICATION_TRANSITIONS[current] || []).includes(to)) {
    throw new ValidationError(
      `Overgang van ${current} naar ${to} is niet toegestaan`,
      { status: 409 }
    );
  }
}

/**
 * Paginering met een echt plafond in plaats van een verborgen limit: 100.
 *
 * @returns {{ page: number, perPage: number, offset: number }}
 */
export function normalizePagination(query = {}, { maxPerPage = PAGINATION.MAX_PER_PAGE } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.per_page ?? query.perPage, 10);
  const perPage = Math.min(
    maxPerPage,
    Math.max(1, Number.isInteger(requested) && requested > 0 ? requested : PAGINATION.DEFAULT_PER_PAGE)
  );

  return { page, perPage, offset: (page - 1) * perPage };
}

/**
 * @param {string} value
 * @returns {string} genormaliseerd e-mailadres
 */
export function normalizeEmail(value) {
  if (!isNonEmptyString(value)) {
    throw new ValidationError('E-mailadres is verplicht');
  }
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    throw new ValidationError(`Ongeldig e-mailadres: ${value}`);
  }
  return normalized;
}
