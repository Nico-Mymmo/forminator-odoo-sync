/**
 * Event Operations State Engine
 * 
 * Pure function state machine for sync status computation
 */

import { SYNC_STATUS, ODOO_FIELDS } from './constants.js';
import { stripHtmlTags, normalizeString, stripShortcodes, stripRenderedForms } from './utils/text.js';
import { buildEditorialDescription } from './editorial.js';

/**
 * Compute sync state from Odoo and WordPress snapshots
 * 
 * Pure function - deterministic state machine
 * 
 * @param {Object} odooSnapshot - x_webinar record
 * @param {Object|null} wpSnapshot - WordPress event data
 * @param {Object|null} editorialContent - Editorial content JSONB (if exists)
 * @returns {string} SYNC_STATUS enum value
 */
export function computeEventState(odooSnapshot, wpSnapshot, editorialContent = null) {
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
  const hasDiscrepancies = detectDiscrepancies(odooSnapshot, wpSnapshot, editorialContent);
  
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
 * @param {Object|null} editorialContent
 * @returns {boolean}
 */
function detectDiscrepancies(odooSnapshot, wpSnapshot, editorialContent = null) {
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
  
  // Description mismatch (only if both have content)
  // Pipeline: stripRenderedForms (WP only) → stripHtmlTags → stripShortcodes → normalizeString
  // Build expected Odoo description (use editorial content if present, else Odoo raw)
  const odooDescRaw = editorialContent && editorialContent.blocks && editorialContent.blocks.length > 0
    ? buildEditorialDescription(editorialContent, odooSnapshot[ODOO_FIELDS.INFO] || '')
    : (odooSnapshot[ODOO_FIELDS.INFO] || '');
  
  const wpDescRaw = wpSnapshot.description || wpSnapshot.content?.rendered || '';
  
  // Strip rendered forms from WP content BEFORE comparing (WordPress expands shortcodes to HTML)
  const wpDescCleaned = stripRenderedForms(wpDescRaw);
  
  const odooDesc = normalizeString(stripShortcodes(stripHtmlTags(odooDescRaw)));
  const wpDesc = normalizeString(stripShortcodes(stripHtmlTags(wpDescCleaned)));
  
  if (odooDesc && wpDesc && odooDesc !== wpDesc) {
    console.log('🔍 DISCREPANCY DETECTED - Description mismatch:');
    console.log('  Odoo desc length:', odooDesc.length);
    console.log('  WP desc length:', wpDesc.length);
    console.log('  Odoo desc:', odooDesc);
    console.log('  WP desc:', wpDesc);
    console.log('  Odoo webinar ID:', odooSnapshot[ODOO_FIELDS.ID]);
    console.log('  Full Odoo snapshot:', JSON.stringify(odooSnapshot, null, 2));
    console.log('  Full WP snapshot:', JSON.stringify(wpSnapshot, null, 2));
    return true;
  }
  
  // Tags/categories mismatch (compare Odoo tag IDs with WP category slugs via comma-separated string)
  // WordPress categories field contains comma-separated slugs: "live,webinar"
  const odooTagIds = odooSnapshot[ODOO_FIELDS.TAG_IDS];
  const wpCategoriesRaw = wpSnapshot.categories; // Tribe V1 API: comma-separated string
  
  // Normalize WP categories (strip HTML, normalize string)
  const wpCategories = wpCategoriesRaw 
    ? normalizeString(stripHtmlTags(String(wpCategoriesRaw)))
    : '';
  
  if (odooTagIds && Array.isArray(odooTagIds) && odooTagIds.length > 0) {
    // If Odoo has tags but WP has no categories, it's a discrepancy
    if (!wpCategories || wpCategories.trim() === '') {
      console.log('🔍 DISCREPANCY DETECTED - Tags/Categories mismatch:');
      console.log('  Odoo has tags:', odooTagIds);
      console.log('  WP categories:', wpCategories || '(empty)');
      console.log('  Full Odoo snapshot:', JSON.stringify(odooSnapshot, null, 2));
      console.log('  Full WP snapshot:', JSON.stringify(wpSnapshot, null, 2));
      return true;
    }
    // Note: Full tag→category mapping comparison would require loading mappings here,
    // which is expensive. For now, we just check presence. Tag mapping changes won't
    // automatically mark as out-of-sync until next publish.
  } else if (wpCategories && wpCategories.trim() !== '') {
    // If WP has categories but Odoo has no tags, it's a discrepancy
    console.log('🔍 DISCREPANCY DETECTED - Tags/Categories mismatch:');
    console.log('  Odoo tags:', odooTagIds || '(empty)');
    console.log('  WP has categories:', wpCategories);
    console.log('  Full Odoo snapshot:', JSON.stringify(odooSnapshot, null, 2));
    console.log('  Full WP snapshot:', JSON.stringify(wpSnapshot, null, 2));
    return true;
  }
  
  return false;
}
