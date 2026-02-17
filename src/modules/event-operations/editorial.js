/**
 * Editorial Content Helpers
 * 
 * Build WordPress descriptions from editorial content blocks or fallback to Odoo
 */

/**
 * Build WordPress description from editorial content or Odoo fallback
 * 
 * @param {Object|null} editorialContent - JSONB from webinar_snapshots.editorial_content
 * @param {string} odooDescription - Fallback from Odoo x_studio_webinar_info
 * @returns {string} HTML description for WordPress
 */
export function buildEditorialDescription(editorialContent, odooDescription) {
  // If no editorial content or no blocks, return Odoo description
  if (!editorialContent || !editorialContent.blocks || !Array.isArray(editorialContent.blocks)) {
    return odooDescription || '';
  }

  // If blocks array is empty, return Odoo description
  if (editorialContent.blocks.length === 0) {
    return odooDescription || '';
  }

  // Render blocks to HTML
  const renderedBlocks = editorialContent.blocks.map(block => {
    if (!block || !block.type) {
      return '';
    }

    if (block.type === 'paragraph') {
      const content = block.content || '';
      // If content contains HTML tags, return as-is (trusted Odoo HTML)
      // This prevents double-wrapping and escaping of Odoo's x_studio_webinar_info HTML
      if (content.includes('<')) {
        return content;
      }
      // Plain text: escape and wrap in paragraph tags
      return `<p>${escapeHtml(content)}</p>`;
    }

    if (block.type === 'shortcode') {
      if (!block.name) {
        return '';
      }
      return renderShortcode(block.name, block.attributes || {});
    }

    // Unknown block type - skip
    return '';
  }).filter(html => html.length > 0);

  return renderedBlocks.join('\n');
}

/**
 * Escape HTML entities to prevent XSS
 * 
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';
  
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render WordPress shortcode syntax
 * 
 * @param {string} name - Shortcode name (e.g., "forminator_form")
 * @param {Object} attributes - Shortcode attributes (e.g., { id: "123" })
 * @returns {string} WordPress shortcode string
 */
function renderShortcode(name, attributes) {
  if (!name) return '';

  // Build attribute string
  const attrs = Object.entries(attributes || {})
    .map(([key, val]) => {
      // Escape attribute values
      const escapedValue = escapeHtml(String(val));
      return `${key}="${escapedValue}"`;
    })
    .join(' ');

  // Return shortcode with or without attributes
  if (attrs.length > 0) {
    return `[${name} ${attrs}]`;
  } else {
    return `[${name}]`;
  }
}

/**
 * Validate editorial content JSONB structure
 * 
 * @param {any} content - Content to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEditorialContent(content) {
  // NULL is valid (means use Odoo description)
  if (content === null || content === undefined) {
    return { valid: true };
  }

  // Must be an object
  if (typeof content !== 'object' || Array.isArray(content)) {
    return { valid: false, error: 'Editorial content must be an object' };
  }

  // Must have blocks array
  if (!content.blocks || !Array.isArray(content.blocks)) {
    return { valid: false, error: 'Editorial content must have a blocks array' };
  }

  // Validate each block
  for (let i = 0; i < content.blocks.length; i++) {
    const block = content.blocks[i];

    if (!block || typeof block !== 'object') {
      return { valid: false, error: `Block ${i} must be an object` };
    }

    if (!block.type || typeof block.type !== 'string') {
      return { valid: false, error: `Block ${i} must have a type string` };
    }

    if (block.type === 'paragraph') {
      if (typeof block.content !== 'string') {
        return { valid: false, error: `Paragraph block ${i} must have content string` };
      }
    } else if (block.type === 'shortcode') {
      if (!block.name || typeof block.name !== 'string') {
        return { valid: false, error: `Shortcode block ${i} must have name string` };
      }
      if (block.attributes && typeof block.attributes !== 'object') {
        return { valid: false, error: `Shortcode block ${i} attributes must be an object` };
      }
    } else {
      return { valid: false, error: `Block ${i} has unknown type: ${block.type}` };
    }
  }

  // Optional: Limit number of blocks
  if (content.blocks.length > 50) {
    return { valid: false, error: 'Maximum 50 blocks allowed' };
  }

  return { valid: true };
}
