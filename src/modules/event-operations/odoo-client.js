/**
 * Odoo Client Wrapper
 * 
 * Abstracts Odoo x_webinar integration
 */

import { searchRead, executeKw, write } from '../../lib/odoo.js';
import { ODOO_MODEL, ODOO_FIELDS } from './constants.js';

let cachedEventTypeFieldName = null;

/**
 * Resolve actual x_webinar event type field name in Odoo.
 *
 * Some databases may use a Studio-generated field name variant instead of
 * `x_webinar_event_type_id`. We detect once via fields_get and normalize.
 *
 * @param {Object} env
 * @returns {Promise<string>}
 */
async function resolveEventTypeFieldName(env) {
  if (cachedEventTypeFieldName) {
    return cachedEventTypeFieldName;
  }

  const fieldsInfo = await executeKw(env, {
    model: ODOO_MODEL.WEBINAR,
    method: 'fields_get',
    args: [],
    kwargs: { attributes: ['type', 'relation'] }
  });

  const preferredCandidates = [
    'x_event_type_id',
    ODOO_FIELDS.EVENT_TYPE_ID,
    'x_studio_webinar_event_type_id',
    'x_studio_event_type_id',
    'x_studio_webinar_type_id',
    'x_studio_webinar_type'
  ];

  for (const fieldName of preferredCandidates) {
    const field = fieldsInfo?.[fieldName];
    if (field?.type === 'many2one') {
      cachedEventTypeFieldName = fieldName;
      return cachedEventTypeFieldName;
    }
  }

  for (const [fieldName, field] of Object.entries(fieldsInfo || {})) {
    if (field?.type === 'many2one' && field?.relation === ODOO_MODEL.EVENT_TYPE) {
      cachedEventTypeFieldName = fieldName;
      return cachedEventTypeFieldName;
    }
  }

  throw new Error(
    `Could not resolve event type field on ${ODOO_MODEL.WEBINAR}. Expected a many2one to ${ODOO_MODEL.EVENT_TYPE}.`
  );
}

function normalizeWebinarEventTypeField(webinar, actualFieldName) {
  if (!webinar || typeof webinar !== 'object') {
    return webinar;
  }

  if (actualFieldName !== ODOO_FIELDS.EVENT_TYPE_ID) {
    webinar[ODOO_FIELDS.EVENT_TYPE_ID] = webinar[actualFieldName] || null;
  }

  return webinar;
}

/**
 * Get all active webinars from Odoo
 * 
 * @param {Object} env - Cloudflare env
 * @returns {Promise<Array>}
 */
export async function getOdooWebinars(env) {
  const eventTypeFieldName = await resolveEventTypeFieldName(env);

  const webinars = await searchRead(env, {
    model: ODOO_MODEL.WEBINAR,
    domain: [
      [ODOO_FIELDS.ACTIVE, '=', true]
    ],
    fields: [
      ODOO_FIELDS.ID,
      ODOO_FIELDS.NAME,
      ODOO_FIELDS.EVENT_DATETIME,
      ODOO_FIELDS.DURATION_MINUTES,
      ODOO_FIELDS.INFO,
      ODOO_FIELDS.STAGE,
      ODOO_FIELDS.ACTIVE,
      eventTypeFieldName
    ],
    order: `${ODOO_FIELDS.EVENT_DATETIME} DESC`,
    limit: 100
  });

  return webinars.map((webinar) => normalizeWebinarEventTypeField(webinar, eventTypeFieldName));
}

/**
 * Get single webinar by ID
 * 
 * @param {Object} env
 * @param {number} webinarId
 * @returns {Promise<Object>}
 */
