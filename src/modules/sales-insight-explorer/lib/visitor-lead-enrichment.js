/**
 * Visitor → Lead Enrichment
 *
 * Haalt crm.lead records op voor een set web visitors.
 * Relatie: x_web_visitor.x_studio_lead_ids many2many → crm.lead
 *
 * Output: elke visitor krijgt __leads: [{ id, name, partner_id, stage_id, ... }]
 *
 * @module modules/sales-insight-explorer/lib/visitor-lead-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';

const LEAD_FIELDS = [
  'id', 'name', 'partner_id', 'stage_id', 'won_status', 'active',
  'create_date', 'date_closed', 'date_last_stage_update',
  'user_id', 'team_id'
];

/**
 * Enrich web visitors met hun CRM leads (via x_studio_lead_ids many2many).
 *
 * @param {Array}  visitors - Primaire query resultaten (x_web_visitor)
 * @param {Object} config   - { enabled: true, filters?: { won_status?: string[] } }
 * @param {Object} env      - Cloudflare worker environment
 * @param {Array}  notes    - Execution notes array (mutated)
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichVisitorsWithLeads(visitors, config, env, notes) {
  const startTime = Date.now();
  notes.push(`🔗 Visitor → Lead enrichment (x_studio_lead_ids): ${visitors.length} bezoekers`);

  if (!visitors.length) {
    return { records: visitors, meta: { count: 0, execution_time_ms: 0 } };
  }

  const visitorIds = visitors.map(v => v.id);

  // Haal x_studio_lead_ids op per visitor (apart van de primaire fields)
  const visitorRels = await searchRead(env, {
    model: 'x_web_visitor',
    domain: [['id', 'in', visitorIds]],
    fields: ['id', 'x_studio_lead_ids'],
    limit: false
  });

  const visitorLeadMap = new Map();
  const allLeadIds = new Set();
  for (const vr of visitorRels) {
    const leadIds = vr.x_studio_lead_ids || [];
    visitorLeadMap.set(vr.id, leadIds);
    leadIds.forEach(id => allLeadIds.add(id));
  }

  notes.push(`x_web_visitor lead-IDs: ${allLeadIds.size} unieke leads voor ${visitorIds.length} bezoekers`);

  if (!allLeadIds.size) {
    return {
      records: visitors.map(v => ({ ...v, __leads: [] })),
      meta: { leads_fetched: 0, visitors_with_leads: 0, execution_time_ms: Date.now() - startTime }
    };
  }

  // Bouw lead-domain
  const leadDomain = [
    ['id', 'in', Array.from(allLeadIds)],
    ['active', 'in', [true, false]]
  ];

  // Optioneel won_status filter
  const wonFilter = config.filters?.won_status;
  if (Array.isArray(wonFilter) && wonFilter.length) {
    leadDomain.push(['won_status', 'in', wonFilter]);
  }

  const leads = await searchRead(env, {
    model: 'crm.lead',
    domain: leadDomain,
    fields: LEAD_FIELDS,
    limit: false
  });

  const leadMap = new Map(leads.map(l => [l.id, l]));

  const enriched = visitors.map(v => ({
    ...v,
    __leads: (visitorLeadMap.get(v.id) || []).map(id => leadMap.get(id)).filter(Boolean)
  }));

  const visitorsWithLeads = [...visitorLeadMap.entries()].filter(([, ids]) => ids.length > 0).length;

  const meta = {
    execution_method: 'visitor_lead_enrichment',
    leads_fetched: leads.length,
    visitors_with_leads: visitorsWithLeads,
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Lead enrichment klaar: ${leads.length} leads, ${visitorsWithLeads}/${visitors.length} bezoekers`);

  return { records: enriched, meta };
}
