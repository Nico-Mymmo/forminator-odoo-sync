/**
 * Public routes — geen sessie vereist.
 *
 * - /favicon.ico
 * - /assets/* (R2 publieke bestanden)
 * - /api/auth/login | logout | me
 * - Forminator Sync V2 webhooks (token-auth)
 *
 * Retourneert een Response als de route hier afgehandeld wordt, anders null.
 *
 * @module router/public-routes
 */

import { handleLogin, handleLogout, handleMe } from '../api/auth.js';
import { validateSession } from '../lib/auth/session.js';
import { getModuleByCode, resolveModuleRoute } from '../modules/registry.js';
import { validateKey } from '../modules/asset-manager/lib/path-utils.js';
import { getMimeType } from '../modules/asset-manager/lib/mime-types.js';
import { extractSessionToken } from './auth-gate.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Webhook token-auth voor Forminator Sync V2 (WordPress kan geen sessie-cookie sturen).
 */
async function validateWebhookToken(request, env) {
  const userAgent = request.headers.get('User-Agent') || '';
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');

  // Webhook secret token — FORMINATOR_WEBHOOK_SECRET (no UA restriction)
  const webhookSecret = env?.FORMINATOR_WEBHOOK_SECRET;
  if (webhookSecret && tokenParam && tokenParam === webhookSecret) {
    return true;
  }

  // Public Forminator token: only works from openvme.be User-Agent (legacy)
  if (tokenParam === 'openvmeform') {
    if (!userAgent.includes('openvme.be')) {
      console.error(`openvmeform token used but User-Agent doesn't contain openvme.be: ${userAgent}`);
      return false;
    }
    return true;
  }

  // Authorization header (Bearer AUTH_TOKEN)
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme === 'Bearer' && token === env.AUTH_TOKEN) {
      return true;
    }
  }

  // Query parameter AUTH_TOKEN (legacy support)
  if (tokenParam && tokenParam === env.AUTH_TOKEN) {
    return true;
  }

  return false;
}

async function dispatchV2Webhook(request, env, ctx, pathname) {
  const v2Module = getModuleByCode('forminator_sync_v2');
  if (!v2Module) {
    return json({ success: false, error: 'Forminator Sync V2 module unavailable' }, 500);
  }

  const resolved = resolveModuleRoute(v2Module, request.method, pathname);
  if (!resolved) {
    return json({ success: false, error: 'Webhook route not found' }, 404);
  }

  const context = { request, env, ctx, user: null, params: resolved.params };
  return await resolved.handler(context);
}

/**
 * Probeer een publieke route af te handelen.
 *
 * @returns {Promise<Response|null>} Response of null (niet publiek → door naar auth-gate/module-router)
 */
export async function handlePublicRoutes(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Favicon
  if (pathname === '/favicon.ico') {
    return new Response(null, { status: 204 });
  }

  // Public asset serving — geen auth, vóór module-router
  // Exacte check: startsWith('/assets/') met trailing slash — NIET '/assets'
  // '/assets' (zonder slash) = module-UI, moet de module-router bereiken met auth
  // '/assets/api/*'          = API routes, moeten module-router bereiken met auth
  // '/assets/mini-apps/*'    = mini-apps-inhoud in dezelfde R2_ASSETS-bucket, MAG NIET
  //                            hier publiek geserveerd worden — privacy/sharing-rechten
  //                            (private/shared/specific) worden alleen in
  //                            src/modules/mini-apps/routes.js gecontroleerd
  //                            (GET /api/apps/:id/content). Zonder deze uitzondering
  //                            zou iedereen elke mini-app rechtstreeks kunnen ophalen
  //                            via /assets/mini-apps/{id}.html, buiten die check om.
  // '/assets/*' (met slash)  = overige publieke bestanden, worden hier geserveerd zonder auth
  if (
    pathname.startsWith('/assets/') &&
    !pathname.startsWith('/assets/api/') &&
    !pathname.startsWith('/assets/mini-apps/') &&
    request.method === 'GET'
  ) {
    const key = pathname.slice('/assets/'.length);

    if (!validateKey(key)) {
      return new Response('Not Found', { status: 404 });
    }

    let object;
    try {
      object = await env.R2_ASSETS.get(key);
    } catch (err) {
      console.error('[asset-manager] R2 get error:', err.message);
      return new Response('Internal Server Error', { status: 500 });
    }

    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const contentType = object.httpMetadata?.contentType || getMimeType(key);

    let cacheControl;
    if (key.startsWith('public/')) {
      cacheControl = 'public, max-age=31536000, immutable';
    } else if (key.startsWith('uploads/')) {
      cacheControl = 'public, max-age=3600';
    } else {
      cacheControl = 'private, no-store';
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'ETag': object.etag || ''
      }
    });
  }

  // Auth endpoints
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    return await handleLogin({ request, env, ctx });
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    return await handleLogout({ request, env, ctx });
  }

  if (pathname === '/api/auth/me' && request.method === 'GET') {
    const token = extractSessionToken(request);
    if (!token) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }

    const user = await validateSession(env, token);
    if (!user) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }

    return await handleMe({ user });
  }

  // Public webhook intake for Forminator Sync V2 (token-auth, no session required)
  if (pathname === '/forminator-v2/api/webhook' && request.method === 'POST') {
    const isAuthorized = await validateWebhookToken(request, env);
    if (!isAuthorized) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }
    return await dispatchV2Webhook(request, env, ctx, pathname);
  }

  // Per-integration generic/Zapier webhook (token-auth per integration, no session required)
  if (/^\/forminator-v2\/api\/integrations\/[^/]+\/webhook$/.test(pathname) && request.method === 'POST') {
    return await dispatchV2Webhook(request, env, ctx, pathname);
  }

  return null;
}
