/**
 * CX Powerboard — Odoo Client
 *
 * Wraps src/lib/odoo.js with CX-specific domain logic.
 * The user_id filter is always injected — never omitted.
 *
 * V6: Uses mail.activity + keep_done as sole source of truth.
 * No mail.message queries. No partner_id needed.
 */

import { searchRead, write } from '../../lib/odoo.js';

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

/**
 * Today's date string (YYYY-MM-DD) in the configured Odoo timezone.
 * Falls back to Europe/Amsterdam if ODOO_TIMEZONE is not set.
 */
export function getTodayStr(env) {
  const tz = env.ODOO_TIMEZONE || 'Europe/Amsterdam';
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

/**
 * Yesterday's date string — used for the one-day lookback window in
 * fetchCompletedToday to guard against the Odoo SaaS UTC boundary.
 */
export function getYesterdayStr(env) {
  const tz = env.ODOO_TIMEZONE || 'Europe/Amsterdam';
  return new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: tz });
}

// ---------------------------------------------------------------------------
// Open activities
// ---------------------------------------------------------------------------

/**
 * Fetch open activities for the given users, filtered to tracked types only.
 * PRIMARY function for dashboard and cron — replaces fetchActiveActivities.
 *
 * @param {Object} env
 * @param {number[]} odooUids
 * @param {number[]} trackedTypeIds
 * @returns {Promise<Array>}
 */
export async function fetchTrackedOpenActivities(env, odooUids, trackedTypeIds) {
  if (!trackedTypeIds.length) return [];
  const result = await searchRead(env, {
    model: 'mail.activity',
    domain: [
      ['user_id', 'in', odooUids],
      ['active', '=', true],
      ['activity_type_id', 'in', trackedTypeIds],
    ],
    fields: ['id', 'activity_type_id', 'user_id', 'date_deadline', 'res_model', 'res_name', 'summary', 'note'],
    limit: 10000,
  });
  return result;
}

/**
 * Fetch ALL open activities for the given users regardless of type.
 * Used only for untracked-type detection — do not use for main dashboard logic.
 *
 * @param {Object} env
 * @param {number[]} odooUids
 * @returns {Promise<Array>}
 */
export async function fetchActiveActivities(env, odooUids) {
  return searchRead(env, {
    model: 'mail.activity',
    domain: [['user_id', 'in', odooUids], ['active', '=', true]],
    fields: ['id', 'activity_type_id', 'user_id', 'date_deadline', 'res_model', 'res_name', 'summary', 'note'],
    limit: 10000,
  });
}

// ---------------------------------------------------------------------------
// Completed activities  (requires keep_done = true on the activity type)
// ---------------------------------------------------------------------------

/**
 * Fetch activities completed today by the given users.
 *
 * Uses a one-day lookback window (yesterday..today) to guard against the
 * Odoo SaaS UTC vs. configured-timezone date_done boundary (e.g. tasks
 * completed at 00:30 Amsterdam = 23:30 UTC previous day).
 * Post-filters in JS to keep only records where date_done equals today
 * in the configured ODOO_TIMEZONE.
 *
 * Requires context: { active_test: false } to read inactive records.
 *
 * IMPORTANT: Only returns results for types where keep_done = true has been
 * set in Odoo. Types with keep_done = false delete their activities on
 * completion and will show 0 completed — no error is thrown.
 *
 * @param {Object} env
 * @param {number[]} odooUids
 * @param {number[]} trackedTypeIds
 * @returns {Promise<Array>}
 */
