/**
 * Lead → Partner Enrichment
 *
 * Haalt het gekoppelde res.partner-record op voor elke lead via
 * `partner_id` (Many2one → res.partner) en voegt het toe als `__partner`
 * aan elk lead-record (dat zelf al genest zit in een actieblad-record
 * als `__leads`).
 *
 * Gebruik: wanneer actiebladen de basisquery zijn, leads als L1-submodel
 * actief zijn (lead_enrichment) én res.partner als L2-submodel van leads
 * (submodelPaths['res.partner'] === 'crm.lead').
 *
 * @module modules/sales-insight-explorer/lib/lead-partner-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';

const BASE_PARTNER_FIELDS = ['id'];

/**
 * Enrich leads met het gekoppelde res.partner-record.
 *
 * @param {Array}  records  - Actieblad-records waarvan elke record.__leads een array is
 * @param {Object} config
 * @param {boolean} config.enabled
 * @param {string[]} [config.fields]  - res.partner veldnamen uit de informatiesets
 * @param {Object}  env
 * @param {Array}   notes
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichLeadsWithPartner(records, config, env, notes) {
  const startTime = Date.now();

  notes.push(`🤝 Lead→Partner enrichment gestart`);

  if (!records.length) {
    return { records, meta: { count: 0, execution_time_ms: 0 } };
  }

  // Verzamel alle leads uit __leads array van elk actieblad-record
  const allLeads = [];
  for (const rec of records) {
    if (Array.isArray(rec.__leads)) allLeads.push(...rec.__leads);
  }

  if (!allLeads.length) {
    notes.push('Lead→Partner: geen leads gevonden, enrichment overgeslagen');
    return { records, meta: { count: 0, execution_time_ms: 0 } };
  }

  // link_field is model-specifiek (bijv. 'partner_id' op crm.lead, kan anders zijn op andere modellen)
  const linkField = config.link_field || 'partner_id';

  // Verzamel unieke partner-IDs via het geconfigureerde koppelveld
  const partnerIdSet = new Set();
  for (const lead of allLeads) {
    const raw = lead[linkField];
    const pid = Array.isArray(raw) ? raw[0] : raw;
    if (pid && typeof pid === 'number') partnerIdSet.add(pid);
  }

  const partnerIds = Array.from(partnerIdSet);

  if (!partnerIds.length) {
    notes.push('Lead→Partner: geen geldige partner_id waarden, enrichment overgeslagen');
    const enrichedRecords = records.map(rec => ({
      ...rec,
      __leads: (rec.__leads || []).map(lead => ({ ...lead, __partner: null }))
    }));
    return { records: enrichedRecords, meta: { count: 0, execution_time_ms: Date.now() - startTime } };
  }

  // Veldlijst: basis + extra velden (dedupliceren)
  const extraFields = Array.isArray(config.fields) ? config.fields : [];
  const fields = Array.from(new Set([...BASE_PARTNER_FIELDS, ...extraFields]));

  const partners = await searchRead(env, {
    model: 'res.partner',
    domain: [['id', 'in', partnerIds]],
    fields,
    limit: false
  });

  notes.push(`res.partner: ${partners.length} partners opgehaald voor ${partnerIds.length} leads`);

  const partnerById = new Map(partners.map(p => [p.id, p]));

  // Voeg __partner toe aan elke lead
  let leadsWithPartner = 0;
  const enrichedRecords = records.map(rec => {
    if (!Array.isArray(rec.__leads)) return rec;
    const enrichedLeads = rec.__leads.map(lead => {
      const pid = Array.isArray(lead.partner_id) ? lead.partner_id[0] : lead.partner_id;
      const partner = partnerById.get(pid) ?? null;
      if (partner) leadsWithPartner++;
      return { ...lead, __partner: partner };
    });
    return { ...rec, __leads: enrichedLeads };
  });

  const meta = {
    execution_method: 'lead_partner_enrichment',
    total_leads_processed: allLeads.length,
    partner_ids_requested: partnerIds.length,
    partners_fetched: partners.length,
    leads_with_partner: leadsWithPartner,
    leads_without_partner: allLeads.length - leadsWithPartner,
    fields_fetched: fields,
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Lead→Partner klaar: ${leadsWithPartner}/${allLeads.length} leads gekoppeld`);
  return { records: enrichedRecords, meta };
}
