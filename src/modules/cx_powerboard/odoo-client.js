/**
 * CX Powerboard — Odoo Client
 *
 * Wraps src/lib/odoo.js with CX-specific domain logic.
 * The user_id filter is always injected — never omitted.
 */

import { searchRead } from '../../lib/odoo.js';

/**
 * Fetch all open Odoo activities assigned to the given Odoo user IDs.
 * Single batched call — never one query per user.
 *
 * @param {Object} env
 * @param {number[]} odooUids - Array of Odoo res.users IDs
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

/**
 * Fetch all available Odoo activity types (for mapping configuration UI).
 *
 * @param {Object} env
 * @returns {Promise<Array>}
 */
export async function fetchActivityTypes(env) {
  return searchRead(env, {
    model: 'mail.activity.type',
    domain: [],
    fields: ['id', 'name'],
  });
}
