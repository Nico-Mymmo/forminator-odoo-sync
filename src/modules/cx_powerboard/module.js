/**
 * CX Powerboard Module
 *
 * Activity priority queue and automated win detection for CX teams.
 */

import { routes } from './routes.js';

export default {
  code: 'cx_powerboard',
  name: 'CX Powerboard',
  description: 'Activity priority queue and automated win detection for CX teams.',
  route: '/cx-powerboard',
  icon: 'trophy',
  isActive: true,
  routes,
};
