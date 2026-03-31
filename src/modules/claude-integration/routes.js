/**
 * Claude Integration Routes
 *
 * All route keys are relative to module.route ('/api/claude').
 * resolveModuleRoute() strips the '/api/claude' prefix before matching,
 * so 'GET /integrations' handles GET /api/claude/integrations.
 *
 * Auth layers:
 *   – Management endpoints (/integrations, /audit): requireAuth (session cookie / Bearer session token)
 *   – Public session endpoints (/session/request, /session/authorize): no session required, rate-limited
 *   – Context endpoint (/context/full): Claude token (NOT a session token) via validateToken()
 *
 * Rate limiting uses MAPPINGS_KV (existing KV namespace).
 * Key format: ratelimit:{action}:{identifier}
 * Fixed-window: first request within a window stores { count, window_start }; resets when window expires.
 *
 * @module modules/claude-integration/routes
 */

import { requireAuth, requireAdmin } from '../../lib/auth/middleware.js';
import {
  createIntegration,
  revokeIntegration as dbRevokeIntegration,
  regenerateSecret,
  listIntegrations,
  getIntegrationByClientId,
  validateClientSecret
} from './lib/integration-service.js';
import { createChallenge, validateAndConsumeChallenge } from './lib/challenge-service.js';
import { createToken, validateToken, revokeAllTokensForIntegration } from './lib/token-service.js';
import { buildContext } from './lib/context-builder.js';
import { logContextCall, getAuditLog } from './lib/audit-service.js';
import { validateScopes } from './lib/scope-filter.js';

// ─── KV rate limiter ─────────────────────────────────────────────────────────

/**
 * Fixed-window KV-based rate limiter.
 *
 * @param {Object} env
 * @param {string} action       e.g. 'challenge_request'
 * @param {string} identifier   e.g. IP or client_id
 * @param {number} maxRequests
 * @param {number} windowSeconds
 * @returns {Promise<{ allowed: boolean }>}
 */
