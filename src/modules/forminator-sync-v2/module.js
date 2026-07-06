import { routes } from './routes.js';

export default {
  code: 'forminator_sync_v2',
  name: 'Koppelingen',
  description: 'MVP module for marketer-first Forminator to Odoo sync',
  route: '/forminator-v2',
  icon: 'workflow',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  routes
};
