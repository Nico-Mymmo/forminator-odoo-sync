/**
 * Home Module
 * 
 * Landing page with module tiles
 */

import { homeDashboardUI, loginPageUI } from './ui.js';
import { veiligNextPad } from '../../router/auth-gate.js';

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
        return new Response(loginPageUI(), {
          headers: { 'Content-Type': 'text/html' }
        });
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