async function checkRateLimit(env, action, identifier, maxRequests, windowSeconds) {
  if (!env.MAPPINGS_KV) return { allowed: true }; // KV not configured: allow

  const key = `ratelimit:${action}:${identifier}`;
  const now = Math.floor(Date.now() / 1000);

  let state = null;
  try {
    state = await env.MAPPINGS_KV.get(key, 'json');
  } catch (_) { /* KV read errors don't block requests */ }

  if (!state || now - state.window_start >= windowSeconds) {
    // New window
    const next = { count: 1, window_start: now };
    await env.MAPPINGS_KV.put(key, JSON.stringify(next), { expirationTtl: windowSeconds }).catch(() => {});
    return { allowed: true };
  }

  if (state.count >= maxRequests) return { allowed: false };

  const updated = { count: state.count + 1, window_start: state.window_start };
  await env.MAPPINGS_KV.put(key, JSON.stringify(updated), {
    expirationTtl: windowSeconds - (now - state.window_start)
  }).catch(() => {});

  return { allowed: true };
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function ok(data, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function err(message, code, status = 400) {
  return new Response(JSON.stringify({ success: false, error: { message, code } }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function rateLimited() {
  return new Response(JSON.stringify({ success: false, error: { message: 'Too many requests', code: 'RATE_LIMITED' } }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
  });
}

function getIP(request) {
  return request.headers.get('CF-Connecting-IP')
    ?? request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    ?? 'unknown';
}

// ─── Integration management ───────────────────────────────────────────────────

/**
 * GET /api/claude/integrations
 * Returns all integrations owned by the requesting user.
 */
const listIntegrationsHandler = requireAuth(async function listIntegrationsHandler(context) {
  const { env, user } = context;
  try {
    const data = await listIntegrations(env, user.id);
    return ok(data);
  } catch (e) {
    console.error('❌ list integrations:', e.message);
    return err(e.message, 'LIST_INTEGRATIONS_FAILED', 500);
  }
});

/**
 * POST /api/claude/integrations
 * Body: { name: string, scopes: string[] }
 * Returns the new integration + plain-text secret (once only).
 */
const createIntegrationHandler = requireAuth(async function createIntegrationHandler(context) {
  const { request, env, user } = context;
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return err('Invalid JSON body', 'INVALID_BODY');
  }

  const { name, scopes } = body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return err('name is required', 'VALIDATION_FAILED');
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return err('scopes must be a non-empty array', 'VALIDATION_FAILED');
  }

  const { valid, unknown } = validateScopes(scopes);
  if (!valid) {
    return err(`Unknown scopes: ${unknown.join(', ')}`, 'VALIDATION_FAILED');
  }

  try {
    const result = await createIntegration(env, user.id, name, scopes);
    return ok(result, 201);
  } catch (e) {
    console.error('❌ create integration:', e.message);
    return err(e.message, 'CREATE_INTEGRATION_FAILED', 500);
  }
});

/**
 * DELETE /api/claude/integrations/:id
 * Revokes the integration and all its active tokens.
 */
const revokeIntegrationHandler = requireAuth(async function revokeIntegrationHandler(context) {
  const { env, user, params } = context;
  const { id } = params;

  if (!id) return err('Integration ID required', 'VALIDATION_FAILED');

  try {
    await dbRevokeIntegration(env, id, user.id);
    await revokeAllTokensForIntegration(env, id);
    return ok({ revoked: true });
  } catch (e) {
    console.error('❌ revoke integration:', e.message);
    return err(e.message, 'REVOKE_FAILED', 404);
  }
});

/**
 * POST /api/claude/integrations/:id/rotate
 * Regenerates the client secret. Returns new secret once.
 */
const rotateSecretHandler = requireAuth(async function rotateSecretHandler(context) {
  const { env, user, params } = context;
  const { id } = params;

  if (!id) return err('Integration ID required', 'VALIDATION_FAILED');

  try {
    // Revoke all active tokens so no old-secret-derived sessions remain
    await revokeAllTokensForIntegration(env, id);
    const result = await regenerateSecret(env, id, user.id);
    return ok(result);
  } catch (e) {
    console.error('❌ rotate secret:', e.message);
    return err(e.message, 'ROTATE_FAILED', 404);
  }
});

// ─── Session / auth endpoints (no session required) ──────────────────────────

/**
 * POST /api/claude/session/request
 * Body: { client_id: string }
 *
 * Issues a short-lived challenge for the given client_id.
 * Rate-limited: 10 requests / 60s per IP.
 *
 * Returns: { challenge_id, expires_at, scope_preview }
 */
async function requestChallenge(context) {
  const { request, env } = context;
  const ip = getIP(request);

  const rl = await checkRateLimit(env, 'challenge_request', ip, 10, 60);
  if (!rl.allowed) return rateLimited();

  let body;
  try { body = await request.json(); } catch (_) { return err('Invalid JSON body', 'INVALID_BODY'); }

  const { client_id } = body ?? {};
  if (!client_id || typeof client_id !== 'string') {
    return err('client_id is required', 'VALIDATION_FAILED');
  }

  try {
    const integration = await getIntegrationByClientId(env, client_id);
    if (!integration) return err('Integration not found or inactive', 'INTEGRATION_NOT_FOUND', 404);

    const { challenge_id, expires_at } = await createChallenge(env, integration.id);

    return ok({ challenge_id, expires_at, scope_preview: integration.scopes ?? [] });
  } catch (e) {
    console.error('❌ request challenge:', e.message);
    return err(e.message, 'CHALLENGE_FAILED', 500);
  }
}

/**
 * POST /api/claude/session/authorize
 * Body: { client_id, client_secret, challenge_id }
 *
 * Validates credentials + consumes challenge → issues access token.
 * Rate-limited: 5 requests / 60s per client_id (brute-force protection).
 *
 * Returns: { access_token, expires_at, allowed_scope }
 */
async function authorizeSession(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch (_) { return err('Invalid JSON body', 'INVALID_BODY'); }

  const { client_id, client_secret, challenge_id } = body ?? {};
  if (!client_id || !client_secret || !challenge_id) {
    return err('client_id, client_secret, and challenge_id are required', 'VALIDATION_FAILED');
  }

  // Rate limit per client_id to prevent brute-forcing secrets
  const rl = await checkRateLimit(env, 'session_authorize', client_id, 5, 60);
  if (!rl.allowed) return rateLimited();

  try {
    const integration = await getIntegrationByClientId(env, client_id);
    if (!integration) return err('Invalid credentials', 'AUTH_FAILED', 401);

    const secretOk = await validateClientSecret(integration, client_secret);
    if (!secretOk) return err('Invalid credentials', 'AUTH_FAILED', 401);

    await validateAndConsumeChallenge(env, integration.id, challenge_id);

    const tokenResult = await createToken(env, integration);
    return ok(tokenResult);
  } catch (e) {
    if (e.code === 'CHALLENGE_INVALID') {
      return err('Challenge is invalid, already used, or expired', 'CHALLENGE_INVALID', 401);
    }
    console.error('❌ authorize session:', e.message);
    return err('Authorization failed', 'AUTH_FAILED', 401);
  }
}

// ─── Context endpoint ─────────────────────────────────────────────────────────

/**
 * GET /api/claude/context/full
 *
 * Two accepted auth modes:
 *   1. Bearer token  — Header: Authorization: Bearer <access_token>
 *      Obtained via the two-step POST session flow.
 *
 *   2. Direct credentials — ?client_id=...&client_secret=...
 *      Single-call fallback for clients that only support GET (e.g. Claude.ai web_fetch).
 *      Same brute-force rate limit as session/authorize (5 req/60 s per client_id).
 *      Note: passing a secret in a query param is less ideal than a POST body;
 *      use the Bearer token flow whenever the client supports POST with a body.
 *
 * Fetches Odoo context, applies scope filtering, returns a structured payload.
 * Query params: timeframe, owner_id, pipeline_id, limit
 */
async function getContext(context) {
  const { request, env, ctx } = context;
  const ip = getIP(request);

  const url = new URL(request.url);
  let tokenMeta;

  const directClientId     = url.searchParams.get('client_id');
  const directClientSecret = url.searchParams.get('client_secret');

  if (directClientId && directClientSecret) {
    // ── Direct credential path (GET-only clients such as Claude.ai web_fetch) ──
    const rl = await checkRateLimit(env, 'session_authorize', directClientId, 5, 60);
    if (!rl.allowed) return rateLimited();

    const integration = await getIntegrationByClientId(env, directClientId);
    if (!integration) return err('Invalid credentials', 'AUTH_FAILED', 401);

    const secretOk = await validateClientSecret(integration, directClientSecret);
    if (!secretOk) return err('Invalid credentials', 'AUTH_FAILED', 401);

    tokenMeta = {
      integrationId: integration.id,
      userId:        integration.user_id,
      scopes:        integration.scopes ?? []
    };
  } else {
    // ── Standard Bearer token path ──
    const authHeader = request.headers.get('Authorization') ?? '';
    const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!rawToken) {
      return err(
        'Provide Authorization: Bearer <token>, or client_id and client_secret as query params',
        'TOKEN_REQUIRED', 401
      );
    }

    // Rate limit on first 16 chars of token (opaque prefix; not sensitive)
    const tokenPrefix = rawToken.slice(0, 16).replace(/[^a-z0-9-]/gi, '');
    const rl = await checkRateLimit(env, 'context_fetch', tokenPrefix, 60, 60);
    if (!rl.allowed) return rateLimited();

    try {
      tokenMeta = await validateToken(env, rawToken);
    } catch (e) {
      logContextCall(env, ctx, {
        integration_id: null,
        user_id: null,
        scope: null,
        endpoint: '/api/claude/context/full',
        success: false,
        failure_reason: 'TOKEN_INVALID',
        payload_size: null,
        ip_address: ip
      });
      return err('Token is invalid or expired', 'TOKEN_INVALID', 401);
    }
  }

  const timeframe  = url.searchParams.get('timeframe')  ?? null;
  const ownerId    = url.searchParams.get('owner_id')   ?? null;
  const pipelineId = url.searchParams.get('pipeline_id') ?? null;
  const limit      = parseInt(url.searchParams.get('limit') ?? '50', 10);

  let contextPayload;
  try {
    contextPayload = await buildContext(env, {
      scopes:     tokenMeta.scopes,
      userId:     tokenMeta.userId,
      odooUserId: env.UID,
      timeframe,
      ownerId,
      pipelineId,
      limit
    });
  } catch (e) {
    console.error('❌ context build failed:', e.message);
    logContextCall(env, ctx, {
      integration_id: tokenMeta.integrationId,
      user_id:        tokenMeta.userId,
      scope:          tokenMeta.scopes?.join(',') ?? null,
      endpoint:       '/api/claude/context/full',
      success:        false,
      failure_reason: e.message,
      payload_size:   null,
      ip_address:     ip
    });
    return err('Context build failed', 'CONTEXT_FAILED', 500);
  }

  const responseBody = JSON.stringify({ success: true, data: contextPayload });

  logContextCall(env, ctx, {
    integration_id: tokenMeta.integrationId,
    user_id:        tokenMeta.userId,
    scope:          contextPayload.meta?.scope ?? null,
    endpoint:       '/api/claude/context/full',
    success:        true,
    failure_reason: null,
    payload_size:   responseBody.length,
    ip_address:     ip
  });

  return new Response(responseBody, { headers: { 'Content-Type': 'application/json' } });
}

// ─── Audit endpoint ───────────────────────────────────────────────────────────

/**
 * GET /api/claude/audit
 * Admin-only. Returns audit log entries with optional filters.
 * Query params: limit, offset, integration_id, user_id
 */
const getAuditHandler = requireAdmin(async function getAuditHandler(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const limit         = parseInt(url.searchParams.get('limit')  ?? '50', 10);
  const offset        = parseInt(url.searchParams.get('offset') ?? '0',  10);
  const integrationId = url.searchParams.get('integration_id') ?? null;
  const userId        = url.searchParams.get('user_id')         ?? null;

  try {
    const result = await getAuditLog(env, { limit, offset, integrationId, userId });
    return ok(result);
  } catch (e) {
    console.error('❌ audit log fetch:', e.message);
    return err(e.message, 'AUDIT_FAILED', 500);
  }
});

// ─── Route map ────────────────────────────────────────────────────────────────
// Keys are subpaths relative to module.route ('/api/claude').
// resolveModuleRoute strips the prefix before matching.

export const routes = {
  'GET /': async () => Response.redirect('/insights/claude', 302),
  'GET /integrations':             listIntegrationsHandler,
  'POST /integrations':            createIntegrationHandler,
  'DELETE /integrations/:id':      revokeIntegrationHandler,
  'POST /integrations/:id/rotate': rotateSecretHandler,
  'POST /session/request':         requestChallenge,
  'POST /session/authorize':       authorizeSession,
  'GET /context/full':             getContext,
  'GET /audit':                    getAuditHandler
};
