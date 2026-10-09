/**
 * Dashboards — Routes
 *
 * ─── Endpoint map ───────────────────────────────────────────────────────────
 *
 *  UI
 *    GET  /                     → Full-page UI (public/dashboards.html)
 *
 *  API (authenticated — iedereen met module-toegang)
 *    GET  /api/aanvragen        → Tab "Aanvragen" (terrein van David): zie lib/aanvragen/index.js. Alle queryparameters gaan door.
 *    GET  /api/targets          → Instelbaar maand-venster (?monthsBack=5&monthsAhead=6&scope=...)
 *    POST /api/targets/batch    → Meerdere maand-targets in één keer opslaan (body: {scope, items: [{periodMonth, targetValue}]})
 *    GET  /api/web-visits       → Tab "Website-bezoeken": compacte sessies uit D1 (?period=7d|30d|90d|12m)
 *    GET  /api/aanvragen-kaart  → Tab "Kaart": aanvragen per postcode (?period=30d|90d|12m|alles)
 *    *    /api/sales*          → Tabs "Verkoop" en "Targets": zie lib/sales/routes.js
 *    *    /api/marketing/*     → Tab "Marketing" (voorheen de module Webgedrag): zie lib/marketing-routes.js
 *
 * @module modules/dashboards/routes
 */
import { getAanvragen } from './lib/aanvragen/index.js';
import { VALID_SCOPES } from './lib/lead-kanalen.js';
import { listTargetWindow, upsertTargets } from './lib/targets.js';
import { getWebVisitsCached, WEB_PERIODS } from './lib/web-visits.js';
import { getWebAttributionCached } from './lib/web-attribution.js';
import { loadExclusions, dropExcluded } from '../web-story/lib/exclusions.js';
import { getAanvragenKaart, normalizeKaartPeriode } from './lib/aanvragen-kaart.js';
import { salesRoutes } from './lib/sales/routes.js';
import { marketingRoutes } from './lib/marketing-routes.js';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    // Nooit cachen -- dit is live Odoo-data, bedoeld om bij elke lading de
    // actuele stand te tonen. Geen Cache API/KV in dit pad, dus dit is puur
    // defensief tegen browser-/edge-caching op de GET-response zelf.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function readScope(url) {
  const scope = url.searchParams.get('scope');
  return VALID_SCOPES.includes(scope) ? scope : 'all';
}

export const routes = {

  // ── Verkoop en Targets (D1 om-sales) ─────────────────────────────────────
  ...salesRoutes,

  // ── Marketing (D1 van de website-tracker; voorheen de module Webgedrag) ──
  ...marketingRoutes,

  // ── UI ────────────────────────────────────────────────────────────────────
  'GET /': async (context) => {
    return context.env.ASSETS.fetch(new Request(new URL('/dashboards.html', context.request.url)));
  },

  // ── Kaart: de aanvragen per postcode ─────────────────────────────────────
  // Enkel koppelingen met een postcodeveld in hun formulier; zie
  // lib/aanvragen-kaart.js voor wat er wel en niet meetelt.
  'GET /api/aanvragen-kaart': async ({ env, request }) => {
    const url = new URL(request.url);
    const periode = normalizeKaartPeriode(url.searchParams.get('period'));
    try {
      const data = await getAanvragenKaart(env, { periode });
      return json({ success: true, data });
    } catch (err) {
      console.error('[dashboards] aanvragen-kaart', err);
      return json({ success: false, error: err.message || String(err) }, 500);
    }
  },

  // ── Aanvragen: het terrein van David ─────────────────────────────────────
  // De route geeft ALLE queryparameters door; wat er gelezen en berekend wordt,
  // staat in lib/aanvragen/ (read-only, via lib/aanvragen-bronnen.js). Zo vraagt
  // een nieuwe filter of een nieuw stuk van het antwoord geen wijziging hier.
  'GET /api/aanvragen': async ({ env, request }) => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    try {
      return json({ success: true, data: await getAanvragen(env, params) });
    } catch (error) {
      console.error('aanvragen fout:', error);
      return json({ success: false, error: error.message || 'Onbekende fout' }, 500);
    }
  },

  // ── Website-bezoeken (D1 van de website-tracker) ─────────────────────────
  // Geen no-store-uitzondering nodig: de response zelf wordt niet gecachet; de
  // berekening wel, 10 minuten in de edge-cache (lib/web-visits.js). Wie onder
  // Marketing -> Instellingen uitgesloten is, gaat er NA de cache uit (web-story/lib/exclusions.js).
  'GET /api/web-visits': async ({ env, request, ctx }) => {
    const url = new URL(request.url);
    const period = WEB_PERIODS[url.searchParams.get('period')] ? url.searchParams.get('period') : '30d';
    try {
      const [data, excl] = await Promise.all([getWebVisitsCached(env, ctx, { period }), loadExclusions(env)]);
      return json({ success: true, data: dropExcluded(data, excl) });
    } catch (error) {
      console.error('web-visits fout:', error);
      return json({ success: false, error: error.message || 'Onbekende fout' }, 500);
    }
  },

  // Wat leidde tot de conversie: per persoon, over de hele historiek (lib/web-attribution.js).
  'GET /api/web-attribution': async ({ env, request, ctx }) => {
    const url = new URL(request.url);
    const period = WEB_PERIODS[url.searchParams.get('period')] ? url.searchParams.get('period') : '30d';
    try {
      const excl = await loadExclusions(env);
      return json({ success: true, data: await getWebAttributionCached(env, ctx, { period, excl }) });
    } catch (error) {
      console.error('web-attribution fout:', error);
      return json({ success: false, error: error.message || 'Onbekende fout' }, 500);
    }
  },

  // ── Targets ──────────────────────────────────────────────────────────────
  'GET /api/targets': async ({ env, request }) => {
    const url = new URL(request.url);
    const monthsBackParam = Number.parseInt(url.searchParams.get('monthsBack'), 10);
    const monthsAheadParam = Number.parseInt(url.searchParams.get('monthsAhead'), 10);
    const monthsBack = Number.isFinite(monthsBackParam) ? Math.min(Math.max(monthsBackParam, 0), 24) : 5;
    const monthsAhead = Number.isFinite(monthsAheadParam) ? Math.min(Math.max(monthsAheadParam, 0), 24) : 6;
    const scope = readScope(url);

    try {
      const months = await listTargetWindow(env, { scope, monthsBack, monthsAhead });
      return json({ success: true, data: { months, scope } });
    } catch (error) {
      console.error('targets ophalen fout:', error);
      return json({ success: false, error: error.message || 'Onbekende fout' }, 500);
    }
  },

  // Eén druk op "Opslaan" in de widget slaat alle (gewijzigde) maandrijen in
  // één keer op -- vandaar één batch-endpoint i.p.v. per-rij POST-calls.
  'POST /api/targets/batch': async ({ env, request, user }) => {
    try {
      const body = await request.json();
      const scope = VALID_SCOPES.includes(body.scope) ? body.scope : 'all';
      const saved = await upsertTargets(env, {
        scope,
        items: Array.isArray(body.items) ? body.items : [],
        userId: user?.id ?? null
      });
      return json({ success: true, data: { saved } });
    } catch (error) {
      console.error('targets batch-opslaan fout:', error);
      return json({ success: false, error: error.message || 'Onbekende fout' }, 400);
    }
  }
};
