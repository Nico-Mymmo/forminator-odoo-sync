/**
 * Dashboards — Routes
 *
 * ─── Endpoint map ───────────────────────────────────────────────────────────
 *
 *  UI
 *    GET  /                     → Full-page UI (public/dashboards.html)
 *
 *  API (authenticated — iedereen met module-toegang)
 *    GET  /api/leads-instroom   → Instroom-widget data (?period=30d|3m|6m|12m&scope=all|syndicoach|openvme|onbekend)
 *    GET  /api/targets          → Instelbaar maand-venster (?monthsBack=5&monthsAhead=6&scope=...)
 *    POST /api/targets/batch    → Meerdere maand-targets in één keer opslaan (body: {scope, items: [{periodMonth, targetValue}]})
 *    GET  /api/web-visits       → Tab "Website-bezoeken": compacte sessies uit D1 (?period=7d|30d|90d|12m)
 *
 * @module modules/dashboards/routes
 */
import { getInstroomData, normalizePeriod, buildBuckets, buildTargetWindows } from './lib/leads-instroom.js';
import { listTargetWindow, getTargetsForMonths, buildTargetTrend, upsertTargets } from './lib/targets.js';
import { getWebVisitsCached, WEB_PERIODS } from './lib/web-visits.js';
import { getWebAttributionCached } from './lib/web-attribution.js';

const VALID_SCOPES = ['all', 'syndicoach', 'openvme', 'onbekend'];

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

/**
 * Alle kalendermaand-sleutels (YYYY-MM-01) die overlappen met [start, end).
 * Gebruikt om vooraf de juiste rijen bij Supabase op te vragen (getTargetsForMonths)
 * vóór sumProratedTarget() de eigenlijke dag-per-dag optelling doet.
 */
function monthKeysInRange(start, end) {
  const keys = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor.getTime() <= last.getTime()) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`);
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return keys;
}

/** '2026-09-01' -> '2026-08-01' (shift -1) of '2026-10-01' (shift +1). */
function shiftMonthKey(monthKey, deltaMonths) {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export const routes = {

  // ── UI ────────────────────────────────────────────────────────────────────
  'GET /': async (context) => {
    return context.env.ASSETS.fetch(new Request(new URL('/dashboards.html', context.request.url)));
  },

  // ── Instroom-widget ──────────────────────────────────────────────────────
  'GET /api/leads-instroom': async ({ env, request }) => {
    const url = new URL(request.url);
    const period = normalizePeriod(url.searchParams.get('period'));
    const scope = readScope(url);

    try {
      const data = await getInstroomData(env, { period, scope });

      // Marketingbenchmark: per dag geprorateerd op de maand-target van die
      // dag (target_value / dagen in die maand), zodat een rollend 30-
      // dagen-venster (dat meestal 2 kalendermaanden overlapt) én een 6-
      // maanden-venster allebei een eerlijke vergelijking krijgen. Zie
      // lib/targets.js — sumProratedTarget() voor de volledige uitleg.
      // Targets zijn scope-gebonden: bij "Syndicoach" gefilterd vergelijken
      // we tegen het Syndicoach-target, niet tegen het totaal-target.
      const rangeStart = new Date(data.range.start.replace(' ', 'T') + 'Z');
      const rangeEnd = new Date(data.range.end.replace(' ', 'T') + 'Z');
      const monthKeys = monthKeysInRange(rangeStart, rangeEnd);
      // Eén maand vóór en na de weergegeven periode meevragen: buildTargetTrend
      // interpoleert tussen maand-MIDDENS, dus die extra maanden maken de
      // curve net aan het begin/einde van de periode vloeiend i.p.v. daar
      // plat te extrapoleren vanaf de eerste/laatste maand die in beeld is.
      const paddedMonthKeys = [monthKeys[0], ...monthKeys, monthKeys[monthKeys.length - 1]]
        .map((key, idx) => (idx === 0 ? shiftMonthKey(key, -1) : idx === monthKeys.length + 1 ? shiftMonthKey(key, 1) : key));
      const targetsByMonth = await getTargetsForMonths(env, { scope, periodMonths: [...new Set(paddedMonthKeys)] });
      data.target = buildTargetTrend(targetsByMonth, rangeStart, rangeEnd, monthKeys);

      // De grafieken VOLGEN de periodetoggle (Nico, 2026-09-28) -- dat
      // vervangt het vaste rollende venster over de voorbije 2 jaar.
      //  - series: staafgrafiek per kanaal, per dag/week/maand (PERIOD_GRANULARITY)
      //  - targetWindows: realisatie tegen target, ALTIJD per maand -- een
      //    target per dag of per week wordt bewust nergens getoond.
      const dailyTargets = data.target.value === null ? null : data.target.dailySeries;
      const channelKeys = Object.keys(data.brandLabels);
      data.series = buildBuckets(data.daily, dailyTargets, data.granularity, channelKeys);
      data.targetWindows = buildTargetWindows(data.daily, dailyTargets, data.period, rangeEnd, channelKeys);
      delete data.target.dailySeries;
      delete data.daily; // zit volledig in data.series

      return json({ success: true, data });
    } catch (error) {
      console.error('leads-instroom fout:', error);
      return json({ success: false, error: error.message || 'Onbekende fout' }, 500);
    }
  },

  // ── Website-bezoeken (D1 van de website-tracker) ─────────────────────────
  // Geen no-store-uitzondering nodig: de response zelf wordt niet gecachet; de
  // berekening wel, 10 minuten in de edge-cache (lib/web-visits.js).
  'GET /api/web-visits': async ({ env, request, ctx }) => {
    const url = new URL(request.url);
    const period = WEB_PERIODS[url.searchParams.get('period')] ? url.searchParams.get('period') : '30d';
    try {
      const data = await getWebVisitsCached(env, ctx, { period });
      return json({ success: true, data });
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
      return json({ success: true, data: await getWebAttributionCached(env, ctx, { period }) });
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
