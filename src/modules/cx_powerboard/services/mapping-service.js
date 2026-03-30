/**
 * CX Powerboard — Mapping Service
 *
 * CRUD for cx_activity_mapping table with KV cache (5-min TTL).
 * Cache is busted on every write.
 *
 * V6: Adds include_in_streak, keep_done_confirmed_at support.
 */

import { createClient } from '@supabase/supabase-js';

const CACHE_KEY = 'cx_activity_mapping_cache';
const CACHE_TTL_SEC = 300; // 5 minutes

export async function getMappings(env) {
  // KV cache first
  try {
    const cached = await env.MAPPINGS_KV.get(CACHE_KEY, 'json');
    if (cached) return cached;
  } catch (_) {}

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_activity_mapping')
    .select('*')
    .order('priority_weight', { ascending: false });

  if (error) throw new Error(error.message);

  try {
    await env.MAPPINGS_KV.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL_SEC });
  } catch (_) {}

  return data;
}

export async function bustMappingCache(env) {
  try {
    await env.MAPPINGS_KV.delete(CACHE_KEY);
  } catch (_) {}
}

export async function createMapping(env, {
  odoo_activity_type_id,
  odoo_activity_type_name,
  priority_weight,
  is_win = false,
  notes = null,
  show_on_dashboard = true,
  danger_threshold_overdue = 1,
  danger_threshold_today = 3,
  include_in_streak = true,
}) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_activity_mapping')
    .insert({
      odoo_activity_type_id,
      odoo_activity_type_name,
      priority_weight,
      is_win,
      notes,
      show_on_dashboard,
      danger_threshold_overdue,
      danger_threshold_today,
      include_in_streak,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  await bustMappingCache(env);
  return data;
}

export async function updateMapping(env, id, {
  priority_weight,
  is_win,
  notes,
  show_on_dashboard,
  danger_threshold_overdue,
  danger_threshold_today,
  include_in_streak,
}) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const updateData = {
    priority_weight,
    is_win,
    notes,
    show_on_dashboard,
    danger_threshold_overdue,
    danger_threshold_today,
  };
  if (include_in_streak !== undefined) updateData.include_in_streak = include_in_streak;

  const { data, error } = await supabase
    .from('cx_activity_mapping')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await bustMappingCache(env);
  return data;
}

/**
 * Stamp keep_done_confirmed_at = now() on a mapping row.
 * Called after successful setKeepDone + verifyKeepDone in Odoo.
 */
export async function confirmKeepDone(env, mappingId) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_activity_mapping')
    .update({ keep_done_confirmed_at: new Date().toISOString() })
    .eq('id', mappingId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await bustMappingCache(env);
  return data;
}

export async function deleteMapping(env, id) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from('cx_activity_mapping')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  await bustMappingCache(env);
}
