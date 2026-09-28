/**
 * Content Feed — nieuws & updates
 *
 * Beheer van `x_content_snippet` (nieuws, release notes, publicaties) in de
 * OM. Odoo is de enige database: deze module bezit geen data en gebruikt
 * geen Supabase.
 *
 * De WordPress-plugin HAALT op via /content-feed/public/v1/*; er wordt
 * nergens naar WordPress geduwd. Zie docs/ontwerp-om-nieuws.md.
 */

import { routes } from './routes.js';

export default {
  code: 'content_feed',
  name: 'Nieuws & updates',
  description: 'Beheer van nieuwsberichten en updates — Odoo als enige database',
  route: '/content-feed',
  icon: 'newspaper',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  routes
};
