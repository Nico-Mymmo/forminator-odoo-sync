/**
 * Profile Module
 *
 * User profile management and password change
 *
 * Profiel -> Beveiliging (/profile/beveiliging) is een modern scherm
 * (public/account-security.html): 2FA, herstelcodes, sessies, aanmeldingen.
 */

import { profileUI } from './ui.js';
import { handleChangePassword, handleUpdateProfile } from './routes.js';
import {
  handleGetSecurity,
  handleMfaConfirm,
  handleMfaSetup,
  handleRegenerateRecoveryCodes,
  handleRevokeOtherOwnSessions,
  handleRevokeOwnSession
} from './security-routes.js';

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
    'POST /change-password': handleChangePassword,

    // Beveiliging: 2FA, herstelcodes, sessies, aanmeldingen
    'GET /beveiliging': async (context) => {
      const res = await context.env.ASSETS.fetch(new Request(new URL('/account-security.html', context.request.url)));
      return new Response(await res.text(), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "frame-ancestors 'none'"
        }
      });
    },
    'GET /api/security': handleGetSecurity,
    'POST /api/security/mfa/setup': handleMfaSetup,
    'POST /api/security/mfa/confirm': handleMfaConfirm,
    'POST /api/security/recovery-codes': handleRegenerateRecoveryCodes,
    'DELETE /api/security/sessions/:id': handleRevokeOwnSession,
    'POST /api/security/sessions/revoke-others': handleRevokeOtherOwnSessions
  }
};