export async function getOdooWebinar(env, webinarId) {
  const eventTypeFieldName = await resolveEventTypeFieldName(env);

  const webinars = await searchRead(env, {
    model: ODOO_MODEL.WEBINAR,
    domain: [
      [ODOO_FIELDS.ID, '=', webinarId]
    ],
    fields: [
      ODOO_FIELDS.ID,
      ODOO_FIELDS.NAME,
      ODOO_FIELDS.EVENT_DATETIME,
      ODOO_FIELDS.DURATION_MINUTES,
      ODOO_FIELDS.INFO,
      ODOO_FIELDS.STAGE,
      ODOO_FIELDS.ACTIVE,
      eventTypeFieldName
    ],
    limit: 1
  });
  
  if (webinars.length === 0) {
    throw new Error(`Webinar ${webinarId} not found in Odoo`);
  }

  return normalizeWebinarEventTypeField(webinars[0], eventTypeFieldName);
}

/**
 * Get registration count for a webinar
 * 
 * @param {Object} env
 * @param {number} webinarId
 * @returns {Promise<number>} Registration count
 */
export async function getRegistrationCount(env, webinarId) {
  const count = await executeKw(env, {
    model: ODOO_MODEL.REGISTRATION,
    method: 'search_count',
    args: [[['x_studio_linked_webinar', '=', webinarId]]]
  });
  
  return count;
}

/**
 * Get registration counts for multiple webinars in one Odoo read_group call.
 *
 * Response shape is optimized for routes: { [webinarId]: count }
 * Missing webinar IDs are not returned by Odoo and should default to 0 by caller.
 *
 * @param {Object} env
 * @param {number[]} webinarIds
 * @returns {Promise<Object<number, number>>}
 */
export async function getRegistrationCountsByWebinar(env, webinarIds) {
  if (!Array.isArray(webinarIds) || webinarIds.length === 0) {
    return {};
  }

  const sanitizedIds = webinarIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (sanitizedIds.length === 0) {
    return {};
  }

  const grouped = await executeKw(env, {
    model: ODOO_MODEL.REGISTRATION,
    method: 'read_group',
    args: [
      [['x_studio_linked_webinar', 'in', sanitizedIds]],
      ['x_studio_linked_webinar'],
      ['x_studio_linked_webinar']
    ],
    kwargs: {
      lazy: false
    }
  });

  const counts = {};
  for (const group of grouped || []) {
    const relation = group?.x_studio_linked_webinar;
    const webinarId = Array.isArray(relation)
      ? Number(relation[0])
      : Number(relation);

    if (!Number.isInteger(webinarId) || webinarId <= 0) {
      continue;
    }

    const count = Number(
      group?.x_studio_linked_webinar_count ??
      group?.__count ??
      group?.id_count ??
      0
    );

    counts[webinarId] = Number.isFinite(count) ? count : 0;
  }

  return counts;
}

/**
 * Get all tags from Odoo x_webinar_tag model
 * 
 * Used for tag mapping UI to show all available tags
 * 
 * @param {Object} env
 * @returns {Promise<Array>} Array of tag objects: [{ id, x_name }]
 */
export async function getAllOdooTags(env) {
  const tags = await searchRead(env, {
    model: ODOO_MODEL.TAGS,
    fields: ['id', 'x_name'],
    order: 'x_name ASC',
    limit: 200
  });
  
  return tags;
}

/**
 * Get all event types from Odoo x_webinar_event_type model
 *
 * Used for Addendum C event type mapping UI
 *
 * @param {Object} env
 * @returns {Promise<Array>} Array of event type objects: [{ id, x_name }]
 */
export async function getAllOdooEventTypes(env) {
  const eventTypes = await searchRead(env, {
    model: ODOO_MODEL.EVENT_TYPE,
    fields: ['id', 'x_name'],
    order: 'x_name ASC',
    limit: 500
  });

  return eventTypes;
}

/**
 * Update a single Odoo webinar field (e.g. description)
 *
 * @param {Object} env
 * @param {number} webinarId - Odoo record ID
 * @param {Object} values - Fields to update, e.g. { x_studio_webinar_info: '...' }
 * @returns {Promise<boolean>} true on success
 */
export async function updateOdooWebinar(env, webinarId, values) {
  return write(env, {
    model: ODOO_MODEL.WEBINAR,
    ids: [webinarId],
    values
  });
}
