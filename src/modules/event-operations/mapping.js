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
  const eventDatetime = odooWebinar[ODOO_FIELDS.EVENT_DATETIME];
  const durationMinutes = odooWebinar[ODOO_FIELDS.DURATION_MINUTES] || DEFAULT_DURATION_MINUTES;
  
  // Validate datetime field
  if (!eventDatetime) {
    throw new Error(`Webinar ${odooWebinar.id} has no datetime (x_studio_event_datetime is empty)`);
  }
  
  // CRITICAL: Odoo datetime fields are stored in UTC but returned WITHOUT 'Z' suffix
  // Example: Odoo returns "2026-06-18 09:00:00" for 11:00 Brussels time (stored as UTC)
  // We must explicitly treat this as UTC by adding 'Z'
  let isoString = eventDatetime.trim();
  
  // If it's in format "YYYY-MM-DD HH:MM:SS" (no T, no Z), convert to ISO with Z
  if (isoString.includes(' ') && !isoString.includes('T')) {
    isoString = isoString.replace(' ', 'T') + 'Z';
  }
  // If it has T but no Z, add Z
  else if (isoString.includes('T') && !isoString.endsWith('Z')) {
    isoString = isoString + 'Z';
  }
  
  // Parse ISO 8601 UTC datetime
  const startDate = new Date(isoString);
  
  // Validate parsed date
  if (isNaN(startDate.getTime())) {
    throw new Error(`Webinar ${odooWebinar.id} has invalid datetime: ${eventDatetime}`);
  }
  
  // Compute end time from duration
  const endDate = new Date(startDate.getTime() + (durationMinutes * 60 * 1000));
  
  return {
    title: odooWebinar[ODOO_FIELDS.NAME],
    start_date: startDate.toISOString(),
    end_date: endDate.toISOString(),
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
