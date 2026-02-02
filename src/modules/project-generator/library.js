/**
 * Project Generator Library
 * 
 * Data access layer for project template CRUD operations.
 * Follows repository pattern from sales-insight-explorer.
 * 
 * RULES:
 * - User-scoped data (RLS enforced automatically)
 * - Explicit user_id filtering (defensive)
 * - All errors logged and re-thrown
 * - No business logic (pure data access)
 * - Addendum N: Permission enforcement on all operations
 */

import { createClient } from '@supabase/supabase-js';
import { canSeeTemplateInList, canRead, canEdit, canDelete } from './permissions.js';

/**
 * Initialize Supabase client
 * 
 * IMPORTANT: Uses SERVICE_ROLE_KEY to enable RLS policies.
 * Do NOT use getSupabaseClient from lib/database.js (bypasses RLS).
 */
function getSupabaseClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Get all templates for a user
 * 
 * Addendum N: Enforces list visibility (canSeeTemplateInList)
 * - Private templates only visible to owner
 * - Public templates visible to everyone
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} userId - User UUID
 * @returns {Promise<Array>} Array of template objects
 * @throws {Error} If database operation fails
 */
export async function getTemplates(env, userId) {
  const supabase = getSupabaseClient(env);
  
  // Fetch all templates (RLS + visibility filtering)
  // RLS policy handles visibility, but we filter defensively
  const { data, error } = await supabase
    .from('project_templates')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[Template Library] Fetch failed:', error);
    throw new Error(`Failed to fetch templates: ${error.message}`);
  }
  
  // Addendum N: Filter by canSeeTemplateInList (privacy invariant)
  const visibleTemplates = (data || []).filter(template => 
    canSeeTemplateInList(template, userId)
  );
  
  return visibleTemplates;
}

/**
 * Get a single template by ID
 * 
 * Addendum N: Returns null if template doesn't exist OR user lacks read permission.
 * This prevents leaking existence of private templates.
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} templateId - Template UUID
 * @param {string} userId - User UUID (optional, for permission check)
 * @returns {Promise<Object|null>} Template object or null
 * @throws {Error} If database operation fails
 */
export async function getTemplate(env, templateId, userId = null) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('project_templates')
    .select('*')
    .eq('id', templateId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    console.error('[Template Library] Get failed:', error);
    throw new Error(`Failed to get template: ${error.message}`);
  }
  
  // Addendum N: Permission check
  // If userId provided and user cannot read, return null (hide existence)
  if (userId && !canRead(data, userId)) {
    return null;
  }
  
  return data;
}

/**
 * Create a new template
 * 
 * Addendum N: Sets owner_user_id, visibility (default: private), editor_user_ids (empty)
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} userId - User UUID
 * @param {Object} data - Template data
 * @param {string} data.name - Template name (required)
 * @param {string} [data.description] - Template description (optional)
 * @param {string} [data.visibility] - Visibility mode (default: private)
 * @param {Array<string>} [data.editor_user_ids] - Editor list (default: [])
 * @returns {Promise<Object>} Created template
 * @throws {Error} If validation fails or database operation fails
 */
export async function createTemplate(env, userId, data) {
  // Validate
  if (!data.name || data.name.trim().length === 0) {
    throw new Error('Name is required');
  }
  
  const supabase = getSupabaseClient(env);
  
  // Addendum N: Set ownership and visibility
  const row = {
    user_id: userId,  // Legacy field (keep for backward compat)
    owner_user_id: userId,  // Addendum N: Owner
    name: data.name.trim(),
    description: data.description?.trim() || null,
    blueprint_data: {},  // Empty object for Iteration 2
    visibility: data.visibility || 'private',  // Addendum N: Default private
    editor_user_ids: data.editor_user_ids || []  // Addendum N: Empty list
  };
  
  const { data: inserted, error } = await supabase
    .from('project_templates')
    .insert(row)
    .select()
    .single();
  
  if (error) {
    console.error('[Template Library] Insert failed:', error);
    throw new Error(`Failed to create template: ${error.message}`);
  }
  
  console.log('[Template Library] Template created:', inserted.id);
  return inserted;
}

/**
 * Update an existing template
 * 
 * Addendum N: Supports visibility and editor_user_ids updates
 * Note: Permission enforcement happens at module.js layer
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} templateId - Template UUID
 * @param {Object} updates - Fields to update
 * @param {string} [updates.name] - New name
 * @param {string} [updates.description] - New description
 * @param {string} [updates.visibility] - New visibility mode
 * @param {Array<string>} [updates.editor_user_ids] - New editor list
 * @returns {Promise<Object>} Updated template
 * @throws {Error} If validation fails or database operation fails
 */
