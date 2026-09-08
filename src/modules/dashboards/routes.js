/**
 * Dashboards — Routes
 *
 * ─── Endpoint map ───────────────────────────────────────────────────────────
 *
 *  UI
 *    GET  /                     → Full-page UI (public/dashboards.html)
 *
 *  API (authenticated — iedereen met module-toegang)
 *    GET  /api/leads-instroom   → Instroom-widget data (?period=30d|6m)
 *
 * @module modules/dashboards/routes
 */
import { getInstroomData } from './lib/leads-instroom.js';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    // Nooit cachen -- dit is live Odoo-data, bedoeld om bij elke lading de
    // actuele stand te tonen. Geen Cache API/KV in dit pad, dus dit is puur
    // defensief tegen browser-/edge-caching op de GET-response zelf.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export const routes = {

  // ── UI ────────────────────────────────────────────────────────────────────
  'GET /': async (context) => {
    return context.env.ASSETS.fetch(new Request(new URL('/dashboards.html', context.request.url)));
  },

  // ── Instroom-widget ──────────────────────────────────────────────────────
  'GET /api/leads-instroom': async ({ env, request }) => {
    const url = new URL(request.url);
    const periodParam = url.searchParams.get('period');
    const period = periodParam === '6m' ? '6m' : '30d';

    try {
      const data = await getInstroomData(env, { period });
      return json({ success: true, data });
    } catch (error) {
      console.error('leads-instroom fout:', error);
      return json({ success: false, error: error.message || 'Onbekende fout' }, 500);
    }
  }
};
