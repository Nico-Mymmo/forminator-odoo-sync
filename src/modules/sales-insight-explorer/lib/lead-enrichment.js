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
 * Defines semantic groupings of lead fields for projection control.
 * Users can enable/disable toggleable groups to control enrichment shape.
 * 
 * RULES:
 * - "status_outcome" is ALWAYS included (cannot be disabled)
 * - Other groups are toggleable
 * - Missing fields resolve to null (no errors)
 */
export const LEAD_PROPERTY_GROUPS = {
  status_outcome: {
    id: 'status_outcome',
    label: 'Status & Outcome',
    always_enabled: true,
    fields: [
      'id',
      'name',
      'won_status',
      'stage_id',
      'lost_reason_id',
      'active'
    ]
  },
  time_flow: {
    id: 'time_flow',
    label: 'Time & Flow',
    always_enabled: false,
    fields: [
      'create_date',
      'date_last_stage_update',
      'date_closed',
      'day_open',
      'day_close'
    ]
  },
  origin_marketing: {
    id: 'origin_marketing',
    label: 'Origin & Marketing',
    always_enabled: false,
    fields: [
      'source_id',
      'medium_id',
      'campaign_id',
      'referred'
    ]
  },
  business_signals: {
    id: 'business_signals',
    label: 'Business Signals',
    always_enabled: false,
    fields: [
      'x_studio_hotness_label',
      'x_studio_hotness_score',
      'x_studio_lifecycle',
      'x_studio_marketing_noden',
      'x_studio_has_linked_actionsheets'
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
  
  // Always fetch x_studio_opportunity_actionsheet_ids for set building
  fields.add('x_studio_opportunity_actionsheet_ids');
  
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
  
  notes.push('🔗 Lead enrichment: two-phase derived set operations');
  
  // Extract enabled property groups (status_outcome is always enabled)
  const enabledGroups = enrichmentConfig.property_groups || [];
  const allEnabledGroups = ['status_outcome', ...enabledGroups.filter(g => g !== 'status_outcome')];
  notes.push(`Property groups enabled: ${allEnabledGroups.join(', ')}`);
  
  // Extract action sheet IDs (set A)
  const setA = new Set(actionSheets.map(as => as.id));
  notes.push(`Phase 1: Primary query returned ${setA.size} action sheets (set A)`);
  
  // Execute secondary query with fields from enabled groups
  const secondaryResult = await executeSecondaryLeadQuery(
    enrichmentConfig.filters,
    enrichmentConfig.mode,
    enabledGroups,
    env,
    notes
  );
  
  // Filter IGNORED leads after retrieval (classification happens here)
  const { filteredLeads, classificationCounts } = filterIgnoredLeads(secondaryResult.leads, notes);
  
  // Build set B and map M
  const setB = new Set();
  const mapM = new Map();
  
  for (const lead of filteredLeads) {
    const actionSheetIds = lead.x_studio_opportunity_actionsheet_ids || [];
    
    for (const asId of actionSheetIds) {
      setB.add(asId);
      
      if (!mapM.has(asId)) {
        mapM.set(asId, []);
      }
      
      // Extract lead payload with enabled property groups
      mapM.get(asId).push(extractLeadPayload(lead, enabledGroups));
    }
  }
  
  notes.push(`Phase 2: Secondary query returned ${secondaryResult.leads.length} leads`);
  notes.push(`Lead classification: ${classificationCounts.OPEN} OPEN, ${classificationCounts.WON} WON, ${classificationCounts.LOST} LOST, ${classificationCounts.IGNORED} IGNORED`);
  notes.push(`After filtering: ${filteredLeads.length} analytically relevant leads`);
  notes.push(`Set B: ${setB.size} unique action sheet IDs referenced by leads`);
  
  // Sort leads deterministically (lead.id ASC)
  for (const leads of mapM.values()) {
    leads.sort((a, b) => a.id - b.id);
  }
  
  // SEMANTIC CORRECTION: Detect if lead filters are active
  const hasLeadFilters = 
    (enrichmentConfig.filters?.stage_ids && enrichmentConfig.filters.stage_ids.length > 0) ||
    (enrichmentConfig.filters?.won_status && enrichmentConfig.filters.won_status.length > 0);
  
  // Determine effective mode
  const requestedMode = enrichmentConfig.mode;
  let effectiveMode = requestedMode;
  let modeOverrideReason = null;
  
  if (hasLeadFilters && requestedMode === 'include') {
    effectiveMode = 'exclude';
    modeOverrideReason = 'lead_filters_active';
    notes.push(`⚠️  Mode override: 'include' → 'exclude' (lead filters require filtering)`);
  }
  
  // Apply set operation with effective mode
  const result = applySetOperation(
    actionSheets,
    setA,
    setB,
    mapM,
    effectiveMode,
    notes
  );
  
  // Build meta
  const intersection = [...setA].filter(id => setB.has(id));
  const difference = [...setA].filter(id => !setB.has(id));
  
  const meta = {
    execution_method: 'two_phase_derived',
    phases: {
      primary: { count: actionSheets.length },
      secondary: {
        count: secondaryResult.leads.length,
        classification_counts: classificationCounts,
        filtered_count: filteredLeads.length,
        unique_action_sheet_ids: setB.size,
        truncated: secondaryResult.truncated
      }
    },
    set_operations: {
      requested_mode: requestedMode,
      effective_mode: effectiveMode,
      mode_override_reason: modeOverrideReason,
      primary_set_size: setA.size,
      secondary_set_size: setB.size,
      intersection_size: intersection.length,
      difference_size: difference.length,
      result_count: result.length
    },
    total_execution_time_ms: Date.now() - startTime
  };
  
  notes.push(`Set operations complete: ${result.length} records in result set`);
  
  return { records: result, meta };
}

/**
 * Execute secondary query on crm.lead model
 * 
 * @param {Object} filters - Lead filters
 * @param {string} mode - Enrichment mode
 * @param {Array<string>} enabledGroups - Enabled property groups
 * @param {Object} env - Worker environment
 * @param {Array} notes - Execution notes
 * @returns {Promise<{leads: Array, truncated: boolean}>}
 */
async function executeSecondaryLeadQuery(filters, mode, enabledGroups, env, notes) {
  // CRITICAL: Allow both active=true AND active=false to retrieve LOST leads
  // LOST leads in Odoo CRM are: active=false, won_status='lost', lost_reason_id IS SET
  // Classification happens AFTER retrieval, not via exclusion
  const domain = [['active', 'in', [true, false]]];
  
  if (filters?.stage_ids && filters.stage_ids.length > 0) {
    domain.push(['stage_id', 'in', filters.stage_ids]);
  }
  
  if (filters?.won_status && filters.won_status.length > 0) {
    domain.push(['won_status', 'in', filters.won_status]);
  }
  
  notes.push(`Secondary query: crm.lead with domain ${JSON.stringify(domain)}`);
  
  // Get fields from enabled property groups
  const fields = getEnabledFields(enabledGroups);
  notes.push(`Fetching ${fields.length} fields from enabled property groups`);
  
  const SECONDARY_LIMIT = 10000;
  
  const leads = await searchRead(env, {
    model: 'crm.lead',
    domain,
    fields,
    limit: SECONDARY_LIMIT
  });
  
  const truncated = leads.length >= SECONDARY_LIMIT;
  
  if (truncated) {
    if (mode === 'exclude' || mode === 'only_without_lead') {
      const error = new Error(
        `Secondary query exceeded limit (${SECONDARY_LIMIT} leads). ` +
        `Results would be incorrect for mode '${mode}'. ` +
        `Please add more specific lead filters.`
      );
      error.code = 'SECONDARY_QUERY_TRUNCATED';
      throw error;
    } else {
      notes.push(`⚠️  Secondary query hit limit (${SECONDARY_LIMIT}); enrichment incomplete`);
    }
  }
  
  return { leads, truncated };
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
  const groupOrder = ['time_flow', 'origin_marketing', 'business_signals'];
  
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
 * Apply set operation based on enrichment mode
 * 
 * @param {Array} actionSheets - Primary query results (set A)
 * @param {Set} setA - Action sheet IDs from primary query
 * @param {Set} setB - Action sheet IDs referenced by leads
 * @param {Map} mapM - Map: action_sheet_id → [lead_payload, ...]
 * @param {string} mode - 'include' | 'exclude' | 'only_without_lead'
 * @param {Array} notes - Execution notes
 * @returns {Array} Filtered and enriched records
 */
function applySetOperation(actionSheets, setA, setB, mapM, mode, notes) {
  const intersection = new Set([...setA].filter(id => setB.has(id)));
  const difference = new Set([...setA].filter(id => !setB.has(id)));
  
  notes.push(`Set operation: mode=${mode}, |A∩B|=${intersection.size}, |A−B|=${difference.size}`);
  
  switch (mode) {
    case 'include':
      // Return all action sheets, enrich items in A ∩ B
      // CRITICAL: Use __leads (synthetic field) for export compatibility
      return actionSheets.map(as => {
        if (intersection.has(as.id)) {
          return { ...as, __leads: mapM.get(as.id) };
        }
        return { ...as, __leads: [] }; // Empty array when no leads exist
      });
    
    case 'exclude':
      // Return only action sheets with leads (A ∩ B)
      return actionSheets
        .filter(as => intersection.has(as.id))
        .map(as => ({ ...as, __leads: mapM.get(as.id) }));
    
    case 'only_without_lead':
      // Return only action sheets without leads (A − B)
      return actionSheets
        .filter(as => difference.has(as.id))
        .map(as => ({ ...as, __leads: [] })); // Explicit empty array
    
    default:
      throw new Error(`Invalid lead enrichment mode: ${mode}`);
  }
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
    if (lead.won_status === 'lost' && lead.lost_reason_id) {
      return 'LOST';
    } else {
      // active=false but NOT properly lost (archived/soft-deleted)
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
function filterIgnoredLeads(leads, notes) {
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
