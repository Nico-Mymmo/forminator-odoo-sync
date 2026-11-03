/**
 * CX Automations
 *
 * Beheert geautomatiseerde CX-acties: instelbare vlag-drempelwaarden per CS-fase
 * en een dagelijkse cron die gebouw-inactiviteit bewaakt en flags zet in Odoo.
 */

import { runOpvolgingCron } from './opvolging/paneel.js';
import { leesSequentie, bewaarSequentie, STANDAARD } from './opvolging/sequentie.js';
import { lijstBerichten, bewaarBericht, verwijderBericht, voorbeeldBericht, verplaatsBericht, lijstGroepen, maakGroep, hernoemGroep, verwijderGroep, TOKENS, MERKEN, TALEN } from './opvolging/berichten.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
async function veilig(fn) {
  try { return json({ success: true, data: await fn() }); }
  catch (err) { return json({ success: false, error: err.message }, err.status || 500); }
}
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

    // Opvolging: alle controlepanelen op de kansen in Odoo nu opnieuw schrijven.
    'POST /api/opvolging/panelen': async ({ env }) => {
      const stats = await runOpvolgingCron(env, { force: true });
      return new Response(JSON.stringify({ success: !!stats, data: stats, mode: env.OPVOLGING_PANEEL_MODE || '' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },

    // Opvolging: de sequentie (sequentie.js) lezen en bewaren.
    'GET /api/opvolging/sequentie': async ({ env }) => {
      const data = await leesSequentie(env, { vers: true });
      return new Response(JSON.stringify({ success: true, data, standaard: STANDAARD }), { headers: { 'Content-Type': 'application/json' } });
    },
    'PUT /api/opvolging/sequentie': async ({ env, user, request }) => {
      try {
        const data = await bewaarSequentie(env, await request.json(), user?.full_name || user?.email);
        return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: err.status || 500, headers: { 'Content-Type': 'application/json' },
        });
      }
    },

    // Opvolging: de berichtteksten (opvolging/berichten.js).
    'GET /api/opvolging/berichten': ({ env }) => veilig(async () => ({
      berichten: await lijstBerichten(env), groepen: await lijstGroepen(env), tokens: TOKENS, merken: MERKEN, talen: TALEN,
    })),
    'POST /api/opvolging/berichten': async ({ env, user, request }) =>
      veilig(async () => bewaarBericht(env, null, await request.json(), user?.full_name || user?.email)),
    'PUT /api/opvolging/berichten/:id': async ({ env, user, request, params }) =>
      veilig(async () => bewaarBericht(env, params.id, await request.json(), user?.full_name || user?.email)),
    'PUT /api/opvolging/berichten/:id/groep': async ({ env, request, params }) =>
      veilig(async () => verplaatsBericht(env, params.id, (await request.json()).groep_id)),
    'POST /api/opvolging/bericht-groepen': async ({ env, request }) => veilig(async () => maakGroep(env, await request.json())),
    'PUT /api/opvolging/bericht-groepen/:id': async ({ env, request, params }) => veilig(async () => hernoemGroep(env, params.id, await request.json())),
    'DELETE /api/opvolging/bericht-groepen/:id': ({ env, params }) => veilig(async () => verwijderGroep(env, params.id)),
    'DELETE /api/opvolging/berichten/:id': ({ env, params }) =>
      veilig(async () => { await verwijderBericht(env, params.id); return { id: params.id }; }),
    'POST /api/opvolging/berichten/voorbeeld': async ({ env, request }) => veilig(async () => {
      const b = await request.json();
      // Een kansnummer, of een link uit Odoo (…#id=11937&… of …/crm/11937).
      const kans = String(b.kans || '');
      const m = kans.match(/[?#&]id=(\d+)/) || kans.match(/(\d+)\D*$/);
      const leadId = m ? Number.parseInt(m[1], 10) : null;
      return voorbeeldBericht(env, { onderwerp: b.onderwerp, tekst_html: b.tekst_html, leadId, taal: b.taal || null });
    }),

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
