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
  getIntegrationById,
  validateClientSecret,
  deleteIntegrationPermanently,
  touchIntegration
} from './lib/integration-service.js';
import { createChallenge, validateAndConsumeChallenge } from './lib/challenge-service.js';
import { createToken, validateToken, revokeAllTokensForIntegration } from './lib/token-service.js';
import { buildContext } from './lib/context-builder.js';
import { logContextCall, getAuditLog } from './lib/audit-service.js';
import {
  getDefaultTemplate, listActiveTemplates, listAllTemplates, getTemplate,
  createTemplate, updateTemplate,
  setDefaultTemplate as setDefaultTemplateInDb,
  deactivateTemplate as deactivateTemplateInDb,
  deleteTemplatePermanently,
  getOdooModelFields
} from './lib/dataset-service.js';

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
 * Body: { name: string, dataset_template_id?: string }
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

  const { name, dataset_template_id = null } = body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return err('name is required', 'VALIDATION_FAILED');
  }

  try {
    const result = await createIntegration(env, user.id, name, dataset_template_id);
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

    return ok({ challenge_id, expires_at });
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
      integrationId:     integration.id,
      userId:            integration.user_id,
      datasetTemplateId: integration.dataset_template_id ?? null
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

    let rawTokenMeta;
    try {
      rawTokenMeta = await validateToken(env, rawToken);
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

    // Load the full integration to get dataset_template_id
    const bearerIntegration = await getIntegrationById(env, rawTokenMeta.integrationId);
    tokenMeta = {
      integrationId:     rawTokenMeta.integrationId,
      userId:            rawTokenMeta.userId,
      datasetTemplateId: bearerIntegration?.dataset_template_id ?? null
    };
  }

  const timeframe = url.searchParams.get('timeframe') ?? null;
  // null = not provided → context-builder uses template default or no limit
  const limit     = url.searchParams.has('limit') ? parseInt(url.searchParams.get('limit'), 10) : null;

  let contextPayload;
  try {
    contextPayload = await buildContext(env, {
      templateId: tokenMeta.datasetTemplateId,
      timeframe,
      limit
    });
  } catch (e) {
    console.error('❌ context build failed:', e.message);
    logContextCall(env, ctx, {
      integration_id: tokenMeta.integrationId,
      user_id:        tokenMeta.userId,
      scope:          tokenMeta.datasetTemplateId ?? null,
      endpoint:       '/api/claude/context/full',
      success:        false,
      failure_reason: e.message,
      payload_size:   null,
      ip_address:     ip
    });
    return err('Context build failed', 'CONTEXT_FAILED', 500);
  }

  const responseBody = JSON.stringify({ success: true, data: contextPayload });

  // Reset expiry timer non-blocking — active integrations stay alive
  ctx.waitUntil(touchIntegration(env, tokenMeta.integrationId));

  logContextCall(env, ctx, {
    integration_id: tokenMeta.integrationId,
    user_id:        tokenMeta.userId,
    scope:          contextPayload.meta?.template_name ?? contextPayload.meta?.template_id ?? null,
    endpoint:       '/api/claude/context/full',
    success:        true,
    failure_reason: null,
    payload_size:   responseBody.length,
    ip_address:     ip
  });

  return new Response(responseBody, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
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

// ─── Dataset template management (admin) ─────────────────────────────────────

const listDatasetTemplatesHandler = requireAuth(async function listDatasetTemplatesHandler(context) {
  const { env, user, request } = context;
  const all = new URL(request.url).searchParams.get('all') === 'true';
  try {
    const data = (user.role === 'admin' && all) ? await listAllTemplates(env) : await listActiveTemplates(env);
    return ok(data);
  } catch (e) { return err(e.message, 'LIST_FAILED', 500); }
});

const createDatasetTemplateHandler = requireAdmin(async function createDatasetTemplateHandler(context) {
  const { request, env, user } = context;
  let body;
  try { body = await request.json(); } catch (_) { return err('Invalid JSON', 'INVALID_BODY'); }
  const { name, description, model_config, field_categories } = body ?? {};
  if (!name || typeof name !== 'string' || !name.trim()) return err('name is required', 'VALIDATION_FAILED');
  if (!Array.isArray(model_config)) return err('model_config must be an array', 'VALIDATION_FAILED');
  try {
    const template = await createTemplate(env, user.id, { name, description, model_config, field_categories });
    return ok(template, 201);
  } catch (e) { return err(e.message, 'CREATE_FAILED', 500); }
});

const getDatasetTemplateHandler = requireAuth(async function getDatasetTemplateHandler(context) {
  const { env, params } = context;
  const template = await getTemplate(env, params.id);
  if (!template) return err('Template not found', 'NOT_FOUND', 404);
  return ok(template);
});

const updateDatasetTemplateHandler = requireAdmin(async function updateDatasetTemplateHandler(context) {
  const { request, env, params } = context;
  let body;
  try { body = await request.json(); } catch (_) { return err('Invalid JSON', 'INVALID_BODY'); }
  try {
    const template = await updateTemplate(env, params.id, body);
    return ok(template);
  } catch (e) { return err(e.message, 'UPDATE_FAILED', 500); }
});

const setDefaultDatasetTemplateHandler = requireAdmin(async function setDefaultDatasetTemplateHandler(context) {
  const { env, params } = context;
  try {
    const template = await setDefaultTemplateInDb(env, params.id);
    return ok(template);
  } catch (e) { return err(e.message, 'SET_DEFAULT_FAILED', 500); }
});

const deactivateDatasetTemplateHandler = requireAdmin(async function deactivateDatasetTemplateHandler(context) {
  const { env, params } = context;
  try {
    await deactivateTemplateInDb(env, params.id);
    return ok({ deactivated: true });
  } catch (e) { return err(e.message, 'DEACTIVATE_FAILED', 500); }
});

const deleteDatasetTemplatePermanentlyHandler = requireAdmin(async function deleteDatasetTemplatePermanentlyHandler(context) {
  const { env, params } = context;
  try {
    await deleteTemplatePermanently(env, params.id);
    return ok({ deleted: true });
  } catch (e) { return err(e.message, 'DELETE_FAILED', 500); }
});

const deleteIntegrationPermanentlyHandler = requireAdmin(async function deleteIntegrationPermanentlyHandler(context) {
  const { env, params } = context;
  try {
    await revokeAllTokensForIntegration(env, params.id);
    await deleteIntegrationPermanently(env, params.id);
    return ok({ deleted: true });
  } catch (e) { return err(e.message, 'DELETE_FAILED', 500); }
});

const getOdooFieldsHandler = requireAdmin(async function getOdooFieldsHandler(context) {
  const { request, env } = context;
  const model = new URL(request.url).searchParams.get('model');
  if (!model || typeof model !== 'string' || !model.trim()) return err('model required', 'VALIDATION_FAILED');
  try {
    const fields = await getOdooModelFields(env, model.trim());
    return ok(fields);
  } catch (e) { return err(e.message, 'FIELDS_FAILED', 500); }
});

// ─── Preview context (session-authenticated, no secret needed) ───────────────

/**
 * GET /api/claude/integrations/:id/preview
 *
 * Builds the dataset context for the given integration using the caller's
 * session cookie — no client_secret required. The caller must own the
 * integration (or be admin).
 *
 * Query params: timeframe, limit (same as /context/full)
 * Returns the same contextPayload structure as /context/full.
 */
const previewContextHandler = requireAuth(async function previewContextHandler(context) {
  const { request, env, user, params } = context;
  const { id } = params;

  if (!id) return err('Integration ID required', 'VALIDATION_FAILED');

  const integration = await getIntegrationById(env, id);
  if (!integration) return err('Integration not found', 'NOT_FOUND', 404);

  // Only the owner or an admin may preview
  if (integration.user_id !== user.id && user.role !== 'admin') {
    return err('Forbidden', 'FORBIDDEN', 403);
  }

  const url = new URL(request.url);
  const timeframe = url.searchParams.get('timeframe') ?? null;
  const limit     = url.searchParams.has('limit') ? parseInt(url.searchParams.get('limit'), 10) : 3;

  try {
    const contextPayload = await buildContext(env, {
      templateId: integration.dataset_template_id ?? null,
      timeframe,
      limit
    });
    return ok(contextPayload);
  } catch (e) {
    console.error('❌ preview context:', e.message);
    return err(e.message, 'PREVIEW_FAILED', 500);
  }
});

// ─── Route map ────────────────────────────────────────────────────────────────
// Keys are subpaths relative to module.route ('/api/claude').
// resolveModuleRoute strips the prefix before matching.

export const routes = {
  'GET /': async () => Response.redirect('/insights/claude', 302),
  'GET /integrations':                           listIntegrationsHandler,
  'POST /integrations':                          createIntegrationHandler,
  'DELETE /integrations/:id':                    revokeIntegrationHandler,
  'DELETE /integrations/:id/permanent':           deleteIntegrationPermanentlyHandler,
  'POST /integrations/:id/rotate':                rotateSecretHandler,
  'GET /integrations/:id/preview':               previewContextHandler,
  'POST /session/request':                       requestChallenge,
  'POST /session/authorize':                     authorizeSession,
  'GET /context/full':                           getContext,
  'GET /audit':                                  getAuditHandler,
  // Dataset template management
  'GET /dataset-templates':                      listDatasetTemplatesHandler,
  'POST /dataset-templates':                     createDatasetTemplateHandler,
  'GET /dataset-templates/:id':                  getDatasetTemplateHandler,
  'PUT /dataset-templates/:id':                  updateDatasetTemplateHandler,
  'POST /dataset-templates/:id/set-default':     setDefaultDatasetTemplateHandler,
  'DELETE /dataset-templates/:id':               deactivateDatasetTemplateHandler,
  'DELETE /dataset-templates/:id/permanent':      deleteDatasetTemplatePermanentlyHandler,
  'GET /odoo/fields':                             getOdooFieldsHandler
};
