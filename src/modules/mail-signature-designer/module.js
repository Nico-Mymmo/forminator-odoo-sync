/**
 * Mail Signature Designer Module
 *
 * Route: /mail-signatures
 * Manages Google Workspace email signature templates and bulk push.
 *
 * ─── Role access ─────────────────────────────────────────────────────────────
 *
 *  All authenticated users with module access via user_modules can visit this
 *  module and manage their own signature ("Mijn handtekening" tab).
 *
 *  The marketing_signature and admin roles additionally unlock:
 *    - "Marketing" tab: branding, events, banners, default disclaimer
 *    - "Push" tab:      multi-user and all-users push
 *    - "Logs" tab:      full push audit log
 *
 *  API-level role enforcement is in routes.js via guardMarketingRole().
 *  UI-level tab visibility is in ui.js via isMarketingOrAdmin.
 *
 *  Role-based module access notes:
 *    - users with role='marketing_signature' are auto-granted module access
 *      in the migration: 20260223000000_mail_signature_roles_and_layers.sql
 *    - For future users: admin must grant via user_modules (same as any module)
 */

import { routes } from './routes.js';

export default {
  code:        'mail_signature_designer',
  name:        'Signature Designer',
  description: 'Beheer en push e-mailhandtekeningen voor Google Workspace gebruikers',
  route:       '/mail-signatures',
  icon:        'mail',
  isActive:    true,

  /**
   * Sub-roles within this module.
   * These are enforced server-side in routes.js, not here.
   * Documented for tooling / admin panels.
   *
   * Values correspond to users.role:
   *   'user'                – Own signature only
   *   'marketing_signature' – Full marketing control + multi-push
   *   'admin'               – Same as marketing_signature
   */
  subRoles: ['user', 'marketing_signature', 'admin'],

  routes
};
