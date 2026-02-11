/**
 * Tag Mapping CRUD Helpers
 * 
 * Manages webinar_tag_mappings table operations
 */

import { getSupabaseAdminClient } from './lib/supabaseClient.js';

/**
 * Get all tag mappings for a user
 * 
 * @param {Object} env
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function getTagMappings(env, userId) {
  const supabase = await getSupabaseAdminClient(env);
  
  const { data, error } = await supabase
    .from('webinar_tag_mappings')
    .select('*')
    .eq('user_id', userId)
    .order('odoo_tag_name', { ascending: true });
  
  if (error) {
    throw new Error(`Failed to fetch tag mappings: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Get tag mappings for specific Odoo tag IDs
 * 
 * @param {Object} env
 * @param {string} userId
 * @param {Array<number>} odooTagIds
 * @returns {Promise<Array>}
 */
export async function getTagMappingsForOdooTags(env, userId, odooTagIds) {
  if (!odooTagIds || odooTagIds.length === 0) {
    return [];
  }
  
  const supabase = await getSupabaseAdminClient(env);
  
  const { data, error } = await supabase
    .from('webinar_tag_mappings')
    .select('*')
    .eq('user_id', userId)
    .in('odoo_tag_id', odooTagIds);
  
  if (error) {
    throw new Error(`Failed to fetch tag mappings for tags: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Create a new tag mapping
 * 
 * @param {Object} env
 * @param {string} userId
 * @param {Object} mapping - { odoo_tag_id, odoo_tag_name, wp_category_slug, wp_category_id?, auto_created? }
 * @returns {Promise<Object>} Created mapping
 */
export async function createTagMapping(env, userId, mapping) {
  const supabase = await getSupabaseAdminClient(env);
  
  const { data, error } = await supabase
    .from('webinar_tag_mappings')
    .insert({
      user_id: userId,
      odoo_tag_id: mapping.odoo_tag_id,
      odoo_tag_name: mapping.odoo_tag_name,
      wp_category_slug: mapping.wp_category_slug,
      wp_category_id: mapping.wp_category_id || null,
      auto_created: mapping.auto_created || false
    })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create tag mapping: ${error.message}`);
  }
  
  return data;
}

/**
 * Update tag mapping (e.g., set wp_category_id after usage)
 * 
 * @param {Object} env
 * @param {string} userId
 * @param {string} mappingId
 * @param {Object} updates - { wp_category_id?, wp_category_slug?, auto_created? }
 * @returns {Promise<Object>} Updated mapping
 */
export async function updateTagMapping(env, userId, mappingId, updates) {
  const supabase = await getSupabaseAdminClient(env);
  
  const { data, error } = await supabase
    .from('webinar_tag_mappings')
    .update(updates)
    .eq('id', mappingId)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to update tag mapping: ${error.message}`);
  }
  
  return data;
}

/**
 * Delete tag mapping
 * 
 * @param {Object} env
 * @param {string} userId
 * @param {string} mappingId
 * @returns {Promise<void>}
 */
export async function deleteTagMapping(env, userId, mappingId) {
  const supabase = await getSupabaseAdminClient(env);
  
  const { error } = await supabase
    .from('webinar_tag_mappings')
    .delete()
    .eq('id', mappingId)
    .eq('user_id', userId);
  
  if (error) {
    throw new Error(`Failed to delete tag mapping: ${error.message}`);
  }
}
