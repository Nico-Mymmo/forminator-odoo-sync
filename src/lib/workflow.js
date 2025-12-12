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
  
  // Determine behavior based on what's configured (declarative approach)
  const hasSearch = step.search && step.search.domain;
  const hasCreate = step.create && Object.keys(step.create).length > 0;
  const hasUpdate = step.update && Object.keys(step.update).length > 0;
  
  console.log(`🔧 [${timestamp}] Step: ${step.step} (${step.model}) - Search:${hasSearch?'✓':'✗'} Create:${hasCreate?'✓':'✗'} Update:${hasUpdate?'✓':'✗'}`);
  
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
          const updateData = processTemplateObject(step.update, formData, stepResults);
          
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
          fields: step.search.fields || ['id']
        });
        record = record[0] || {};
        
      } else {
        console.log(`ℹ️ [${timestamp}] No existing ${step.model} found`);
        
        // Create if configured
        if (hasCreate) {
          console.log(`➕ [${timestamp}] Creating new ${step.model}`);
          
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
            fields: step.search.fields || ['id']
          });
          record = record[0] || {};
          
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
    
    const createData = processTemplateObject(step.create, formData, stepResults);
    
    recordId = await create(env, {
      model: step.model,
      values: createData
    });
    isNew = true;
    console.log(`✅ [${timestamp}] Created ${step.model}: ID ${recordId}`);
    
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
function processTemplate(template, formData, stepResults) {
  if (typeof template !== 'string') return template;
  
  let hasNullReference = false;
  
  const result = template
    // First process step references: $contact.id
    .replace(/\$(\w+)\.(\w+)/g, (match, stepName, fieldName) => {
      if (stepResults[stepName] && stepResults[stepName].record) {
        const value = stepResults[stepName].record[fieldName] || stepResults[stepName][fieldName];
        // If value is explicitly null, false, undefined, or 0 (but not empty string)
        if (value === null || value === undefined || value === false) {
          hasNullReference = true;
          return '';
        }
        return value;
      }
      return '';
    })
    // Then process form data: ${email}
    .replace(/\$\{(\w+)\}/g, (match, fieldName) => {
      return formData[fieldName] !== undefined ? formData[fieldName] : '';
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
        const result = processTemplate(String(part), formData, stepResults);
        return result === null ? false : result; // Convert null to false for domain
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
