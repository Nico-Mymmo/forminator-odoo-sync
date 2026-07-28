/**
 * Module-router — resolve module + route, voer handler uit, track endpoint.
 *
 * @module router/module-router
 */

import { getModuleByRoute, resolveModuleRoute } from '../modules/registry.js';
import { trackEndpoint } from '../lib/endpoint-tracker.js';
import { authGate } from './auth-gate.js';
import { addCorsHeaders } from './cors.js';
import { trackerErrorPage } from './public-routes.js';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Onbekende top-level paden (geen module matcht) kunnen op operations.openvme.be
// EN link.openvme.be terechtkomen -- beide domeinen wijzen naar dezelfde Worker
// en zijn qua Host-header niet betrouwbaar te onderscheiden (zie de uitgebreide
// toelichting in public-routes.js bij de tracker-redirect). Voor een gewoon
// browserbezoek (bv. iemand tikt/deelt een verkeerde/verlopen link.openvme.be/...-
// URL zonder /t/-prefix) tonen we daarom altijd de merk-consistente "niet gevonden"-
// pagina i.p.v. kale JSON — dat is voor zowel staff als klanten een betere
// ervaring, en raakt geen enkele bestaande, wél-gematchte module-route.
function isBrowserPageRequest(request) {
  if (request.method !== 'GET') return false;
  const accept = request.headers.get('Accept') || '';
  return accept.includes('text/html');
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
    if (isBrowserPageRequest(request)) {
      return trackerErrorPage({
        status: 404,
        heading: 'Pagina niet gevonden',
        message: 'Deze pagina bestaat niet, of de link klopt niet (meer).',
      });
    }
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
