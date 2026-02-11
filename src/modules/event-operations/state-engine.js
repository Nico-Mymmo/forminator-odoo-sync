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
 * Only checks title and date - description is managed via editorial content
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
      console.log('🔍 DISCREPANCY DETECTED - Title mismatch:');
      console.log('  Odoo title:', odooTitle);
      console.log('  WP title:', wpTitle);
      return true;
    }
  }
  
  // Date/time mismatch (only if WP has start_date — Tribe API field)
  const wpDateRaw = wpSnapshot.start_date;
  if (wpDateRaw) {
    // Normalize and extract date part (strip HTML just in case)
    const wpDate = stripHtmlTags(String(wpDateRaw)).split(' ')[0].trim();
    const odooDate = odooSnapshot[ODOO_FIELDS.DATE];
    if (wpDate && odooDate && wpDate !== odooDate) {
      console.log('🔍 DISCREPANCY DETECTED - Date mismatch:');
      console.log('  Odoo date:', odooDate);
      console.log('  WP date:', wpDate);
      return true;
    }
  }
  
  // No description or tag comparison - user manages description via editorial content
  // and re-publishes when needed
  
  return false;
}
