/**
 * Odoo Client Wrapper
 * 
 * Abstracts Odoo x_webinar integration
 */

import { searchRead, executeKw, write } from '../../lib/odoo.js';
import { ODOO_MODEL, ODOO_FIELDS } from './constants.js';

let cachedEventTypeFieldName = null;
let cachedRecapTemplateFieldName = null;
const DEFAULT_RECAP_TEMPLATE_ID = 53;

function resolveRecapTemplateId(env) {
  const candidates = [
    env?.RECAP_MAIL_TEMPLATE_ID,
    env?.ODOO_RECAP_TEMPLATE_ID
  ];

  for (const candidate of candidates) {
    const parsed = Number.parseInt(String(candidate || '').trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_RECAP_TEMPLATE_ID;
}

async function resolveRecapTemplateFieldName(env) {
  if (cachedRecapTemplateFieldName) {
    return cachedRecapTemplateFieldName;
  }

  const envOverride = String(env?.RECAP_TEMPLATE_FIELD || '').trim();
  if (envOverride) {
    cachedRecapTemplateFieldName = envOverride;
    return cachedRecapTemplateFieldName;
  }

  const fieldsInfo = await executeKw(env, {
    model: ODOO_MODEL.WEBINAR,
    method: 'fields_get',
    args: [],
    kwargs: { attributes: ['type', 'relation'] }
  });

  const preferredCandidates = [
    'x_studio_recap_template_id',
    'x_studio_recap_mail_template_id',
    'x_studio_recap_template',
    'x_studio_recap_mail_template',
    'x_recap_mail_template_id',
    'x_recap_template_id',
    'recap_template_id'
  ];

  for (const fieldName of preferredCandidates) {
    const field = fieldsInfo?.[fieldName];
    if (field?.type === 'many2one' && field?.relation === 'mail.template') {
      cachedRecapTemplateFieldName = fieldName;
      return cachedRecapTemplateFieldName;
    }
  }

  for (const [fieldName, field] of Object.entries(fieldsInfo || {})) {
    if (field?.type !== 'many2one' || field?.relation !== 'mail.template') {
      continue;
    }

    const normalized = String(fieldName || '').toLowerCase();
    if (normalized.includes('recap') && normalized.includes('template')) {
      cachedRecapTemplateFieldName = fieldName;
      return cachedRecapTemplateFieldName;
    }
  }

  return null;
}

export async function ensureWebinarRecapTemplate(env, webinarId) {
  const recapTemplateId = resolveRecapTemplateId(env);
  if (!Number.isInteger(recapTemplateId) || recapTemplateId <= 0) {
    return { ensured: false, reason: 'missing_template_id' };
  }

  const recapTemplateField = await resolveRecapTemplateFieldName(env);
  if (!recapTemplateField) {
    const writeCandidates = [
      'x_studio_recap_template_id',
      'x_studio_recap_mail_template_id',
      'x_studio_recap_template',
      'x_studio_recap_mail_template',
      'x_recap_mail_template_id',
      'x_recap_template_id',
      'recap_template_id'
    ];

    for (const candidateField of writeCandidates) {
      try {
        await write(env, {
          model: ODOO_MODEL.WEBINAR,
          ids: [webinarId],
          values: { [candidateField]: recapTemplateId }
        });

        cachedRecapTemplateFieldName = candidateField;
        return { ensured: true, field: candidateField, template_id: recapTemplateId, changed: true, via: 'fallback_write' };
      } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        const isUnknownFieldError =
          message.includes('unknown field') ||
          message.includes('invalid field') ||
          message.includes('field') && message.includes('does not exist');

        if (!isUnknownFieldError) {
          throw error;
        }
      }
    }

    return { ensured: false, reason: 'missing_template_field' };
  }

  const rows = await executeKw(env, {
    model: ODOO_MODEL.WEBINAR,
    method: 'read',
    args: [[webinarId]],
    kwargs: { fields: [recapTemplateField] }
  });

  const webinar = Array.isArray(rows) ? rows[0] : null;
  const currentValue = webinar?.[recapTemplateField];
  const currentId = Array.isArray(currentValue) ? Number(currentValue[0]) : Number(currentValue);

  if (Number.isInteger(currentId) && currentId > 0) {
    return { ensured: true, field: recapTemplateField, template_id: currentId, changed: false };
  }

  await write(env, {
    model: ODOO_MODEL.WEBINAR,
    ids: [webinarId],
    values: { [recapTemplateField]: recapTemplateId }
  });

  return { ensured: true, field: recapTemplateField, template_id: recapTemplateId, changed: true };
}

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
    args: [[[ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId]]]
  });
  
  return count;
}

