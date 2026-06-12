/**
 * Partner → Lead Enrichment
 *
 * Koppelt CRM-leads aan res.partner (VME) records.
 *
 * BELANGRIJK: crm.lead.partner_id wijst naar een CONTACTPERSOON (kind van de VME),
 * niet naar de VME zelf. De koppeling loopt via:
 *   crm.lead.partner_id.commercial_partner_id → res.partner (VME)
 *
 * Domain: ['partner_id.commercial_partner_id', 'in', partnerIds]
 * Vervolgens: contact-IDs → VME-IDs via een aparte res.partner lookup.
 *
 * L2 sub-enrichments:
 *   - chatter_enrichment: mail.message per lead ophalen (__chatter)
 *   - activity_enrichment: mail.activity per lead ophalen (__activities)
 *
 * @module modules/sales-insight-explorer/lib/partner-lead-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';
import { LEAD_PROPERTY_GROUPS, getEnabledFields, filterIgnoredLeads } from './lead-enrichment.js';
import { enrichWithChatter } from './chatter-enrichment.js';
import { enrichWithActivities } from './activity-enrichment.js';

/**
 * Enrich partners met gekoppelde leads, inclusief optionele sub-enrichments per lead.
 *
 * @param {Array}  partners
 * @param {Object} config
 * @param {boolean} config.enabled
 * @param {Array<string>} config.property_groups
 * @param {Object} config.filters                   - won_status, stage_ids
 * @param {Object} [config.chatter_enrichment]      - L2
 * @param {Object} [config.activity_enrichment]     - L2
 * @param {Object} env
 * @param {Array}  notes
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichPartnersWithLeads(partners, config, env, notes) {
  const startTime = Date.now();
  const enabledGroups = config.property_groups || [];
  notes.push(`🔗 Partner→Lead enrichment: ${partners.length} partners, groepen: ${enabledGroups.join(', ') || 'basis'}`);

  if (!partners.length) {
    return { records: partners, meta: { count: 0, execution_time_ms: 0 } };
  }

  const partnerIds = partners.map(p => p.id);

  // Stap 1: leads ophalen via commercial_partner_id (contact → VME)
  // partner_id op crm.lead = contactpersoon; commercial_partner_id = top-level bedrijf (VME)
  const domain = [
    ['partner_id.commercial_partner_id', 'in', partnerIds],
    ['active', 'in', [true, false]]
  ];

  const filters = config.filters || {};
  if (filters.won_status?.length) {
    domain.push(['won_status', 'in', filters.won_status]);
  }
  if (filters.stage_ids?.length) {
    domain.push(['stage_id', 'in', filters.stage_ids]);
  }

  const fields = getEnabledFields(enabledGroups);
  // partner_id nodig voor contact→VME mapping
  if (!fields.includes('partner_id')) fields.push('partner_id');

  const rawLeads = await searchRead(env, { model: 'crm.lead', domain, fields, limit: false });
  notes.push(`crm.lead: ${rawLeads.length} leads via commercial_partner_id`);

  if (!rawLeads.length) {
    const enriched = partners.map(p => ({ ...p, __leads: [] }));
    return { records: enriched, meta: { count: 0, execution_time_ms: Date.now() - startTime } };
  }

  // Stap 2: contact-IDs → VME-IDs ophalen via res.partner.commercial_partner_id
  const contactIds = [...new Set(
    rawLeads.map(l => Array.isArray(l.partner_id) ? l.partner_id[0] : l.partner_id).filter(Boolean)
  )];

  const contacts = await searchRead(env, {
    model: 'res.partner',
    domain: [['id', 'in', contactIds]],
    fields: ['id', 'commercial_partner_id'],
    limit: false
  });

  // Map: contactId → VME id
  const contactToVME = new Map();
  for (const c of contacts) {
    const vmeId = Array.isArray(c.commercial_partner_id) ? c.commercial_partner_id[0] : c.commercial_partner_id;
    if (vmeId) contactToVME.set(c.id, vmeId);
  }
  // Fallback: als de partner zelf al een VME is (commercial_partner_id = zichzelf)
  for (const pid of partnerIds) {
    if (!contactToVME.has(pid)) contactToVME.set(pid, pid);
  }

  const { filteredLeads, classificationCounts } = filterIgnoredLeads(rawLeads, notes);

  // Stap 3: L2 sub-enrichments op de gefilterde leads
  let enrichedLeads = filteredLeads;

  if (config.chatter_enrichment?.enabled) {
    const r = await enrichWithChatter(enrichedLeads, { ...config.chatter_enrichment, odoo_model: 'crm.lead' }, env, notes);
    enrichedLeads = r.records;
  }

  if (config.activity_enrichment?.enabled) {
    const r = await enrichWithActivities(enrichedLeads, { ...config.activity_enrichment, odoo_model: 'crm.lead' }, env, notes);
    enrichedLeads = r.records;
  }

  // Stap 4: groepeer per VME
  const leadsByPartnerId = new Map();
  for (const lead of enrichedLeads) {
    const rawContactId = Array.isArray(lead.partner_id) ? lead.partner_id[0] : lead.partner_id;
    const vmeId = contactToVME.get(rawContactId) ?? rawContactId;
    if (!vmeId) continue;

    if (!leadsByPartnerId.has(vmeId)) leadsByPartnerId.set(vmeId, []);

    const payload = {};
    for (const field of LEAD_PROPERTY_GROUPS.status_outcome.fields) {
      payload[field] = lead[field] ?? null;
    }
    payload.classification = lead.won_status === 'won' ? 'WON'
      : lead.won_status === 'lost' ? 'LOST' : 'OPEN';
    for (const groupId of enabledGroups) {
      if (LEAD_PROPERTY_GROUPS[groupId]) {
        for (const field of LEAD_PROPERTY_GROUPS[groupId].fields) {
          payload[field] = lead[field] ?? null;
        }
      }
    }
    if (lead.__chatter)    payload.__chatter    = lead.__chatter;
    if (lead.__activities) payload.__activities = lead.__activities;

    leadsByPartnerId.get(vmeId).push(payload);
  }

  for (const arr of leadsByPartnerId.values()) arr.sort((a, b) => a.id - b.id);

  const enriched = partners.map(p => ({
    ...p,
    __leads: leadsByPartnerId.get(p.id) ?? []
  }));

  const meta = {
    execution_method: 'partner_lead_enrichment_via_commercial_partner',
    total_leads_fetched: rawLeads.length,
    classification_counts: classificationCounts,
    partners_with_leads: leadsByPartnerId.size,
    l2_enrichments: {
      chatter:    config.chatter_enrichment?.enabled  ?? false,
      activities: config.activity_enrichment?.enabled ?? false
    },
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Partner→Lead klaar: ${leadsByPartnerId.size}/${partners.length} partners hebben leads`);
  return { records: enriched, meta };
}
