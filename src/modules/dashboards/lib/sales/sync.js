/**
 * Verkoopgegevens: Odoo -> D1 "om-sales".
 *
 * Elk kwartier (index.js, *\/15-tak) en op vraag (POST /dashboards/api/sales/sync).
 * Per model: alles met write_date >= de laatst geziene, gesorteerd op write_date,
 * in pagina's van 500. Upsert op id, dus een tweede keer hetzelfde record lezen
 * kan geen kwaad -- daarom >= en niet >, anders valt een record dat in dezelfde
 * seconde gewijzigd werd als het laatst gelezene stil weg.
 *
 * Eén keer per dag (FULL_EVERY_H) een volledige id-vergelijking: een verwijderd
 * record heeft geen write_date meer en zou anders eeuwig in D1 blijven staan.
 *
 * res.partner telt honderdduizenden contacten. Enkel wie ergens naar verwezen
 * wordt (orders, facturen, leads, actiebladen) en de ouders daarvan komen mee.
 *
 * Na een geslaagde ronde: SALES_VERSION_KEY ophogen (sleutel van de cache in
 * derive.js) en, één keer per dag, de momentopname van de abonnementen.
 */

import { searchRead, executeKw, search } from '../../../../lib/odoo.js';
import { hasSalesDb, readSales, upsertRows, deleteMissing, runSales } from '../../../../lib/sales-db.js';

export const SALES_VERSION_KEY = 'sales:version';
const LOCK_KEY = 'sales:sync:lock';
const LOCK_TTL_S = 900;
const PAGE = 500;
const FULL_EVERY_H = 20;

const m2o = (v) => (Array.isArray(v) ? v[0] : (typeof v === 'number' ? v : null));
const val = (v) => (v === false || v === undefined ? null : v);
const bool = (v) => (v ? 1 : 0);
const ids = (v) => JSON.stringify(Array.isArray(v) ? v : []);

/**
 * Wat er gespiegeld wordt. `row` zet een Odoo-record om naar de kolommen van
 * `columns` (zelfde volgorde). `context` wordt meegegeven aan search_read.
 */
