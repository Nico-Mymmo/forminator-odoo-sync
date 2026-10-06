/**
 * AV-slides
 *
 * De twee slides waarmee de maandelijkse AV eindigt -- "Wist-je-weetje" en het
 * "Prikbord" -- klaargezet uit Odoo (verjaardagen, events), uitgerekende
 * feestdagen en weetjes uit de cijfers, en met een klik als gewone Slides-vormen
 * in de presentatie van die maand gezet. Opslag per maand: av_slide_editions.
 */

import { routes } from './routes.js';

export default {
  code: 'av_slides',
  name: 'AV-slides',
  description: 'Wist-je-weetje en het prikbord voor de maandelijkse AV',
  route: '/av-slides',
  icon: 'presentation',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  routes,
};
