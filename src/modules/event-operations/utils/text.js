/**
 * Event Operations - Text Utilities
 * 
 * Shared text processing functions
 */

/**
 * Strip HTML tags and decode common entities
 * 
 * @param {string} html - HTML content
 * @returns {string} Plain text
 */
export function stripHtmlTags(html) {
  if (!html) return '';
  
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Normalize string for comparison
 * 
 * @param {string} str - Input string
 * @returns {string} Normalized string
 */
export function normalizeString(str) {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
