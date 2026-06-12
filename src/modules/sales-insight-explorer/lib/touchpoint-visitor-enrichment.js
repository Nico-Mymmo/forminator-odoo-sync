/**
 * Touchpoint → Visitor Enrichment
 *
 * Haalt x_web_visitor records op voor een set ad touchpoints.
 * Relatie: x_ad_touchpoint.x_studio_visitor many2one → x_web_visitor
 *
 * Ondersteunt optionele L2-enrichment: visitor → leads (via x_studio_lead_ids).
 *
 * Output: elke touchpoint krijgt __visitor: { id, naam, email, source_site,
 *   eerste_bezoek, laatste_bezoek, utm_source, utm_medium, utm_campaign,
 *   [__leads: [...]] }
 *
 * @module modules/sales-insight-explorer/lib/touchpoint-visitor-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';

const VISITOR_FIELDS = [
  'id', 'x_name', 'x_studio_email', 'x_studio_source_site',
  'x_studio_first_seen', 'x_studio_last_seen',
  'x_studio_utm_source', 'x_studio_utm_medium', 'x_studio_utm_campaign'
];

const LEAD_FIELDS = [
  'id', 'name', 'partner_id', 'stage_id', 'won_status', 'active',
  'create_date', 'date_closed', 'user_id', 'team_id'
];

/**
 * Enrich ad touchpoints met hun bezoekersprofiel (en optioneel leads).
 *
 * @param {Array}  touchpoints - Primaire query resultaten (x_ad_touchpoint).
 *                               Moet x_studio_visitor bevatten (wordt automatisch
 *                               toegevoegd in routes.js wanneer deze enrichment actief is).
 * @param {Object} config      - { enabled: true, lead_enrichment?: { enabled: true } }
 * @param {Object} env         - Cloudflare worker environment
 * @param {Array}  notes       - Execution notes array (mutated)
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichTouchpointsWithVisitor(touchpoints, config, env, notes) {
  const startTime = Date.now();
  const needsLeads = config.lead_enrichment?.enabled === true;
  notes.push(`🔗 Touchpoint → Visitor enrichment (lead L2: ${needsLeads}): ${touchpoints.length} touchpoints`);

  if (!touchpoints.length) {
    return { records: touchpoints, meta: { count: 0, execution_time_ms: 0 } };
  }

  // Verzamel unieke visitor-IDs uit het x_studio_visitor veld
  const visitorIdSet = new Set();
  for (const tp of touchpoints) {
    const visitorId = Array.isArray(tp.x_studio_visitor) ? tp.x_studio_visitor[0] : tp.x_studio_visitor;
    if (visitorId) visitorIdSet.add(visitorId);
  }

  const visitorIds = Array.from(visitorIdSet);

  if (!visitorIds.length) {
    notes.push('Geen visitor-IDs gevonden in touchpoints');
    return {
      records: touchpoints.map(tp => ({ ...tp, __visitor: null })),
      meta: { visitors_fetched: 0, execution_time_ms: Date.now() - startTime }
    };
  }

  // Haal visitor-fields op (+ x_studio_lead_ids als L2 leads nodig zijn)
  const fetchFields = [...VISITOR_FIELDS];
  if (needsLeads) fetchFields.push('x_studio_lead_ids');

  const visitors = await searchRead(env, {
    model: 'x_web_visitor',
    domain: [['id', 'in', visitorIds]],
    fields: fetchFields,
    limit: false
  });

  notes.push(`x_web_visitor: ${visitors.length} bezoekers opgehaald voor ${touchpoints.length} touchpoints`);

  // Optioneel: haal leads op voor bezoekers (L2)
  let leadMap = new Map();
  if (needsLeads) {
    const allLeadIds = new Set();
    for (const v of visitors) {
      (v.x_studio_lead_ids || []).forEach(id => allLeadIds.add(id));
    }
    if (allLeadIds.size) {
      const leads = await searchRead(env, {
        model: 'crm.lead',
        domain: [
          ['id', 'in', Array.from(allLeadIds)],
          ['active', 'in', [true, false]]
        ],
        fields: LEAD_FIELDS,
        limit: false
      });
      leadMap = new Map(leads.map(l => [l.id, l]));
      notes.push(`crm.lead (L2): ${leads.length} leads voor bezoekers opgehaald`);
    }
  }

  // Bouw visitor-map
  const visitorMap = new Map();
  for (const v of visitors) {
    const entry = {
      id:             v.id,
      naam:           v.x_name,
      email:          v.x_studio_email || null,
      source_site:    v.x_studio_source_site || null,
      eerste_bezoek:  v.x_studio_first_seen || null,
      laatste_bezoek: v.x_studio_last_seen || null,
      utm_source:     v.x_studio_utm_source || null,
      utm_medium:     v.x_studio_utm_medium || null,
      utm_campaign:   v.x_studio_utm_campaign || null
    };
    if (needsLeads) {
      entry.__leads = (v.x_studio_lead_ids || []).map(id => leadMap.get(id)).filter(Boolean);
    }
    visitorMap.set(v.id, entry);
  }

  // Enrich touchpoints
  const enriched = touchpoints.map(tp => {
    const visitorId = Array.isArray(tp.x_studio_visitor) ? tp.x_studio_visitor[0] : tp.x_studio_visitor;
    return {
      ...tp,
      __visitor: visitorId ? (visitorMap.get(visitorId) ?? null) : null
    };
  });

  const withVisitor = enriched.filter(tp => tp.__visitor).length;

  const meta = {
    execution_method: 'touchpoint_visitor_enrichment',
    visitors_fetched: visitors.length,
    touchpoints_with_visitor: withVisitor,
    ...(needsLeads ? { leads_fetched: leadMap.size } : {}),
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Visitor enrichment klaar: ${withVisitor}/${touchpoints.length} touchpoints met bezoeker`);

  return { records: enriched, meta };
}
