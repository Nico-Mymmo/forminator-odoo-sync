/**
 * Webinar Registration Service (Addendum G)
 */

import { getWebinarRegistrationCount, getWebinarRegistrations, getPartnersByIds } from '../odoo-client.js';
import { resolveLeadStatesForPartners } from './lead-resolution-service.js';

const FULL_LIST_THRESHOLD = 120;
const VIRTUALIZATION_THRESHOLD = 300;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parseMany2One(value) {
  if (Array.isArray(value) && value.length > 0) {
    const id = Number(value[0]);
    const name = value[1] != null ? String(value[1]) : null;
    return {
      id: Number.isInteger(id) ? id : null,
      name
    };
  }

  const id = Number(value);
  if (!Number.isInteger(id)) {
    return { id: null, name: null };
  }

  return { id, name: null };
}

function pickFirst(record, candidates) {
  for (const candidate of candidates) {
    if (record?.[candidate] !== undefined) {
      return record[candidate];
    }
  }
  return null;
}

function parseBoolean(value) {
  return value === true || value === 1 || value === '1';
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizePageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  const parsed = normalizePositiveInteger(value, fallback);
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function detectHtmlContent(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return false;
  }

  return /<\s*\/?\s*[a-z][^>]*>/i.test(value);
}

/**
 * Fetch webinar registrations with deterministic lead state enrichment.
 *
 * Threshold enforcement:
 * - 0-120: full list
 * - 121-300: mandatory pagination
 * - >300: mandatory pagination + virtualizationRequired
 *
 * @param {Object} env
 * @param {Object} options
 * @param {number} options.webinarId
 * @param {number|string} [options.page]
 * @param {number|string} [options.perPage]
 * @returns {Promise<Object>}
 */
export async function getWebinarRegistrationsView(env, options) {
  const webinarId = Number(options?.webinarId);
  if (!Number.isInteger(webinarId) || webinarId <= 0) {
    throw new Error('Invalid webinarId');
  }

  const total = Number(await getWebinarRegistrationCount(env, webinarId)) || 0;

  const requiresPagination = total > FULL_LIST_THRESHOLD;
  const requiresVirtualization = total > VIRTUALIZATION_THRESHOLD;

  const page = normalizePositiveInteger(options?.page, 1);
  const perPage = normalizePageSize(options?.perPage, DEFAULT_PAGE_SIZE);

  const effectivePage = requiresPagination ? page : 1;
  const effectivePerPage = requiresPagination ? perPage : Math.max(total, 1);
  const effectiveOffset = requiresPagination ? (effectivePage - 1) * effectivePerPage : 0;

  const records = total === 0
    ? []
    : await getWebinarRegistrations(env, webinarId, {
      offset: effectiveOffset,
      limit: effectivePerPage,
      order: 'write_date desc, id desc'
    });

  const registrationRows = Array.isArray(records) ? records : [];

  const partnerIds = [...new Set(
    registrationRows
      .map((row) => pickFirst(row, ['x_studio_registered_by', 'partner_id']))
      .map((value) => parseMany2One(value).id)
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  const leadStateByPartnerId = await resolveLeadStatesForPartners(env, partnerIds);
  const partners = await getPartnersByIds(env, partnerIds);
  const partnerById = new Map(
    (Array.isArray(partners) ? partners : [])
      .map((partner) => [Number(partner?.id), partner])
      .filter(([id]) => Number.isInteger(id) && id > 0)
  );

  const rows = registrationRows.map((row) => {
    const registrationId = Number(row?.id);
    const registeredBy = parseMany2One(pickFirst(row, ['x_studio_registered_by', 'partner_id']));
    const contactCreated = parseBoolean(pickFirst(row, ['x_studio_contact_created', 'x_contact_created', 'contact_created']));
    const attended = parseBoolean(pickFirst(row, ['x_studio_webinar_attended', 'x_webinar_attended', 'attended']));
    const confirmationEmailSent = parseBoolean(pickFirst(row, [
      'x_studio_confirmation_email_sent',
      'x_confirmation_email_sent',
      'confirmation_email_sent',
      'x_studio_confirmation_sent',
      'x_confirmation_sent',
      'confirmation_sent'
    ]));
    const reminderEmailSent = parseBoolean(pickFirst(row, [
      'x_studio_reminder_email_sent',
      'x_reminder_email_sent',
      'reminder_email_sent',
      'x_studio_reminder_sent',
      'x_reminder_sent',
      'reminder_sent'
    ]));
    const recapEmailSent = parseBoolean(pickFirst(row, [
      'x_studio_recap_email_sent',
      'x_recap_email_sent',
      'recap_email_sent',
      'x_studio_recap_sent',
      'x_recap_sent',
      'recap_sent'
    ]));

    const rowEmail = pickFirst(row, ['x_studio_email', 'email', 'email_from']);
    const fallbackEmail = registeredBy.id ? (partnerById.get(registeredBy.id)?.email || null) : null;

    return {
      id: Number.isInteger(registrationId) ? registrationId : null,
      name: pickFirst(row, ['x_name', 'name']),
      email: rowEmail || fallbackEmail,
      attended,
      questions: pickFirst(row, ['x_studio_webinar_questions', 'x_studio_questions', 'questions']),
      questions_is_html_flag: detectHtmlContent(pickFirst(row, ['x_studio_webinar_questions', 'x_studio_questions', 'questions'])),
      contactCreated,
      x_studio_confirmation_email_sent: confirmationEmailSent,
      x_studio_reminder_email_sent: reminderEmailSent,
      x_studio_recap_email_sent: recapEmailSent,
      registeredBy,
      lead: registeredBy.id ? (leadStateByPartnerId.get(registeredBy.id) || null) : null
    };
  });

  const totalPages = requiresPagination
    ? Math.max(1, Math.ceil(total / effectivePerPage))
    : 1;

  return {
    webinarId,
    total,
    rows,
    pagination: {
      page: effectivePage,
      perPage: effectivePerPage,
      totalPages,
      requiresPagination,
      requiresVirtualization,
      thresholds: {
        fullListMax: FULL_LIST_THRESHOLD,
        virtualizationMin: VIRTUALIZATION_THRESHOLD + 1
      }
    }
  };
}
