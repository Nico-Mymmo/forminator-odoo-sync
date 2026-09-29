/**
 * Auth-gate — sessie-validatie en module-toegangscontrole.
 *
 * Token-extractie (Bearer header of session-cookie) → validateSession →
 * requiresAuth / requiresAdmin / user_modules check.
 *
 * @module router/auth-gate
 */

import { validateSession } from '../lib/auth/session.js';
import { getUserModules } from '../modules/registry.js';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Haal het sessie-token uit de Authorization header of de session-cookie.
 *
 * @param {Request} request
 * @returns {string|null}
 */
export function extractSessionToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const sessionCookie = cookies.find(c => c.startsWith('session='));
    if (sessionCookie) {
      return sessionCookie.split('=')[1];
    }
  }

  return null;
}

/**
 * Een `next`-pad dat veilig is om na het inloggen naartoe te sturen.
 *
 * Enkel een pad op DEZE site: begint met één `/`, niet met `//` of `/\`
 * (dat leest een browser als een ander domein). Alles anders wordt null --
 * anders is de loginpagina een open redirect naar eender welke site.
 *
 * @param {string|null} waarde @returns {string|null}
 */
export function veiligNextPad(waarde) {
  const pad = String(waarde || '');
  if (!pad.startsWith('/') || pad.startsWith('//') || pad.startsWith('/\\')) return null;
  if (/[\r\n]/.test(pad)) return null;
  return pad;
}

/**
 * Valideer de sessie en controleer module-toegang.
 *
 * @param {Request} request
 * @param {Object} env
 * @param {Object} module - Module-definitie uit de registry
 * @returns {Promise<{user: Object|null}|Response>} {user} bij toegang, anders een Response (redirect/403)
 */
export async function authGate(request, env, module) {
  const token = extractSessionToken(request);

  let user = null;
  if (token) {
    user = await validateSession(env, token);
  }

  // Module vereist auth maar gebruiker is niet ingelogd → redirect naar login (home).
  // Bij een GET gaat het gevraagde pad mee als ?next=, zodat je na het
  // inloggen terechtkomt waar je heen wou (een offerte uit de Odoo-chatter)
  // in plaats van op het dashboard.
  //
  // De Location is RELATIEF, nooit `new URL('/', request.url)`. Via
  // operations.openvme.be (een geproxyde CNAME) ziet de Worker als request.url
  // het workers.dev-adres; een absolute redirect stuurde de browser dan naar
  // een ANDER domein. Voor een fetch() is dat een CORS-fout in plaats van een
  // herkenbare redirect (`res.redirected`), en de gebruiker zag enkel een
  // kapotte pagina -- zo ging het in de offertetool. Relatief lost de browser
  // op tegen het adres dat HIJ opvroeg.
  const requiresAuth = module.requiresAuth !== false && module.code !== 'home';
  if (!user && requiresAuth) {
    let location = '/';
    if (request.method === 'GET') {
      const gevraagd = new URL(request.url);
      const next = veiligNextPad(gevraagd.pathname + gevraagd.search);
      if (next && next !== '/') location = `/?next=${encodeURIComponent(next)}`;
    }
    return new Response(null, { status: 302, headers: { Location: location } });
  }

  if (user) {
    // Admin module vereist admin-rol
    if (module.requiresAdmin && user.role !== 'admin') {
      return json({ error: 'Forbidden', message: 'Admin access required' }, 403);
    }

    // Profile is altijd toegankelijk voor ingelogde gebruikers; admins hebben overal toegang.
    // Overige gebruikers hebben een user_modules entry nodig.
    if (
      user.role !== 'admin' &&
      !module.requiresAdmin &&
      module.requiresAuth !== false &&
      module.code !== 'home' &&
      module.code !== 'profile'
    ) {
      const userModules = getUserModules(user);
      const hasAccess = userModules.some(m => m.code === module.code);

      if (!hasAccess) {
        return json({ error: 'Forbidden', message: 'You do not have access to this module' }, 403);
      }
    }
  }

  return { user };
}
