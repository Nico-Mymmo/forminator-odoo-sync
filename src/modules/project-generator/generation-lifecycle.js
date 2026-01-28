/**
 * Project Generator - Generation Lifecycle Manager
 * 
 * Manages generation attempt lifecycle and persistence.
 * Enforces state transitions and prevents duplicate generations.
 * 
 * STATE FLOW:
 * - in_progress → completed (success)
 * - in_progress → failed (error)
 * 
 * RULES:
 * - ONE row per generation attempt
 * - NO overwrites of existing rows
 * - Block if in_progress
 * - Warn if completed
 * - Allow retry if failed
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Initialize Supabase client
 * 
 * Uses SERVICE_ROLE_KEY to enable RLS policies.
 */
function getSupabaseClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Check for existing generation attempts
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} userId - User UUID
 * @param {string} templateId - Template UUID
 * @returns {Promise<Object|null>} Latest generation or null
 */
export async function getLatestGeneration(env, userId, templateId) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('project_generations')
    .select('*')
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error) {
    console.error('[Generation Lifecycle] Get latest failed:', error);
    throw new Error(`Failed to check generation status: ${error.message}`);
  }
  
  return data;
}

/**
 * Validate that generation can proceed
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} userId - User UUID
 * @param {string} templateId - Template UUID
 * @param {boolean} confirmOverwrite - Explicit confirmation to overwrite completed
 * @returns {Promise<Object>} Validation result { canProceed, reason, existingGeneration }
 */
export async function validateGenerationStart(env, userId, templateId, confirmOverwrite = false) {
  const existing = await getLatestGeneration(env, userId, templateId);
  
  if (!existing) {
    return { canProceed: true, reason: null, existingGeneration: null };
  }
  
  // HARD BLOCK: generation in progress
  if (existing.status === 'in_progress') {
    return {
      canProceed: false,
      reason: 'Generation already in progress for this template',
      existingGeneration: existing
    };
  }
  
  // SOFT BLOCK: completed generation requires confirmation
  if (existing.status === 'completed' && !confirmOverwrite) {
    return {
      canProceed: false,
      reason: 'Template already generated. Set confirmOverwrite=true to generate again.',
      existingGeneration: existing
    };
  }
  
  // ALLOW: failed generation can be retried
  // ALLOW: completed generation with confirmation
  return { canProceed: true, reason: null, existingGeneration: existing };
}

/**
 * Start a new generation attempt
 * 
 * Creates a row with status='in_progress'
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} userId - User UUID
 * @param {string} templateId - Template UUID
 * @param {Object} generationModel - Canonical generation model
 * @returns {Promise<string>} Generation ID
 */
export async function startGeneration(env, userId, templateId, generationModel) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('project_generations')
    .insert({
      user_id: userId,
      template_id: templateId,
      status: 'in_progress',
      generation_model: generationModel,
      started_at: new Date().toISOString()
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('[Generation Lifecycle] Start failed:', error);
    throw new Error(`Failed to start generation: ${error.message}`);
  }
  
  console.log(`[Generation Lifecycle] Started generation ${data.id}`);
  return data.id;
}

/**
 * Mark generation as successful
 * 
 * Updates row to status='completed' with Odoo data
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} generationId - Generation UUID
 * @param {Object} result - Generation result
 * @param {number} result.odoo_project_id - Odoo project ID
 * @param {string} result.odoo_project_url - Odoo project URL
 * @param {Object} result.odoo_mappings - Blueprint → Odoo ID mappings
 */
export async function markGenerationSuccess(env, generationId, result) {
  const supabase = getSupabaseClient(env);
  
  const { error } = await supabase
    .from('project_generations')
    .update({
      status: 'completed',
      odoo_project_id: result.odoo_project_id,
      odoo_project_url: result.odoo_project_url,
      odoo_mappings: result.odoo_mappings,
      completed_at: new Date().toISOString()
    })
    .eq('id', generationId);
  
  if (error) {
    console.error('[Generation Lifecycle] Mark success failed:', error);
    throw new Error(`Failed to mark generation success: ${error.message}`);
  }
  
  console.log(`[Generation Lifecycle] Completed generation ${generationId}`);
}

/**
 * Mark generation as failed
 * 
 * Updates row to status='failed' with error details
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} generationId - Generation UUID
 * @param {string} failedStep - Step identifier where failure occurred
 * @param {string} errorMessage - Error message
 */
export async function markGenerationFailure(env, generationId, failedStep, errorMessage) {
  const supabase = getSupabaseClient(env);
  
  const { error } = await supabase
    .from('project_generations')
    .update({
      status: 'failed',
      failed_step: failedStep,
      error_message: errorMessage,
      completed_at: new Date().toISOString()
    })
    .eq('id', generationId);
  
  if (error) {
    console.error('[Generation Lifecycle] Mark failure failed:', error);
    // Log but don't throw - original error is more important
  }
  
  console.log(`[Generation Lifecycle] Failed generation ${generationId} at step ${failedStep}`);
}
