import { logIncomingRequest } from "../lib/log_request.js";
import { normalizeForminatorFields } from "../lib/forminator_mapper.js";
import { getFormMapping } from "../config/form_mappings.js";
import { executeWorkflow } from "../lib/workflow.js";

/**
 * Receive Forminator form submission
 * Logs all incoming data and executes configured workflow
 */
export async function receiveForminator({ request, env, data }) {
  const timestamp = new Date().toISOString();
  
  // Log incoming request
  logIncomingRequest(request, data, 'forminator');
  
  // Normalize Forminator field names (email-1 → email, phone-3 → phone, etc.)
  const normalizedData = normalizeForminatorFields(data);
  
  // Check if this form should be synced to Odoo
  const formId = normalizedData.ovme_forminator_id || data.ovme_forminator_id;
  if (!formId) {
    console.log(`⚠️ [${timestamp}] No ovme_forminator_id found, skipping Odoo sync`);
    return new Response(JSON.stringify({
      success: true,
      message: "Form received (no sync configured)"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  const mapping = getFormMapping(formId);
  
  if (!mapping) {
    console.log(`ℹ️ [${timestamp}] Form ${formId} not configured for Odoo sync, skipping`);
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
      if (normalizedData[forminatorField] !== undefined) {
        mappingsToApply.push({ forminatorField, customName, value: normalizedData[forminatorField] });
      }
    }
    
    // Then apply all mappings
    for (const { forminatorField, customName, value } of mappingsToApply) {
      normalizedData[customName] = value;
      console.log(`🔀 [${timestamp}] Custom mapping: ${forminatorField} → ${customName}`);
      // Remove original field to avoid duplicates
      delete normalizedData[forminatorField];
    }
  }
  
  console.log(`📋 [${timestamp}] Normalized data: ${JSON.stringify(normalizedData, null, 2)}`);
  
  if (!mapping.workflow) {
    console.log(`⚠️ [${timestamp}] Form ${formId} has no workflow configured`);
    return new Response(JSON.stringify({
      success: true,
      message: `Form ${formId} received (no workflow configured)`
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  console.log(`🔧 [${timestamp}] Form ${formId} has ${mapping.workflow.length} workflow steps`);
  
  // Execute workflow
  const workflowResults = await executeWorkflow(env, mapping.workflow, normalizedData);
  
  return new Response(JSON.stringify({
    success: true,
    message: "Form processed successfully",
    workflow: workflowResults,
    timestamp
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
  
  // Return success response
  return new Response(JSON.stringify({
    success: true,
    message: "Form submission received and logged",
    timestamp: timestamp,
    data_received: Object.keys(data)
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
