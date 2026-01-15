/**
 * Home Module
 * 
 * Landing page with module tiles
 */

import { homeDashboardUI, loginPageUI } from './ui.js';

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
      
      return new Response(homeDashboardUI(context.user), {
        headers: { 'Content-Type': 'text/html' }
      });
    }
  }
};
