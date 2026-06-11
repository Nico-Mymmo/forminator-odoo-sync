/**
 * Module-router — resolve module + route, voer handler uit, track endpoint.
 *
 * @module router/module-router
 */

import { getModuleByRoute, resolveModuleRoute } from '../modules/registry.js';
import { trackEndpoint } from '../lib/endpoint-tracker.js';
import { authGate } from './auth-gate.js';
import { addCorsHeaders } from './cors.js';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Handel een module-request af (auth-gate → handler → endpoint-tracking).
 *
 * @returns {Promise<Response>}
 */
export async function handleModuleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const module = getModuleByRoute(pathname);
  if (!module) {
    return json({ success: false, error: 'Not Found' }, 404);
  }

  // Auth + module-toegang
  const gate = await authGate(request, env, module);
  if (gate instanceof Response) {
    return gate;
  }

  // Resolve route binnen de module
  const resolved = resolveModuleRoute(module, request.method, pathname);
  if (!resolved) {
    return json({ success: false, error: 'Not Found' }, 404);
  }

  const context = { request, env, ctx, user: gate.user, params: resolved.params };
  const response = await resolved.handler(context);

  // Fire-and-forget endpoint-tracking (alleen module-routes, niet publieke/auth-routes).
  // routePath is het route-patroon (bv. /api/users/:id) — lage cardinaliteit in endpoint_log.
  const routePath = resolved.routePath === '/' ? '' : resolved.routePath;
  trackEndpoint(env, `${request.method} ${module.route}${routePath}`, ctx);

  return addCorsHeaders(response);
}
