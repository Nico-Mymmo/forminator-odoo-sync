/**
 * Sales Insight Explorer Module
 * 
 * Data-driven exploration system for sales insights based on dynamic Odoo models.
 * 
 * @module modules/sales-insight-explorer
 */

import { routes } from './routes.js';

export default {
  code: 'sales_insight_explorer',
  name: 'Sales Insight Explorer',
  description: 'Schema-driven query builder for Odoo data exploration and export',
  route: '/insights',
  icon: 'database',
  isActive: true,
  
  routes
};
