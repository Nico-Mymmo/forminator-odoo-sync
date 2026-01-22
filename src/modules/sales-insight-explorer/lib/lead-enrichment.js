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
 * Enrich action sheets with CRM lead data using two-phase set operations
 * 
 * @param {Array} actionSheets - Results from primary query (set A)
 * @param {Object} enrichmentConfig - Lead enrichment configuration
 * @param {boolean} enrichmentConfig.enabled - Enable lead enrichment
 * @param {string} enrichmentConfig.mode - 'include' | 'exclude' | 'only_without_lead'
 * @param {Object} enrichmentConfig.filters - Lead filters
 * @param {Array<number>} enrichmentConfig.filters.stage_ids - Stage IDs to filter
 * @param {Array<string>} enrichmentConfig.filters.won_status - Won status values
 * @param {Object} env - Cloudflare worker environment
 * @param {Array} notes - Execution notes array (mutated)
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichWithLeads(actionSheets, enrichmentConfig, env, notes) {
  const startTime = Date.now();
  
  notes.push('🔗 Lead enrichment: two-phase derived set operations');
  
  // Extract action sheet IDs (set A)
  const setA = new Set(actionSheets.map(as => as.id));
  notes.push(`Phase 1: Primary query returned ${setA.size} action sheets (set A)`);
  
  // Execute secondary query
  const secondaryResult = await executeSecondaryLeadQuery(
    enrichmentConfig.filters,
    enrichmentConfig.mode,
    env,
    notes
  );
  
  // Build set B and map M
  const setB = new Set();
  const mapM = new Map();
  
  for (const lead of secondaryResult.leads) {
    const actionSheetIds = lead.x_studio_opportunity_actionsheet_ids || [];
    
    for (const asId of actionSheetIds) {
      setB.add(asId);
      
      if (!mapM.has(asId)) {
        mapM.set(asId, []);
      }
      
      mapM.get(asId).push(extractLeadPayload(lead));
    }
  }
  
  notes.push(`Phase 2: Secondary query returned ${secondaryResult.leads.length} leads`);
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
 * @param {Object} env - Worker environment
 * @param {Array} notes - Execution notes
 * @returns {Promise<{leads: Array, truncated: boolean}>}
 */
async function executeSecondaryLeadQuery(filters, mode, env, notes) {
  const domain = [['active', '=', true]];
  
  if (filters?.stage_ids && filters.stage_ids.length > 0) {
    domain.push(['stage_id', 'in', filters.stage_ids]);
  }
  
  if (filters?.won_status && filters.won_status.length > 0) {
    domain.push(['won_status', 'in', filters.won_status]);
  }
  
  notes.push(`Secondary query: crm.lead with domain ${JSON.stringify(domain)}`);
  
  const SECONDARY_LIMIT = 10000;
  
  const leads = await searchRead(env, {
    model: 'crm.lead',
    domain,
    fields: [
      'id',
      'name',
      'stage_id',
      'active',
      'won_status',
      'x_studio_opportunity_actionsheet_ids'
    ],
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
 * Extract allowed lead fields into enrichment payload
 * 
 * @param {Object} lead - Full lead record from Odoo
 * @returns {Object} Lead payload for enrichment
 */
function extractLeadPayload(lead) {
  return {
    id: lead.id,
    name: lead.name,
    stage_id: lead.stage_id,
    active: lead.active,
    won_status: lead.won_status
  };
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
      return actionSheets.map(as => {
        if (intersection.has(as.id)) {
          return { ...as, leads: mapM.get(as.id) };
        }
        return as; // No 'leads' key when no leads exist
      });
    
    case 'exclude':
      // Return only action sheets with leads (A ∩ B)
      return actionSheets
        .filter(as => intersection.has(as.id))
        .map(as => ({ ...as, leads: mapM.get(as.id) }));
    
    case 'only_without_lead':
      // Return only action sheets without leads (A − B)
      return actionSheets.filter(as => difference.has(as.id));
      // No 'leads' key by definition
    
    default:
      throw new Error(`Invalid lead enrichment mode: ${mode}`);
  }
}