const MODELS = [
  {
    key: 'orders', table: 'orders', model: 'sale.order', domain: [],
    fields: ['name', 'state', 'subscription_state', 'origin_order_id', 'subscription_id', 'partner_id', 'commercial_partner_id',
      'plan_id', 'start_date', 'end_date', 'next_invoice_date', 'first_contract_date', 'date_order', 'close_reason_id',
      'recurring_monthly', 'amount_untaxed', 'user_id', 'team_id', 'opportunity_id', 'x_studio_partner_company_type',
      'create_date', 'write_date'],
    columns: ['id', 'name', 'state', 'sub_state', 'origin_id', 'parent_id', 'partner_id', 'commercial_id', 'plan_id', 'start_date',
      'end_date', 'next_invoice_date', 'first_contract_date', 'date_order', 'close_reason_id', 'recurring_monthly', 'amount_untaxed',
      'user_id', 'team_id', 'opportunity_id', 'company_type_id', 'create_date', 'write_date'],
    row: (r) => [r.id, val(r.name), val(r.state), val(r.subscription_state), m2o(r.origin_order_id), m2o(r.subscription_id), m2o(r.partner_id),
      m2o(r.commercial_partner_id), m2o(r.plan_id), val(r.start_date), val(r.end_date), val(r.next_invoice_date), val(r.first_contract_date),
      val(r.date_order), m2o(r.close_reason_id), r.recurring_monthly || 0, r.amount_untaxed || 0, m2o(r.user_id), m2o(r.team_id),
      m2o(r.opportunity_id), m2o(r.x_studio_partner_company_type), val(r.create_date), val(r.write_date)]
  },
  {
    key: 'order_lines', table: 'order_lines', model: 'sale.order.line', domain: [],
    fields: ['order_id', 'product_id', 'product_uom', 'product_uom_qty', 'price_unit', 'discount', 'price_subtotal', 'recurring_invoice',
      'display_type', 'write_date'],
    columns: ['id', 'order_id', 'product_id', 'uom', 'qty', 'price_unit', 'discount', 'price_subtotal', 'is_recurring', 'display_type', 'write_date'],
    row: (r) => [r.id, m2o(r.order_id), m2o(r.product_id), Array.isArray(r.product_uom) ? r.product_uom[1] : null, r.product_uom_qty || 0,
      r.price_unit || 0, r.discount || 0, r.price_subtotal || 0, bool(r.recurring_invoice), val(r.display_type), val(r.write_date)]
  },
  {
    key: 'order_logs', table: 'order_logs', model: 'sale.order.log', domain: [],
    fields: ['order_id', 'origin_order_id', 'event_type', 'event_date', 'amount_signed', 'recurring_monthly', 'subscription_state', 'write_date'],
    columns: ['id', 'order_id', 'origin_id', 'event_type', 'event_date', 'amount_signed', 'recurring_monthly', 'sub_state'],
    row: (r) => [r.id, m2o(r.order_id), m2o(r.origin_order_id), val(r.event_type), val(r.event_date), r.amount_signed || 0,
      r.recurring_monthly || 0, val(r.subscription_state)]
  },
  {
    key: 'invoices', table: 'invoices', model: 'account.move', domain: [['move_type', 'in', ['out_invoice', 'out_refund']]],
    fields: ['name', 'move_type', 'state', 'payment_state', 'partner_id', 'commercial_partner_id', 'invoice_date', 'invoice_date_due',
      'invoice_origin', 'amount_untaxed_signed', 'amount_total_signed', 'amount_residual', 'invoice_payment_term_id', 'write_date'],
    columns: ['id', 'name', 'move_type', 'state', 'payment_state', 'partner_id', 'commercial_id', 'invoice_date', 'invoice_date_due',
      'invoice_origin', 'amount_untaxed_signed', 'amount_total_signed', 'amount_residual', 'payment_term_id', 'write_date'],
    row: (r) => [r.id, val(r.name), val(r.move_type), val(r.state), val(r.payment_state), m2o(r.partner_id), m2o(r.commercial_partner_id),
      val(r.invoice_date), val(r.invoice_date_due), val(r.invoice_origin), r.amount_untaxed_signed || 0, r.amount_total_signed || 0,
      r.amount_residual || 0, m2o(r.invoice_payment_term_id), val(r.write_date)]
  },
  {
    key: 'invoice_lines', table: 'invoice_lines', model: 'account.move.line',
    domain: [['move_id.move_type', 'in', ['out_invoice', 'out_refund']], ['display_type', '=', 'product']],
    fields: ['move_id', 'product_id', 'quantity', 'price_subtotal', 'sale_line_ids', 'write_date'],
    columns: ['id', 'move_id', 'product_id', 'qty', 'price_subtotal', 'sale_line_ids', 'write_date'],
    row: (r) => [r.id, m2o(r.move_id), m2o(r.product_id), r.quantity || 0, r.price_subtotal || 0, ids(r.sale_line_ids), val(r.write_date)]
  },
  {
    key: 'products', table: 'products', model: 'product.product', domain: [], context: { active_test: false },
    fields: ['product_tmpl_id', 'name', 'recurring_invoice', 'categ_id', 'default_code', 'active', 'write_date'],
    columns: ['id', 'template_id', 'name', 'is_recurring', 'categ', 'default_code', 'active'],
    row: (r) => [r.id, m2o(r.product_tmpl_id), val(r.name), bool(r.recurring_invoice), Array.isArray(r.categ_id) ? r.categ_id[1] : null,
      val(r.default_code), bool(r.active)]
  },
  {
    key: 'leads', table: 'leads', model: 'crm.lead', domain: [], context: { active_test: false },
    fields: ['name', 'type', 'active', 'stage_id', 'lost_reason_id', 'partner_id', 'user_id', 'team_id', 'source_id', 'campaign_id', 'medium_id',
      'x_studio_brand_origin', 'x_studio_lead_channel', 'x_syndicoach_pack', 'x_studio_isexpertlead', 'tag_ids',
      'x_studio_opportunity_actionsheet_ids', 'expected_revenue', 'create_date', 'date_closed', 'date_last_stage_update', 'date_conversion', 'write_date'],
    columns: ['id', 'name', 'type', 'active', 'stage_id', 'lost_reason_id', 'partner_id', 'user_id', 'team_id', 'source_id', 'campaign_id',
      'medium_id', 'brand_origin', 'lead_channel', 'syndicoach_pack', 'is_expert', 'tags', 'actionsheet_ids', 'expected_revenue', 'create_date',
      'date_closed', 'date_last_stage_update', 'date_conversion', 'write_date'],
    row: (r) => [r.id, val(r.name), val(r.type), bool(r.active), m2o(r.stage_id), m2o(r.lost_reason_id), m2o(r.partner_id), m2o(r.user_id),
      m2o(r.team_id), m2o(r.source_id), m2o(r.campaign_id), m2o(r.medium_id), val(r.x_studio_brand_origin), val(r.x_studio_lead_channel),
      val(r.x_syndicoach_pack), bool(r.x_studio_isexpertlead), ids(r.tag_ids), ids(r.x_studio_opportunity_actionsheet_ids),
      r.expected_revenue || 0, val(r.create_date), val(r.date_closed), val(r.date_last_stage_update), val(r.date_conversion), val(r.write_date)]
  },
  {
    key: 'action_sheets', table: 'action_sheets', model: 'x_sales_action_sheet', domain: [], context: { active_test: false },
    fields: ['x_studio_for_company_id', 'x_studio_contact_id', 'x_studio_number_of_apartments', 'x_studio_number_of_plots',
      'x_studio_number_of_co_owners', 'x_studio_current_syndic_type', 'x_studio_hoa_established', 'x_studio_has_commercial_plots',
      'x_studio_as_opportunity_ids', 'x_studio_user_id', 'create_date', 'write_date'],
    columns: ['id', 'company_id', 'contact_id', 'apartments', 'plots', 'co_owners', 'current_syndic_type', 'hoa_established',
      'has_commercial_plots', 'lead_ids', 'user_id', 'create_date', 'write_date'],
    row: (r) => [r.id, m2o(r.x_studio_for_company_id), m2o(r.x_studio_contact_id), val(r.x_studio_number_of_apartments), val(r.x_studio_number_of_plots),
      val(r.x_studio_number_of_co_owners), val(r.x_studio_current_syndic_type), bool(r.x_studio_hoa_established), bool(r.x_studio_has_commercial_plots),
      ids(r.x_studio_as_opportunity_ids), m2o(r.x_studio_user_id), val(r.create_date), val(r.write_date)]
  }
];

