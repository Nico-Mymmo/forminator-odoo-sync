/**
 * Database Layer - Supabase Client
 *
 * Centralized database access for the whole platform.
 * ALL Supabase connections go through getSupabaseClient(env) —
 * never call createClient() directly in modules.
 *
 * @module lib/database
 */

import { createClient } from '@supabase/supabase-js';

// Per-isolate singleton (Workers reuse isolates across requests)
let cachedClient = null;
let cachedKey = null;

/**
 * Get the shared Supabase client (per-isolate singleton).
 * Uses the service role key for server-side operations (bypasses RLS).
 *
 * @param {Object} env - Environment variables from Cloudflare Workers
 * @returns {Object} Supabase client instance
 */
export function getSupabaseClient(env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  const key = `${env.SUPABASE_URL}::${env.SUPABASE_SERVICE_ROLE_KEY}`;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false, // Workers zijn stateless
        autoRefreshToken: false
      }
    });
    cachedKey = key;
  }

  return cachedClient;
}
