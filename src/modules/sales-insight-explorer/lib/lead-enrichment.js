/**
 * Lead Enrichment via Two-Phase Set Operations
 * 
 * This module implements CRM lead enrichment for action sheets using a strict
 * two-phase architecture:
 * 
 * Phase 1: Primary query fetches action sheets (set A)
 * Phase 2: Secondary query fetches leads and extracts action_sheet_ids (set B)
 * 
 * Set operations (intersection, difference) determine which records are enriched.
 * 
 * ARCHITECTURAL CONSTRAINTS:
 * - x_sales_action_sheet.lead_id DOES NOT EXIST
 * - Action sheets have NO schema-level relation to crm.lead
 * - Relationship is unidirectional: crm.lead → x_sales_action_sheet
 * - NO joins, NO ORM magic, NO relation traversal
 * 
 * @module modules/sales-insight-explorer/lib/lead-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';

/**
 * Lead Property Groups
 *
 * Semantische groepen van crm.lead velden voor projectie-controle.
 * Gebruikers kunnen optionele groepen aan/uitzetten om de JSON lean te houden.
 *
 * REGELS:
 * - "status_outcome" is ALTIJD inbegrepen (niet uitzetten)
 * - Andere groepen zijn optioneel
 * - Ontbrekende velden → null (geen fouten)
 *
 * Geverifieerd tegen live Odoo juni 2026.
 * Trimmed: active, day_open, campaign_id, referred, x_studio_marketing_noden,
 *           x_studio_has_linked_actionsheets verwijderd (niet analytisch nuttig).
 */
export const LEAD_PROPERTY_GROUPS = {
  status_outcome: {
    id: 'status_outcome',
    label: 'Status & Uitkomst',
    always_enabled: true,
    fields: [
      'id',
      'name',
      'won_status',
      'stage_id',
      'lost_reason_id'
      // 'active' verwijderd — classificatie gebeurt via classifyLead(), niet analytisch
    ]
  },
  time_flow: {
    id: 'time_flow',
    label: 'Tijdslijn',
    always_enabled: false,
    fields: [
      'create_date',
      'date_last_stage_update',
      'date_closed',
      'day_close'
      // 'day_open' verwijderd — minder relevant voor analyse
    ]
  },
  origin_marketing: {
    id: 'origin_marketing',
    label: 'Herkomst',
    always_enabled: false,
    fields: [
      'source_id',
      'medium_id'
      // 'campaign_id', 'referred' verwijderd — zelden nuttig in bulk-analyse
    ]
  },
  business_signals: {
    id: 'business_signals',
    label: 'Bedrijfssignalen',
    always_enabled: false,
    fields: [
      'x_studio_hotness_label',
      'x_studio_hotness_score',
      'x_studio_lifecycle'
      // 'x_studio_marketing_noden' verwijderd — interne tool-waarde
      // 'x_studio_has_linked_actionsheets' verwijderd — afgeleide boolean, redundant
    ]
  },
  lead_context: {
    id: 'lead_context',
    label: 'Lead Profiel',
    always_enabled: false,
    fields: [
      'x_studio_brand_origin',           // Hoe lead binnengekomen (Meta, organisch…)
      'x_studio_search_syndic_current_admin', // Huidig beheertype bij aanvraag
      'x_studio_is_vme_check',           // Wil VME-check
      'x_studio_isexpertlead'            // Expert-lead
    ]
  }
};

/**
 * Get all fields from enabled property groups
 *
 * @param {Array<string>} enabledGroups - Group IDs to include (status_outcome always added)
 * @returns {Array<string>} - Unique field names
 */
export function getEnabledFields(enabledGroups = []) {
  const fields = new Set();

  // status_outcome is ALWAYS included
  for (const field of LEAD_PROPERTY_GROUPS.status_outcome.fields) {
    fields.add(field);
  }

  // NOTE: classification is a DERIVED field (computed by classifyLead)
  // It is NOT fetched from Odoo, only added in extractLeadPayload

  // Add fields from enabled groups
  for (const groupId of enabledGroups) {
    if (LEAD_PROPERTY_GROUPS[groupId] && !LEAD_PROPERTY_GROUPS[groupId].always_enabled) {
      for (const field of LEAD_PROPERTY_GROUPS[groupId].fields) {
        fields.add(field);
      }
    }
  }

  // active is needed for classification (classifyLead checks active flag)
  fields.add('active');

  return Array.from(fields);
}