const PARTNER = {
  key: 'partners', table: 'partners', model: 'res.partner', context: { active_test: false },
  fields: ['name', 'is_company', 'parent_id', 'commercial_partner_id', 'x_studio_company_type', 'x_studio_contact_type', 'x_studio_company_status',
    'x_studio_current_syndic_type', 'x_studio_number_of_plots', 'x_studio_number_of_apartments', 'x_studio_parent_expert',
    'x_studio_invoiced_by_partner', 'x_studio_non_invoiced_customer', 'lang', 'zip', 'city', 'active', 'create_date', 'write_date',
    'x_syndicoach_pack'],
  columns: ['id', 'name', 'is_company', 'parent_id', 'commercial_id', 'company_type_id', 'contact_type_id', 'company_status', 'current_syndic_type',
    'number_of_plots', 'number_of_apartments', 'parent_expert_id', 'invoiced_by_partner', 'non_invoiced', 'lang', 'zip', 'city', 'active',
    'create_date', 'write_date', 'syndicoach_pack'],
  row: (r) => [r.id, val(r.name), bool(r.is_company), m2o(r.parent_id), m2o(r.commercial_partner_id), m2o(r.x_studio_company_type),
    m2o(r.x_studio_contact_type), val(r.x_studio_company_status), val(r.x_studio_current_syndic_type), val(r.x_studio_number_of_plots),
    val(r.x_studio_number_of_apartments), m2o(r.x_studio_parent_expert), bool(r.x_studio_invoiced_by_partner), bool(r.x_studio_non_invoiced_customer),
    val(r.lang), val(r.zip), val(r.city), bool(r.active), val(r.create_date), val(r.write_date), val(r.x_syndicoach_pack)]
};
// Schema van de partnerrijen. Komt er een kolom bij, verhoog dit: dan haalt de
// volgende ronde ALLE gekende partners opnieuw op, en niet enkel wat in Odoo
// veranderde -- anders blijft de nieuwe kolom leeg tot iemand die partner wijzigt.
const PARTNER_SCHEMA = 2; // 2: syndicoach_pack

