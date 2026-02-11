/**
 * Event Operations Mapping Layer
 * 
 * Pure functions for data transformation
 */

import {
  ODOO_FIELDS,
  TIMEZONE,
  DEFAULT_DURATION_MINUTES,
  WP_META_KEYS
} from './constants.js';
import { stripHtmlTags } from './utils/text.js';

/**
 * Convert Odoo x_webinar to WordPress Tribe Event payload
 * 
 * @param {Object} odooWebinar - x_webinar record
 * @returns {Object} Tribe Events API payload
 */
export function mapOdooToWordPress(odooWebinar) {
  const startDateTime = computeStartDateTime(
    odooWebinar[ODOO_FIELDS.DATE],
    odooWebinar[ODOO_FIELDS.START_TIME]
  );
  
  const endDateTime = computeEndDateTime(startDateTime, DEFAULT_DURATION_MINUTES);
  
  return {
    title: odooWebinar[ODOO_FIELDS.NAME],
    start_date: formatLocalDateTime(startDateTime),
    end_date: formatLocalDateTime(endDateTime),
    description: stripHtmlTags(odooWebinar[ODOO_FIELDS.INFO] || ''),
    status: 'publish',
    timezone: TIMEZONE
  };
}

/**
 * Compute start datetime from Odoo date + time
 * 
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} timeFloat - Decimal hours (e.g., 14.5 = 14:30)
 * @returns {Date}
 */
function computeStartDateTime(dateStr, timeFloat) {
  const date = new Date(dateStr);
  const hours = Math.floor(timeFloat);
  const minutes = Math.round((timeFloat - hours) * 60);
  
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Compute end datetime from start + duration
 * 
 * @param {Date} startDate
 * @param {number} durationMinutes
 * @returns {Date}
 */
function computeEndDateTime(startDate, durationMinutes) {
  const endDate = new Date(startDate);
  endDate.setMinutes(endDate.getMinutes() + durationMinutes);
  return endDate;
}

/**
 * Format Date to WordPress datetime string (timezone-aware)
 * 
 * CRITICAL: Manual construction to avoid UTC conversion
 * WordPress expects local time in "YYYY-MM-DD HH:MM:SS" format
 * 
 * @param {Date} date - Local date
 * @returns {string} YYYY-MM-DD HH:MM:SS (local time)
 */
function formatLocalDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Extract odoo_webinar_id from WordPress meta object
 * 
 * @param {Object} metaObject - WordPress meta field
 * @returns {number|null}
 */
export function extractOdooWebinarId(metaObject) {
  const value = metaObject?.[WP_META_KEYS.ODOO_WEBINAR_ID];
  return value ? parseInt(value, 10) : null;
}
