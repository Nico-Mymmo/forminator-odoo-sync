/**
 * Odoo Client Wrapper
 * 
 * Abstracts Odoo x_webinar integration
 */

import { searchRead } from '../../lib/odoo.js';
import { ODOO_MODEL, ODOO_FIELDS } from './constants.js';

/**
 * Get all active webinars from Odoo
 * 
 * @param {Object} env - Cloudflare env
 * @returns {Promise<Array>}
 */
export async function getOdooWebinars(env) {
  const webinars = await searchRead(env, {
    model: ODOO_MODEL.WEBINAR,
    domain: [
      [ODOO_FIELDS.ACTIVE, '=', true]
    ],
    fields: [
      ODOO_FIELDS.ID,
      ODOO_FIELDS.NAME,
      ODOO_FIELDS.DATE,
      ODOO_FIELDS.START_TIME,
      ODOO_FIELDS.INFO,
      ODOO_FIELDS.STAGE
    ],
    order: `${ODOO_FIELDS.DATE} DESC`,
    limit: 100
  });
  
  return webinars;
}

/**
 * Get single webinar by ID
 * 
 * @param {Object} env
 * @param {number} webinarId
 * @returns {Promise<Object>}
 */
export async function getOdooWebinar(env, webinarId) {
  const webinars = await searchRead(env, {
    model: ODOO_MODEL.WEBINAR,
    domain: [
      [ODOO_FIELDS.ID, '=', webinarId]
    ],
    fields: [
      ODOO_FIELDS.ID,
      ODOO_FIELDS.NAME,
      ODOO_FIELDS.DATE,
      ODOO_FIELDS.START_TIME,
      ODOO_FIELDS.INFO,
      ODOO_FIELDS.STAGE,
      ODOO_FIELDS.ACTIVE
    ],
    limit: 1
  });
  
  if (webinars.length === 0) {
    throw new Error(`Webinar ${webinarId} not found in Odoo`);
  }
  
  return webinars[0];
}
