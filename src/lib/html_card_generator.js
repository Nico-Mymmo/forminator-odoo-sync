/**
 * Generate HTML card from form data based on configuration
 * 
 * @param {Object} formData - The form data to display
 * @param {Object} config - HTML card configuration
 * @returns {string} - HTML string
 */
export function generateHtmlCard(formData, config) {
  if (!config) {
    // Default: show all fields in a single section
    return generateDefaultCard(formData);
  }

  const title = config.title || 'Formulier Gegevens';
  const sections = config.sections || [];

  let html = `<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 20px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;'>`;
  
  // Main title
  html += `<h2 style='color: #2c3e50; margin-top: 0; border-bottom: 2px solid #3498db; padding-bottom: 10px;'>${title}</h2>`;
  
  // Process sections
  for (const section of sections) {
    if (section.separator) {
      // Add separator line
      html += `<div style='height: 1px; background-color: #bdc3c7; margin: 20px 0;'></div>`;
      continue;
    }

    // Start table for this section
    html += `<table style='width: 100%; border-collapse: collapse;'>`;
    
    // Section title
    if (section.title) {
      html += `<tr><td colspan='2' style='padding: 16px 0 8px 0;'><h3 style='color: #2c3e50; margin: 0; font-size: 16px; border-bottom: 1px solid #bdc3c7; padding-bottom: 8px;'>${section.title}</h3></td></tr>`;
    }
    
    // Section fields
    if (section.fields && Array.isArray(section.fields)) {
      for (const field of section.fields) {
        const key = field.key;
        const label = field.label || key;
        const value = formData[key];
        
        // Skip empty values
        if (value === undefined || value === null || value === '') {
          continue;
        }
        
        html += `<tr><td style='padding: 8px 0; font-weight: bold; color: #555; width: 40%;'>${label}:</td><td style='padding: 8px 0; color: #333;'>${escapeHtml(String(value))}</td></tr>`;
      }
    }
    
    html += `</table>`;
  }
  
  html += `</div>`;
  
  return html;
}

/**
 * Generate default card with all fields
 * 
 * @param {Object} formData - The form data
 * @returns {string} - HTML string
 */
function generateDefaultCard(formData) {
  let html = `<div style='font-family: Arial, sans-serif; max-width: 600px; margin: 20px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;'>`;
  html += `<h2 style='color: #2c3e50; margin-top: 0; border-bottom: 2px solid #3498db; padding-bottom: 10px;'>Formulier Gegevens</h2>`;
  html += `<table style='width: 100%; border-collapse: collapse;'>`;
  
  // Skip technical fields
  const skipFields = ['g_recaptcha_response', 'referer_url', '_wp_http_referer', 'page_id', 
                      'form_type', 'current_url', 'render_id', 'ovme_uuid', 'ovme_forminator_id', 
                      '_forminator_user_ip'];
  
  for (const [key, value] of Object.entries(formData)) {
    if (skipFields.includes(key) || value === undefined || value === null || value === '') {
      continue;
    }
    
    // Format label: convert underscores to spaces and capitalize
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    
    html += `<tr><td style='padding: 8px 0; font-weight: bold; color: #555; width: 40%;'>${label}:</td><td style='padding: 8px 0; color: #333;'>${escapeHtml(String(value))}</td></tr>`;
  }
  
  html += `</table></div>`;
  
  return html;
}

/**
 * Escape HTML special characters
 * 
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
