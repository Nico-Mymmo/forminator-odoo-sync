/**
 * CX Automations
 *
 * Beheert geautomatiseerde CX-acties: instelbare vlag-drempelwaarden per CS-fase
 * en een dagelijkse cron die gebouw-inactiviteit bewaakt en flags zet in Odoo.
 */

import { handleGetOdooConfig, handleGetTechnicalBlocks, handleGetThresholds, handleSaveThresholds, handleGetSettings, handleSaveSettings, handleGetLog, handleRunCron, handleGetMergerConfig, handleGetMergerFields, handleSaveMergerConfig, handlePatchLeadPreview, handleFixLeadSearch, handleUpgradeLeadPreview, handleAddFieldExclusions, handleDisableSanitize, handleInlineCheckboxes, handleFixInlineCheckboxes } from './routes.js';

export default {
  code: 'cx_automations',
  name: 'CX Automations',
  description: 'Instelbare vlag-drempelwaarden per CS-fase en cron-beheer',
  route: '/cx-automations',
  icon: 'zap',

  isActive: true,
  requiresAuth: true,

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

    'GET /api/merger-config': handleGetMergerConfig,
    'GET /api/merger-fields': handleGetMergerFields,
    'POST /api/merger-config': handleSaveMergerConfig,
    'POST /api/patch-lead-preview': handlePatchLeadPreview,
    'POST /api/fix-lead-search': handleFixLeadSearch,
    'POST /api/upgrade-lead-preview': handleUpgradeLeadPreview,
    'POST /api/add-field-exclusions': handleAddFieldExclusions,
    'POST /api/disable-sanitize': handleDisableSanitize,
    'POST /api/inline-checkboxes': handleInlineCheckboxes,
    'POST /api/fix-inline-checkboxes': handleFixInlineCheckboxes,
  },
};