/**
 * Get registration count for one webinar.
 *
 * @param {Object} env
 * @param {number} webinarId
 * @returns {Promise<number>}
 */
export async function getWebinarRegistrationCount(env, webinarId) {
  return getRegistrationCount(env, webinarId);
}

/**
 * Get webinar registrations with offset/limit.
 *
 * Fields are intentionally left empty to avoid hard failures on custom field naming
 * differences across environments. Callers normalize candidate fields.
 *
 * @param {Object} env
 * @param {number} webinarId
 * @param {Object} options
 * @param {number} [options.offset=0]
 * @param {number} [options.limit=50]
 * @param {string} [options.order='write_date desc, id desc']
 * @returns {Promise<Array<Object>>}
 */
export async function getWebinarRegistrations(env, webinarId, options = {}) {
  const { offset = 0, limit = 50, order = 'write_date desc, id desc' } = options;

  return searchRead(env, {
    model: ODOO_MODEL.REGISTRATION,
    domain: [[ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId]],
    fields: [],
    offset,
    limit,
    order
  });
}

/**
 * Get leads for a set of partner IDs.
 *
 * @param {Object} env
 * @param {number[]} partnerIds
 * @returns {Promise<Array<Object>>}
 */
export async function getLeadsByPartnerIds(env, partnerIds) {
  if (!Array.isArray(partnerIds) || partnerIds.length === 0) {
    return [];
  }

  const sanitizedPartnerIds = partnerIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (sanitizedPartnerIds.length === 0) {
    return [];
  }

  return searchRead(env, {
    model: ODOO_MODEL.LEAD,
    domain: [['partner_id', 'in', sanitizedPartnerIds]],
    fields: [
      'id',
      'name',
      'partner_id',
      'stage_id',
      'won_status',
      'lost_reason_id',
      'active',
      'write_date',
      'create_date'
    ],
    order: 'write_date desc, create_date desc, id desc',
    limit: false
  });
}

/**
 * Get partners for a set of partner IDs.
 *
 * @param {Object} env
 * @param {number[]} partnerIds
 * @returns {Promise<Array<Object>>}
 */
export async function getPartnersByIds(env, partnerIds) {
  if (!Array.isArray(partnerIds) || partnerIds.length === 0) {
    return [];
  }

  const sanitizedPartnerIds = partnerIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (sanitizedPartnerIds.length === 0) {
    return [];
  }

  return searchRead(env, {
    model: ODOO_MODEL.PARTNER,
    domain: [['id', 'in', sanitizedPartnerIds]],
    fields: ['id', 'name', 'email'],
    limit: false
  });
}

/**
 * Get stage metadata for stage IDs.
 *
 * @param {Object} env
 * @param {number[]} stageIds
 * @returns {Promise<Array<Object>>}
 */
export async function getLeadStagesByIds(env, stageIds) {
  if (!Array.isArray(stageIds) || stageIds.length === 0) {
    return [];
  }

  const sanitizedStageIds = stageIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (sanitizedStageIds.length === 0) {
    return [];
  }

  return searchRead(env, {
    model: ODOO_MODEL.LEAD_STAGE,
    domain: [['id', 'in', sanitizedStageIds]],
    fields: [],
    limit: false
  });
}

/**
 * Update attendance for one registration and write mandatory audit metadata.
 *
 * @param {Object} env
 * @param {number} registrationId
 * @param {Object} values
 * @param {boolean} values.attended
 * @param {number} values.updatedByUserId
 * @param {string} values.updatedAt
 * @param {string} values.origin
 * @returns {Promise<boolean>}
 */
