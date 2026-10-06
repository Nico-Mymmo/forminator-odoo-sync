/**
 * Routes van de tabbladen Verkoop en Targets (ingevoegd in ../../routes.js).
 *
 *   GET    /api/sales               de feiten (derive.js), uit de cache tot de volgende sync
 *   GET    /api/sales/status        hoe vers is D1, per model
 *   POST   /api/sales/sync          nu synchroniseren (beheerder); {full:true} = ook verwijderingen nakijken
 *   GET    /api/sales/targets       ?from=YYYY-MM-01&to=YYYY-MM-01 -> productdoelen + aanvraagdoelen
 *   POST   /api/sales/targets       {items:[{metric, scope?, month, value|null}]}
 *   POST   /api/sales/settings      {key, value}
 *   POST   /api/sales/exclusions    {kind, recordId, scope, label, reason}   (beheerder)
 *   DELETE /api/sales/exclusions/:id                                        (beheerder)
 *   POST   /api/sales/planned       {id?, name, start_month, plots, mrr, odoo_partner_id, note}
 *   DELETE /api/sales/planned/:id
 */

import { getSalesFactsCached, PRODUCT_TARGETS, snapshotRows, deriveSalesFacts } from './derive.js';
import { runSalesSync, getSalesSyncStatus, writeSnapshot } from './sync.js';
import {
  loadSalesSettings, setSetting, listProductTargets, saveProductTargets,
  addExclusion, deleteExclusion, savePlanned, deletePlanned
} from './settings.js';
import { hasSalesDb } from '../../../../lib/sales-db.js';
import { getSupabaseClient } from '../../../../lib/database.js';

const isAdmin = (user) => user?.role === 'admin';
const MONTH_RE = /^\d{4}-\d{2}-01$/;
const TARGET_METRICS = PRODUCT_TARGETS.map((p) => p.key);
// De aanvraagdoelen van het tabblad Aanvragen staan in dezelfde tabel; Targets
// mag ze schrijven ("benodigde MQL's overnemen"), met hun eigen scope.
const LEADS_METRIC = 'leads_instroom';
const LEADS_SCOPES = ['all', 'openvme', 'syndicoach'];

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
const fail = (err, status) => json({ success: false, error: err.message || String(err) }, status || 500);

/** Sync + de momentopname van vandaag. Ook gebruikt door de cron in index.js. */
export async function runSalesCron(env, { full = false, force = false } = {}) {
  const result = await runSalesSync(env, { full, force });
  if (result.skipped) return result;
  try {
    const settings = await loadSalesSettings(env);
    const facts = await deriveSalesFacts(env, settings);
    if (facts.configured) result.snapshot = await writeSnapshot(env, facts.meta.today, snapshotRows(facts));
  } catch (err) {
    result.snapshot = { error: err.message };
  }
  return result;
}

export const salesRoutes = {
  'GET /api/sales': async ({ env, ctx, user }) => {
    if (!hasSalesDb(env)) return json({ success: true, data: { configured: false } });
    try {
      const settings = await loadSalesSettings(env);
      const facts = await getSalesFactsCached(env, ctx, settings);
      return json({ success: true, data: { ...facts, me: { is_admin: isAdmin(user) }, settingsErrors: settings.errors } });
    } catch (err) {
      console.error('[dashboards][sales]', err);
      return fail(err);
    }
  },

  'GET /api/sales/status': async ({ env, user }) => {
    try {
      return json({ success: true, data: { ...(await getSalesSyncStatus(env)), is_admin: isAdmin(user) } });
    } catch (err) { return fail(err); }
  },

  'POST /api/sales/sync': async ({ env, request, user }) => {
    if (!isAdmin(user)) return json({ success: false, error: 'Alleen voor beheerders' }, 403);
    let body = {};
    try { body = await request.json(); } catch (_) { body = {}; }
    try {
      return json({ success: true, data: await runSalesCron(env, { full: body.full === true, force: body.force === true }) });
    } catch (err) {
      console.error('[dashboards][sales-sync]', err);
      return fail(err);
    }
  },

  'GET /api/sales/targets': async ({ env, request }) => {
    const url = new URL(request.url);
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!MONTH_RE.test(from || '') || !MONTH_RE.test(to || '')) return json({ success: false, error: 'from/to moeten YYYY-MM-01 zijn' }, 400);
    try {
      const products = await listProductTargets(env, TARGET_METRICS, from, to);
      const { data, error } = await getSupabaseClient(env).from('dashboard_targets')
        .select('scope, period_month, target_value').eq('metric', LEADS_METRIC).gte('period_month', from).lte('period_month', to);
      if (error) throw new Error(error.message);
      return json({ success: true, data: {
        products,
        leads: (data || []).map((r) => ({ scope: r.scope, month: r.period_month, value: Number(r.target_value) }))
      } });
    } catch (err) { return fail(err); }
  },

  'POST /api/sales/targets': async ({ env, request, user }) => {
    try {
      const body = await request.json();
      const items = Array.isArray(body.items) ? body.items : [];
      const product = items.filter((i) => i.metric !== LEADS_METRIC);
      const leads = items.filter((i) => i.metric === LEADS_METRIC);
      if (leads.some((i) => !LEADS_SCOPES.includes(i.scope || 'all'))) throw new Error('Onbekende scope voor aanvraagdoelen');
      const out = { products: await saveProductTargets(env, product, TARGET_METRICS, user?.id) };
      for (const scope of LEADS_SCOPES) {
        const part = leads.filter((i) => (i.scope || 'all') === scope);
        if (part.length) out[`leads_${scope}`] = await saveProductTargets(env, part, [LEADS_METRIC], user?.id, scope);
      }
      return json({ success: true, data: out });
    } catch (err) { return fail(err, 400); }
  },

  'POST /api/sales/settings': async ({ env, request, user }) => {
    try {
      const body = await request.json();
      if (body.key !== 'targets.manual_ratios' && !isAdmin(user)) return json({ success: false, error: 'Alleen voor beheerders' }, 403);
      await setSetting(env, body.key, body.value, user?.id);
      return json({ success: true });
    } catch (err) { return fail(err, 400); }
  },

  'POST /api/sales/exclusions': async ({ env, request, user }) => {
    if (!isAdmin(user)) return json({ success: false, error: 'Alleen voor beheerders' }, 403);
    try {
      return json({ success: true, data: await addExclusion(env, await request.json(), user?.id) });
    } catch (err) { return fail(err, 400); }
  },

  'DELETE /api/sales/exclusions/:id': async ({ env, params, user }) => {
    if (!isAdmin(user)) return json({ success: false, error: 'Alleen voor beheerders' }, 403);
    try { await deleteExclusion(env, params.id); return json({ success: true }); } catch (err) { return fail(err, 400); }
  },

  'POST /api/sales/planned': async ({ env, request, user }) => {
    try { return json({ success: true, data: await savePlanned(env, await request.json(), user?.id) }); } catch (err) { return fail(err, 400); }
  },

  'DELETE /api/sales/planned/:id': async ({ env, params }) => {
    try { await deletePlanned(env, params.id); return json({ success: true }); } catch (err) { return fail(err, 400); }
  }
};
