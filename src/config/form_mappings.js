import { Database } from '../lib/database.js';

/**
 * Forminator form field mappings to Odoo
 * 
 * Configuration is loaded from Supabase with in-memory caching.
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

// Cache for database mappings (prevents multiple DB reads per request)
let dbMappingsCache = null;
let dbCacheTimestamp = 0;
const DB_CACHE_TTL = 60000; // 1 minute cache

/**
 * Invalidate the mappings cache
 * Called when mappings are updated to ensure fresh data is loaded
 */
export function invalidateMappingsCache() {
  dbMappingsCache = null;
  dbCacheTimestamp = 0;
  console.log('🔄 Mappings cache invalidated');
}

/**
 * Get mapping configuration for a form
 * Fetches from Supabase with in-memory caching
 * 
 * @param {string} formId - The ovme_forminator_id from the form submission
 * @param {Object} env - Environment with Supabase credentials
 * @returns {Object|null} - Mapping config or null if form should not be synced
 */
export async function getFormMapping(formId, env = null) {
  // Skip internal JSON fields that start with underscore
  if (formId && formId.startsWith('_')) return null;
  
  // Require env for database access
  if (!env) {
    console.error('No environment provided to getFormMapping');
    return null;
  }
  
  try {
    // Check cache first
    const now = Date.now();
    if (dbMappingsCache && (now - dbCacheTimestamp) < DB_CACHE_TTL) {
      return dbMappingsCache[formId] || null;
    }
    
    // Fetch from database
    const db = new Database(env);
    const allMappings = await db.formMappings.getAllMappings();
    
    // Update cache
    dbMappingsCache = allMappings;
    dbCacheTimestamp = now;
    
    return allMappings[formId] || null;
  } catch (error) {
    console.error('Error reading from database:', error);
    return null;
  }
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
