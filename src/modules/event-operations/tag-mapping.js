/**
 * Event Type → WP Tag Mapping Helpers (Addendum C)
 */

import { getSupabaseAdminClient } from './lib/supabaseClient.js';

/**
 * Get all event type mappings for a user
 *
 * @param {Object} env
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function getEventTypeTagMappings(env, userId) {
  const supabase = await getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('event_type_wp_tag_mapping')
    .select('*')
    .eq('user_id', userId)
    .order('odoo_event_type_id', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch event type mappings: ${error.message}`);
  }

  return data || [];
}

/**
 * Get mapping for one event type
 *
 * @param {Object} env
 * @param {string} userId
 * @param {number} odooEventTypeId
 * @returns {Promise<Object|null>}
 */
export async function getEventTypeTagMappingByEventTypeId(env, userId, odooEventTypeId) {
  const supabase = await getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('event_type_wp_tag_mapping')
    .select('*')
    .eq('user_id', userId)
    .eq('odoo_event_type_id', odooEventTypeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch event type mapping: ${error.message}`);
  }

  return data || null;
}

/**
 * Upsert mapping for one event type
 *
 * @param {Object} env
 * @param {string} userId
 * @param {Object} mapping
 * @returns {Promise<Object>}
 */
export async function upsertEventTypeTagMapping(env, userId, mapping) {
  const supabase = await getSupabaseAdminClient(env);

  const payload = {
    user_id: userId,
    odoo_event_type_id: mapping.odoo_event_type_id,
    wp_tag_id: mapping.wp_tag_id,
    wp_tag_slug: mapping.wp_tag_slug,
    wp_tag_name: mapping.wp_tag_name,
    calendar_color: mapping.calendar_color || 'primary'
  };

  const { data, error } = await supabase
    .from('event_type_wp_tag_mapping')
    .upsert(payload, {
      onConflict: 'user_id,odoo_event_type_id'
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert event type mapping: ${error.message}`);
  }

  return data;
}

/**
 * Delete mapping by row id
 *
 * @param {Object} env
 * @param {string} userId
 * @param {string} mappingId
 * @returns {Promise<void>}
 */
export async function deleteEventTypeTagMapping(env, userId, mappingId) {
  const supabase = await getSupabaseAdminClient(env);

  const { error } = await supabase
    .from('event_type_wp_tag_mapping')
    .delete()
    .eq('id', mappingId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to delete event type mapping: ${error.message}`);
  }
}
