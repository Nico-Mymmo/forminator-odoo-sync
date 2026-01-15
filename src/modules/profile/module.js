/**
 * Profile Module
 * 
 * User profile management and password change
 */

import { profileUI } from './ui.js';
import { handleChangePassword, handleUpdateProfile } from './routes.js';

export default {
  // Module metadata
  code: 'profile',
  name: 'Profile',
  description: 'Manage your profile and password',
  route: '/profile',
  icon: 'user',
  
  // Module status
  isActive: true,
  requiresAdmin: false,
  
  // Route handlers
  routes: {
    // Profile page
    'GET /': async (context) => {
      if (!context.user) {
        return Response.redirect(new URL('/', new URL(context.request.url)), 302);
      }
      
      return new Response(profileUI(context.user), {
        headers: { 'Content-Type': 'text/html' }
      });
    },
    
    // Update profile
    'POST /update': handleUpdateProfile,
    
    // Change password
    'POST /change-password': handleChangePassword
  }
};
