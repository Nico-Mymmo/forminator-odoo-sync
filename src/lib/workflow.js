import { search, read, create, write, messagePost } from "../lib/odoo.js";
import { generateHtmlCard } from "../lib/html_card_generator.js";

/**
 * Process a workflow step
 * Handles check/create/update logic for a single step
 * 
 * @param {Object} env - Cloudflare environment
 * @param {Object} step - Workflow step configuration
 * @param {Object} formData - Normalized form data
 * @param {Object} stepResults - Results from previous steps
 * @returns {Object} - Step result with id, record, isNew, isUpdated
 */
async function processStep(env, step, formData, stepResults) {
  const timestamp = new Date().toISOString().substring(11, 19);
  
  // Determine behavior based on what's configured (declarative approach)
  const hasSearch = step.search && step.search.domain;
  const hasCreate = step.create && Object.keys(step.create).length > 0;
  // Check for update.fields (new format) or update directly (old format)
  const updateFields = step.update?.fields || step.update;
  const hasUpdate = updateFields && Object.keys(updateFields).length > 0;
  
  console.log(`🔧 [${timestamp}] Step: ${step.step} (${step.model}) - Search: ${hasSearch?'✓':'✗'} Create: ${hasCreate?'✓':'✗'} Update: ${hasUpdate?'✓':'✗'}`);
  
  let recordId = null;
  let isNew = false;
  let isUpdated = false;
  let record = null;
  
  // Search for existing record if search is configured
  if (hasSearch) {
    const searchDomain = processTemplateDomain(step.search.domain, formData, stepResults);
    
    // If domain contains null references (e.g., $contact.parent_id is null), skip search
    if (searchDomain === null) {
      console.log(`⏭️ [${timestamp}] Search skipped: domain contains null/unresolved references`);
      recordId = null;
    } else {
      const existingRecords = await search(env, {
        model: step.model,
        domain: searchDomain,
        limit: 1
      });
      
      recordId = existingRecords.length > 0 ? existingRecords[0] : null;
      
      if (recordId) {
        console.log(`✅ [${timestamp}] Found existing ${step.model}: ID ${recordId}`);
        
        // Update if configured
        if (hasUpdate) {
          // Extract fields from step.update.fields or use step.update directly (for backward compatibility)
          const updateFields = step.update.fields || step.update;
          const updateTypes = step._ui_metadata?.update_types || {};
          const updateData = processTemplateObject(updateFields, formData, stepResults, updateTypes);
          
          if (Object.keys(updateData).length > 0) {
            await write(env, {
              model: step.model,
              ids: [recordId],
              values: updateData
            });
            isUpdated = true;
            console.log(`📝 [${timestamp}] Updated ${step.model} ID ${recordId}`);
          }
          
          // Post chatter message if configured for update
          if (step._chatter?.update && recordId) {
            const chatterMessage = processTemplate(step._chatter.update, formData, stepResults);
            if (chatterMessage) {
              await messagePost(env, {
                model: step.model,
                id: [recordId],
                body: chatterMessage
              });
              console.log(`💬 [${timestamp}] Posted chatter message on updated ${step.model} ID ${recordId}`);
            }
          }
        }
        
        // Read full record
        const fieldsToRead = step.search.fields || ['id'];
        console.log(`📖 [${timestamp}] Reading fields: ${fieldsToRead.join(', ')}`);
        record = await read(env, {
          model: step.model,
          ids: [recordId],
          fields: fieldsToRead
        });
        record = record[0] || {};
        console.log(`📦 [${timestamp}] Retrieved data: ${JSON.stringify(record)}`);
        
      } else {
        console.log(`ℹ️ [${timestamp}] No existing ${step.model} found`);
        
        // Create if configured
        if (hasCreate) {
          console.log(`➕ [${timestamp}] Creating new ${step.model}`);
          
          const createTypes = step._ui_metadata?.create_types || {};
          const createData = processTemplateObject(step.create, formData, stepResults, createTypes);
          
          recordId = await create(env, {
            model: step.model,
            values: createData
          });
          isNew = true;
          console.log(`✅ [${timestamp}] Created ${step.model}: ID ${recordId}`);
          
          // Post chatter message if configured for create
          if (step._chatter?.create && recordId) {
            const chatterMessage = processTemplate(step._chatter.create, formData, stepResults);
            if (chatterMessage) {
              await messagePost(env, {
                model: step.model,
                id: [recordId],
                body: chatterMessage
              });
              console.log(`💬 [${timestamp}] Posted chatter message on created ${step.model} ID ${recordId}`);
            }
          }
          
          // Read full record
          const fieldsToRead = step.search.fields || ['id'];
          console.log(`📖 [${timestamp}] Reading fields: ${fieldsToRead.join(', ')}`);
          record = await read(env, {
            model: step.model,
            ids: [recordId],
            fields: fieldsToRead
          });
          record = record[0] || {};
          console.log(`📦 [${timestamp}] Retrieved data: ${JSON.stringify(record)}`);
          
        } else {
          // No create configured, skip
          console.log(`⚠️ [${timestamp}] Record not found and no create configured, skipping`);
          return {
            id: null,
            record: {},
            isNew: false,
            isUpdated: false,
            skipped: true
          };
        }
      }
    }
  } else if (hasCreate) {
    // No search, just create
    console.log(`➕ [${timestamp}] Creating new ${step.model} (no search)`);
    
    const createTypes = step._ui_metadata?.create_types || {};
    const createData = processTemplateObject(step.create, formData, stepResults, createTypes);
    
    recordId = await create(env, {
      model: step.model,
      values: createData
    });
    isNew = true;
    console.log(`✅ [${timestamp}] Created ${step.model}: ID ${recordId}`);
    
    // Post chatter message if configured for create
    if (step._chatter?.create && recordId) {
      const chatterMessage = processTemplate(step._chatter.create, formData, stepResults);
      if (chatterMessage) {
        await messagePost(env, {
          model: step.model,
          id: [recordId],
          body: chatterMessage
        });
        console.log(`💬 [${timestamp}] Posted chatter message on created ${step.model} ID ${recordId}`);
      }
    }
    
    record = await read(env, {
      model: step.model,
      ids: [recordId],
      fields: ['id']
    });
    record = record[0] || {};
  }
  
  return {
    id: recordId,
    record: record,
    isNew,
    isUpdated,
    skipped: !recordId
  };
}

