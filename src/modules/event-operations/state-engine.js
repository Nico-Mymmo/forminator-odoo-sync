/**
 * Event Operations State Engine
 * 
 * Pure function state machine for sync status computation
 */

import { SYNC_STATUS, ODOO_FIELDS } from './constants.js';
import { stripHtmlTags, normalizeString } from './utils/text.js';

/**
 * Compute sync state from Odoo and WordPress snapshots
 * 
 * Pure function - deterministic state machine
 * 
 * @param {Object} odooSnapshot - x_webinar record
 * @param {Object|null} wpSnapshot - WordPress event data
 * @returns {string} SYNC_STATUS enum value
 */
export function computeEventState(odooSnapshot, wpSnapshot) {
  // Odoo archived → archived state
  if (!odooSnapshot[ODOO_FIELDS.ACTIVE]) {
    return wpSnapshot ? SYNC_STATUS.ARCHIVED : SYNC_STATUS.DELETED;
  }
  
  // Not published to WordPress yet
  if (!wpSnapshot) {
    return SYNC_STATUS.NOT_PUBLISHED;
  }
  
  // WordPress event deleted but Odoo active
  if (wpSnapshot.status === 'trash') {
    return SYNC_STATUS.DELETED;
  }
  
  // WordPress event saved as draft
  if (wpSnapshot.status === 'draft') {
    return SYNC_STATUS.DRAFT;
  }
  
  // Check for content discrepancies (title and date only - no description comparison)
  const hasDiscrepancies = detectDiscrepancies(odooSnapshot, wpSnapshot);
  
  if (hasDiscrepancies) {
    return SYNC_STATUS.OUT_OF_SYNC;
  }
  
  return SYNC_STATUS.PUBLISHED;
}

/**
 * Detect content discrepancies between Odoo and WordPress
 * Only checks execution-critical fields: datetime, duration, meeting_link, host
 * Title and description are NOT compared (user manages via editorial)
 * 
 * @param {Object} odooSnapshot
 * @param {Object} wpSnapshot
 * @returns {boolean}
 */
function detectDiscrepancies(odooSnapshot, wpSnapshot) {
  // 1. DATETIME comparison (full UTC timestamp, NOT date-only)
  const wpDatetimeRaw = wpSnapshot.utc_start_date || wpSnapshot.start_date;
  const odooDatetimeRaw = odooSnapshot[ODOO_FIELDS.EVENT_DATETIME];
  
  if (wpDatetimeRaw && odooDatetimeRaw) {
    const odooUtc = parseAsUTC(odooDatetimeRaw);
    const wpUtc = parseAsUTC(wpDatetimeRaw);
    
    if (odooUtc && wpUtc) {
      // Compare with 60-second tolerance (as per decision #3)
      const diffMs = Math.abs(odooUtc.getTime() - wpUtc.getTime());
      if (diffMs > 60000) { // 60 seconds = 60,000 ms
        console.log('🔍 DISCREPANCY DETECTED - Datetime mismatch:');
        console.log('  Odoo datetime:', odooUtc.toISOString());
        console.log('  WP datetime:', wpUtc.toISOString());
        console.log('  Difference (minutes):', Math.round(diffMs / 60000));
        return true;
      }
    }
  }
  
  // 2. DURATION comparison (if available)
  // TODO: Check if duration fields exist in snapshots
  // const odooDuration = odooSnapshot[ODOO_FIELDS.DURATION];
  // const wpDuration = wpSnapshot.duration;
  // if (odooDuration !== wpDuration) { return true; }
  
  // 3. MEETING LINK comparison (if available)
  // TODO: Check if meeting_link fields exist in snapshots
  // const odooMeetingLink = odooSnapshot[ODOO_FIELDS.MEETING_LINK];
  // const wpMeetingLink = wpSnapshot.meeting_link;
  // if (odooMeetingLink !== wpMeetingLink) { return true; }
  
  // 4. HOST comparison (if available)
  // TODO: Check if host fields exist in snapshots
  // const odooHost = odooSnapshot[ODOO_FIELDS.HOST];
  // const wpHost = wpSnapshot.host;
  // if (odooHost !== wpHost) { return true; }
  
  return false;
}

/**
 * Parse datetime string as UTC
 * Handles "YYYY-MM-DD HH:MM:SS" format (Odoo) and ISO format (WordPress)
 * 
 * @param {string} raw - Datetime string
 * @returns {Date|null}
 */
function parseAsUTC(raw) {
  if (!raw) return null;
  
  let iso = String(raw).trim();
  
  // Convert "YYYY-MM-DD HH:MM:SS" to ISO format
  if (iso.includes(' ') && !iso.includes('T')) {
    iso = iso.replace(' ', 'T') + 'Z';
  } else if (iso.includes('T') && !iso.endsWith('Z')) {
    iso += 'Z';
  }
  
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
