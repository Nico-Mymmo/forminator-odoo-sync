/**
 * API endpoints for managing form mappings
 * Requires ADMIN_TOKEN authentication
 */

import mappingsJsonFallback from '../config/mappings.json';

/**
 * Get all mappings
 * GET /api/mappings
 */
export async function getMappings({ env }) {
  try {
    let mappingsJson = await env.MAPPINGS_KV.get('mappings', 'json');
    
    if (!mappingsJson) {
      // Fallback to mappings.json if KV is empty
      mappingsJson = mappingsJsonFallback;
    }
    
    // Return mappings directly without wrapper
    return new Response(JSON.stringify(mappingsJson), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching mappings:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Get specific form mapping
 * GET /api/mappings/:formId
 */
export async function getMapping({ env, formId }) {
  try {
    const mappingsJson = await env.MAPPINGS_KV.get('mappings', 'json');
    
    if (!mappingsJson || !mappingsJson[formId]) {
      return new Response(JSON.stringify({
        success: false,
        error: `Form ${formId} not found`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({
      success: true,
      data: mappingsJson[formId]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching mapping:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Save or update form mapping
 * POST /api/mappings/:formId
 * Body: { field_mapping, value_mapping, html_card, workflow }
 */
export async function saveMapping({ env, formId, data }) {
  try {
    // Get existing mappings
    let mappingsJson = await env.MAPPINGS_KV.get('mappings', 'json') || {};
    
    // Update specific form
    mappingsJson[formId] = data;
    
    // Save back to KV
    await env.MAPPINGS_KV.put('mappings', JSON.stringify(mappingsJson, null, 2));
    
    console.log(`✅ Saved mapping for form ${formId}`);
    
    return new Response(JSON.stringify({
      success: true,
      message: `Form ${formId} mapping saved`,
      data: mappingsJson[formId]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error saving mapping:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Delete form mapping
 * DELETE /api/mappings/:formId
 */
export async function deleteMapping({ env, formId }) {
  try {
    // Get existing mappings
    let mappingsJson = await env.MAPPINGS_KV.get('mappings', 'json') || {};
    
    if (!mappingsJson[formId]) {
      return new Response(JSON.stringify({
        success: false,
        error: `Form ${formId} not found`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Delete form
    delete mappingsJson[formId];
    
    // Save back to KV
    await env.MAPPINGS_KV.put('mappings', JSON.stringify(mappingsJson, null, 2));
    
    console.log(`🗑️ Deleted mapping for form ${formId}`);
    
    return new Response(JSON.stringify({
      success: true,
      message: `Form ${formId} mapping deleted`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting mapping:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Import entire mappings JSON
 * POST /api/mappings/import
 * Body: { mappings: {...} }
 */
export async function importMappings({ env, data }) {
  try {
    // Validate it's an object
    if (!data.mappings || typeof data.mappings !== 'object') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid mappings format'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Save to KV
    await env.MAPPINGS_KV.put('mappings', JSON.stringify(data.mappings, null, 2));
    
    console.log(`📥 Imported mappings: ${Object.keys(data.mappings).length} forms`);
    
    return new Response(JSON.stringify({
      success: true,
      message: `Imported ${Object.keys(data.mappings).length} form mappings`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error importing mappings:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
