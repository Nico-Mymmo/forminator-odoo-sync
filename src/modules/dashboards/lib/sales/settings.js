/**
 * Wat mensen voor de tabbladen Verkoop en Targets in de OM invoeren (Supabase):
 * targets per product, instellingen, uitsluitingen en geplande professionals.
 * Migratie: supabase/migrations/20261005120000_sales_dashboard.sql.
 *
 * Targets delen de tabel dashboard_targets met de aanvragen-widget
 * (lib/targets.js): één tabel, zodat een target overal hetzelfde is. Een
 * productdoel heeft scope 'all' -- het merk zit in het product zelf
 * (PRODUCT_TARGETS in derive.js).
 */

import { getSupabaseClient } from '../../../../lib/database.js';

function db(env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase configuration');
  return getSupabaseClient(env);
}

const MONTH_RE = /^\d{4}-\d{2}-01$/;

/** Alles wat derive.js nodig heeft, in één keer. Een ontbrekende tabel = lege lijst. */
export async function loadSalesSettings(env) {
  const sb = db(env);
  const [settings, exclusions, planned] = await Promise.all([
    sb.from('dashboard_settings').select('key, value'),
    sb.from('sales_exclusions').select('id, kind, record_id, scope, label, reason, created_at').order('created_at'),
    sb.from('sales_planned_professionals').select('id, name, start_month, plots, mrr, odoo_partner_id, note, updated_at').order('start_month')
  ]);
  const s = Object.fromEntries((settings.data || []).map((r) => [r.key, r.value]));
  return {
    fyStartMonth: Number(s['sales.fiscal_year_start_month']) || 9,
    switchWindowDays: Number(s['sales.switch_window_days']) || 30,
    manualRatios: s['targets.manual_ratios'] || null,
    exclusions: exclusions.data || [],
    planned: planned.data || [],
    errors: [settings.error, exclusions.error, planned.error].filter(Boolean).map((e) => e.message)
  };
}

export async function setSetting(env, key, value, userId) {
  const allowed = ['sales.fiscal_year_start_month', 'sales.switch_window_days', 'targets.manual_ratios'];
  if (!allowed.includes(key)) throw new Error('Onbekende instelling: ' + key);
  const { error } = await db(env).from('dashboard_settings')
    .upsert({ key, value, updated_by: userId || null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

/** Targets van een reeks metrics tussen twee maanden (inclusief), scope 'all'. */
export async function listProductTargets(env, metrics, fromMonth, toMonth) {
  const { data, error } = await db(env).from('dashboard_targets')
    .select('metric, period_month, target_value, updated_at')
    .in('metric', metrics).eq('scope', 'all')
    .gte('period_month', fromMonth).lte('period_month', toMonth);
  if (error) throw new Error('listProductTargets: ' + error.message);
  return (data || []).map((r) => ({ metric: r.metric, month: r.period_month, value: Number(r.target_value), updatedAt: r.updated_at }));
}

/**
 * Meerdere targets in één keer. `value: null` wist de target (een lege cel in
 * de tabel betekent "geen target", niet 0 -- 0 is een bewuste keuze).
 * @param {Array<{metric:string, month:string, value:number|null}>} items
 */
export async function saveProductTargets(env, items, allowedMetrics, userId, scope = 'all') {
  const rows = [], wipe = [];
  for (const it of items || []) {
    if (!allowedMetrics.includes(it.metric)) throw new Error('Onbekende target: ' + it.metric);
    if (!MONTH_RE.test(it.month)) throw new Error('Ongeldige maand: ' + it.month);
    if (it.value === null || it.value === '') { wipe.push(it); continue; }
    const v = Number(it.value);
    if (!Number.isFinite(v) || v < 0) throw new Error(`Ongeldige waarde voor ${it.metric} ${it.month}: ${it.value}`);
    rows.push({ metric: it.metric, scope, period_month: it.month, target_value: Math.round(v * 100) / 100,
      updated_by: userId || null, updated_at: new Date().toISOString() });
  }
  const sb = db(env);
  if (rows.length) {
    const { error } = await sb.from('dashboard_targets').upsert(rows, { onConflict: 'metric,scope,period_month' });
    if (error) throw new Error('saveProductTargets: ' + error.message);
  }
  for (const w of wipe) {
    const { error } = await sb.from('dashboard_targets').delete().eq('metric', w.metric).eq('scope', scope).eq('period_month', w.month);
    if (error) throw new Error('saveProductTargets (wissen): ' + error.message);
  }
  return { saved: rows.length, cleared: wipe.length };
}

export async function addExclusion(env, { kind, recordId, scope = 'all', label, reason }, userId) {
  if (!['partner', 'order'].includes(kind)) throw new Error('kind moet partner of order zijn');
  if (!Number.isInteger(Number(recordId))) throw new Error('recordId ontbreekt');
  if (!String(reason || '').trim()) throw new Error('Een reden is verplicht: zonder reden weet straks niemand waarom een cijfer is wat het is.');
  const { data, error } = await db(env).from('sales_exclusions')
    .upsert({ kind, record_id: Number(recordId), scope, label: label || null, reason: String(reason).trim(), created_by: userId || null },
      { onConflict: 'kind,record_id,scope' })
    .select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteExclusion(env, id) {
  const { error } = await db(env).from('sales_exclusions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function savePlanned(env, item, userId) {
  const row = {
    name: String(item.name || '').trim(),
    start_month: item.start_month,
    plots: Math.max(0, Number.parseInt(item.plots, 10) || 0),
    mrr: Math.max(0, Number(item.mrr) || 0),
    odoo_partner_id: item.odoo_partner_id ? Number(item.odoo_partner_id) : null,
    note: item.note ? String(item.note) : null,
    updated_at: new Date().toISOString()
  };
  if (!row.name) throw new Error('Naam ontbreekt');
  if (!MONTH_RE.test(row.start_month || '')) throw new Error('Startmaand moet de eerste van een maand zijn (YYYY-MM-01)');
  const sb = db(env);
  const q = item.id
    ? sb.from('sales_planned_professionals').update(row).eq('id', item.id)
    : sb.from('sales_planned_professionals').insert({ ...row, created_by: userId || null });
  const { data, error } = await q.select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deletePlanned(env, id) {
  const { error } = await db(env).from('sales_planned_professionals').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
