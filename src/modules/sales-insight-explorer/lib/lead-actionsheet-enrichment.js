/**
 * Lead → Actieblad Enrichment
 *
 * Koppelt x_sales_action_sheet records aan crm.lead records via het veld
 * `x_studio_as_opportunity_ids` op x_sales_action_sheet (Many2many → crm.lead).
 *
 * Ophaalstrategie: query x_sales_action_sheet WHERE x_studio_as_opportunity_ids contains lead_id.
 * Omdat Odoo Many2many-inverse queries ondersteunt via domain [field, 'in', ids],
 * gebruiken we: [['x_studio_as_opportunity_ids', 'in', leadIds]].
 *
 * @module modules/sales-insight-explorer/lib/lead-actionsheet-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';

const BASE_AS_FIELDS = [
  'id',
  'x_name',
  'x_studio_for_company_id',
  'x_studio_stage_id',
  'x_studio_user_id',
  'x_active',
  'create_date',
  'x_studio_as_opportunity_ids'  // nodig voor de koppeling terug naar lead
];

/**
 * Enrich leads met gekoppelde actiebladen.
 *
 * @param {Array}  leads    - Primaire query resultaten (moeten .id bevatten)
 * @param {Object} config
 * @param {boolean} config.enabled
 * @param {boolean} [config.include_archived]  - Inclusief gearchiveerde actiebladen (default: true)
 * @param {Object}  env
 * @param {Array}   notes
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichLeadsWithActionSheets(leads, config, env, notes) {
  const startTime = Date.now();
  const includeArchived = config.include_archived ?? true;

  notes.push(`📋 Lead→Actieblad enrichment: ${leads.length} leads, gearchiveerd=${includeArchived}`);

  if (!leads.length) {
    return { records: leads, meta: { count: 0, execution_time_ms: 0 } };
  }

  const leadIds = leads.map(l => l.id);

  const domain = [
    ['x_studio_as_opportunity_ids', 'in', leadIds]
  ];

  if (includeArchived) {
    domain.push(['x_active', 'in', [true, false]]);
  }

  const actionSheets = await searchRead(env, {
    model: 'x_sales_action_sheet',
    domain,
    fields: BASE_AS_FIELDS,
    order: 'create_date desc',
    limit: false
  });

  notes.push(`x_sales_action_sheet: ${actionSheets.length} actiebladen opgehaald voor ${leadIds.length} leads`);

  // Bouw lead-ID → actiebladen map via x_studio_as_opportunity_ids
  const asByLeadId = new Map();
  for (const as of actionSheets) {
    const linkedLeadIds = Array.isArray(as.x_studio_as_opportunity_ids)
      ? as.x_studio_as_opportunity_ids
      : [];

    const record = {
      id:              as.id,
      naam:            as.x_name,
      partner:         as.x_studio_for_company_id,  // [id, name] tuple
      fase:            as.x_studio_stage_id,         // [id, name] tuple
      verantwoordelijke: as.x_studio_user_id,        // [id, name] tuple
      actief:          as.x_active,
      aangemaakt:      as.create_date
    };

    for (const lid of linkedLeadIds) {
      if (!leadIds.includes(lid)) continue;
      if (!asByLeadId.has(lid)) asByLeadId.set(lid, []);
      asByLeadId.get(lid).push(record);
    }
  }

  const enriched = leads.map(l => ({
    ...l,
    __actiebladen: asByLeadId.get(l.id) ?? []
  }));

  const meta = {
    execution_method:            'lead_actionsheet_enrichment',
    total_actionsheets_fetched:  actionSheets.length,
    leads_with_actionsheets:     asByLeadId.size,
    execution_time_ms:           Date.now() - startTime
  };

  notes.push(`Lead→Actieblad klaar: ${asByLeadId.size}/${leads.length} leads hebben actiebladen`);
  return { records: enriched, meta };
}
