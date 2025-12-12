import { search, read, create, write } from "../lib/odoo.js";

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
  console.log(`🔧 [${timestamp}] Step: ${step.step} (${step.model}) - Action: ${step.action}`);
  
  // Process templates in search domain
  const searchDomain = processTemplateDomain(step.search.domain, formData, stepResults);
  
  // Search for existing record
  const existingRecords = await search(env, {
    model: step.model,
    domain: searchDomain,
    limit: 1
  });
  
  let recordId = existingRecords.length > 0 ? existingRecords[0] : null;
  let isNew = false;
  let isUpdated = false;
  let record = null;
  
  if (recordId) {
    console.log(`✅ [${timestamp}] Found existing ${step.model}: ID ${recordId}`);
    
    // Update if enabled and not check_only
    if (step.action !== "check_only" && step.update && step.update.enabled && Object.keys(step.update.fields || {}).length > 0) {
      const updateData = processTemplateObject(step.update.fields, formData, stepResults);
      
      if (Object.keys(updateData).length > 0) {
        await write(env, {
          model: step.model,
          ids: [recordId],
          values: updateData
        });
        isUpdated = true;
        console.log(`📝 [${timestamp}] Updated ${step.model} ID ${recordId}`);
      }
    }
    
    // Read full record
    record = await read(env, {
      model: step.model,
      ids: [recordId],
      fields: step.search.fields
    });
    record = record[0] || {};
    
  } else {
    // Record not found
    if (step.action === "check_create") {
      console.log(`➕ [${timestamp}] Creating new ${step.model}`);
      
      // Create new record
      const createData = processTemplateObject(step.create, formData, stepResults);
      
      recordId = await create(env, {
        model: step.model,
        values: createData
      });
      isNew = true;
      console.log(`✅ [${timestamp}] Created ${step.model}: ID ${recordId}`);
      
      // Read full record
      record = await read(env, {
        model: step.model,
        ids: [recordId],
        fields: step.search.fields
      });
      record = record[0] || {};
      
    } else if (step.action === "check_update" || step.action === "check_only") {
      console.log(`⚠️ [${timestamp}] Record not found for ${step.action}, skipping`);
      // Return null result, step failed gracefully
      return {
        id: null,
        record: {},
        isNew: false,
        isUpdated: false,
        skipped: true
      };
    }
  }
  
  return {
    id: recordId,
    record: record,
    isNew,
    isUpdated,
    skipped: false
  };
}

/**
 * Process template string with form data and step results
 * Replaces ${field} with form data and $stepname.field with step results
 * 
 * @param {string} template - Template string
 * @param {Object} formData - Normalized form data
 * @param {Object} stepResults - Results from previous steps
 * @returns {string} - Processed string
 */
function processTemplate(template, formData, stepResults) {
  if (typeof template !== 'string') return template;
  
  return template
    // First process step references: $contact.id
    .replace(/\$(\w+)\.(\w+)/g, (match, stepName, fieldName) => {
      if (stepResults[stepName] && stepResults[stepName].record) {
        return stepResults[stepName].record[fieldName] || stepResults[stepName][fieldName] || '';
      }
      return '';
    })
    // Then process form data: ${email}
    .replace(/\$\{(\w+)\}/g, (match, fieldName) => {
      return formData[fieldName] !== undefined ? formData[fieldName] : '';
    });
}

/**
 * Process template domain (array with nested arrays)
 * 
 * @param {Array} domain - Odoo domain
 * @param {Object} formData - Form data
 * @param {Object} stepResults - Step results
 * @returns {Array} - Processed domain
 */
function processTemplateDomain(domain, formData, stepResults) {
  return domain.map(condition => {
    if (Array.isArray(condition)) {
      return condition.map(part => processTemplate(String(part), formData, stepResults));
    }
    return condition;
  });
}

/**
 * Process template object (recursively process all string values)
 * 
 * @param {Object} obj - Object with template strings
 * @param {Object} formData - Form data
 * @param {Object} stepResults - Step results
 * @returns {Object} - Processed object with only non-empty values
 */
function processTemplateObject(obj, formData, stepResults) {
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      const processed = processTemplate(value, formData, stepResults);
      if (processed) {
        result[key] = processed;
      }
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value;
    } else if (value && typeof value === 'object') {
      result[key] = processTemplateObject(value, formData, stepResults);
    }
  }
  
  return result;
}

/**
 * Execute a workflow for a form submission
 * Processes steps sequentially, passing results to next steps
 * 
 * @param {Object} env - Cloudflare environment
 * @param {Object} workflow - Workflow configuration
 * @param {Object} formData - Normalized form data
 * @returns {Object} - Results from all steps
 */
export async function executeWorkflow(env, workflow, formData) {
  const timestamp = new Date().toISOString().substring(11, 19);
  console.log(`🚀 [${timestamp}] Starting workflow with ${workflow.length} steps`);
  
  const stepResults = {};
  
  for (const step of workflow) {
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
      throw error;
    }
  }
  
  console.log(`🎉 [${timestamp}] Workflow completed successfully`);
  return stepResults;
}
