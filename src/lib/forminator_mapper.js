/**
 * Map Forminator field names to clean field names
 * Forminator adds suffixes like email-1, phone-3, name-2 etc.
 * This function normalizes them to: email, phone, name
 * 
 * @param {Object} data - Raw form data with Forminator field names
 * @returns {Object} - Cleaned data with normalized field names
 */
export function normalizeForminatorFields(data) {
  const normalized = {};
  const timestamp = new Date().toISOString().substring(11, 19);
  
  // Fields to filter out (not logged, not stored)
  const filteredFields = ['g-recaptcha-response', 'g_recaptcha_response'];
  
  // Common field mappings (base name => possible variations)
  const fieldMappings = {
    email: /^email[-_]?\d*$/i,
    phone: /^(phone|telephone|mobile)[-_]?\d*$/i,
    name: /^name[-_]?\d*$/i,
    first_name: /^(first[-_]?name|firstname)[-_]?\d*$/i,
    last_name: /^(last[-_]?name|lastname|surname)[-_]?\d*$/i,
    company: /^(company|company[-_]?name|organization)[-_]?\d*$/i,
    company_name: /^(company[-_]?name|company)[-_]?\d*$/i,
    address: /^address[-_]?\d*$/i,
    city: /^city[-_]?\d*$/i,
    postal_code: /^(postal[-_]?code|zip|postcode)[-_]?\d*$/i,
    country: /^country[-_]?\d*$/i,
    message: /^(message|description|comments?)[-_]?\d*$/i,
    subject: /^subject[-_]?\d*$/i,
  };
  
  // Keep track of what we've mapped
  const mappedKeys = new Set();
  
  // First pass: map known fields
  for (const [key, value] of Object.entries(data)) {
    // Skip filtered fields
    if (filteredFields.includes(key)) {
      console.log(`🗑️ [${timestamp}] Filtered out: ${key}`);
      continue;
    }
    
    let mapped = false;
    
    // Try to match against our field mappings
    for (const [normalizedKey, regex] of Object.entries(fieldMappings)) {
      if (regex.test(key)) {
        // Only map if we haven't already mapped this normalized key
        if (!normalized[normalizedKey]) {
          normalized[normalizedKey] = value;
          mappedKeys.add(key);
          console.log(`🔄 [${timestamp}] Mapped: ${key} → ${normalizedKey}`);
          mapped = true;
          break;
        }
      }
    }
    
    // If not mapped, keep original key
    if (!mapped) {
      normalized[key] = value;
    }
  }
  
  return normalized;
}

/**
 * Extract contact data from normalized Forminator data
 * 
 * @param {Object} data - Normalized form data
 * @returns {Object} - Contact data ready for Odoo
 */
export function extractContactData(data) {
  return {
    email: data.email || null,
    name: data.name || `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.email || null,
    phone: data.phone || null,
    mobile: data.mobile || null,
    company_name: data.company_name || data.company || null,
    street: data.address || null,
    city: data.city || null,
    zip: data.postal_code || null,
    country_id: data.country || null,
  };
}