/**
 * Enrich action sheets with CRM lead data using two-phase set operations
 * 
 * @param {Array} actionSheets - Results from primary query (set A)
 * @param {Object} enrichmentConfig - Lead enrichment configuration
 * @param {boolean} enrichmentConfig.enabled - Enable lead enrichment
 * @param {string} enrichmentConfig.mode - 'include' | 'exclude' | 'only_without_lead'
 * @param {Object} enrichmentConfig.filters - Lead filters
 * @param {Array<number>} enrichmentConfig.filters.stage_ids - Stage IDs to filter
 * @param {Array<string>} enrichmentConfig.filters.won_status - Won status values
 * @param {Array<string>} enrichmentConfig.property_groups - Enabled property groups
 * @param {Object} env - Cloudflare worker environment
 * @param {Array} notes - Execution notes array (mutated)
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichWithLeads(actionSheets, enrichmentConfig, env, notes) {
  const startTime = Date.now();

  notes.push('🔗 Lead enrichment: directe ID-benadering via x_studio_as_opportunity_ids');

  const enabledGroups = enrichmentConfig.property_groups || [];
  notes.push(`Property groups: status_outcome (altijd) + ${enabledGroups.join(', ') || 'geen extra'}`);

  // FASE 1: Verzamel alle unieke lead-IDs uit de actiebladen zelf.
  // Dit is betrouwbaarder dan de inverse many2many-richting op crm.lead.
  const allLeadIds = new Set();
  const asToLeadIds = new Map(); // actieblad-ID → [lead-IDs]

  for (const as of actionSheets) {
    const ids = as.x_studio_as_opportunity_ids || [];
    asToLeadIds.set(as.id, ids);
    ids.forEach(id => allLeadIds.add(id));
  }

  notes.push(`Fase 1: ${actionSheets.length} actiebladen, ${allLeadIds.size} unieke lead-IDs gevonden`);

  // Geen leads → vroeg terugkeren
  if (allLeadIds.size === 0) {
    const result = actionSheets.map(as => {
      const { x_studio_as_opportunity_ids, ...rest } = as;
      return { ...rest, __leads: [] };
    });
    return {
      records: applyMode(result, enrichmentConfig.mode, notes),
      meta: {
        execution_method: 'direct_id_lookup',
        phases: { primary: { count: actionSheets.length }, secondary: { count: 0 } },
        result_count: 0,
        total_execution_time_ms: Date.now() - startTime
      }
    };
  }

  // FASE 2: Haal alleen de relevante leads op (gefilterd op ID + eventuele won_status/stage-filters).
  const fields = getEnabledFields(enabledGroups);
  const domain = [
    ['id', 'in', Array.from(allLeadIds)],
    ['active', 'in', [true, false]] // inclusief gearchiveerde (LOST) leads
  ];

  const filters = enrichmentConfig.filters || {};
  if (filters.won_status?.length) {
    domain.push(['won_status', 'in', filters.won_status]);
    notes.push(`Lead-filter: won_status in [${filters.won_status.join(', ')}]`);
  }
  if (filters.stage_ids?.length) {
    domain.push(['stage_id', 'in', filters.stage_ids]);
    notes.push(`Lead-filter: stage_id in [${filters.stage_ids.join(', ')}]`);
  }

  const leads = await searchRead(env, { model: 'crm.lead', domain, fields, limit: false });
  notes.push(`Fase 2: ${leads.length} leads opgehaald`);

  // Classificeer en bouw lead-ID → payload map
  const { filteredLeads, classificationCounts } = filterIgnoredLeads(leads, notes);
  notes.push(`Classificatie: ${classificationCounts.OPEN} OPEN, ${classificationCounts.WON} WON, ${classificationCounts.LOST} LOST, ${classificationCounts.IGNORED} IGNORED`);

  const leadPayloadMap = new Map();
  for (const lead of filteredLeads) {
    leadPayloadMap.set(lead.id, extractLeadPayload(lead, enabledGroups));
  }

  // Koppel leads aan actiebladen; verwijder intern veld uit output
  const enriched = actionSheets.map(as => {
    const { x_studio_as_opportunity_ids, ...rest } = as;
    const leadIds = asToLeadIds.get(as.id) || [];
    const matchingLeads = leadIds.map(id => leadPayloadMap.get(id)).filter(Boolean);
    matchingLeads.sort((a, b) => a.id - b.id);
    return { ...rest, __leads: matchingLeads };
  });

  const withLeads = enriched.filter(as => as.__leads.length > 0).length;
  notes.push(`Koppeling: ${withLeads}/${actionSheets.length} actiebladen hebben leads na filters`);

  const result = applyMode(enriched, enrichmentConfig.mode, notes);

  const meta = {
    execution_method: 'direct_id_lookup',
    phases: {
      primary: { count: actionSheets.length },
      secondary: {
        count: leads.length,
        classification_counts: classificationCounts,
        filtered_count: filteredLeads.length
      }
    },
    mode: enrichmentConfig.mode,
    result_count: result.length,
    total_execution_time_ms: Date.now() - startTime
  };

  return { records: result, meta };
}

/**
 * Pas modus-filtering toe op de reeds-gekoppelde actiebladen.
 *
 * include          → alle actiebladen, __leads kan leeg zijn
 * exclude          → alleen actiebladen MET leads
 * only_without_lead → alleen actiebladen ZONDER leads
 *
 * @param {Array}  enriched - Actiebladen met __leads array
 * @param {string} mode
 * @param {Array}  notes
 * @returns {Array}
 */
