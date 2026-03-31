/**
 * Claude Integration Service
 *
 * CRUD operations for claude_integrations table.
 * Secrets are hashed with SHA-256 (same pattern as src/lib/auth/password.js).
 * Plain-text secret is returned exactly once on create/rotate; never stored.
 *
 * @module modules/claude-integration/lib/integration-service
 */

import { hashPassword, verifyPassword } from '../../../lib/auth/password.js';
import { getSupabaseClient } from '../../../lib/database.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Generate a cryptographically random UUID-based opaque string */
function generateSecret() {
  return `sk-${crypto.randomUUID().replace(/-/g, '')}`;
}

function generateClientId() {
  return `ci-${crypto.randomUUID().replace(/-/g, '')}`;
}

/** Strip the secret_hash before returning an integration to callers */
function sanitize(integration) {
  if (!integration) return null;
  const { client_secret_hash: _omit, ...safe } = integration;
  return safe;
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Create a new integration.
 * Returns the sanitized row plus the plain-text secret (visible once only).
 *
 * @param {Object} env
 * @param {string} userId
 * @param {string} name
 * @param {string[]} scopes  e.g. ['own_leads', 'team_view']
 * @returns {Promise<{ integration: Object, client_secret: string }>}
 */
export async function createIntegration(env, userId, name, scopes) {
  const db = getSupabaseClient(env);
  const client_id = generateClientId();
  const client_secret = generateSecret();
  const client_secret_hash = await hashPassword(client_secret);

  const { data, error } = await db
    .from('claude_integrations')
    .insert({
      user_id:            userId,
      name:               name.trim(),
      client_id,
      client_secret_hash,
      scopes:             scopes ?? [],
      is_active:          true
    })
    .select('id, user_id, name, client_id, scopes, is_active, created_at')
    .single();

  if (error) throw new Error(`Failed to create integration: ${error.message}`);

  return { integration: data, client_secret };
}

/**
 * Revoke an integration (soft-delete).
 * Also cascades token revocation via revokeAllTokensForIntegration
 * (called from routes.js after revoke to keep service boundary clean).
 *
 * @param {Object} env
 * @param {string} integrationId
 * @param {string} userId  Ensure only owner can revoke
 */
export async function revokeIntegration(env, integrationId, userId) {
  const db = getSupabaseClient(env);

  const { data, error } = await db
    .from('claude_integrations')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', integrationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Integration not found or already revoked');
  }
}

/**
 * Regenerate the client secret for an integration.
 * Returns the new plain-text secret (visible once only).
 *
 * @param {Object} env
 * @param {string} integrationId
 * @param {string} userId
 * @returns {Promise<{ integration: Object, client_secret: string }>}
 */
export async function regenerateSecret(env, integrationId, userId) {
  const db = getSupabaseClient(env);
  const client_secret = generateSecret();
  const client_secret_hash = await hashPassword(client_secret);

  const { data, error } = await db
    .from('claude_integrations')
    .update({ client_secret_hash })
    .eq('id', integrationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .select('id, user_id, name, client_id, scopes, is_active, created_at')
    .single();

  if (error || !data) {
    throw new Error('Integration not found or inactive');
  }

  return { integration: data, client_secret };
}

/**
 * List all active integrations for a user.
 * Never exposes client_secret_hash.
 *
 * @param {Object} env
 * @param {string} userId
 * @returns {Promise<Object[]>}
 */
export async function listIntegrations(env, userId) {
  const db = getSupabaseClient(env);

  const { data, error } = await db
    .from('claude_integrations')
    .select('id, user_id, name, client_id, scopes, is_active, created_at, revoked_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list integrations: ${error.message}`);

  return data ?? [];
}

/**
 * Fetch a single active integration by its public client_id.
 * Used at the auth boundary (session/request endpoint).
 *
 * @param {Object} env
 * @param {string} clientId
 * @returns {Promise<Object|null>}  Includes client_secret_hash for callers that need it
 */
export async function getIntegrationByClientId(env, clientId) {
  const db = getSupabaseClient(env);

  const { data, error } = await db
    .from('claude_integrations')
    .select('id, user_id, name, client_id, client_secret_hash, scopes, is_active, created_at')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .single();

  if (error) return null;
  return data;
}

/**
 * Validate a raw client secret against a stored integration row.
 * Constant-time comparison via verifyPassword.
 *
 * @param {Object} integration  Full integration row (must include client_secret_hash)
 * @param {string} rawSecret
 * @returns {Promise<boolean>}
 */
export async function validateClientSecret(integration, rawSecret) {
  if (!integration?.client_secret_hash || !rawSecret) return false;
  return verifyPassword(rawSecret, integration.client_secret_hash);
}