/**
 * Process template string with form data and step results
 * Replaces ${field} with form data and $stepname.field with step results
 * Returns null if any step reference resolves to null/false/undefined
 * 
 * @param {string} template - Template string
 * @param {Object} formData - Normalized form data
 * @param {Object} stepResults - Results from previous steps
 * @returns {string|null} - Processed string or null if unresolved references
 */
/**
 * Convert value to specified type
 * @param {*} value - Value to convert
 * @param {string} type - Target type ('auto', 'string', 'integer', 'float', 'boolean')
 * @returns {*} - Converted value
 */
function convertFieldType(value, type) {
  if (type === 'auto') {
    // Auto mode: keep original type or try to parse
    if (typeof value === 'string') {
      // Try to parse JSON-like values
      try {
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (value.startsWith('{') || value.startsWith('[')) {
          return JSON.parse(value);
        }
        // Check if it's a number
        if (!isNaN(value) && value.trim() !== '') {
          const num = Number(value);
          return Number.isInteger(num) ? parseInt(value) : parseFloat(value);
        }
      } catch (e) {}
    }
    return value;
  }
  
  switch (type) {
    case 'string':
      return String(value);
    case 'integer':
      return parseInt(value) || 0;
    case 'float':
      return parseFloat(value) || 0.0;
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        return value.toLowerCase() === 'true' || value === '1';
      }
      return Boolean(value);
    default:
      return value;
  }
}

function processTemplate(template, formData, stepResults) {
  if (typeof template !== 'string') return template;
  
  let hasNullReference = false;
  
  const result = template
    // First process step references: $contact.id
    .replace(/\$(\w+)\.(\w+)/g, (match, stepName, fieldName) => {
      // Skip if this is ${field.xxx} syntax (form field reference, not step reference)
      if (stepName === 'field') {
        return match; // Leave it for next replacement
      }
      if (stepResults[stepName] && stepResults[stepName].record) {
        const value = stepResults[stepName].record[fieldName] || stepResults[stepName][fieldName];
        // If value is explicitly null, false, undefined, or 0 (but not empty string)
        if (value === null || value === undefined || value === false) {
          hasNullReference = true;
          return '';
        }
        // If value is Many2One (array like [id, "name"]), return just the ID
        if (Array.isArray(value) && value.length >= 1) {
          return value[0];
        }
        // Trim string values to avoid trailing/leading whitespace issues
        return typeof value === 'string' ? value.trim() : value;
      }
      return '';
    })
    // Then process form field references: ${field.email} or ${email}
    .replace(/\$\{(?:field\.)?(\w+)\}/g, (match, fieldName) => {
      const value = formData[fieldName];
      // Trim string values to avoid trailing/leading whitespace issues
      return value !== undefined ? (typeof value === 'string' ? value.trim() : value) : '';
    });
  
  // If we found null references, return null to signal skip
  return hasNullReference ? null : result;
}

