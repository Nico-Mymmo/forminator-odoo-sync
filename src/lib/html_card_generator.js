/**
 * Generate HTML card from form data based on configuration
 * 
 * @param {Object} formData - The form data to display
 * @param {Object} config - HTML card configuration (supports sections-based format)
 * @returns {string} - HTML string
 */
export function generateHtmlCard(formData, config) {
  if (!config) {
    // Default: show all fields in a single section
    return generateDefaultCard(formData);
  }

  // Check if new sections-based format (version 3)
  if (config.sections && Array.isArray(config.sections)) {
    return generateFromSections(formData, config);
  }

  // Check if template-based format (version 2)
  if (config.selectedFields && Array.isArray(config.selectedFields)) {
    return generateFromTemplate(formData, config);
  }

  // Check if element-based format (version 1)
  if (config.version === 1 && config.elements) {
    return generateFromElements(formData, config.elements);
  }

  // Legacy format with sections
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
 * Generate HTML card from sections-based configuration (v3)
 * 
 * @param {Object} formData - The form data
 * @param {Object} config - Configuration with sections array and style
 * @returns {string} - HTML string
 */
function generateFromSections(formData, config) {
  const { sections, style = {} } = config;
  const { compact = false, borders = false, icons = true, columns = 1 } = style;
  
  // Icon mapping using lucide icon names
  const iconMap = {
    'email': 'mail',
    'phone': 'phone',
    'mobile': 'smartphone',
    'name': 'user',
    'first_name': 'user',
    'last_name': 'user',
    'street': 'map-pin',
    'city': 'map',
    'zip': 'hash',
    'country': 'globe',
    'number': 'hash',
    'ownership_type': 'building',
    'number_of_units': 'building-2'
  };
  
  let html = `<div style="padding:20px; background:#f9fafb; border-radius:8px; font-family:system-ui,-apple-system,sans-serif;">`;
  
  // Track if we're in a grid section
  let gridItems = [];
  let currentColumns = 1;
  
  sections.forEach((section, idx) => {
    if (section.type === 'title') {
      // Close previous grid if exists
      if (gridItems.length > 0) {
        html += `<div style="display:grid; grid-template-columns: repeat(${currentColumns}, 1fr); gap:${compact ? '8px' : '12px'}; margin-bottom:${compact ? '16px' : '20px'};">`;
        html += gridItems.join('');
        html += '</div>';
        gridItems = [];
      }
      
      html += `<h3 style="font-size:${compact ? '14px' : '16px'}; font-weight:600; color:#374151; margin:${compact ? '12px' : '16px'} 0 ${compact ? '8px' : '12px'} 0; ${idx === 0 ? 'margin-top:0;' : ''}">${escapeHtml(section.text || 'Section')}</h3>`;
    } else if (section.type === 'divider') {
      // Close previous grid if exists
      if (gridItems.length > 0) {
        html += `<div style="display:grid; grid-template-columns: repeat(${currentColumns}, 1fr); gap:${compact ? '8px' : '12px'}; margin-bottom:${compact ? '16px' : '20px'};">`;
        html += gridItems.join('');
        html += '</div>';
        gridItems = [];
      }
      
      html += `<hr style="border:none; border-top:1px solid #e5e7eb; margin:${compact ? '12px' : '16px'} 0;">`;
    } else if (section.type === 'text') {
      // Close previous grid if exists
      if (gridItems.length > 0) {
        html += `<div style="display:grid; grid-template-columns: repeat(${currentColumns}, 1fr); gap:${compact ? '8px' : '12px'}; margin-bottom:${compact ? '16px' : '20px'};">`;
        html += gridItems.join('');
        html += '</div>';
        gridItems = [];
      }
      
      html += `<div style="background:white; padding:${compact ? '10px' : '14px'}; border-radius:6px; ${borders ? 'border:1px solid #e5e7eb;' : ''} margin-bottom:${compact ? '12px' : '16px'}; white-space:pre-wrap; color:#374151; font-size:${compact ? '12px' : '14px'};">${escapeHtml(section.content || '')}</div>`;
    } else if (section.type === 'columnBreak') {
      // Close previous grid if exists
      if (gridItems.length > 0) {
        html += `<div style="display:grid; grid-template-columns: repeat(${currentColumns}, 1fr); gap:${compact ? '8px' : '12px'}; margin-bottom:${compact ? '16px' : '20px'};">`;
        html += gridItems.join('');
        html += '</div>';
        gridItems = [];
      }
      
      // Update column count for next group
      currentColumns = section.columns || 1;
    } else if (section.type === 'field') {
      const fieldValue = formData[section.field];
      
      // Skip empty values
      if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
        return;
      }
      
      const label = section.customLabel || section.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const icon = iconMap[section.field.toLowerCase()] || 'tag';
      
      let itemHtml = `
        <div style="background:white; padding:${compact ? '8px' : '12px'}; border-radius:6px; ${borders ? 'border:1px solid #e5e7eb;' : ''}">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            ${icons ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="#lucide-${icon}"/></svg>` : ''}
            <div style="font-size:${compact ? '11px' : '12px'}; color:#6b7280; font-weight:500;">${escapeHtml(label)}</div>
          </div>
          <div style="font-size:${compact ? '13px' : '14px'}; color:#111827; font-weight:500;">${escapeHtml(String(fieldValue))}</div>
        </div>
      `;
      
      gridItems.push(itemHtml);
    }
  });
  
  // Close final grid if exists
  if (gridItems.length > 0) {
    html += `<div style="display:grid; grid-template-columns: repeat(${currentColumns}, 1fr); gap:${compact ? '8px' : '12px'};">`;
    html += gridItems.join('');
    html += '</div>';
  }
  
  html += '</div>';
  
  return html;
}

/**
 * Generate HTML card from template-based configuration (v2)
 * 
 * @param {Object} formData - The form data
 * @param {Object} config - Template configuration with selectedFields and style
 * @returns {string} - HTML string
 */
function generateFromTemplate(formData, config) {
  const { selectedFields, style = {} } = config;
  const { compact = false, borders = true, icons = true } = style;
  
  // Icon mapping
  const iconMap = {
    'email': '✉️',
    'phone': '📞',
    'mobile': '📱',
    'street': '🏠',
    'city': '🏙️',
    'zip': '📮',
    'name': '👤',
    'first_name': '👤',
    'last_name': '👤',
    'number': '🔢',
    'ownership_type': '🏘️',
    'number_of_units': '🏢'
  };
  
  const borderStyle = borders ? 'border: 1px solid #e0e0e0; border-radius: 8px;' : '';
  const padding = compact ? '10px' : '20px';
  const rowGap = compact ? '8px' : '12px';
  
  let html = `<div style="font-family: Arial, sans-serif; ${borderStyle} padding: ${padding}; background-color: #f9f9f9;">`;
  html += `<h2 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: ${rowGap};">Formulier Gegevens</h2>`;
  html += `<div style="display: grid; gap: ${rowGap};">`;
  
  selectedFields.forEach(field => {
    const value = formData[field];
    
    // Skip empty values
    if (value === undefined || value === null || value === '') {
      return;
    }
    
    const icon = icons && iconMap[field] ? iconMap[field] + ' ' : '';
    const label = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    html += `
      <div style="display: grid; grid-template-columns: ${compact ? '120px' : '150px'} 1fr; gap: 8px; align-items: start;">
        <strong style="color: #34495e;">${icon}${label}:</strong>
        <span style="color: #555;">${escapeHtml(String(value))}</span>
      </div>
    `;
  });
  
  html += `</div></div>`;
  
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
 * Generate HTML from element-based configuration (new format)
 * 
 * @param {Object} formData - The form data
 * @param {Array} elements - Array of HTML card elements
 * @returns {string} - HTML string
 */
function generateFromElements(formData, elements) {
  console.log('🎨 Generating HTML card from elements:', JSON.stringify(elements, null, 2));
  console.log('📊 Form data available:', Object.keys(formData));
  
  let html = `<div style='font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; max-width: 650px; margin: 0; padding: 1.5rem; border: 1px solid #e5e7eb; border-radius: 10px; background: linear-gradient(to bottom, #ffffff, #f9fafb); box-shadow: 0 2px 8px rgba(0,0,0,0.08);'>`;
  
  html += renderElements(formData, elements);
  
  html += `</div>`;
  
  console.log('✅ Generated HTML length:', html.length);
  console.log('🔍 HTML preview (first 500 chars):', html.substring(0, 500));
  
  return html;
}

/**
 * Render array of elements recursively
 * 
 * @param {Object} formData - The form data
 * @param {Array} elements - Array of elements to render
 * @returns {string} - HTML string
 */
function renderElements(formData, elements) {
  let html = '';
  
  for (const element of elements) {
    html += renderElement(formData, element);
  }
  
  return html;
}

/**
 * Render a single element
 * 
 * @param {Object} formData - The form data
 * @param {Object} element - Element to render
 * @returns {string} - HTML string
 */
function renderElement(formData, element) {
  if (element.type === 'heading') {
    const level = element.level || 'h2';
    const styles = level === 'h1' 
      ? 'font-size: 1.8rem; color: #2c3e50; margin: 1rem 0 0.75rem 0; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem;'
      : level === 'h2'
      ? 'font-size: 1.4rem; color: #2c3e50; margin: 1rem 0 0.5rem 0; border-bottom: 1px solid #bdc3c7; padding-bottom: 0.5rem;'
      : 'font-size: 1.1rem; color: #555; margin: 0.75rem 0 0.5rem 0;';
    
    return `<${level} style='${styles}'>${escapeHtml(element.text || '')}</${level}>`;
    
  } else if (element.type === 'text') {
    return `<p style='margin: 0.5rem 0; color: #333; line-height: 1.6;'>${escapeHtml(element.text || '')}</p>`;
    
  } else if (element.type === 'divider') {
    return `<hr style='border: none; border-top: 2px solid #ddd; margin: 1rem 0;'>`;
    
  } else if (element.type === 'field') {
    // Use odooField (mapped name) if available, fallback to field (original name)
    const fieldName = element.odooField || element.field;
    const label = element.label || fieldName;
    const value = formData[fieldName];
    
    console.log(`  📝 Rendering field: ${element.field} -> ${fieldName}, label: ${label}, value: ${value}`);
    
    // Skip if no value
    if (value === undefined || value === null || value === '') {
      console.log(`  ⏭️ Skipping field ${fieldName} (no value)`);
      return '';
    }
    
    return `<div style='padding: 0.5rem 0; border-bottom: 1px solid #f0f0f0;'>
      <div style='font-weight: 600; color: #666; font-size: 0.85rem; margin-bottom: 0.25rem; text-transform: capitalize;'>${escapeHtml(label)}</div>
      <div style='color: #222; font-size: 0.95rem;'>${escapeHtml(String(value))}</div>
    </div>`;
    
  } else if (element.type === 'container') {
    const title = element.title || '';
    const layout = element.layout || 'vertical';
    const children = element.children || [];
    
    let containerStyle = 'padding: 1.25rem; margin: 1rem 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);';
    let childrenStyle = '';
    
    if (layout === 'horizontal') {
      childrenStyle = 'display: flex; gap: 1rem; flex-wrap: wrap;';
    } else if (layout === 'grid') {
      childrenStyle = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;';
    } else {
      childrenStyle = 'display: flex; flex-direction: column;';
    }
    
    let html = `<div style='${containerStyle}'>`;
    
    if (title) {
      html += `<h4 style='margin: 0 0 1rem 0; color: #4f46e5; font-size: 1.05rem; font-weight: 600; border-bottom: 2px solid #e0e7ff; padding-bottom: 0.5rem;'>${escapeHtml(title)}</h4>`;
    }
    
    html += `<div style='${childrenStyle}'>`;
    html += renderElements(formData, children);
    html += `</div></div>`;
    
    return html;
  }
  
  return '';
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
