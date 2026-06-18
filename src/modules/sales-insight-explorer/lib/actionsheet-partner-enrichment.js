/**
 * Actieblad → Partner Enrichment
 *
 * Haalt het gekoppelde res.partner-record op voor elk actieblad via
 * `x_studio_for_company_id` (Many2one → res.partner) en voegt het toe
 * als `__partner` aan het actieblad-record.
 *
 * @module modules/sales-insight-explorer/lib/actionsheet-partner-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';

/** Minimum vereist om de map te kunnen bouwen */
const BASE_PARTNER_FIELDS = ['id'];

/**
 * Enrich actiebladen met het gekoppelde res.partner-record.
 *
 * @param {Array}  actionsheets - Primaire query resultaten (bevatten x_studio_for_company_id)
 * @param {Object} config
 * @param {boolean} config.enabled
 * @param {string[]} [config.fields]  - Extra res.partner veldnamen uit de informatiesets
 * @param {Object}  env
 * @param {Array}   notes
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichActiesheetsWithPartner(actionsheets, config, env, notes) {
  const startTime = Date.now();

  notes.push(`🏢 Actieblad→Partner enrichment: ${actionsheets.length} actiebladen`);

  if (!actionsheets.length) {
    return { records: actionsheets, meta: { count: 0, execution_time_ms: 0 } };
  }

  // Verzamel unieke partner-IDs uit x_studio_for_company_id
  const partnerIdSet = new Set();
  for (const as of actionsheets) {
    const pid = Array.isArray(as.x_studio_for_company_id)
      ? as.x_studio_for_company_id[0]
      : as.x_studio_for_company_id;
    if (pid && typeof pid === 'number') partnerIdSet.add(pid);
  }

  const partnerIds = Array.from(partnerIdSet);

  if (!partnerIds.length) {
    notes.push('Actieblad→Partner: geen geldige partner-IDs gevonden, enrichment overgeslagen');
    return {
      records: actionsheets.map(as => ({ ...as, __partner: null })),
      meta: { count: 0, execution_time_ms: Date.now() - startTime }
    };
  }

  // Veldlijst: basis + extra velden uit informatiesets (dedupliceren)
  const extraFields = Array.isArray(config.fields) ? config.fields : [];
  const fields = Array.from(new Set([...BASE_PARTNER_FIELDS, ...extraFields]));

  const partners = await searchRead(env, {
    model: 'res.partner',
    domain: [['id', 'in', partnerIds]],
    fields,
    limit: false
  });

  notes.push(`res.partner: ${partners.length} partners opgehaald voor ${partnerIds.length} actiebladen`);

  // Bouw ID-map
  const partnerById = new Map(partners.map(p => [p.id, p]));

  // Koppel partner aan elk actieblad
  const enriched = actionsheets.map(as => {
    const pid = Array.isArray(as.x_studio_for_company_id)
      ? as.x_studio_for_company_id[0]
      : as.x_studio_for_company_id;
    return {
      ...as,
      __partner: partnerById.get(pid) ?? null
    };
  });

  const withPartner = enriched.filter(r => r.__partner !== null).length;

  const meta = {
    execution_method: 'actionsheet_partner_enrichment',
    partner_ids_requested: partnerIds.length,
    partners_fetched: partners.length,
    actionsheets_with_partner: withPartner,
    actionsheets_without_partner: actionsheets.length - withPartner,
    fields_fetched: fields,
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Actieblad→Partner klaar: ${withPartner}/${actionsheets.length} actiebladen gekoppeld`);
  return { records: enriched, meta };
}
