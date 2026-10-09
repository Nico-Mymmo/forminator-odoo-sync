/**
 * Home Module
 *
 * Landing page with module tiles
 */

import { homeDashboardUI } from './ui.js';
import { veiligNextPad } from '../../router/auth-gate.js';

/**
 * De loginpagina (public/login.html). Niet in de cache, en niet in een frame
 * van een andere site te tonen: een loginformulier in een onzichtbaar iframe
 * is de klassieke manier om iemand op de verkeerde knop te laten klikken.
 */
async function loginPagina(context) {
  const res = await context.env.ASSETS.fetch(new Request(new URL('/login.html', context.request.url)));
  return new Response(await res.text(), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'Referrer-Policy': 'same-origin'
    }
  });
}

export default {
  // Module metadata
  code: 'home',
  name: 'Home',
  description: 'Module dashboard',
  route: '/',
  icon: 'home',

  // Module status
  isActive: true,
  requiresAdmin: false,  // Everyone can see home

  // Route handlers
  routes: {
    // Main dashboard
    'GET /': async (context) => {
      // Show login page if not authenticated
      if (!context.user) {
        return loginPagina(context);
      }

      // Al ingelogd en toch met ?next= binnen (bv. een tweede tabblad): meteen door.
      const next = veiligNextPad(new URL(context.request.url).searchParams.get('next'));
      if (next) return Response.redirect(new URL(next, context.request.url).toString(), 302);

      return new Response(homeDashboardUI(context.user), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
  }
};
