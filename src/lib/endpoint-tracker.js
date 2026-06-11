/**
 * Endpoint tracking — registreert per endpoint wanneer het voor het laatst
 * is aangeroepen (tabel: endpoint_log, functie: upsert_endpoint_log).
 *
 * Fire-and-forget: mag NOOIT een request blokkeren of laten falen.
 * Wordt alleen aangeroepen voor module-routes (niet voor publieke/auth-routes).
 *
 * @module lib/endpoint-tracker
 */

import { getSupabaseClient } from './database.js';

/**
 * Track een endpoint-aanroep (fire-and-forget, nooit blocking).
 *
 * @param {Object} env - Cloudflare env
 * @param {string} endpoint - bv. "GET /admin/api/users"
 * @param {Object} [ctx] - Cloudflare execution context (voor waitUntil)
 */
export function trackEndpoint(env, endpoint, ctx) {
  try {
    const supabase = getSupabaseClient(env);
    const promise = supabase
      .rpc('upsert_endpoint_log', { p_endpoint: endpoint })
      .then(() => {})
      .catch(() => {});

    // waitUntil zorgt dat de upsert afgerond wordt nadat de response al verstuurd is
    if (ctx?.waitUntil) {
      ctx.waitUntil(promise);
    }
  } catch (_) {
    // Tracking mag nooit het request breken
  }
}
