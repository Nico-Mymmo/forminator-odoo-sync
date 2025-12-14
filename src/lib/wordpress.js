// WordPress REST API wrapper for Forminator

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
