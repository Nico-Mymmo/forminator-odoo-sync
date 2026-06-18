/**
 * Lead → Web Visitor Enrichment
 *
 * Haalt x_web_visitor records op voor leads die al in __leads-arrays zitten
 * (na lead enrichment). Werkt op elk basismodel dat __leads heeft.
 *
 * Koppelingslogica:
 *   x_web_visitor.x_studio_lead_ids (many2many → crm.lead) — reverse lookup
 *   domain: [['x_studio_lead_ids', 'in', leadIds]]
 *
 * Output:
 *   elke lead in record.__leads krijgt: __visitors: [{ id, naam, email, ... }]
 *   elke visitor krijgt optioneel:      __touchpoints: [{ id, ... }]
 *
 * @module modules/sales-insight-explorer/lib/lead-visitor-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';
import { enrichVisitorsWithTouchpoints } from './visitor-touchpoint-enrichment.js';

/**
 * Visitor-velden voor gestructureerde output (geen HTML blobs).
 * Gebaseerd op x_web_visitor model — geverifieerd juni 2026.
 */
const VISITOR_FIELDS = [
  'id',
  'x_name',
  'x_studio_email',
  'x_studio_source_site',
  'x_studio_first_seen',
  'x_studio_last_seen',
  'x_studio_session_duration',
  'x_studio_utm_source',
  'x_studio_utm_medium',
  'x_studio_utm_campaign',
  'x_studio_possible_bounce',
  'x_studio_instant_bounce',
  'x_studio_lead_ids'  // vereist voor reverse mapping lead → visitor
];

/**
 * Enrich leads (binnen __leads op elk basismodel-record) met hun web visitors.
 *
 * @param {Array}  records - Basismodel-records; elke record heeft __leads array
 * @param {Object} config
 * @param {boolean} config.enabled
 * @param {Object}  [config.touchpoint_enrichment] - { enabled: boolean }
 * @param {Object}  env
 * @param {Array}   notes
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichLeadsWithVisitors(records, config, env, notes) {
  const startTime = Date.now();
  notes.push('🌐 Lead → Web Visitor enrichment gestart');

  // Verzamel alle leads uit __leads arrays over alle records heen
  const allLeads = [];
  for (const rec of records) {
    if (Array.isArray(rec.__leads)) allLeads.push(...rec.__leads);
  }

  if (!allLeads.length) {
    notes.push('Lead→Visitor: geen leads gevonden, enrichment overgeslagen');
    return {
      records,
      meta: { visitors_fetched: 0, leads_with_visitors: 0, execution_time_ms: Date.now() - startTime }
    };
  }

  const allLeadIds = Array.from(new Set(allLeads.map(l => l.id)));
  notes.push(`Lead→Visitor: ${allLeadIds.length} unieke lead-IDs verzameld uit ${allLeads.length} leads`);

  // Reverse lookup: bezoekers die gelinkt zijn aan minstens één van onze lead-IDs
  const visitorDomain = [['x_studio_lead_ids', 'in', allLeadIds]];
  const vf = config.filters || {};
  if (vf.possible_bounce === 'exclude')      visitorDomain.push(['x_studio_possible_bounce', '=', false]);
  else if (vf.possible_bounce === 'only')    visitorDomain.push(['x_studio_possible_bounce', '=', true]);
  if (vf.instant_bounce === 'exclude')       visitorDomain.push(['x_studio_instant_bounce', '=', false]);
  else if (vf.instant_bounce === 'only')     visitorDomain.push(['x_studio_instant_bounce', '=', true]);
  if (vf.possible_bounce || vf.instant_bounce) notes.push(`Visitor bounce-filter: possible=${vf.possible_bounce || 'include'}, instant=${vf.instant_bounce || 'include'}`);

  const rawVisitors = await searchRead(env, {
    model: 'x_web_visitor',
    domain: visitorDomain,
    fields: VISITOR_FIELDS,
    limit: false
  });

  notes.push(`x_web_visitor: ${rawVisitors.length} bezoekers opgehaald`);

  if (!rawVisitors.length) {
    notes.push('Lead→Visitor: geen bezoekers gevonden voor deze leads');
    return {
      records,
      meta: { visitors_fetched: 0, leads_with_visitors: 0, execution_time_ms: Date.now() - startTime }
    };
  }

  // Optionele touchpoint enrichment
  let enrichedVisitors = rawVisitors;
  if (config.touchpoint_enrichment?.enabled) {
    const tpResult = await enrichVisitorsWithTouchpoints(rawVisitors, config.touchpoint_enrichment, env, notes);
    enrichedVisitors = tpResult.records;
  }

  // Bouw reverse map: leadId → [visitors]
  // x_studio_lead_ids bevat de IDs van de leads waaraan de visitor gelinkt is
  const visitorsByLeadId = new Map();
  for (const visitor of enrichedVisitors) {
    const linkedLeadIds = Array.isArray(visitor.x_studio_lead_ids) ? visitor.x_studio_lead_ids : [];
    for (const lid of linkedLeadIds) {
      if (!visitorsByLeadId.has(lid)) visitorsByLeadId.set(lid, []);
      visitorsByLeadId.get(lid).push(visitor);
    }
  }

  // Koppel __visitors aan elke lead — alleen als er bezoekers zijn voor die lead
  let leadsWithVisitors = 0;
  const enrichedRecords = records.map(rec => {
    if (!Array.isArray(rec.__leads)) return rec;
    const enrichedLeads = rec.__leads.map(lead => {
      const visitors = visitorsByLeadId.get(lead.id);
      if (!visitors || !visitors.length) return lead; // geen bezoekers → veld niet toevoegen
      leadsWithVisitors++;
      return { ...lead, __visitors: visitors };
    });
    return { ...rec, __leads: enrichedLeads };
  });

  const meta = {
    execution_method: 'lead_visitor_enrichment',
    total_leads: allLeads.length,
    unique_lead_ids: allLeadIds.length,
    visitors_fetched: rawVisitors.length,
    leads_with_visitors: leadsWithVisitors,
    touchpoints_enabled: !!config.touchpoint_enrichment?.enabled,
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Lead→Visitor klaar: ${rawVisitors.length} bezoekers, ${leadsWithVisitors}/${allLeads.length} leads gekoppeld`);
  return { records: enrichedRecords, meta };
}
