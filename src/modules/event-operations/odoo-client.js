/**
 * Odoo Client Wrapper
 * 
 * Abstracts Odoo x_webinar integration
 */

import { searchRead, executeKw } from '../../lib/odoo.js';
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
      ODOO_FIELDS.STAGE,
      ODOO_FIELDS.ACTIVE,
      ODOO_FIELDS.TAG_IDS
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
      ODOO_FIELDS.ACTIVE,
      ODOO_FIELDS.TAG_IDS
    ],
    limit: 1
  });
  
  if (webinars.length === 0) {
    throw new Error(`Webinar ${webinarId} not found in Odoo`);
  }
  
  return webinars[0];
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
