/**
 * Public routes — geen sessie vereist.
 *
 * - /favicon.ico
 * - /assets/* (R2 publieke bestanden)
 * - /api/auth/login | logout | me
 * - Forminator Sync V2 webhooks (token-auth)
 * - link.openvme.be/* — FSV2 tracker-redirect (trackbare korte links/QR-codes,
 *   inherent publiek: iemand die een QR scant heeft geen sessie-cookie).
 *   link.openvme.be zonder pad (root-bezoek) stuurt door naar https://openvme.be.
 *   Onbekende/inactieve slugs tonen een branded foutpagina i.p.v. kale tekst.
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
import { getIntegrationByTrackerSlug, logTrackerHit } from '../modules/forminator-sync-v2/database.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Branded HTML-pagina voor trackable links die niet (meer) werken — link.openvme.be
 * heeft geen ander doel dan doorsturen/loggen, dus dit is de enige plek waar een
 * bezoeker ooit echt content van dit domein te zien krijgt. Geen build-stap/CDN-
 * afhankelijkheid: puur inline HTML+CSS, want dit MOET altijd werken, ook als een
 * externe CDN eventjes onbereikbaar is.
 */
function trackerErrorPage({ status, heading, message }) {
  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${heading} — mymmo</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f8f9fb;
    color: #1f2430;
    padding: 24px;
    box-sizing: border-box;
  }
  .card {
    max-width: 420px;
    width: 100%;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 32px 28px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 16px;
    border-radius: 50%;
    background: #fef3f2;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
  }
  h1 { font-size: 18px; font-weight: 700; margin: 0 0 8px; }
  p { font-size: 14px; color: #6b7280; line-height: 1.5; margin: 0 0 20px; }
  a.btn {
    display: inline-block;
    font-size: 13px;
    font-weight: 600;
    color: #ffffff;
    background: #2563eb;
    padding: 9px 18px;
    border-radius: 8px;
    text-decoration: none;
  }
  a.btn:hover { background: #1d4ed8; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">🔗</div>
    <h1>${heading}</h1>
    <p>${message}</p>
    <a class="btn" href="https://openvme.be">Naar openvme.be</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
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

  // FSV2 tracker-redirect — trackbare korte links/QR-codes.
  //
  // Twee manieren om hier te belanden, BEIDE ondersteund (onafhankelijk van elkaar):
  //   1) pathname begint met '/t/<slug>' — werkt op ELK hostname dat naar deze
  //      Worker wijst (incl. het kale workers.dev-adres en operations.openvme.be),
  //      dit is de betrouwbare methode zolang link.openvme.be nog niet (volledig)
  //      werkt, want ze hangt NIET af van hostname-detectie.
  //   2) hostname === link.openvme.be met de slug direct in het pad ('/<slug>',
  //      geen '/t/'-prefix) — de "mooie" vorm zodra dat domein live is. LET OP:
  //      als link.openvme.be via eenzelfde geproxyde cross-account CNAME loopt als
  //      operations.openvme.be, is het NIET zeker dat Cloudflare de originele
  //      Host-header behoudt (in de praktijk bleek dat voor operations.openvme.be
  //      niet betrouwbaar) — vandaar dat (1) de primaire, geteste weg is en (2) een
  //      bonus is die werkt zodra/als de hostname wél correct doorkomt.
  //
  // Dit MOET vóór elke sessie-afhankelijke logica draaien: inherent publiek,
  // iemand die een QR-code scant of een gedeelde link volgt heeft geen sessie-cookie.
  const requestHost = request.headers.get('Host') || url.hostname;
  const isTrackerPathPrefix = pathname.startsWith('/t/');
  const isTrackerHostname = requestHost === 'link.openvme.be';

  if ((isTrackerPathPrefix || isTrackerHostname) && request.method === 'GET') {
    const slug = isTrackerPathPrefix
      ? pathname.slice('/t/'.length).split('/')[0]
      : pathname.slice(1).split('/')[0];

    // Rechtstreeks bezoek zonder slug op het "mooie" domein (bv. iemand tikt
    // "link.openvme.be" gewoon in) -> doorsturen naar de hoofdwebsite. Bij de
    // '/t/'-vorm zonder slug ('/t' of '/t/') is er niets zinnigs om naartoe te
    // sturen, dat toont gewoon de "niet gevonden"-pagina hieronder.
    if (!slug) {
      if (isTrackerHostname) {
        return Response.redirect('https://openvme.be', 302);
      }
      return trackerErrorPage({
        status: 404,
        heading: 'Link niet gevonden',
        message: 'Deze link bestaat niet (meer), of is verkeerd overgetypt.',
      });
    }

    let integration;
    try {
      integration = await getIntegrationByTrackerSlug(env, slug);
    } catch (err) {
      console.error('[tracker] failed to look up slug:', err.message);
      return trackerErrorPage({
        status: 500,
        heading: 'Er ging iets mis',
        message: 'Deze link kon momenteel niet verwerkt worden. Probeer het later opnieuw.',
      });
    }

    if (!integration) {
      return trackerErrorPage({
        status: 404,
        heading: 'Link niet gevonden',
        message: 'Deze link bestaat niet (meer), of is verkeerd overgetypt.',
      });
    }

    if (!integration.is_active || !integration.destination_url) {
      return trackerErrorPage({
        status: 410,
        heading: 'Link niet meer actief',
        message: 'Deze link is uitgeschakeld en stuurt niet langer door.',
      });
    }

    const origin = url.searchParams.get('src') === 'qr' ? 'qr' : 'link';
    const logPromise = logTrackerHit(env, integration.id, {
      origin,
      referrer: request.headers.get('Referer') || null,
      userAgent: request.headers.get('User-Agent') || null,
    }).catch((err) => console.error('[tracker] failed to log hit:', err.message));

    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(logPromise);
    } else {
      await logPromise;
    }

    return Response.redirect(integration.destination_url, 302);
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
