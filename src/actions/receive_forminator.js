import { logIncomingRequest } from "../lib/log_request.js";
import { getFormMapping } from "../config/form_mappings.js";
import { executeWorkflow } from "../lib/workflow.js";
import { logRequest } from "./history_api.js";

/**
 * Receive Forminator form submission
 * Logs all incoming data and executes configured workflow
 */
export async function receiveForminator({ request, env, data }) {
  const timestamp = new Date().toISOString();
  
  // Log incoming request
  logIncomingRequest(request, data, 'forminator');
  
  // Start with raw data - no automatic normalization
  const formData = { ...data };
  
  // Check if this form should be synced to Odoo
  const formId = formData.ovme_forminator_id;
  if (!formId) {
    console.log(`⚠️ [${timestamp}] No ovme_forminator_id found, skipping Odoo sync`);
    
    // Log to history
    await logRequest(env, 'unknown', {
      status: 'skipped',
      requestData: data,
      error: 'No ovme_forminator_id found'
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: "Form received (no sync configured)"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  const mapping = await getFormMapping(formId, env);
  
  if (!mapping) {
    console.log(`ℹ️ [${timestamp}] Form ${formId} not configured for Odoo sync, skipping`);
    
    // Log to history
    await logRequest(env, formId, {
      status: 'skipped',
      requestData: data,
      error: 'Form not configured for Odoo sync'
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: `Form ${formId} received (no sync configured)`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  // Apply form-specific field mapping if configured
  if (mapping.field_mapping) {
    // First, collect all mappings to avoid modifying object during iteration
    const mappingsToApply = [];
    for (const [forminatorField, customName] of Object.entries(mapping.field_mapping)) {
      if (formData[forminatorField] !== undefined) {
        mappingsToApply.push({ forminatorField, customName, value: formData[forminatorField] });
      }
    }
    
    // Then apply all mappings
    for (const { forminatorField, customName, value } of mappingsToApply) {
      formData[customName] = value;
      console.log(`🔀 [${timestamp}] Field mapping: ${forminatorField} → ${customName}`);
      // Remove original field to avoid duplicates
      delete formData[forminatorField];
    }
  }
  
  // Apply value mappings for selection fields
  if (mapping.value_mapping) {
    for (const [fieldName, valueMap] of Object.entries(mapping.value_mapping)) {
      if (formData[fieldName] !== undefined) {
        const originalValue = formData[fieldName];
        let mappedValue = valueMap[originalValue];
        
        if (mappedValue !== undefined) {
          // Direct mapping found
          formData[fieldName] = mappedValue;
          console.log(`🎯 [${timestamp}] Value mapping: ${fieldName}: "${originalValue}" → "${mappedValue}"`);
        } else if (valueMap._default !== undefined) {
          // Use default value if no mapping found
          formData[fieldName] = valueMap._default;
          console.log(`🎯 [${timestamp}] Value mapping (default): ${fieldName}: "${originalValue}" → "${valueMap._default}"`);
        } else if (valueMap._skip === true) {
          // Skip field entirely (remove from data)
          delete formData[fieldName];
          console.log(`⏭️ [${timestamp}] Value mapping (skip): ${fieldName}: "${originalValue}" removed`);
        } else {
          // No mapping, no default, no skip = keep original
          console.log(`⚠️ [${timestamp}] No value mapping found for ${fieldName}: "${originalValue}" (keeping original)`);
        }
      }
    }
  }
  
  console.log(`📋 [${timestamp}] Mapped data: ${JSON.stringify(formData, null, 2)}`);
  
  if (!mapping.workflow) {
    console.log(`⚠️ [${timestamp}] Form ${formId} has no workflow configured`);
    
    // Log to history
    await logRequest(env, formId, {
      status: 'skipped',
      requestData: data,
      error: 'No workflow configured'
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: `Form ${formId} received (no workflow configured)`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  console.log(`🔧 [${timestamp}] Form ${formId} has ${mapping.workflow.length} workflow step${mapping.workflow.length === 1 ? '' : 's'}`);
  
  // Execute workflow with optional HTML card config
  try {
    const workflowResults = await executeWorkflow(env, mapping.workflow, formData, mapping.html_card || null);
    
    // Log successful execution to history
    await logRequest(env, formId, {
      status: 'success',
      requestData: data,
      workflowResults: workflowResults
    });
    
    return new Response(JSON.stringify({
      success: true,
      message: "Form processed successfully",
      workflow: workflowResults,
      timestamp
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error(`❌ [${timestamp}] Workflow execution failed:`, error);
    
    // Build detailed error log
    const errorLog = {
      status: 'error',
      requestData: data,
      error: error.message || String(error),
      errorType: error.name || 'Error',
      timestamp: timestamp
    };
    
    // Add workflow-specific error details if available
    if (error.workflowDetails) {
      errorLog.workflowDetails = error.workflowDetails;
    }
    
    // Add Odoo RPC error details if available
    if (error.data) {
      errorLog.odooError = {
        code: error.code,
        name: error.data.name,
        message: error.data.message,
        debug: error.data.debug,
        arguments: error.data.arguments
      };
      
      // Extract invalid field name for easier debugging
      if (error.data.name === 'builtins.ValueError' && error.data.message) {
        const fieldMatch = error.data.message.match(/Invalid field ['"]([^'"]+)['"]/);
        if (fieldMatch) {
          errorLog.invalidField = fieldMatch[1];
          errorLog.hint = `Field '${fieldMatch[1]}' does not exist on model '${error.workflowDetails?.model || 'unknown'}'`;
        }
      }
    }
    
    // Add stack trace if available
    if (error.stack) {
      errorLog.stackTrace = error.stack;
    }
    
    // Log error to history
    await logRequest(env, formId, errorLog);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message || String(error),
      timestamp
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
