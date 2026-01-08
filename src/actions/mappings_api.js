/**
 * API endpoints for managing form mappings
 * Requires ADMIN_TOKEN authentication
 * 
 * REFACTORED: Now uses Supabase PostgreSQL instead of Cloudflare KV
 */

import { Database } from '../lib/database.js';
import { invalidateMappingsCache } from '../config/form_mappings.js';

/**
 * Get all mappings
 * GET /api/mappings
 */
export async function getMappings({ env }) {
  try {
    const db = new Database(env);
    const mappingsJson = await db.formMappings.getAllMappings();
    
    // Return mappings directly without wrapper (backwards compatible format)
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
    const db = new Database(env);
    const mapping = await db.formMappings.getMapping(formId);
    
    if (!mapping) {
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
      data: mapping
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
 * Body: { name, field_mapping, value_mapping, html_card, workflow, _version }
 * 
 * _version is optional - if provided, enables optimistic locking
 */
export async function saveMapping({ env, formId, data }) {
  try {
    console.log(`🔵 [API saveMapping] formId: ${formId}`);
    console.log(`🔵 [API saveMapping] data.workflow length: ${data.workflow?.length}`);
    
    const db = new Database(env);
    const expectedVersion = data._version || null;
    
    // Check if mapping exists
    const existing = await db.formMappings.getMapping(formId);
    
    let savedMapping;
    
    if (!existing) {
      // Create new mapping
      savedMapping = await db.formMappings.createMapping(formId, data);
      console.log(`✅ Created new mapping for form ${formId}`);
    } else {
      // Update existing mapping with optimistic locking
      try {
        savedMapping = await db.formMappings.updateMapping(
          formId, 
          data, 
          expectedVersion
        );
        console.log(`✅ Updated mapping for form ${formId} (version ${savedMapping._metadata.version})`);
      } catch (error) {
        if (error.code === 'VERSION_CONFLICT') {
          return new Response(JSON.stringify({
            success: false,
            error: 'conflict',
            message: error.message,
            currentVersion: error.currentVersion
          }), {
            status: 409, // Conflict
            headers: { 'Content-Type': 'application/json' }
          });
        }
        throw error;
      }
    }
    
    // Invalidate cache to ensure fresh data
    invalidateMappingsCache();
    
    return new Response(JSON.stringify({
      success: true,
      message: `Form ${formId} mapping saved`,
      data: savedMapping
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
 * Delete form mapping (soft delete)
 * DELETE /api/mappings/:formId
 */
export async function deleteMapping({ env, formId }) {
  try {
    const db = new Database(env);
    
    // Check if exists
    const existing = await db.formMappings.getMapping(formId);
    if (!existing) {
      return new Response(JSON.stringify({
        success: false,
        error: `Form ${formId} not found`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Soft delete
    await db.formMappings.deleteMapping(formId);
    
    // Invalidate cache
    invalidateMappingsCache();
    
    console.log(`🗑️ Soft deleted mapping for form ${formId}`);
    
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
 * Import entire mappings JSON (bulk import)
 * POST /api/mappings/import
 * Body: { mappings: { "formId1": {...}, "formId2": {...} } }
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
    
    const db = new Database(env);
    const formIds = Object.keys(data.mappings);
    let imported = 0;
    let updated = 0;
    let errors = [];
    
    // Import each form mapping
    for (const formId of formIds) {
      try {
        const mapping = data.mappings[formId];
        const existing = await db.formMappings.getMapping(formId);
        
        if (!existing) {
          await db.formMappings.createMapping(formId, mapping);
          imported++;
        } else {
          await db.formMappings.updateMapping(formId, mapping);
          updated++;
        }
      } catch (error) {
        console.error(`Failed to import form ${formId}:`, error);
        errors.push({ formId, error: error.message });
      }
    }
    
    // Invalidate cache
    invalidateMappingsCache();
    
    console.log(`📥 Imported ${imported} new, updated ${updated} existing mappings`);
    
    return new Response(JSON.stringify({
      success: true,
      message: `Imported ${imported} new and updated ${updated} existing form mappings`,
      imported,
      updated,
      errors: errors.length > 0 ? errors : undefined
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

/**
 * Get mapping history
 * GET /api/mappings/:formId/history
 */
export async function getMappingHistory({ env, formId }) {
  try {
    const db = new Database(env);
    
    // Check if mapping exists
    const mapping = await db.formMappings.getMapping(formId);
    if (!mapping) {
      return new Response(JSON.stringify({
        success: false,
        error: `Form ${formId} not found`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const history = await db.formMappings.getHistory(formId, 100);
    
    return new Response(JSON.stringify({
      success: true,
      data: history
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching mapping history:', error);
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
 * Restore mapping from history
 * POST /api/mappings/:formId/restore
 * Body: { historyId: "uuid" }
 */
export async function restoreMappingFromHistory({ env, formId, data }) {
  try {
    if (!data.historyId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing historyId'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const db = new Database(env);
    const restoredMapping = await db.formMappings.restoreFromHistory(formId, data.historyId);
    
    // Invalidate cache
    invalidateMappingsCache();
    
    console.log(`♻️ Restored mapping for form ${formId} from history ${data.historyId}`);
    
    return new Response(JSON.stringify({
      success: true,
      message: `Form ${formId} restored from history`,
      data: restoredMapping
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error restoring mapping:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