// Kleine lijsten: elke ronde volledig opnieuw (samen een paar honderd rijen).
const LOOKUPS = [
  { kind: 'close_reason', model: 'sale.order.close.reason', fields: ['name'] },
  { kind: 'plan', model: 'sale.subscription.plan', fields: ['name'], context: { active_test: false } },
  { kind: 'company_type', model: 'x_company_type', fields: ['x_name'], name: (r) => r.x_name, context: { active_test: false } },
  { kind: 'contact_type', model: 'x_contact_type', fields: ['x_name'], name: (r) => r.x_name, context: { active_test: false } },
  { kind: 'stage', model: 'crm.stage', fields: ['name', 'sequence', 'is_won'], extra: (r) => ({ sequence: r.sequence, is_won: !!r.is_won }) },
  { kind: 'lost_reason', model: 'crm.lost.reason', fields: ['name'], context: { active_test: false } },
  { kind: 'user', model: 'res.users', fields: ['name'], context: { active_test: false } },
  { kind: 'team', model: 'crm.team', fields: ['name'], context: { active_test: false } },
  { kind: 'tag', model: 'crm.tag', fields: ['name'] },
  { kind: 'utm_source', model: 'utm.source', fields: ['name'] },
  { kind: 'utm_campaign', model: 'utm.campaign', fields: ['name'], context: { active_test: false } },
  { kind: 'utm_medium', model: 'utm.medium', fields: ['name'], context: { active_test: false } },
  { kind: 'payment_term', model: 'account.payment.term', fields: ['name'], context: { active_test: false } }
];
const SELECTIONS = [
  ['crm.lead', 'x_studio_brand_origin'], ['crm.lead', 'x_studio_lead_channel'], ['crm.lead', 'x_syndicoach_pack'], ['res.partner', 'x_syndicoach_pack'],
  ['res.partner', 'x_studio_company_status'], ['res.partner', 'x_studio_current_syndic_type'],
  ['x_sales_action_sheet', 'x_studio_current_syndic_type']
];

async function getState(env) {
  const rows = await readSales(env, 'SELECT * FROM sync_state');
  return Object.fromEntries(rows.map((r) => [r.model, r]));
}

async function setState(env, model, patch) {
  const cur = (await readSales(env, 'SELECT * FROM sync_state WHERE model = ?', [model]))[0] || { model };
  const next = { ...cur, ...patch };
  await upsertRows(env, 'sync_state', ['model', 'last_write_date', 'last_run_at', 'last_full_at', 'rows', 'last_error', 'schema'],
    [[model, next.last_write_date || null, next.last_run_at || null, next.last_full_at || null, next.rows || 0, next.last_error || null,
      next.schema || null]], ['model']);
}

function nowUtc() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

/** Alle records van een model met write_date >= since, gepagineerd. */
async function fetchChanged(env, def, since) {
  const domain = [...def.domain];
  if (since) domain.push(['write_date', '>=', since]);
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const part = await searchRead(env, {
      model: def.model, domain, fields: def.fields, limit: PAGE, offset, order: 'write_date asc, id asc', context: def.context
    });
    out.push(...(part || []));
    if (!part || part.length < PAGE) break;
  }
  return out;
}

async function allIds(env, def) {
  return executeKw(env, { model: def.model, method: 'search', args: [def.domain], kwargs: { context: def.context || {} } });
}

async function syncModel(env, def, state, full) {
  const since = full ? null : state?.last_write_date || null;
  const recs = await fetchChanged(env, def, since);
  await upsertRows(env, def.table, def.columns, recs.map(def.row));
  const maxWrite = recs.reduce((m, r) => (r.write_date && r.write_date > m ? r.write_date : m), since || '');
  let removed = 0;
  if (full) removed = await deleteMissing(env, def.table, await allIds(env, def));
  await setState(env, def.key, { last_write_date: maxWrite || since, last_run_at: nowUtc(), rows: recs.length, last_error: null,
    ...(full ? { last_full_at: nowUtc() } : {}) });
  return { read: recs.length, removed };
}

