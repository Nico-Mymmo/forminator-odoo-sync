/**
 * Partner → Actieblad Enrichment
 *
 * Koppelt x_sales_action_sheet records aan res.partner records via het veld
 * `x_studio_for_company_id` op x_sales_action_sheet (Many2one → res.partner).
 *
 * L2 sub-enrichments (optioneel, geconfigureerd via payload):
 *   - chatter_enrichment:  mail.message per actieblad ophalen (__chatter)
 *   - activity_enrichment: mail.activity per actieblad ophalen (__activities)
 *   - lead_enrichment:     crm.lead per actieblad ophalen (__leads)
 *                          Vereist x_studio_as_opportunity_ids in de fetch.
 *
 * @module modules/sales-insight-explorer/lib/partner-actionsheet-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';
import { enrichWithChatter } from './chatter-enrichment.js';
import { enrichWithActivities } from './activity-enrichment.js';
import { enrichWithLeads } from './lead-enrichment.js';

/**
 * Basisvelden per actieblad.
 * x_studio_as_opportunity_ids wordt dynamisch toegevoegd als lead_enrichment enabled is.
 */
const BASE_AS_FIELDS = [
  'id',
  'x_name',
  'x_studio_for_company_id',
  'x_studio_stage_id',
  'x_studio_user_id',
  'x_active',
  'create_date'
];

/**
 * Enrich partners met gekoppelde actiebladen, inclusief optionele sub-enrichments.
 *
 * @param {Array}  partners  - Primaire query resultaten (moeten .id bevatten)
 * @param {Object} config
 * @param {boolean} config.enabled
 * @param {boolean} [config.include_archived]              - Inclusief gearchiveerde actiebladen (default: true)
 * @param {Object}  [config.chatter_enrichment]            - L2: chatter per actieblad
 * @param {Object}  [config.activity_enrichment]           - L2: activiteiten per actieblad
 * @param {Object}  [config.lead_enrichment]               - L2: leads per actieblad
 * @param {Object}  env
 * @param {Array}   notes
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichPartnersWithActionSheets(partners, config, env, notes) {
  const startTime = Date.now();
  const includeArchived = config.include_archived ?? true;
  const hasLeadEnrichment = config.lead_enrichment?.enabled === true;

  notes.push(`📋 Partner→Actieblad enrichment: ${partners.length} partners, gearchiveerd=${includeArchived}, leads=${hasLeadEnrichment}`);

  if (!partners.length) {
    return { records: partners, meta: { count: 0, execution_time_ms: 0 } };
  }

  const partnerIds = partners.map(p => p.id);

  const domain = [
    ['x_studio_for_company_id', 'in', partnerIds]
  ];

  if (includeArchived) {
    domain.push(['x_active', 'in', [true, false]]);
  }

  // Velden: basis + x_studio_as_opportunity_ids als lead enrichment nodig
  const fields = [...BASE_AS_FIELDS];
  if (hasLeadEnrichment && !fields.includes('x_studio_as_opportunity_ids')) {
    fields.push('x_studio_as_opportunity_ids');
  }

  let actionSheets = await searchRead(env, {
    model: 'x_sales_action_sheet',
    domain,
    fields,
    order: 'create_date desc',
    limit: false
  });

  notes.push(`x_sales_action_sheet: ${actionSheets.length} actiebladen opgehaald voor ${partnerIds.length} partners`);

  // L2 sub-enrichments: voer uit op volledige batch (efficiënter dan per partner)
  if (config.chatter_enrichment?.enabled) {
    const chatterResult = await enrichWithChatter(
      actionSheets,
      { ...config.chatter_enrichment, odoo_model: 'x_sales_action_sheet' },
      env,
      notes
    );
    actionSheets = chatterResult.records;
  }

  if (config.activity_enrichment?.enabled) {
    const actResult = await enrichWithActivities(
      actionSheets,
      { ...config.activity_enrichment, odoo_model: 'x_sales_action_sheet' },
      env,
      notes
    );
    actionSheets = actResult.records;
  }

  if (hasLeadEnrichment) {
    const leadResult = await enrichWithLeads(
      actionSheets,
      config.lead_enrichment,
      env,
      notes
    );
    actionSheets = leadResult.records;
  }

  // Bouw partner-ID → actiebladen map
  const asByPartnerId = new Map();
  for (const as of actionSheets) {
    // x_studio_for_company_id is een Many2one → [id, name] tuple
    const pid = Array.isArray(as.x_studio_for_company_id)
      ? as.x_studio_for_company_id[0]
      : as.x_studio_for_company_id;
    if (!pid) continue;

    if (!asByPartnerId.has(pid)) asByPartnerId.set(pid, []);

    const payload = {
      id: as.id,
      naam: as.x_name,
      fase: as.x_studio_stage_id,            // [id, name] tuple
      verantwoordelijke: as.x_studio_user_id, // [id, name] tuple
      actief: as.x_active,
      aangemaakt: as.create_date
    };

    // L2 sub-enrichment data doorgeven
    if (as.__chatter)    payload.__chatter    = as.__chatter;
    if (as.__activities) payload.__activities = as.__activities;
    if (as.__leads)      payload.__leads      = as.__leads;

    asByPartnerId.get(pid).push(payload);
  }

  const enriched = partners.map(p => ({
    ...p,
    __actiebladen: asByPartnerId.get(p.id) ?? []
  }));

  const meta = {
    execution_method: 'partner_actionsheet_enrichment',
    total_actionsheets_fetched: actionSheets.length,
    partners_with_actionsheets: asByPartnerId.size,
    l2_enrichments: {
      chatter:    config.chatter_enrichment?.enabled  ?? false,
      activities: config.activity_enrichment?.enabled ?? false,
      leads:      hasLeadEnrichment
    },
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Partner→Actieblad klaar: ${asByPartnerId.size}/${partners.length} partners hebben actiebladen`);
  return { records: enriched, meta };
}
