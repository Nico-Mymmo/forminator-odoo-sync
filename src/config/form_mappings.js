import mappingsJson from './mappings.json';

/**
 * Forminator form field mappings to Odoo
 * 
 * Configuration is loaded from mappings.json for easy maintenance.
 * 
 * Structure in mappings.json:
 * {
 *   "form_id": {
 *     "model": "res.partner",
 *     "fields": {
 *       "odoo_field": "template with ${forminator_fields}"
 *     }
 *   }
 * }
 * 
 * Template syntax: ${fieldname} will be replaced with the normalized field value
 * 
 * If a form_id is not in the mappings, no Odoo sync will happen.
 */
export const FORM_MAPPINGS = mappingsJson;

/**
 * Get mapping configuration for a form
 * 
 * @param {string} formId - The ovme_forminator_id from the form submission
 * @returns {Object|null} - Mapping config or null if form should not be synced
 */
export function getFormMapping(formId) {
  // Skip internal JSON fields that start with underscore
  if (formId && formId.startsWith('_')) return null;
  
  return FORM_MAPPINGS[formId] || null;
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