/** Partners: wie ergens naar verwezen wordt, plus de ouders, tot er niets meer bijkomt. */
async function syncPartners(env, full) {
  // Eén query per kolom: D1 weigert een UNION van tien SELECT's
  // ("too many terms in compound SELECT").
  const REFS = [['orders', 'partner_id'], ['orders', 'commercial_id'], ['invoices', 'partner_id'], ['invoices', 'commercial_id'],
    ['leads', 'partner_id'], ['action_sheets', 'company_id'], ['action_sheets', 'contact_id'],
    ['partners', 'parent_id'], ['partners', 'commercial_id'], ['partners', 'parent_expert_id']];
  const wanted = new Set();
  for (const [table, col] of REFS) {
    (await readSales(env, `SELECT DISTINCT ${col} AS id FROM ${table} WHERE ${col} IS NOT NULL`)).forEach((r) => wanted.add(r.id));
  }
  // Ook ELK gebouw en elke professional, met of zonder order of lead. Een gebouw
  // dat via zijn expert gefactureerd wordt heeft geen eigen abonnement en kwam
  // anders nooit in D1 (2026-10-06: 29 van de 290 VME's in beheer). Zonder die
  // gebouwen kan het dashboard niet tonen hoeveel kavels een professional zou
  // moeten factureren. Een paar duizend id's, één aanroep.
  try {
    const ids = await search(env, { model: 'res.partner', domain: ['|', ['x_studio_company_type', '!=', false], ['x_studio_invoiced_by_partner', '=', true]] });
    (ids || []).forEach((id) => wanted.add(id));
  } catch (err) {
    console.error('[sales-sync] gebouwen en professionals', err.message);
  }
  const known = new Set((await readSales(env, 'SELECT id FROM partners')).map((r) => r.id));
  const state = (await getState(env)).partners;
  const since = state?.last_write_date || null;
  const allesOpnieuw = full || !since || state?.schema !== PARTNER_SCHEMA;
  let read = 0, maxWrite = since || '';

  const fetchIds = async (list, extraDomain) => {
    for (let i = 0; i < list.length; i += PAGE) {
      const part = await searchRead(env, {
        model: PARTNER.model, domain: [['id', 'in', list.slice(i, i + PAGE)], ...extraDomain], fields: PARTNER.fields, context: PARTNER.context
      });
      await upsertRows(env, PARTNER.table, PARTNER.columns, (part || []).map(PARTNER.row));
      read += (part || []).length;
      (part || []).forEach((r) => { if (r.write_date && r.write_date > maxWrite) maxWrite = r.write_date; });
      (part || []).forEach((r) => { [m2o(r.parent_id), m2o(r.commercial_partner_id), m2o(r.x_studio_parent_expert)].forEach((x) => x && wanted.add(x)); });
    }
  };

  // Nieuw gerefereerd: volledig ophalen. Twee rondes vangen de ouder van een ouder.
  for (let round = 0; round < 3; round++) {
    const missing = [...wanted].filter((id) => !known.has(id));
    if (!missing.length) break;
    await fetchIds(missing, []);
    missing.forEach((id) => known.add(id));
  }
  // Al gekend: enkel wat veranderde (of alles, bij de dagelijkse ronde).
  await fetchIds([...known], allesOpnieuw ? [] : [['write_date', '>=', since]]);
  await setState(env, 'partners', { last_write_date: maxWrite || since, last_run_at: nowUtc(), rows: read, last_error: null,
    schema: PARTNER_SCHEMA, ...(allesOpnieuw ? { last_full_at: nowUtc() } : {}) });
  return { read };
}

async function syncLookups(env) {
  const rows = [];
  for (const l of LOOKUPS) {
    try {
      const recs = await searchRead(env, { model: l.model, domain: [], fields: l.fields, context: l.context });
      (recs || []).forEach((r) => rows.push([l.kind, String(r.id), l.name ? l.name(r) : r.name, l.extra ? JSON.stringify(l.extra(r)) : null]));
    } catch (err) {
      // Een opzoeklijst die niet leesbaar is (rechten, Studio-model hernoemd)
      // mag de rest van de sync niet tegenhouden: dan staat er "#id" i.p.v. een naam.
      console.error('[sales-sync] lookup', l.kind, err.message);
    }
  }
  // Labels van selectievelden (merk-herkomst, kanaal, pakket, ...): eerst de
  // velden zelf, dan hun waarden. Een veld dat (nog) niet bestaat valt weg.
  const fieldNames = await searchRead(env, { model: 'ir.model.fields', domain: selectionDomain('model', 'name'), fields: ['model', 'name'] });
  const fieldKey = Object.fromEntries((fieldNames || []).map((f) => [f.id, `sel:${f.model}.${f.name}`]));
  const sel = Object.keys(fieldKey).length
    ? await searchRead(env, {
      model: 'ir.model.fields.selection', domain: [['field_id', 'in', Object.keys(fieldKey).map(Number)]], fields: ['field_id', 'value', 'name', 'sequence']
    })
    : [];
  (sel || []).forEach((s) => {
    const k = fieldKey[m2o(s.field_id)];
    if (k) rows.push([k, String(s.value), s.name, JSON.stringify({ sequence: s.sequence })]);
  });
  await upsertRows(env, 'lookups', ['kind', 'id', 'name', 'extra'], rows, ['kind', 'id']);
  return { read: rows.length };
}

