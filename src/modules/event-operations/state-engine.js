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
  
  // Check for content discrepancies
  const hasDiscrepancies = detectDiscrepancies(odooSnapshot, wpSnapshot);
  
  if (hasDiscrepancies) {
    return SYNC_STATUS.OUT_OF_SYNC;
  }
  
  return SYNC_STATUS.PUBLISHED;
}

/**
 * Detect content discrepancies between Odoo and WordPress
 * 
 * @param {Object} odooSnapshot
 * @param {Object} wpSnapshot
 * @returns {boolean}
 */
function detectDiscrepancies(odooSnapshot, wpSnapshot) {
  // Title mismatch
  if (normalizeString(odooSnapshot[ODOO_FIELDS.NAME]) !== 
      normalizeString(wpSnapshot.title?.rendered || wpSnapshot.title)) {
    return true;
  }
  
  // Date/time mismatch (compare normalized dates)
  const odooDate = odooSnapshot[ODOO_FIELDS.DATE];
  const wpDate = wpSnapshot.start_date?.split(' ')[0];
  
  if (odooDate !== wpDate) {
    return true;
  }
  
  // Description mismatch (compare stripped HTML)
  const odooDesc = stripHtmlTags(odooSnapshot[ODOO_FIELDS.INFO] || '');
  const wpDesc = stripHtmlTags(wpSnapshot.description || '');
  
  if (normalizeString(odooDesc) !== normalizeString(wpDesc)) {
    return true;
  }
  
  return false;
}