function applyMode(enriched, mode, notes) {
  switch (mode) {
    case 'exclude':
      notes.push(`Mode 'exclude': alleen actiebladen met leads`);
      return enriched.filter(as => as.__leads.length > 0);
    case 'only_without_lead':
      notes.push(`Mode 'only_without_lead': alleen actiebladen zonder leads`);
      return enriched.filter(as => as.__leads.length === 0);
    default: // 'include'
      return enriched;
  }
}


/**
 * Extract lead fields based on enabled property groups
 * 
 * RULES:
 * - Status & Outcome is ALWAYS included
 * - Other groups are included only if enabled
 * - Field ordering: status_outcome, then groups in order
 * - Missing fields resolve to null (no errors)
 * 
 * @param {Object} lead - Full lead record from Odoo
 * @param {Array<string>} enabledGroups - Enabled property groups (excluding status_outcome)
 * @returns {Object} Lead payload for enrichment
 */
function extractLeadPayload(lead, enabledGroups = []) {
  const payload = {};
  
  // ALWAYS include Status & Outcome fields (in order)
  for (const field of LEAD_PROPERTY_GROUPS.status_outcome.fields) {
    payload[field] = lead[field] !== undefined ? lead[field] : null;
  }
  
  // Add classification (always included)
  payload.classification = classifyLead(lead);
  
  // Add fields from enabled groups (in group order)
  const groupOrder = ['time_flow', 'origin_marketing', 'business_signals', 'lead_context'];
  
  for (const groupId of groupOrder) {
    if (enabledGroups.includes(groupId) && LEAD_PROPERTY_GROUPS[groupId]) {
      for (const field of LEAD_PROPERTY_GROUPS[groupId].fields) {
        payload[field] = lead[field] !== undefined ? lead[field] : null;
      }
    }
  }
  
  return payload;
}


/**
 * Classify lead based on Odoo CRM semantics
 * 
 * CANONICAL CLASSIFICATION:
 * - OPEN:    active=true,  won_status='pending'
 * - WON:     active=true,  won_status='won'
 * - LOST:    active=false, won_status='lost', lost_reason_id IS SET
 * - IGNORED: active=false AND (won_status != 'lost' OR lost_reason_id IS NULL)
 * 
 * IMPORTANT DISTINCTION:
 * - active is a TECHNICAL VISIBILITY FLAG in Odoo
 * - won_status + lost_reason_id define ANALYTICAL STATE
 * - active=false ≠ lost (needs won_status='lost' AND lost_reason_id)
 * 
 * @param {Object} lead - Lead record from Odoo
 * @returns {string} 'OPEN' | 'WON' | 'LOST' | 'IGNORED'
 */
function classifyLead(lead) {
  if (lead.active === true) {
    if (lead.won_status === 'won') {
      return 'WON';
    } else if (lead.won_status === 'pending') {
      return 'OPEN';
    } else {
      // active=true but won_status is something else (edge case)
      return 'OPEN'; // Default to OPEN for active leads
    }
  } else {
    // active=false
    if (lead.won_status === 'lost') {
      // LOST leads altijd meenemen, ook zonder lost_reason_id
      return 'LOST';
    } else {
      // active=false maar niet als LOST gemarkeerd → archivering zonder reden (IGNORED)
      return 'IGNORED';
    }
  }
}

/**
 * Filter IGNORED leads after retrieval and return classification counts
 * 
 * IGNORED leads are:
 * - active=false AND (won_status != 'lost' OR lost_reason_id IS NULL)
 * 
 * These are archived/soft-deleted leads that are NOT analytically LOST.
 * They MUST be discarded AFTER retrieval, not at query level.
 * 
 * @param {Array} leads - All leads from secondary query
 * @param {Array} notes - Execution notes
 * @returns {{filteredLeads: Array, classificationCounts: Object}}
 */
export function filterIgnoredLeads(leads, notes) {
  const classificationCounts = {
    OPEN: 0,
    WON: 0,
    LOST: 0,
    IGNORED: 0
  };
  
  const filteredLeads = [];
  
  for (const lead of leads) {
    const classification = classifyLead(lead);
    classificationCounts[classification]++;
    
    if (classification !== 'IGNORED') {
      filteredLeads.push(lead);
    }
  }
  
  if (classificationCounts.IGNORED > 0) {
    notes.push(`⚠️  Filtered out ${classificationCounts.IGNORED} IGNORED leads (active=false but not properly LOST)`);
  }
  
  return { filteredLeads, classificationCounts };
}
