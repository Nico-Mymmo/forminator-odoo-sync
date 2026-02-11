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
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
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
    .replace(/\u2026/g, '...')   // … (ellipsis) → ...
    .replace(/\u2018|\u2019/g, "'")  // smart quotes → straight
    .replace(/\u201C|\u201D/g, '"')  // smart double quotes → straight
    .replace(/\u2013|\u2014/g, '-')  // en/em dash → hyphen
    .replace(/\s+/g, ' ');
}

/**
 * Strip WordPress shortcodes from text
 * 
 * @param {string} text - Text with potential shortcodes
 * @returns {string} Text without shortcodes
 */
export function stripShortcodes(text) {
  if (!text) return '';
  
  // Remove all [shortcode attr="value"] patterns
  return text.replace(/\[([a-z_-]+)(?:\s+[^\]]+)?\]/gi, '').trim();
}
