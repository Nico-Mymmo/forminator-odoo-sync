// WordPress REST API wrapper for Forminator

/**
 * Fetch Forminator forms via the openvme/v1 custom endpoint.
 *
 * Single source of truth for ALL modules that need live form data.
 *
 * Postman-verified call:
 *   GET {baseUrl}/wp-json/openvme/v1/forminator/forms
 *   Header: X-OPENVME-SECRET: <secret>
 *   Header: Accept: application/json
 *
 * @param {{ baseUrl: string, secret: string }} opts
 * @returns {Promise<Array>} Array of { form_id, form_name, fields }
 */
export async function fetchOpenVmeForminatorForms({ baseUrl, secret }) {
  const url = `${String(baseUrl).replace(/\/$/, '')}/wp-json/openvme/v1/forminator/forms`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'X-OPENVME-SECRET': secret,
        'Accept':           'application/json'
      }
    });
  } catch (networkErr) {
    throw new Error(`WP onbereikbaar (${url}): ${networkErr.message}`);
  }

  if (response.status === 401) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `WP weigerde toegang (401) op ${url}. ` +
      `Controleer de X-OPENVME-SECRET waarde. WP antwoord: ${body.slice(0, 200)}`
    );
  }

  if (response.status === 404) {
    throw new Error(
      `WP endpoint niet gevonden (404): ${url}. ` +
      `De openvme/v1 plugin is niet actief op deze WP-site.`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`WP openvme forminator forms error ${response.status}: ${body.slice(0, 300)}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Ongeldige JSON ontvangen van ${url}`);
  }

  if (!Array.isArray(data)) {
    throw new Error(`Verwachtte array van formulieren, maar kreeg ${typeof data} van ${url}`);
  }

  return data;
}

/**
 * Bouw een Basic Auth header vanuit een token in het formaat "Gebruiker:AppWachtwoord".
 *
 * Het token wordt NOOIT vooraf geëncodeerd opgeslagen — deze functie doet de
 * base64-encoding runtime in de Worker.
 *
 * @param {string} token  Formaat: "Gebruiker:AppWachtwoord"
 * @returns {string}      "Basic <base64>"
 */
export function getWpAuthHeader(token) {
  if (!token || !String(token).includes(':')) {
    throw new Error(
      'WP_API_TOKEN heeft een ongeldig formaat. ' +
      'Verwacht: "Gebruiker:AppWachtwoord" (niet vooraf base64 encoded).'
    );
  }
  return `Basic ${btoa(String(token))}`;
}

/**
 * Haal Forminator forms op via Basic Auth (WP_API_TOKEN_SITE_X secrets).
 *
 * Zelfde endpoint als fetchOpenVmeForminatorForms maar gebruikt
 * Authorization: Basic in plaats van X-OPENVME-SECRET.
 *
 * @param {{ baseUrl: string, token: string }} opts
 *   token = plain "Gebruiker:AppWachtwoord" string (Cloudflare secret, nooit encoded)
 * @returns {Promise<Array>}
 */
export async function fetchForminatorFormsBasicAuth({ baseUrl, token }) {
  const authHeader = getWpAuthHeader(token);
  const url = `${String(baseUrl).replace(/\/$/, '')}/wp-json/openvme/v1/forminator/forms`;

  let response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Authorization': authHeader,
        'Accept':        'application/json'
      }
    });
  } catch (networkErr) {
    throw new Error(`WP onbereikbaar (${url}): ${networkErr.message}`);
  }

  if (response.status === 401) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `WP weigerde toegang (401) op ${url}. ` +
      `Controleer WP_API_TOKEN — formaat moet "Gebruiker:AppWachtwoord" zijn. ` +
      `WP antwoord: ${body.slice(0, 200)}`
    );
  }

  if (response.status === 404) {
    throw new Error(
      `WP endpoint niet gevonden (404): ${url}. ` +
      `De openvme/v1 plugin is niet actief op deze WP-site.`
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`WP Basic Auth forminator forms error ${response.status}: ${body.slice(0, 300)}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Ongeldige JSON ontvangen van ${url}`);
  }

  if (!Array.isArray(data)) {
    throw new Error(`Verwachtte array van formulieren, maar kreeg ${typeof data} van ${url}`);
  }

  return data;
}

