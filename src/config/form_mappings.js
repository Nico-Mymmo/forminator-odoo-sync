import mappingsJson from './mappings.json';

/**
 * Forminator form field mappings to Odoo
 * 
 * Configuration is loaded from KV storage (MAPPINGS_KV) with fallback to mappings.json.
 * 
 * Structure:
 * {
 *   "form_id": {
 *     "field_mapping": { ... },
 *     "value_mapping": { ... },
 *     "html_card": { ... },
 *     "workflow": [ ... ]
 *   }
 * }
 * 
 * If a form_id is not in the mappings, no Odoo sync will happen.
 */

// Cache for KV mappings (prevents multiple KV reads per request)
let kvMappingsCache = null;
let kvCacheTimestamp = 0;
const KV_CACHE_TTL = 60000; // 1 minute cache

/**
 * Get mapping configuration for a form
 * Tries KV storage first, falls back to mappings.json
 * 
 * @param {string} formId - The ovme_forminator_id from the form submission
 * @param {Object} env - Environment with MAPPINGS_KV binding (optional)
 * @returns {Object|null} - Mapping config or null if form should not be synced
 */
export async function getFormMapping(formId, env = null) {
  // Skip internal JSON fields that start with underscore
  if (formId && formId.startsWith('_')) return null;
  
  // Try KV storage if env is provided
  if (env && env.MAPPINGS_KV) {
    try {
      // Check cache first
      const now = Date.now();
      if (kvMappingsCache && (now - kvCacheTimestamp) < KV_CACHE_TTL) {
        return kvMappingsCache[formId] || null;
      }
      
      // Fetch from KV
      const kvMappings = await env.MAPPINGS_KV.get('mappings', 'json');
      if (kvMappings) {
        kvMappingsCache = kvMappings;
        kvCacheTimestamp = now;
        return kvMappings[formId] || null;
      }
    } catch (error) {
      console.error('Error reading from KV, falling back to JSON:', error);
    }
  }
  
  // Fallback to static JSON file
  return mappingsJson[formId] || null;
}

/**
 * Process a template string with form data
 * Replaces ${fieldname} with actual values from normalizedData
 * 
 * @param {string} template - Template string like "Hello ${name} - ${email}"
 * @param {Object} normalizedData - Form data with field values
 * @returns {string} - Processed string with values filled in
 */
function processTemplate(template, normalizedData) {
  return template.replace(/\$\{(\w+)\}/g, (match, fieldName) => {
    return normalizedData[fieldName] !== undefined ? normalizedData[fieldName] : '';
  });
}

/**
 * Map form data to Odoo fields based on form configuration
 * 
 * @param {Object} normalizedData - Normalized Forminator data
 * @param {Object} mapping - Form mapping configuration
 * @returns {Object} - Data mapped to Odoo field names
 */
export function mapToOdoo(normalizedData, mapping) {
  const odooData = {};
  const timestamp = new Date().toISOString().substring(11, 19);
  
  for (const [odooField, template] of Object.entries(mapping.fields)) {
    // Process template with form data
    const value = processTemplate(template, normalizedData);
    
    // Only include if value is not empty
    if (value) {
      odooData[odooField] = value;
      
      // Log differently for templates vs direct mappings
      if (template.includes('${')) {
        console.log(`🔗 [${timestamp}] Template: ${odooField} = "${template}" → "${value}"`);
      } else {
        console.log(`🔗 [${timestamp}] Direct: ${odooField} = "${value}"`);
      }
    }
  }
  
  return odooData;
}
