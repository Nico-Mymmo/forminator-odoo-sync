/**
 * CX Powerboard — Win Service
 *
 * Query cx_processed_wins for user and team win views.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Get recent wins for a single platform user.
 *
 * @param {Object} env
 * @param {string} platformUserId - UUID from users.id
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getUserWins(env, platformUserId, limit = 20) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_processed_wins')
    .select('*')
    .eq('platform_user_id', platformUserId)
    .order('won_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Get wins for all users (team view, manager/admin only).
 *
 * @param {Object} env
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getAllWins(env, limit = 100) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('cx_processed_wins')
    .select('*, user:platform_user_id(id, full_name, email)')
    .order('won_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}
