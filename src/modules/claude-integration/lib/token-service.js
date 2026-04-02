/**
 * Token Service
 *
 * Manages short-lived access tokens for the Claude context endpoint.
 * Tokens are multi-use within a 5-minute TTL.
 * The raw token is returned to the caller once; only its SHA-256 hash is stored.
 *
 * @module modules/claude-integration/lib/token-service
 */

import { hashPassword } from '../../../lib/auth/password.js';
import { getSupabaseClient } from '../../../lib/database.js';

const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 1 day

/**
 * Create a new access token for an integration.
 * Returns the raw token (show once) and the expiry timestamp.
 *
 * @param {Object} env
 * @param {Object} integration  Full integration row (id, user_id, scopes)
 * @returns {Promise<{ access_token: string, expires_at: string, allowed_scope: string[] }>}
 */
export async function createToken(env, integration) {
  const db = getSupabaseClient(env);
  const raw = `ct-${crypto.randomUUID().replace(/-/g, '')}`;
  const token_hash = await hashPassword(raw);
  const expires_at = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

  const { error } = await db
    .from('claude_tokens')
    .insert({
      token_hash,
      integration_id: integration.id,
      user_id:        integration.user_id,
      scopes:         integration.scopes ?? [],
      expires_at
    });

  if (error) throw new Error(`Failed to create token: ${error.message}`);

  return {
    access_token:  raw,
    expires_at,
    allowed_scope: integration.scopes ?? []
  };
}

/**
 * Validate a raw access token.
 * Returns the token metadata if valid; throws with TOKEN_INVALID otherwise.
 *
 * @param {Object} env
 * @param {string} rawToken
 * @returns {Promise<{ integrationId: string, userId: string, scopes: string[] }>}
 */
export async function validateToken(env, rawToken) {
  if (!rawToken) {
    const err = new Error('No token provided');
    err.code = 'TOKEN_INVALID';
    throw err;
  }

  const db = getSupabaseClient(env);
  const token_hash = await hashPassword(rawToken);
  const now = new Date().toISOString();

  const { data, error } = await db
    .from('claude_tokens')
    .select('id, integration_id, user_id, scopes, expires_at, revoked_at')
    .eq('token_hash', token_hash)
    .is('revoked_at', null)
    .gte('expires_at', now)
    .single();

  if (error || !data) {
    const err = new Error('Token is invalid or expired');
    err.code = 'TOKEN_INVALID';
    throw err;
  }

  return {
    integrationId: data.integration_id,
    userId:        data.user_id,
    scopes:        data.scopes ?? []
  };
}

/**
 * Revoke all active tokens for an integration.
 * Called immediately when an integration is revoked so existing sessions
 * are invalidated without waiting for natural expiry.
 *
 * @param {Object} env
 * @param {string} integrationId
 */
export async function revokeAllTokensForIntegration(env, integrationId) {
  const db = getSupabaseClient(env);

  const { error } = await db
    .from('claude_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('integration_id', integrationId)
    .is('revoked_at', null);

  if (error) {
    // Non-fatal: log but don't throw – the integration is already revoked
    console.error('⚠️ Failed to revoke tokens for integration:', integrationId, error.message);
  }
}
