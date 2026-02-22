/**
 * Mail Signature Designer Module
 *
 * Route: /mail-signatures
 * Manages Google Workspace email signature templates and bulk push.
 */

import { routes } from './routes.js';

export default {
  code: 'mail_signature_designer',
  name: 'Signature Designer',
  description: 'Beheer en push e-mailhandtekeningen voor Google Workspace gebruikers',
  route: '/mail-signatures',
  icon: 'mail',
  isActive: true,
  routes
};
