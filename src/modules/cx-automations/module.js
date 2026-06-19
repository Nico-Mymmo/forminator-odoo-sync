/**
 * CX Automations
 *
 * Beheert geautomatiseerde CX-acties: instelbare vlag-drempelwaarden per CS-fase
 * en een dagelijkse cron die gebouw-inactiviteit bewaakt en flags zet in Odoo.
 */

import { handleGetOdooConfig, handleGetTechnicalBlocks, handleGetThresholds, handleSaveThresholds, handleGetSettings, handleSaveSettings, handleGetLog, handleRunCron } from './routes.js';

export default {
  code: 'cx_automations',
  name: 'CX Automations',
  description: 'Instelbare vlag-drempelwaarden per CS-fase en cron-beheer',
  route: '/cx-automations',
  icon: 'zap',

  isActive: true,
  requiresAuth: true,
  requiresAdmin: true,

  routes: {
    'GET /': async (context) => {
      const html = await context.env.ASSETS.fetch(
        new Request(new URL('/cx-automations.html', context.request.url))
      );
      return new Response(await html.text(), {
        headers: { 'Content-Type': 'text/html' },
      });
    },

    'GET /api/odoo-config': handleGetOdooConfig,
    'GET /api/technical-blocks': handleGetTechnicalBlocks,
    'GET /api/thresholds': handleGetThresholds,
    'POST /api/thresholds': handleSaveThresholds,
    'GET /api/settings': handleGetSettings,
    'POST /api/settings': handleSaveSettings,
    'GET /api/log': handleGetLog,
    'POST /api/run-cron': handleRunCron,
  },
};
