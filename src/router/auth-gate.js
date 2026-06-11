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

  // Module vereist auth maar gebruiker is niet ingelogd → redirect naar login (home)
  const requiresAuth = module.requiresAuth !== false && module.code !== 'home';
  if (!user && requiresAuth) {
    return Response.redirect(new URL('/', request.url), 302);
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
