/**
 * CX Powerboard — Mapping Service
 *
 * CRUD for cx_activity_mapping table with KV cache (5-min TTL).
 * Cache is busted on every write.
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

export async function createMapping(env, { odoo_activity_type_id, odoo_activity_type_name, priority_weight, is_win = false, notes = null, show_on_dashboard = true, danger_threshold_overdue = 1, danger_threshold_today = 3 }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_activity_mapping')
    .insert({ odoo_activity_type_id, odoo_activity_type_name, priority_weight, is_win, notes, show_on_dashboard, danger_threshold_overdue, danger_threshold_today })
    .select()
    .single();

  if (error) throw new Error(error.message);
  await bustMappingCache(env);
  return data;
}

export async function updateMapping(env, id, { priority_weight, is_win, notes, show_on_dashboard, danger_threshold_overdue, danger_threshold_today }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_activity_mapping')
    .update({ priority_weight, is_win, notes, show_on_dashboard, danger_threshold_overdue, danger_threshold_today })
    .eq('id', id)
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
