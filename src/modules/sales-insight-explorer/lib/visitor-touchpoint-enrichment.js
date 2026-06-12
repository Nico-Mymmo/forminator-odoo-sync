/**
 * Visitor → Touchpoint Enrichment
 *
 * Haalt ad touchpoints (x_ad_touchpoint) op voor een set web visitors.
 * Relatie: x_ad_touchpoint.x_studio_visitor many2one → x_web_visitor
 *
 * Output: elke visitor krijgt __touchpoints: [{ id, naam, source, medium,
 *   campaign, ad, timestamp, landing_page, device }]
 *
 * @module modules/sales-insight-explorer/lib/visitor-touchpoint-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';

const TOUCHPOINT_FIELDS = [
  'id', 'x_name', 'x_studio_visitor',
  'x_studio_source', 'x_studio_medium',
  'x_studio_campaign_name', 'x_studio_ad_name',
  'x_studio_timestamp', 'x_studio_landing_page', 'x_studio_device'
];

/**
 * Enrich web visitors met hun ad touchpoints.
 *
 * @param {Array}  visitors - Primaire query resultaten (x_web_visitor)
 * @param {Object} config   - { enabled: true }
 * @param {Object} env      - Cloudflare worker environment
 * @param {Array}  notes    - Execution notes array (mutated)
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichVisitorsWithTouchpoints(visitors, config, env, notes) {
  const startTime = Date.now();
  notes.push(`🖱️ Visitor → Touchpoint enrichment: ${visitors.length} bezoekers`);

  if (!visitors.length) {
    return { records: visitors, meta: { count: 0, execution_time_ms: 0 } };
  }

  const visitorIds = visitors.map(v => v.id);

  const touchpoints = await searchRead(env, {
    model: 'x_ad_touchpoint',
    domain: [['x_studio_visitor', 'in', visitorIds]],
    fields: TOUCHPOINT_FIELDS,
    order: 'x_studio_timestamp asc',
    limit: false
  });

  notes.push(`x_ad_touchpoint: ${touchpoints.length} touchpoints opgehaald`);

  // Groepeer per visitor-ID
  const byVisitor = new Map();
  for (const tp of touchpoints) {
    const visitorId = Array.isArray(tp.x_studio_visitor) ? tp.x_studio_visitor[0] : tp.x_studio_visitor;
    if (!visitorId) continue;
    if (!byVisitor.has(visitorId)) byVisitor.set(visitorId, []);
    byVisitor.get(visitorId).push({
      id: tp.id,
      naam: tp.x_name,
      source: tp.x_studio_source || null,
      medium: tp.x_studio_medium || null,
      campaign: tp.x_studio_campaign_name || null,
      ad: tp.x_studio_ad_name || null,
      timestamp: tp.x_studio_timestamp || null,
      landing_page: tp.x_studio_landing_page || null,
      device: tp.x_studio_device || null
    });
  }

  const enriched = visitors.map(v => ({
    ...v,
    __touchpoints: byVisitor.get(v.id) ?? []
  }));

  const meta = {
    execution_method: 'visitor_touchpoint_enrichment',
    touchpoints_fetched: touchpoints.length,
    visitors_with_touchpoints: byVisitor.size,
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Touchpoints klaar: ${byVisitor.size}/${visitors.length} bezoekers met touchpoints`);

  return { records: enriched, meta };
}
