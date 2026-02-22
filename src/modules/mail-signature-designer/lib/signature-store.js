/**
 * Mail Signature Designer - Signature Store
 *
 * Data access layer for signature_config and signature_push_log.
 * Enforces singleton config via fixed UUID + unique index.
 */

import { getSupabaseAdminClient } from './supabaseClient.js';

/**
 * Fixed UUID for the global singleton config row.
 * Combined with the DB unique index this guarantees exactly one row.
 */
export const GLOBAL_SIGNATURE_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Get the current global signature config.
 * Returns default empty config if no row exists yet.
 *
 * @param {Object} env
 * @returns {Object} config JSONB object
 */
export async function getConfig(env) {
  const supabase = getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('signature_config')
    .select('config, updated_at, updated_by')
    .eq('id', GLOBAL_SIGNATURE_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`[signature-store] getConfig failed: ${error.message}`);
  }

  return data ?? { config: {}, updated_at: null, updated_by: null };
}

/**
 * Upsert the global signature config.
 * Always writes to the singleton row via fixed ID.
 *
 * @param {Object} env
 * @param {Object} config - JSONB config object
 * @param {string} updatedBy - UUID of the acting user
 * @returns {Object} updated row
 */
export async function upsertConfig(env, config, updatedBy) {
  const supabase = getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('signature_config')
    .upsert({
      id: GLOBAL_SIGNATURE_ID,
      config,
      updated_by: updatedBy,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    throw new Error(`[signature-store] upsertConfig failed: ${error.message}`);
  }

  return data;
}

/**
 * Append a push log entry.
 *
 * @param {Object} env
 * @param {Object} entry - Log fields
 */
export async function logPush(env, entry) {
  const supabase = getSupabaseAdminClient(env);

  const { error } = await supabase
    .from('signature_push_log')
    .insert({
      actor_email: entry.actor_email,
      target_user_email: entry.target_user_email,
      sendas_email: entry.sendas_email,
      success: entry.success,
      error_message: entry.error_message ?? null,
      html_hash: entry.html_hash ?? null,
      metadata: entry.metadata ?? {}
    });

  if (error) {
    // Log errors are non-fatal — we log but do not throw
    console.error(`[signature-store] logPush failed: ${error.message}`);
  }
}

/**
 * Get push logs, newest first.
 *
 * @param {Object} env
 * @param {number} limit - Max rows to return (default 100)
 * @returns {Array} push log rows
 */
export async function getLogs(env, limit = 100) {
  const supabase = getSupabaseAdminClient(env);

  const { data, error } = await supabase
    .from('signature_push_log')
    .select('*')
    .order('pushed_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`[signature-store] getLogs failed: ${error.message}`);
  }

  return data ?? [];
}