/**
 * Process template domain (array with nested arrays)
 * Returns null if any template resolves to null (indicating null references)
 * 
 * @param {Array} domain - Odoo domain
 * @param {Object} formData - Form data
 * @param {Object} stepResults - Step results
 * @returns {Array|null} - Processed domain or null if contains null references
 */
function processTemplateDomain(domain, formData, stepResults) {
  const processed = domain.map(condition => {
    if (Array.isArray(condition)) {
      return condition.map(part => {
        // Keep booleans and numbers as-is
        if (typeof part === 'boolean' || typeof part === 'number') {
          return part;
        }
        // Process strings
        if (typeof part === 'string') {
          const result = processTemplate(part, formData, stepResults);
          return result === null ? false : result; // Convert null to false for domain
        }
        return part;
      });
    }
    return condition;
  });
  
  // Check if any condition has null/false values from unresolved references
  const hasNullCondition = processed.some(condition => 
    Array.isArray(condition) && condition.some(part => part === false && typeof part !== 'boolean')
  );
  
  return hasNullCondition ? null : processed;
}

/**
 * Process template object (recursively process all string values)
 * Apply type conversions based on fieldTypes metadata
 * 
 * @param {Object} obj - Object with template strings
 * @param {Object} formData - Form data
 * @param {Object} stepResults - Step results
 * @param {Object} fieldTypes - Optional field type metadata from _ui_metadata
 * @returns {Object} - Processed object with only non-empty values
 */
function processTemplateObject(obj, formData, stepResults, fieldTypes = {}) {
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const fieldType = fieldTypes[key] || 'auto';
    
    if (typeof value === 'string') {
      const processed = processTemplate(value, formData, stepResults);
      if (processed) {
        // Apply type conversion based on metadata
        result[key] = convertFieldType(processed, fieldType);
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      // Apply type conversion
      result[key] = convertFieldType(value, fieldType);
    } else if (Array.isArray(value)) {
      result[key] = value;
    } else if (value && typeof value === 'object') {
      result[key] = processTemplateObject(value, formData, stepResults);
    }
  }
  
  return result;
}

/**
 * Analyze workflow to find all field references from previous steps
 * and automatically add them to search.fields
 * 
 * @param {Array} workflow - Workflow configuration
 * @returns {Array} - Workflow with enriched fields
 */
function enrichWorkflowFields(workflow) {
  const enrichedWorkflow = JSON.parse(JSON.stringify(workflow)); // Deep clone
  
  // For each step, analyze what fields are needed from previous steps
  for (let i = 0; i < enrichedWorkflow.length; i++) {
    const step = enrichedWorkflow[i];
    const requiredFields = new Set(['id']); // Always include id
    
    // Add fields already configured
    const originalFields = [];
    if (step.search && step.search.fields) {
      step.search.fields.forEach(field => {
        requiredFields.add(field);
        originalFields.push(field);
      });
    }
    
    // Check all future steps for references to this step
    for (let j = i + 1; j < enrichedWorkflow.length; j++) {
      const futureStep = enrichedWorkflow[j];
      const stepName = step.step;
      
      // Find all references like $stepname.fieldname in the future step
      const jsonStr = JSON.stringify(futureStep);
      const regex = new RegExp(`\\$${stepName}\\.(\\w+)`, 'g');
      let match;
      
      while ((match = regex.exec(jsonStr)) !== null) {
        const fieldName = match[1];
        requiredFields.add(fieldName);
      }
    }
    
    // Update the step's fields
    if (step.search) {
      const finalFields = Array.from(requiredFields);
      step.search.fields = finalFields;
      
      // Log auto-added fields
      const autoAdded = finalFields.filter(f => !originalFields.includes(f) && f !== 'id');
      if (autoAdded.length > 0) {
        console.log(`🔍 Auto-detected fields for step "${step.step}": ${autoAdded.join(', ')}`);
      }
    }
  }
  
  return enrichedWorkflow;
}

