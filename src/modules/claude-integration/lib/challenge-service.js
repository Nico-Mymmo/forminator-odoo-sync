/**
 * Challenge Service
 *
 * Short-lived one-time challenges for the two-step Claude auth flow.
 *
 * ATOMICITY: validateAndConsumeChallenge uses a conditional UPDATE that
 * matches only unspent, non-expired rows and returns the updated row.
 * Concurrent requests racing on the same challenge_id will each fire an
 * UPDATE; only one UPDATE will see used_at IS NULL at the moment it runs –
 * PostgreSQL row-level locking ensures the second UPDATE finds used_at
 * already set and matches 0 rows, resulting in a 401.
 *
 * Error codes:
 *   CHALLENGE_INVALID  – not found, already used, expired, or wrong integration
 *
 * @module modules/claude-integration/lib/challenge-service
 */

import { getSupabaseClient } from '../../../lib/database.js';

const CHALLENGE_TTL_SECONDS = 5 * 60; // 5 minutes

/**
 * Create a new challenge for an integration.
 *
 * @param {Object} env
 * @param {string} integrationId  UUID of the integration (internal FK)
 * @returns {Promise<{ challenge_id: string, expires_at: string }>}
 */
export async function createChallenge(env, integrationId) {
  const db = getSupabaseClient(env);
  const challenge_id = crypto.randomUUID();
  const expires_at = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();

  const { error } = await db
    .from('claude_challenges')
    .insert({ integration_id: integrationId, challenge_id, expires_at });

  if (error) throw new Error(`Failed to create challenge: ${error.message}`);

  return { challenge_id, expires_at };
}

/**
 * Atomically validate and consume a challenge.
 *
 * The UPDATE fires only when ALL conditions hold simultaneously:
 *   – challenge_id matches
 *   – integration_id matches (prevents cross-integration replay)
 *   – used_at IS NULL (not yet consumed)
 *   – expires_at > NOW() (not expired)
 *
 * If 0 rows are updated the challenge is invalid (already used / expired /
 * wrong integration). A second concurrent call racing on the same row will
 * always find used_at already populated and return 0 rows.
 *
 * @param {Object} env
 * @param {string} integrationId  UUID of the integration
 * @param {string} challengeId    Opaque challenge string from createChallenge
 * @returns {Promise<void>}  Throws CHALLENGE_INVALID if the update matched 0 rows
 */
export async function validateAndConsumeChallenge(env, integrationId, challengeId) {
  const db = getSupabaseClient(env);
  const now = new Date().toISOString();

  const { data, error } = await db
    .from('claude_challenges')
    .update({ used_at: now })
    .eq('challenge_id', challengeId)
    .eq('integration_id', integrationId)
    .is('used_at', null)
    .gte('expires_at', now)
    .select('id');

  if (error) throw new Error(`Challenge validation error: ${error.message}`);

  if (!data || data.length === 0) {
    const err = new Error('Challenge is invalid, already used, or expired');
    err.code = 'CHALLENGE_INVALID';
    throw err;
  }
}
