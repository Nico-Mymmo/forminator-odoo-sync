/**
 * Event Operations Module
 * 
 * Manage Odoo x_webinar publication to WordPress Tribe Events
 */

import { routes } from './routes.js';

export default {
  code: 'event_operations',
  name: 'Event Operations',
  description: 'Manage Odoo webinar publication to WordPress',
  route: '/events',
  icon: 'calendar',
  isActive: true,
  routes
};
