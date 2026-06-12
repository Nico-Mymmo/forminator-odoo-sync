/**
 * Activity Enrichment — twee-fase
 *
 * Haalt open/geplande activiteiten (mail.activity) op voor een batch actiebladen.
 *
 * ARCHITECTUUR:
 * - Fase 1: primaire query → actieblad-IDs
 * - Fase 2: mail.activity met domain [['res_model','=','x_sales_action_sheet'],
 *           ['res_id','in', ids]]
 *
 * Lean output: activity_type_id, date_deadline, summary, state, user_id
 * Bewust NIET opgenomen: note (html), calendar_event_id, attachment_ids
 *
 * Resultaat: actieblad-record krijgt __activities veld (array).
 *
 * Relevante activiteitstypen bij mymmo:
 *   Call(2), To-Do(4), Email(1), Calendly Ondersteuning(16)
 *
 * @module modules/sales-insight-explorer/lib/activity-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';

/**
 * Lean velden die we ophalen per activiteit
 */
const LEAN_ACTIVITY_FIELDS = ['id', 'res_id', 'activity_type_id', 'date_deadline', 'summary', 'state', 'user_id'];

/**
 * Enrich actiebladen met activiteiten
 *
 * @param {Array}  actionSheets  - Primaire query resultaten
 * @param {Object} config        - Configuratie
 * @param {boolean} config.enabled
 * @param {boolean} config.include_done    - Afgeronde activiteiten ook meenemen (default: false)
 * @param {Array}   config.states          - Filter op state (default: open + overdue)
 * @param {Object}  env
 * @param {Array}   notes
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichWithActivities(records, config, env, notes) {
  const startTime = Date.now();
  const includeDone = config.include_done ?? false;
  const stateFilter = config.states ?? ['today', 'planned', 'overdue'];
  const odooModel = config.odoo_model ?? 'x_sales_action_sheet';

  notes.push(`📋 Activity enrichment (${odooModel}): states=${stateFilter.join(', ')}, include_done=${includeDone}`);

  if (!records.length) {
    return { records, meta: { count: 0, execution_time_ms: 0 } };
  }

  const recordIds = records.map(r => r.id);

  const domain = [
    ['res_model', '=', odooModel],
    ['res_id', 'in', recordIds]
  ];

  if (!includeDone) {
    domain.push(['state', 'in', stateFilter]);
  }

  const activities = await searchRead(env, {
    model: 'mail.activity',
    domain,
    fields: LEAN_ACTIVITY_FIELDS,
    order: 'date_deadline asc',
    limit: false
  });

  notes.push(`mail.activity: ${activities.length} activiteiten opgehaald`);

  const activitiesByRecordId = new Map();
  for (const act of activities) {
    const rid = act.res_id;
    if (!activitiesByRecordId.has(rid)) activitiesByRecordId.set(rid, []);
    activitiesByRecordId.get(rid).push({
      id: act.id,
      type: act.activity_type_id,
      deadline: act.date_deadline,
      summary: act.summary,
      state: act.state,
      user: act.user_id
    });
  }

  const enriched = records.map(r => ({
    ...r,
    __activities: activitiesByRecordId.get(r.id) ?? []
  }));

  const meta = {
    execution_method: 'two_phase_activities',
    odoo_model: odooModel,
    total_activities_fetched: activities.length,
    records_with_activities: activitiesByRecordId.size,
    include_done: includeDone,
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Activity enrichment klaar: ${activitiesByRecordId.size}/${records.length} records hebben activiteiten`);

  return { records: enriched, meta };
}