export async function fetchCompletedToday(env, odooUids, trackedTypeIds) {
  if (!trackedTypeIds.length) return [];
  const todayStr     = getTodayStr(env);
  const yesterdayStr = getYesterdayStr(env);
  console.log(`[fetchCompletedToday] uids=[${odooUids.join(',')}] types=[${trackedTypeIds.join(',')}] range=${yesterdayStr}..${todayStr}`);
  const raw = await searchRead(env, {
    model: 'mail.activity',
    domain: [
      ['user_id', 'in', odooUids],
      ['date_done', '!=', false],
      ['date_done', '>=', yesterdayStr],
      ['date_done', '<=', todayStr],
      ['activity_type_id', 'in', trackedTypeIds],
    ],
    fields: ['id', 'activity_type_id', 'user_id', 'active', 'date_done', 'res_model', 'res_name'],
    limit: 5000,
    context: { active_test: false },
  });
  const filtered = (raw || []).filter(a => a.active === false && a.date_done === todayStr);
  console.log(`[fetchCompletedToday] raw=${(raw||[]).length} → after JS filter=${filtered.length}  (active=false + date_done=${todayStr})`);
  console.log(`[fetchCompletedToday] active-breakdown: ${JSON.stringify((raw||[]).map(a => ({ id: a.id, active: a.active, date_done: a.date_done })))}`);
  return filtered;
}

/**
 * Fetch all completed activities in a date range — used for sparkline history.
 * Returns minimal fields; caller groups by date_done + activity_type_id.
 *
 * @param {Object} env
 * @param {number[]} odooUids
 * @param {number[]} trackedTypeIds
 * @param {string} fromDate  YYYY-MM-DD inclusive
 * @param {string} toDate    YYYY-MM-DD inclusive
 * @returns {Promise<Array>}
 */
export async function fetchCompletedInRange(env, odooUids, trackedTypeIds, fromDate, toDate) {
  if (!trackedTypeIds.length || !odooUids.length) return [];
  console.log(`[fetchCompletedInRange] uids=[${odooUids.join(',')}] types=[${trackedTypeIds.join(',')}] range=${fromDate}..${toDate}`);
  const raw = await searchRead(env, {
    model: 'mail.activity',
    domain: [
      ['user_id', 'in', odooUids],
      ['date_done', '!=', false],
      ['date_done', '>=', fromDate],
      ['date_done', '<=', toDate],
      ['activity_type_id', 'in', trackedTypeIds],
    ],
    fields: ['id', 'activity_type_id', 'active', 'date_done'],
    limit: 10000,
    context: { active_test: false },
  });
  const filtered = (raw || []).filter(a => a.active === false);
  console.log(`[fetchCompletedInRange] raw=${(raw||[]).length} → after JS filter=${filtered.length}`);
  return filtered;
}

// ---------------------------------------------------------------------------
// keep_done management  (one-directional: only ever set true, never false)
// ---------------------------------------------------------------------------

/**
 * Set keep_done = true on a mail.activity.type record in Odoo.
 * This is permanent — we never revert it to false.
 *
 * @param {Object} env
 * @param {number} typeId
 * @returns {Promise<boolean>} true if the write call returned true
 */
export async function setKeepDone(env, typeId) {
  const result = await write(env, {
    model: 'mail.activity.type',
    ids: [typeId],
    values: { keep_done: true },
  });
  return result === true;
}

/**
 * Read back keep_done for a given type to verify the write succeeded.
 * Always verify after setKeepDone — never trust the write return value alone.
 *
 * @param {Object} env
 * @param {number} typeId
 * @returns {Promise<boolean>}
 */
export async function verifyKeepDone(env, typeId) {
  const records = await searchRead(env, {
    model: 'mail.activity.type',
    domain: [['id', '=', typeId]],
    fields: ['id', 'keep_done'],
    limit: 1,
  });
  return records?.[0]?.keep_done === true;
}

// ---------------------------------------------------------------------------
// Activity types  (for mapping configuration UI)
// ---------------------------------------------------------------------------

/**
 * Fetch all available Odoo activity types including their current keep_done state.
 *
 * @param {Object} env
 * @returns {Promise<Array>}
 */
export async function fetchActivityTypes(env) {
  return searchRead(env, {
    model: 'mail.activity.type',
    domain: [],
    fields: ['id', 'name', 'keep_done'],
  });
}
