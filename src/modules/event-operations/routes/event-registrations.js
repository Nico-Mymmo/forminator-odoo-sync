/**
 * Event Registration Routes (Addendum G backend)
 */

import { LOG_PREFIX } from '../constants.js';
import { getWebinarRegistrationsView } from '../services/webinar-registration-service.js';
import { applyAttendanceUpdate, applyBulkAttendanceUpdates } from '../services/attendance-service.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function parseInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseBooleanInput(value) {
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

export const eventRegistrationRoutes = {
  /**
   * GET /events/api/events/:webinarId/registrations
   */
  'GET /api/events/:webinarId/registrations': async (context) => {
    const { env, params, request } = context;

    try {
      const webinarId = parseInteger(params?.webinarId);
      if (!webinarId || webinarId <= 0) {
        return jsonResponse({ success: false, error: 'Invalid webinarId parameter' }, 400);
      }

      const url = new URL(request.url);
      const page = url.searchParams.get('page');
      const perPage = url.searchParams.get('per_page');

      const data = await getWebinarRegistrationsView(env, {
        webinarId,
        page,
        perPage
      });

      return jsonResponse({ success: true, data });
    } catch (error) {
      console.error(`${LOG_PREFIX} ❌ Fetch registrations failed:`, error);
      return jsonResponse({ success: false, error: error?.message || 'Failed to fetch registrations' }, 500);
    }
  },

  /**
   * POST /events/api/events/registrations/:id/attendance
   *
   * Body: { attended: boolean, origin?: string }
   */
  'POST /api/events/registrations/:id/attendance': async (context) => {
    const { env, params, request } = context;

    try {
      const registrationId = parseInteger(params?.id);
      if (!registrationId || registrationId <= 0) {
        return jsonResponse({ success: false, error: 'Invalid registration ID' }, 400);
      }

      const body = await request.json();
      const attended = parseBooleanInput(body?.attended);
      if (attended === null) {
        return jsonResponse({ success: false, error: 'attended must be boolean' }, 400);
      }

      const data = await applyAttendanceUpdate(env, {
        registrationId,
        attended,
        origin: body?.origin
      });

      return jsonResponse({ success: true, data });
    } catch (error) {
      console.error(`${LOG_PREFIX} ❌ Attendance update failed:`, error);
      return jsonResponse({ success: false, error: error?.message || 'Attendance update failed' }, 500);
    }
  },

  /**
   * POST /events/api/events/registrations/bulk-attendance
   *
   * Body: { updates: [{ registrationId, attended }], origin?: string }
   */
  'POST /api/events/registrations/bulk-attendance': async (context) => {
    const { env, request } = context;

    try {
      const body = await request.json();
      const updates = Array.isArray(body?.updates) ? body.updates : null;

      if (!updates || updates.length === 0) {
        return jsonResponse({ success: false, error: 'updates[] is required' }, 400);
      }

      const normalizedUpdates = [];
      for (const update of updates) {
        const registrationId = parseInteger(update?.registrationId ?? update?.id);
        const attended = parseBooleanInput(update?.attended);

        if (!registrationId || registrationId <= 0 || attended === null) {
          return jsonResponse({ success: false, error: 'Each update must include valid registrationId and boolean attended' }, 400);
        }

        normalizedUpdates.push({ registrationId, attended });
      }

      const data = await applyBulkAttendanceUpdates(env, {
        updates: normalizedUpdates,
        origin: body?.origin
      });

      const statusCode = data.failureCount > 0 ? 207 : 200;
      return jsonResponse({ success: data.failureCount === 0, data }, statusCode);
    } catch (error) {
      console.error(`${LOG_PREFIX} ❌ Bulk attendance update failed:`, error);
      return jsonResponse({ success: false, error: error?.message || 'Bulk attendance update failed' }, 500);
    }
  }
};