/** (model = m AND name = f) OR ... in Odoo's prefixnotatie. */
function selectionDomain(modelField, nameField) {
  const parts = SELECTIONS.map(([m, f]) => ['&', [modelField, '=', m], [nameField, '=', f]]);
  return [...Array(parts.length - 1).fill('|'), ...parts.flat()];
}

/**
 * Eén ronde. `full` dwingt de volledige vergelijking af; anders gebeurt die
 * vanzelf zodra de vorige ouder is dan FULL_EVERY_H uur.
 * @returns {Promise<object>} per model hoeveel er gelezen/verwijderd werd
 */
export async function runSalesSync(env, { full = false, force = false } = {}) {
  if (!hasSalesDb(env)) return { skipped: 'SALES_DB ontbreekt' };
  if (!force && env.MAPPINGS_KV) {
    const lock = await env.MAPPINGS_KV.get(LOCK_KEY);
    if (lock) return { skipped: 'een andere ronde loopt al sinds ' + lock };
    await env.MAPPINGS_KV.put(LOCK_KEY, nowUtc(), { expirationTtl: LOCK_TTL_S });
  }
  const started = Date.now();
  const result = {};
  try {
    const state = await getState(env);
    const lastFull = Object.values(state).map((s) => s.last_full_at).filter(Boolean).sort()[0];
    const doFull = full || !lastFull || (Date.now() - Date.parse(lastFull.replace(' ', 'T') + 'Z')) > FULL_EVERY_H * 3600e3;
    result.full = doFull;
    result.lookups = await syncLookups(env);
    for (const def of MODELS) {
      try {
        result[def.key] = await syncModel(env, def, state[def.key], doFull);
      } catch (err) {
        result[def.key] = { error: err.message };
        await setState(env, def.key, { last_run_at: nowUtc(), last_error: String(err.message).slice(0, 500) });
        console.error('[sales-sync]', def.key, err.message);
      }
    }
    try {
      result.partners = await syncPartners(env, doFull);
    } catch (err) {
      result.partners = { error: err.message };
      await setState(env, 'partners', { last_run_at: nowUtc(), last_error: String(err.message).slice(0, 500) });
    }
    if (env.MAPPINGS_KV) await env.MAPPINGS_KV.put(SALES_VERSION_KEY, String(Date.now()));
    result.ms = Date.now() - started;
    return result;
  } finally {
    if (!force && env.MAPPINGS_KV) await env.MAPPINGS_KV.delete(LOCK_KEY);
  }
}

/** Hoe vers is wat er in D1 staat, per model. */
export async function getSalesSyncStatus(env) {
  if (!hasSalesDb(env)) return { configured: false };
  const rows = await readSales(env, 'SELECT * FROM sync_state ORDER BY model');
  return { configured: true, models: rows };
}

/** Eén momentopname per dag (de afgeleide stand, door derive.js aangeleverd). */
export async function writeSnapshot(env, day, chains) {
  const exists = await readSales(env, 'SELECT 1 AS x FROM subscription_snapshots WHERE day = ? LIMIT 1', [day]);
  if (exists.length) return { day, skipped: true };
  await upsertRows(env, 'subscription_snapshots',
    ['day', 'origin_id', 'current_order_id', 'customer_id', 'status', 'mrr', 'company_type_id', 'plan_id'],
    chains.map((c) => [day, c.id, c.cur, c.cust, c.status, c.mrr, c.ct, c.plan]), ['day', 'origin_id']);
  return { day, rows: chains.length };
}

export { runSales };
