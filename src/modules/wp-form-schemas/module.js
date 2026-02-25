import { routes } from './routes.js';

export default {
  code:           'wp_form_schemas',
  name:           'WP Form Schemas',
  description:    'Multi-site WordPress Forminator schema sync',
  route:          '/wp-sites',
  icon:           'database',
  isActive:       true,
  requiresAuth:   true,
  requiresAdmin:  false,
  routes
};