/**
 * Inject HTML cards into workflow steps
 * Replaces __html_card__ placeholders with generated HTML
 * Uses step.html_card config if available, falls back to global config
 * 
 * @param {Array} workflow - Workflow configuration
 * @param {Object} formData - Form data
 * @param {Object} globalHtmlCardConfig - Global HTML card configuration (deprecated, use step.html_card)
 * @returns {Array} - Workflow with HTML cards injected
 */
function injectHtmlCards(workflow, formData, globalHtmlCardConfig = null) {
  const workflowCopy = JSON.parse(JSON.stringify(workflow)); // Deep clone
  
  for (const step of workflowCopy) {
    // Parse html_card config if it's a JSON string
    let stepHtmlCardConfig = null;
    if (step.html_card) {
      try {
        stepHtmlCardConfig = typeof step.html_card === 'string' 
          ? JSON.parse(step.html_card) 
          : step.html_card;
      } catch (e) {
        console.error(`Failed to parse html_card config for step ${step.step}:`, e);
      }
    }
    
    // Use step config, fall back to global config
    const htmlCardConfig = stepHtmlCardConfig || globalHtmlCardConfig;
    
    // Only process if we have a config
    if (!htmlCardConfig) {
      continue;
    }
    
    // Check create fields
    if (step.create) {
      for (const [key, value] of Object.entries(step.create)) {
        if (typeof value === 'string' && value.includes('__html_card__')) {
          step.create[key] = value.replace('__html_card__', generateHtmlCard(formData, htmlCardConfig));
        }
      }
    }
    
    // Check update fields
    if (step.update && step.update.fields) {
      for (const [key, value] of Object.entries(step.update.fields)) {
        if (typeof value === 'string' && value.includes('__html_card__')) {
          step.update.fields[key] = value.replace('__html_card__', generateHtmlCard(formData, htmlCardConfig));
        }
      }
    }
  }
  
  return workflowCopy;
}

/**
 * Execute a workflow for a form submission
 * Processes steps sequentially, passing results to next steps
 * 
 * @param {Object} env - Cloudflare environment
 * @param {Object} workflow - Workflow configuration
 * @param {Object} formData - Normalized form data
 * @param {Object} htmlCardConfig - HTML card configuration (optional)
 * @returns {Object} - Results from all steps
 */
export async function executeWorkflow(env, workflow, formData, htmlCardConfig = null) {
  const timestamp = new Date().toISOString().substring(11, 19);
  
  // Enrich workflow with auto-detected required fields
  const enrichedWorkflow = enrichWorkflowFields(workflow);
  
  // Process workflow steps to inject HTML cards
  const processedWorkflow = injectHtmlCards(enrichedWorkflow, formData, htmlCardConfig);
  
  console.log(`🚀 [${timestamp}] Starting workflow with ${processedWorkflow.length} step${processedWorkflow.length === 1 ? '' : 's'}`);
  
  const stepResults = {};
  
  for (const step of processedWorkflow) {
    try {
      const result = await processStep(env, step, formData, stepResults);
      stepResults[step.step] = result;
      
      if (result.skipped) {
        console.log(`⏭️ [${timestamp}] Step "${step.step}" skipped: NOT FOUND`);
      } else {
        console.log(`✅ [${timestamp}] Step "${step.step}" completed: ${result.isNew ? 'NEW' : (result.isUpdated ? 'UPDATED' : 'EXISTING')} - ID: ${result.id}`);
      }
    } catch (error) {
      console.error(`❌ [${timestamp}] Step "${step.step}" failed: ${error.message}`);
      
      // Extract detailed Odoo error information if available
      let errorDetails = {
        step: step.step,
        model: step.model,
        message: error.message,
        stack: error.stack
      };
      
      // Check if this is an Odoo RPC error with detailed data
      if (error.data) {
        errorDetails.odooError = {
          name: error.data.name,
          message: error.data.message,
          debug: error.data.debug,
          arguments: error.data.arguments,
          context: error.data.context
        };
        
        // Try to extract field name from ValueError
        if (error.data.name === 'builtins.ValueError' && error.data.message) {
          const fieldMatch = error.data.message.match(/Invalid field ['"]([^'"]+)['"]/);
          if (fieldMatch) {
            errorDetails.invalidField = fieldMatch[1];
          }
        }
      }
      
      // Attach error details to the error object for logging
      error.workflowDetails = errorDetails;
      throw error;
    }
  }
  
  console.log(`🎉 [${timestamp}] Workflow completed successfully`);
  return stepResults;
}
