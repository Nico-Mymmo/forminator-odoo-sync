/**
 * Ad & Sales Campaigns
 *
 * Funnel -> swimlane (één user-issue) -> cards (post-its per funnel-stage).
 * Fase 1: puur CRUD, geen AI-assist, geen gedeelde/herbruikbare bibliotheek
 * over funnels heen (bewust uitgesteld, zie sparsessie 2026-07-31).
 */
import { routes } from './routes.js';

export default {
  code: 'campaign_funnels',
  name: 'Ad & Sales Campaigns',
  description: 'Marketing- en salesfunnels: van marktonderzoek tot go-to-market',
  route: '/campaigns',
  icon: 'megaphone',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  routes
};