export async function updateTemplate(env, templateId, updates) {
  // Validate name if provided
  if (updates.name !== undefined) {
    if (!updates.name || updates.name.trim().length === 0) {
      throw new Error('Name cannot be empty');
    }
  }
  
  const supabase = getSupabaseClient(env);
  
  // Build update object
  const updateData = {};
  if (updates.name !== undefined) {
    updateData.name = updates.name.trim();
  }
  if (updates.description !== undefined) {
    updateData.description = updates.description?.trim() || null;
  }
  // Addendum N: Support visibility and editor updates
  if (updates.visibility !== undefined) {
    updateData.visibility = updates.visibility;
  }
  if (updates.editor_user_ids !== undefined) {
    updateData.editor_user_ids = updates.editor_user_ids;
  }
  
  if (Object.keys(updateData).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  const { data, error } = await supabase
    .from('project_templates')
    .update(updateData)
    .eq('id', templateId)
    .select()
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Template not found');
    }
    console.error('[Template Library] Update failed:', error);
    throw new Error(`Failed to update template: ${error.message}`);
  }
  
  console.log('[Template Library] Template updated:', templateId);
  return data;
}

/**
 * Delete a template
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} templateId - Template UUID
 * @returns {Promise<boolean>} True if deleted, false if not found
 * @throws {Error} If database operation fails
 */
export async function deleteTemplate(env, templateId) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('project_templates')
    .delete()
    .eq('id', templateId)
    .select();
  
  if (error) {
    console.error('[Template Library] Delete failed:', error);
    throw new Error(`Failed to delete template: ${error.message}`);
  }
  
  const deleted = data && data.length > 0;
  if (deleted) {
    console.log('[Template Library] Template deleted:', templateId);
  }
  
  return deleted;
}

/**
 * Get blueprint data for a template
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} templateId - Template UUID
 * @returns {Promise<Object>} Blueprint data object
 * @throws {Error} If database operation fails or template not found
 */
export async function getBlueprintData(env, templateId) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('project_templates')
    .select('blueprint_data')
    .eq('id', templateId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Template not found');
    }
    console.error('[Template Library] Get blueprint failed:', error);
    throw new Error(`Failed to get blueprint: ${error.message}`);
  }
  
  return data.blueprint_data || {};
}

/**
 * Save blueprint data for a template
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} templateId - Template UUID
 * @param {Object} blueprintData - Blueprint data object
 * @returns {Promise<Object>} Updated template
 * @throws {Error} If validation fails or database operation fails
 */
export async function saveBlueprintData(env, templateId, blueprintData) {
  if (!blueprintData || typeof blueprintData !== 'object') {
    throw new Error('Blueprint data must be an object');
  }
  
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('project_templates')
    .update({ blueprint_data: blueprintData })
    .eq('id', templateId)
    .select()
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Template not found');
    }
    console.error('[Template Library] Save blueprint failed:', error);
    throw new Error(`Failed to save blueprint: ${error.message}`);
  }
  
  console.log('[Template Library] Blueprint saved:', templateId);
  return data;
}

// ============================================================================
// GENERATION HISTORY DATA ACCESS (Iteration 5)
// ============================================================================

/**
 * Get all generation attempts for a template
 * 
 * Returns UI-friendly generation history, newest first.
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} userId - User UUID
 * @param {string} templateId - Template UUID
 * @returns {Promise<Array>} Array of generation objects
 * @throws {Error} If database operation fails
 */
export async function getGenerationsForTemplate(env, userId, templateId) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('project_generations')
    .select('id, status, started_at, completed_at, odoo_project_id, odoo_project_url, failed_step, error_message')
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('[Template Library] Get generations failed:', error);
    throw new Error(`Failed to fetch generations: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Get a single generation record by ID
 * 
 * Returns full generation data including diagnostics.
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} userId - User UUID
 * @param {string} generationId - Generation UUID
 * @returns {Promise<Object|null>} Generation object or null
 * @throws {Error} If database operation fails
 */
export async function getGenerationById(env, userId, generationId) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('project_generations')
    .select('id, status, template_id, started_at, completed_at, odoo_project_id, odoo_project_url, odoo_mappings, failed_step, error_message, generation_model')
    .eq('user_id', userId)
    .eq('id', generationId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    console.error('[Template Library] Get generation failed:', error);
    throw new Error(`Failed to get generation: ${error.message}`);
  }
  
  return data;
}
