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
 * @param {string} status - WordPress post status ('publish', 'draft', 'private')
 * @returns {Object} Tribe Events API payload
 */
export function mapOdooToWordPress(odooWebinar, status = 'publish') {
  const dateValue = odooWebinar[ODOO_FIELDS.DATE];
  const timeValue = odooWebinar[ODOO_FIELDS.START_TIME];
  
  // Odoo returns false for empty fields
  if (!dateValue) {
    throw new Error(`Webinar ${odooWebinar.id} has no date (x_studio_date is empty)`);
  }
  
  const startDateTime = computeStartDateTime(
    dateValue,
    timeValue || '0u'
  );
  
  const endDateTime = computeEndDateTime(startDateTime, DEFAULT_DURATION_MINUTES);
  
  return {
    title: odooWebinar[ODOO_FIELDS.NAME],
    start_date: formatLocalDateTime(startDateTime),
    end_date: formatLocalDateTime(endDateTime),
    description: stripHtmlTags(odooWebinar[ODOO_FIELDS.INFO] || '') || ' ',
    status: status,
    timezone: TIMEZONE
  };
}

/**
 * Compute start datetime from Odoo date + time
 * 
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} timeStr - Dutch format: "11u", "14u30", "9u30"
 * @returns {Date}
 */
function computeStartDateTime(dateStr, timeStr) {
  // Parse YYYY-MM-DD manually to avoid timezone shift
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Parse Dutch time format: "11u", "14u30", "9u30"
  const { hours, minutes } = parseOdooTime(timeStr);
  
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/**
 * Parse Odoo Dutch time string
 * 
 * Formats: "11u", "14u30", "9u30", "0u"
 * 
 * @param {string} timeStr
 * @returns {{ hours: number, minutes: number }}
 */
function parseOdooTime(timeStr) {
  const str = String(timeStr).trim().toLowerCase();
  const match = str.match(/^(\d{1,2})u(\d{1,2})?$/);
  
  if (!match) {
    console.warn(`[Event Operations] Unrecognized time format: "${timeStr}", defaulting to 00:00`);
    return { hours: 0, minutes: 0 };
  }
  
  return {
    hours: parseInt(match[1], 10),
    minutes: match[2] ? parseInt(match[2], 10) : 0
  };
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
