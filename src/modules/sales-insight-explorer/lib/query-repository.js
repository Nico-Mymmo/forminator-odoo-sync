/**
 * Query Repository
 * 
 * Database persistence layer for Sales Insight Explorer queries.
 * 
 * RULES:
 * - Every query MUST be validated before save
 * - Invalid queries rejected (never persisted)
 * - All database errors logged and re-thrown
 * - No business logic here (pure data access)
 */

import { createClient } from '@supabase/supabase-js';

/**
 * @typedef {Object} SavedQuery
 * @property {string} id - UUID
 * @property {string} name
 * @property {string} description
 * @property {string} base_model
 * @property {QueryDefinition} query_definition
 * @property {'preset'|'user'} source
 * @property {'simple'|'moderate'|'complex'|'very_complex'} complexity_hint
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * Initialize Supabase client
 */
function getSupabaseClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }
  
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Save a validated query to database
 * 
 * IMPORTANT: Caller MUST validate query before calling this function.
 * This function does NOT validate - it assumes validation already passed.
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {Object} queryData
 * @param {string} queryData.name - Human-readable name
 * @param {string} queryData.description - Optional description
 * @param {QueryDefinition} queryData.query_definition - Complete query
 * @param {'preset'|'user'} queryData.source - Source type
 * @param {'simple'|'moderate'|'complex'|'very_complex'} queryData.complexity_hint
 * @returns {Promise<SavedQuery>}
 * @throws {Error} If database operation fails
 */
export async function saveQuery(env, queryData) {
  const supabase = getSupabaseClient(env);
  
  // Extract base_model from query_definition
  const baseModel = queryData.query_definition.base_model;
  
  if (!baseModel) {
    throw new Error('query_definition.base_model is required');
  }
  
  // Prepare row data
  const row = {
    name: queryData.name,
    description: queryData.description || null,
    base_model: baseModel,
    query_definition: queryData.query_definition,
    source: queryData.source,
    complexity_hint: queryData.complexity_hint || null
  };
  
  // Insert into database
  const { data, error } = await supabase
    .from('sales_insight_queries')
    .insert(row)
    .select()
    .single();
  
  if (error) {
    console.error('[Query Repository] Save failed:', error);
    throw new Error(`Failed to save query: ${error.message}`);
  }
  
  console.log('[Query Repository] Query saved:', data.id);
  return data;
}

/**
 * Get a query by ID
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} id - Query UUID
 * @returns {Promise<SavedQuery|null>}
 * @throws {Error} If database operation fails
 */
export async function getQueryById(env, id) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('sales_insight_queries')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // Not found - return null
      return null;
    }
    console.error('[Query Repository] Get failed:', error);
    throw new Error(`Failed to get query: ${error.message}`);
  }
  
  return data;
}

/**
 * List all queries with optional filters
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {Object} options
 * @param {string} options.base_model - Filter by base model (optional)
 * @param {'preset'|'user'} options.source - Filter by source (optional)
 * @param {number} options.limit - Max results (default: 100)
 * @param {number} options.offset - Pagination offset (default: 0)
 * @returns {Promise<SavedQuery[]>}
 * @throws {Error} If database operation fails
 */
export async function listQueries(env, options = {}) {
  const supabase = getSupabaseClient(env);
  
  let query = supabase
    .from('sales_insight_queries')
    .select('*')
    .order('created_at', { ascending: false });
  
  // Apply filters
  if (options.base_model) {
    query = query.eq('base_model', options.base_model);
  }
  
  if (options.source) {
    query = query.eq('source', options.source);
  }
  
  // Apply pagination
  const limit = options.limit || 100;
  const offset = options.offset || 0;
  query = query.range(offset, offset + limit - 1);
  
  const { data, error } = await query;
  
  if (error) {
    console.error('[Query Repository] List failed:', error);
    throw new Error(`Failed to list queries: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Update a query
 * 
 * IMPORTANT: Caller MUST validate new query before calling this function.
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} id - Query UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<SavedQuery>}
 * @throws {Error} If database operation fails or query not found
 */
export async function updateQuery(env, id, updates) {
  const supabase = getSupabaseClient(env);
  
  // Only allow updating specific fields
  const allowedUpdates = {
    name: updates.name,
    description: updates.description,
    query_definition: updates.query_definition,
    complexity_hint: updates.complexity_hint
  };
  
  // Remove undefined values
  Object.keys(allowedUpdates).forEach(key => 
    allowedUpdates[key] === undefined && delete allowedUpdates[key]
  );
  
  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error('No valid fields to update');
  }
  
  // Update base_model if query_definition changed
  if (allowedUpdates.query_definition) {
    allowedUpdates.base_model = allowedUpdates.query_definition.base_model;
  }
  
  const { data, error } = await supabase
    .from('sales_insight_queries')
    .update(allowedUpdates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error(`Query not found: ${id}`);
    }
    console.error('[Query Repository] Update failed:', error);
    throw new Error(`Failed to update query: ${error.message}`);
  }
  
  console.log('[Query Repository] Query updated:', id);
  return data;
}

/**
 * Delete a query
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {string} id - Query UUID
 * @returns {Promise<boolean>} - True if deleted, false if not found
 * @throws {Error} If database operation fails
 */
export async function deleteQuery(env, id) {
  const supabase = getSupabaseClient(env);
  
  const { data, error } = await supabase
    .from('sales_insight_queries')
    .delete()
    .eq('id', id)
    .select();
  
  if (error) {
    console.error('[Query Repository] Delete failed:', error);
    throw new Error(`Failed to delete query: ${error.message}`);
  }
  
  const deleted = data && data.length > 0;
  if (deleted) {
    console.log('[Query Repository] Query deleted:', id);
  }
  
  return deleted;
}

/**
 * Count queries with optional filters
 * 
 * @param {Object} env - Cloudflare Worker environment
 * @param {Object} options
 * @param {string} options.base_model - Filter by base model (optional)
 * @param {'preset'|'user'} options.source - Filter by source (optional)
 * @returns {Promise<number>}
 * @throws {Error} If database operation fails
 */
export async function countQueries(env, options = {}) {
  const supabase = getSupabaseClient(env);
  
  let query = supabase
    .from('sales_insight_queries')
    .select('id', { count: 'exact', head: true });
  
  // Apply filters
  if (options.base_model) {
    query = query.eq('base_model', options.base_model);
  }
  
  if (options.source) {
    query = query.eq('source', options.source);
  }
  
  const { count, error } = await query;
  
  if (error) {
    console.error('[Query Repository] Count failed:', error);
    throw new Error(`Failed to count queries: ${error.message}`);
  }
  
  return count || 0;
}
