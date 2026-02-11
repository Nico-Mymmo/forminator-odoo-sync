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
  // Extract WP title (Core API: { rendered }, Tribe API: string)
  const wpTitleRaw = typeof wpSnapshot.title === 'object' 
    ? wpSnapshot.title?.rendered 
    : wpSnapshot.title;
  
  // Title mismatch — decode HTML entities before comparing
  if (wpTitleRaw) {
    const odooTitle = normalizeString(stripHtmlTags(odooSnapshot[ODOO_FIELDS.NAME] || ''));
    const wpTitle = normalizeString(stripHtmlTags(wpTitleRaw));
    if (odooTitle !== wpTitle) {
      return true;
    }
  }
  
  // Date/time mismatch (only if WP has start_date — Tribe API field)
  const wpDate = wpSnapshot.start_date?.split(' ')[0];
  if (wpDate) {
    const odooDate = odooSnapshot[ODOO_FIELDS.DATE];
    if (odooDate !== wpDate) {
      return true;
    }
  }
  
  // Description mismatch (only if both have content)
  const odooDesc = stripHtmlTags(odooSnapshot[ODOO_FIELDS.INFO] || '').trim();
  const wpDesc = stripHtmlTags(wpSnapshot.description || wpSnapshot.content?.rendered || '').trim();
  
  if (odooDesc && wpDesc && normalizeString(odooDesc) !== normalizeString(wpDesc)) {
    return true;
  }
  
  return false;
}
