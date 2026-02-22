/**
 * Mail Signature Designer - Internal Supabase Client
 *
 * Module-scoped helper to reduce boilerplate in routes.
 * NOT shared with other modules.
 *
 * Pattern: Singleton per isolate (identical to event-operations)
 */

import { createClient } from '@supabase/supabase-js';

let supabaseClientInstance = null;

/**
 * Get Supabase admin client (singleton per isolate)
 *
 * @param {Object} env - Cloudflare env
 * @returns {SupabaseClient}
 * @throws {Error} If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing
 */
export function getSupabaseAdminClient(env) {
  if (!env.SUPABASE_URL) {
    throw new Error('Missing environment variable: SUPABASE_URL');
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }

  if (!supabaseClientInstance) {
    supabaseClientInstance = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return supabaseClientInstance;
}
