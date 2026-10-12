/**
 * Nieuwsbrieven -- de publieke kant van een vraag in de mail.
 *
 *   GET  /t/_v/<stukje>/<optie>?c=&t=   de bedankpagina (statisch, public/)
 *   POST /t/_v/api/answer               het antwoord bewaren (door de pagina)
 *   POST /t/_v/api/comment              een toelichting bij dat antwoord
 *   GET  /t/_v/api/question?cid=        enkel lezen, voor de voorbeeldstand
 *
 * Onder /t/ omdat de redirect-regel op link.* (ander Cloudflare-account) /t/
 * doorlaat; "_v" kan geen slug van een trackbare link zijn (die hebben geen
 * underscore). Zelfde afweging als /t/_o/ voor de tracker.
 *
 * De GET bewaart NIETS: beveiligingsscanners openen elke link in een mail.
 */

import { registreerAntwoord, registreerToelichting, vraagVoorbeeld } from './lib/answers.js';
import { NewsletterError } from './lib/store.js';
import { LOG_PREFIX } from './lib/constants.js';

const PREFIX = '/t/_v/';

// Een grens per IP, in het geheugen van de isolate: genoeg om iemand tegen te
// houden die de route bestookt. Zelfde keuze als checkRateLimitLocal in events-v2.
const teller = new Map();
function teVeel(ip) {
  const nu = Date.now();
  const r = teller.get(ip) || { start: nu, n: 0 };
  if (nu - r.start > 60_000) { r.start = nu; r.n = 0; }
  r.n += 1;
  teller.set(ip, r);
  if (teller.size > 5000) teller.clear();
  return r.n > 40;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

/** @returns {Promise<Response|null>} null = niet voor ons */
export async function handleNewsletterPublic(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return null;
  const rest = url.pathname.slice(PREFIX.length);
  const ip = request.headers.get('CF-Connecting-IP') || 'onbekend';

  try {
    if (rest.startsWith('api/')) {
      if (teVeel(ip)) return json({ success: false, error: 'Even geduld, probeer het zo opnieuw.' }, 429);
      if (rest === 'api/answer' && request.method === 'POST') {
        const b = await body(request);
        return json({ success: true, data: await registreerAntwoord(env, b) });
      }
      if (rest === 'api/comment' && request.method === 'POST') {
        return json({ success: true, data: await registreerToelichting(env, await body(request)) });
      }
      if (rest === 'api/question' && request.method === 'GET') {
        return json({ success: true, data: await vraagVoorbeeld(env, { cid: url.searchParams.get('cid') }) });
      }
      return json({ success: false, error: 'Niet gevonden' }, 404);
    }

    if (request.method === 'GET' && /^[0-9a-f-]{36}\/[a-z0-9-]{1,40}\/?$/i.test(rest)) {
      const pagina = await env.ASSETS.fetch(new Request(new URL('/nieuwsbrief-antwoord.html', url)));
      const headers = new Headers(pagina.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Robots-Tag', 'noindex');
      return new Response(pagina.body, { status: pagina.status, headers });
    }
    return null;
  } catch (err) {
    const status = err instanceof NewsletterError ? err.status : 500;
    if (status === 500) console.error(`${LOG_PREFIX} publiek:`, err);
    return json({ success: false, error: status === 500 ? 'Er ging iets mis. Probeer het later opnieuw.' : err.message }, status);
  }
}