export async function updateRegistrationAttendance(env, registrationId, values) {
  const {
    attended,
    updatedByUserId,
    updatedAt,
    origin
  } = values;

  const fullPayload = {
    [ODOO_FIELDS.ATTENDED]: Boolean(attended),
    [ODOO_FIELDS.ATTENDANCE_UPDATED_AT]: updatedAt,
    [ODOO_FIELDS.ATTENDANCE_UPDATED_BY]: updatedByUserId,
    [ODOO_FIELDS.ATTENDANCE_UPDATE_ORIGIN]: origin
  };

  try {
    return await write(env, {
      model: ODOO_MODEL.REGISTRATION,
      ids: [registrationId],
      values: fullPayload
    });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    const likelyAuditFieldIssue =
      message.includes('x_studio_attendance_') ||
      message.includes('unknown field') ||
      message.includes('invalid field') ||
      message.includes('access') ||
      message.includes('permission');

    if (!likelyAuditFieldIssue) {
      throw error;
    }

    console.warn('[event-operations] Attendance audit write failed, retrying without audit fields', {
      registrationId,
      reason: error?.message || 'unknown'
    });

    return write(env, {
      model: ODOO_MODEL.REGISTRATION,
      ids: [registrationId],
      values: {
        [ODOO_FIELDS.ATTENDED]: Boolean(attended)
      }
    });
  }
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

// ─── Recap / video functions ──────────────────────────────────────────────────

/**
 * Fetch only the recap-relevant fields for one webinar from Odoo.
 *
 * @param {Object} env
 * @param {number} webinarId
 * @returns {Promise<Object|null>}
 */
export async function getWebinarRecapFields(env, webinarId) {
  const result = await executeKw(env, {
    model: ODOO_MODEL.WEBINAR,
    method: 'read',
    args: [[webinarId]],
    kwargs: {
      fields: [
        ODOO_FIELDS.ID,
        ODOO_FIELDS.NAME,
        ODOO_FIELDS.EVENT_DATETIME,
        ODOO_FIELDS.VIDEO_URL,
        ODOO_FIELDS.THUMBNAIL_URL,
        ODOO_FIELDS.FOLLOWUP_HTML
      ]
    }
  });
  return Array.isArray(result) && result.length > 0 ? result[0] : null;
}

/**
 * Check whether any registration for this webinar has already received a recap
 * email. The field x_studio_recap_email_sent lives on x_webinarregistrations,
 * NOT on x_webinar.
 *
 * @param {Object} env
 * @param {number} webinarId
 * @returns {Promise<boolean>}
 */
export async function getWebinarRecapSentStatus(env, webinarId) {
  const count = await executeKw(env, {
    model: ODOO_MODEL.REGISTRATION,
    method: 'search_count',
    args: [[[
      ODOO_FIELDS.LINKED_WEBINAR, '=', webinarId
    ], [
      'x_studio_recap_email_sent', '=', true
    ]]]
  });
  return count > 0;
}

/**
 * Write recap-related fields to an Odoo webinar record.
 *
 * Only the fields present in `fields` are written — undefined/absent keys
 * are skipped by Odoo's write() naturally.
 *
 * @param {Object} env
 * @param {number} webinarId
 * @param {{ video_url?: string, thumbnail_url?: string, followup_html?: string }} fields
 * @returns {Promise<boolean>}
 */
export async function updateWebinarRecapFields(env, webinarId, fields) {
  const values = {};
  if (fields.video_url     !== undefined) values[ODOO_FIELDS.VIDEO_URL]     = fields.video_url;
  if (fields.thumbnail_url !== undefined) values[ODOO_FIELDS.THUMBNAIL_URL] = fields.thumbnail_url;
  if (fields.followup_html !== undefined) values[ODOO_FIELDS.FOLLOWUP_HTML] = fields.followup_html;

  if (Object.keys(values).length === 0) return true; // nothing to write

  return write(env, {
    model: ODOO_MODEL.WEBINAR,
    ids: [webinarId],
    values
  });
}

/**
 * Trigger recap sending through Odoo Server Action 1099.
 *
 * @param {Object} env
 * @param {number} webinarId
 * @returns {Promise<any>}
 */
export async function sendWebinarRecap(env, webinarId) {
  const recapTemplateId = resolveRecapTemplateId(env);

  return executeKw(env, {
    model: 'ir.actions.server',
    method: 'run',
    args: [[1099]],
    kwargs: {
      context: {
        active_model: ODOO_MODEL.WEBINAR,
        active_id: webinarId,
        active_ids: [webinarId],
        recap_template_id: recapTemplateId
      }
    }
  });
}

/**
 * Reset recap sent status through Odoo Server Action 1100.
 *
 * @param {Object} env
 * @param {number} webinarId
 * @returns {Promise<any>}
 */
export async function resetWebinarRecapStatus(env, webinarId) {
  return executeKw(env, {
    model: 'ir.actions.server',
    method: 'run',
    args: [[1100]],
    kwargs: {
      context: {
        active_model: ODOO_MODEL.WEBINAR,
        active_id: webinarId,
        active_ids: [webinarId]
      }
    }
  });
}