export async function getForminatorForm(formId, env) {
    const auth = btoa(`${env.WP_USERNAME}:${env.WP_PASSWORD}`);
    
    console.log(`[WordPress] Fetching Forminator form ${formId}`);
    
    try {
        // Try the Forminator REST API endpoint
        const response = await fetch(`https://openvme.be/wp-json/forminator/v1/forms/${formId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`[WordPress] Response status: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[WordPress] Error response: ${errorText}`);
            throw new Error(`WordPress API returned ${response.status}: ${errorText || response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`[WordPress] Successfully fetched form data`);
        return data;
    } catch (error) {
        console.error('[WordPress] Failed to fetch Forminator form:', error);
        throw new Error(`Failed to fetch WordPress form: ${error.message}`);
    }
}

export function extractFieldsFromForm(formData) {
    const fields = {};
    
    if (!formData || !formData.fields) {
        return fields;
    }
    
    // Parse Forminator fields structure
    Object.entries(formData.fields).forEach(([fieldId, fieldConfig]) => {
        if (!fieldConfig || !fieldConfig.element_id) {
            return;
        }
        
        const elementId = fieldConfig.element_id;
        const fieldType = fieldConfig.type || 'text';
        const fieldLabel = fieldConfig.field_label || elementId;
        
        // Handle different field types
        switch (fieldType) {
            case 'name':
                // Name field has sub-fields
                if (fieldConfig.fname) {
                    fields[`${elementId}_first_name`] = {
                        label: `${fieldLabel} (First Name)`,
                        type: 'text',
                        element_id: elementId
                    };
                }
                if (fieldConfig.lname) {
                    fields[`${elementId}_last_name`] = {
                        label: `${fieldLabel} (Last Name)`,
                        type: 'text',
                        element_id: elementId
                    };
                }
                break;
                
            case 'email':
                fields[elementId] = {
                    label: fieldLabel,
                    type: 'email',
                    element_id: elementId
                };
                break;
                
            case 'phone':
                fields[elementId] = {
                    label: fieldLabel,
                    type: 'phone',
                    element_id: elementId
                };
                break;
                
            case 'text':
            case 'textarea':
                fields[elementId] = {
                    label: fieldLabel,
                    type: fieldType,
                    element_id: elementId
                };
                break;
                
            case 'number':
                fields[elementId] = {
                    label: fieldLabel,
                    type: 'number',
                    element_id: elementId
                };
                break;
                
            case 'select':
            case 'radio':
            case 'checkbox':
                const options = {};
                if (fieldConfig.options && Array.isArray(fieldConfig.options)) {
                    fieldConfig.options.forEach(opt => {
                        if (opt.value && opt.label) {
                            options[opt.value] = opt.label;
                        }
                    });
                }
                fields[elementId] = {
                    label: fieldLabel,
                    type: fieldType,
                    element_id: elementId,
                    options: options
                };
                break;
                
            case 'slider':
                fields[elementId] = {
                    label: fieldLabel,
                    type: 'slider',
                    element_id: elementId,
                    min: fieldConfig.min || 0,
                    max: fieldConfig.max || 100
                };
                break;
                
            default:
                // Generic field
                fields[elementId] = {
                    label: fieldLabel,
                    type: fieldType,
                    element_id: elementId
                };
        }
    });
    
    return fields;
}

export function generateFieldMapping(fields) {
    const mapping = {};
    
    Object.entries(fields).forEach(([fieldId, fieldInfo]) => {
        // Generate a clean field name from label
        let cleanName = fieldInfo.label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
        
        // Avoid duplicates
        let baseName = cleanName;
        let counter = 1;
        while (Object.values(mapping).includes(cleanName)) {
            cleanName = `${baseName}_${counter}`;
            counter++;
        }
        
        mapping[fieldId] = cleanName;
    });
    
    return mapping;
}
