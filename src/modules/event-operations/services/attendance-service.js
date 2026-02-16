/**
 * Attendance Service (Addendum G)
 */

import { updateRegistrationAttendance } from '../odoo-client.js';

const BULK_WRITE_BATCH_SIZE = 50;
const DEFAULT_ATTENDANCE_ORIGIN = 'workspace_panel';

function toOdooDatetime(value = new Date()) {
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

function normalizeRegistrationId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAttended(value) {
  if (value === true || value === false) {
    return value;
  }

  if (value === 1 || value === '1') {
    return true;
  }

  if (value === 0 || value === '0') {
    return false;
  }

  return null;
}

function getActorOdooUserId(env, explicitOdooUserId) {
  const raw = explicitOdooUserId ?? env?.UID;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Valid Odoo user ID is required for attendance audit writes');
  }
  return parsed;
}

function chunkArray(items, chunkSize) {
  if (!Array.isArray(items) || items.length === 0 || chunkSize <= 0) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

/**
 * Apply attendance update for a single registration.
 *
 * @param {Object} env
 * @param {Object} params
 * @param {number} params.registrationId
 * @param {boolean|number|string} params.attended
 * @param {number} [params.actorOdooUserId]
 * @param {string} [params.origin]
 * @returns {Promise<Object>}
 */
export async function applyAttendanceUpdate(env, params) {
  const registrationId = normalizeRegistrationId(params?.registrationId);
  if (!registrationId) {
    throw new Error('Invalid registration ID');
  }

  const attended = normalizeAttended(params?.attended);
  if (attended === null) {
    throw new Error('Invalid attended value (expected boolean)');
  }

  const actorOdooUserId = getActorOdooUserId(env, params?.actorOdooUserId);
  const origin = String(params?.origin || DEFAULT_ATTENDANCE_ORIGIN).trim() || DEFAULT_ATTENDANCE_ORIGIN;
  const updatedAt = toOdooDatetime();

  await updateRegistrationAttendance(env, registrationId, {
    attended,
    updatedByUserId: actorOdooUserId,
    updatedAt,
    origin
  });

  return {
    registrationId,
    attended,
    audit: {
      updatedAt,
      updatedBy: actorOdooUserId,
      origin
    }
  };
}

/**
 * Apply attendance updates in bounded batches with row-level result reporting.
 *
 * @param {Object} env
 * @param {Object} params
 * @param {Array<Object>} params.updates
 * @param {number} [params.actorOdooUserId]
 * @param {string} [params.origin]
 * @returns {Promise<Object>}
 */
export async function applyBulkAttendanceUpdates(env, params) {
  const updates = Array.isArray(params?.updates) ? params.updates : [];
  if (updates.length === 0) {
    throw new Error('updates must contain at least one attendance update');
  }

  const actorOdooUserId = getActorOdooUserId(env, params?.actorOdooUserId);
  const origin = String(params?.origin || DEFAULT_ATTENDANCE_ORIGIN).trim() || DEFAULT_ATTENDANCE_ORIGIN;

  const batches = chunkArray(updates, BULK_WRITE_BATCH_SIZE);
  const results = [];

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(async (update) => {
        try {
          const result = await applyAttendanceUpdate(env, {
            registrationId: update?.registrationId ?? update?.id,
            attended: update?.attended,
            actorOdooUserId,
            origin
          });

          return {
            registrationId: result.registrationId,
            success: true,
            attended: result.attended,
            audit: result.audit
          };
        } catch (error) {
          return {
            registrationId: normalizeRegistrationId(update?.registrationId ?? update?.id),
            success: false,
            error: error?.message || 'Attendance update failed'
          };
        }
      })
    );

    results.push(...batchResults);
  }

  const successCount = results.filter((row) => row.success).length;
  const failureRows = results.filter((row) => !row.success);

  return {
    total: results.length,
    successCount,
    failureCount: failureRows.length,
    results,
    failures: failureRows
  };
}
