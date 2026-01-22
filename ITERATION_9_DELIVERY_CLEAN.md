# Iteration 9: CRM Lead Enrichment via Two-Phase Set Operations

**Date:** January 22, 2026  
**Status:** Design Complete, Implementation Pending  
**Module:** Sales Insight Explorer

---

## ⚠️ AUTHORITATIVE ARCHITECTURE CLARIFICATION

**FINAL AND NON-NEGOTIABLE DATA MODEL:**

1. **`x_sales_action_sheet.lead_id` DOES NOT EXIST**
   - There is NO direct foreign key from action sheets to crm.lead
   - There is NO many2one relation from action sheets to leads

2. **The ONLY valid relationship is UNIDIRECTIONAL:**
   ```
   crm.lead.x_studio_opportunity_actionsheet_ids → x_sales_action_sheet
   ```
   - This is a one2many or many2many field ON THE LEAD MODEL
   - It points FROM leads TO action sheets
   - The relationship cannot be traversed in reverse via schema

3. **Two-Phase Derived Set Operations are the ONLY valid architecture**
   - Primary query: fetch action sheets (set A)
   - Secondary query: fetch leads and extract action_sheet_ids (set B)
   - Set operations: intersection, difference, enrichment
   - NO joins, NO ORM domain tricks, NO schema traversal

---

## Executive Summary

Iteration 9 extends the Sales Insight Explorer with CRM lead enrichment capabilities using **two-phase derived set operations**.

**Key Achievements:**
- ✅ Bug fix: Field format compatibility (COMPLETED)
- ✅ Design: Two-phase set operation architecture (COMPLETED)
- ⏳ Implementation: Lead enrichment modes (PENDING)

**Architecture:**
Two-phase set operations are the ONLY valid architecture for this feature. Action sheets are the leading dataset. Leads are enrichment only.

---

## Part A: Supporting Infrastructure

### Backend Endpoint: CRM Stages

**Implementation:** ✅ COMPLETED

The `/api/sales-insights/stages` endpoint supports the lead filter UI:

```javascript
GET /api/sales-insights/stages
→ Returns crm.stage records ordered by sequence ASC
```

**Files Modified:**
- `src/modules/sales-insight-explorer/routes.js`: Added `getCrmStages()` handler

---

## Part B: Bug Fix - Field Format Compatibility

### Issue
`TypeError: unhashable type: 'dict'` when executing semantic queries.

### Root Cause
The semantic wizard sent field objects `{model: 'x_sales_action_sheet', field: 'id'}` but Odoo's `search_read` requires string arrays `['id', 'x_name']`.

### Solution
Updated `runSemanticQuery` in `routes.js` to detect and extract field names:

```javascript
let fields;
if (Array.isArray(payload.fields) && payload.fields.length > 0) {
  if (typeof payload.fields[0] === 'object' && payload.fields[0].field) {
    fields = payload.fields
      .filter(f => f.model === model)
      .map(f => f.field);
  } else {
    fields = payload.fields;
  }
} else {
  fields = ['id'];
}
```

**Status:** ✅ Fixed and tested

---

## Part C: Data Model Reality

**The ONLY relationship that exists:**

```
crm.lead
  ├─ id (integer)
  ├─ name (char)
  ├─ stage_id (many2one → crm.stage)
  ├─ active (boolean)
  ├─ won_status (selection: 'won'|'lost'|'pending')
  └─ x_studio_opportunity_actionsheet_ids (one2many/many2many → x_sales_action_sheet)
      ↓
x_sales_action_sheet
  ├─ id (integer)
  ├─ x_name (char)
  ├─ create_date (datetime)
  └─ [NO FIELD pointing to crm.lead]
```

**Absolute Constraints:**
1. Action sheets have ZERO schema fields referencing crm.lead
2. The relationship is strictly unidirectional: lead → action sheet
3. One action sheet can be referenced by multiple leads
4. One lead can reference multiple action sheets

---

## Part D: Two-Phase Set Operations Design

### Relation Modes

Let:
- **A** = Set of action sheet IDs from primary query
- **B** = Set of action sheet IDs referenced by leads from secondary query
- **M** = Map: `action_sheet_id → [lead_payload, ...]`

#### Mode 1: `include` (Enrichment Only)
**Set Operation:** Result IDs = A, enrich items in A ∩ B

**Behavior:**
- Return all action sheets from primary query
- For IDs in A ∩ B: add `leads` field with lead data
- For IDs in A − B: no `leads` field (key absent)

#### Mode 2: `exclude` (Only With Leads)
**Set Operation:** Result IDs = A ∩ B

**Behavior:**
- Filter primary results to only IDs in B
- All results have `leads` field populated

#### Mode 3: `only_without_lead`
**Set Operation:** Result IDs = A − B

**Behavior:**
- Filter primary results to exclude any ID in B
- No results have `leads` field

### Secondary Query Specification

**When to Execute:**
Secondary query is ALWAYS required when lead enrichment is enabled.

**Query Structure:**
```javascript
{
  model: 'crm.lead',
  domain: [
    ['active', '=', true],
    // Optional: ['stage_id', 'in', [1, 2, 3]]
    // Optional: ['won_status', 'in', ['won', 'lost']]
  ],
  fields: [
    'id',
    'name',
    'stage_id',
    'active',
    'won_status',
    'x_studio_opportunity_actionsheet_ids'
  ],
  limit: 10000
}
```

**Truncation Behavior (MANDATORY):**

| Mode | Truncation Allowed? | Behavior if Limit Hit |
|------|--------------------|-----------------------|
| `include` | ✅ YES (with warning) | Continue execution, add `truncated: true` to meta |
| `exclude` | ❌ NO | ABORT with error |
| `only_without_lead` | ❌ NO | ABORT with error |

### Enrichment Contract

**Allowed Lead Fields (Strict Whitelist):**
1. `id` (integer)
2. `name` (string)
3. `stage_id` (object)
4. `active` (boolean)
5. `won_status` (string)

**Multiple Leads Handling:**
- Field name: `leads` (plural - NEVER `lead`)
- Always an array
- Sort by `lead.id ASC` for determinism

**No Leads:**
- The `leads` key MUST NOT exist (not null, not [], absent)

**Validation Rules:**
- `include` mode: Some results have `leads`, some don't
- `exclude` mode: ALL results have `leads`
- `only_without_lead` mode: NO results have `leads` key

### Payload Structure

```javascript
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    {"model": "x_sales_action_sheet", "field": "id"},
    {"model": "x_sales_action_sheet", "field": "x_name"}
  ],
  "filters": [...],
  "lead_enrichment": {
    "enabled": true,
    "mode": "include",
    "filters": {
      "stage_ids": [1, 2, 3],
      "won_status": ["won", "lost"]
    }
  }
}
```

---

## Part E: Implementation Plan

### Backend Module: `lib/lead-enrichment.js`

```javascript
/**
 * Lead Enrichment via Two-Phase Set Operations
 */

export async function enrichWithLeads(
  actionSheets,
  enrichmentConfig,
  env,
  notes
) {
  const startTime = Date.now();
  
  // Extract action sheet IDs (set A)
  const setA = new Set(actionSheets.map(as => as.id));
  
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
  
  // Sort leads deterministically
  for (const leads of mapM.values()) {
    leads.sort((a, b) => a.id - b.id);
  }
  
  // Apply set operation
  const result = applySetOperation(
    actionSheets,
    setA,
    setB,
    mapM,
    enrichmentConfig.mode,
    notes
  );
  
  // Build meta
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
      mode: enrichmentConfig.mode,
      primary_set_size: setA.size,
      secondary_set_size: setB.size,
      intersection_size: [...setA].filter(id => setB.has(id)).length,
      difference_size: [...setA].filter(id => !setB.has(id)).length,
      result_count: result.length
    },
    total_execution_time_ms: Date.now() - startTime
  };
  
  return { records: result, meta };
}

async function executeSecondaryLeadQuery(filters, mode, env, notes) {
  const domain = [['active', '=', true]];
  
  if (filters.stage_ids && filters.stage_ids.length > 0) {
    domain.push(['stage_id', 'in', filters.stage_ids]);
  }
  
  if (filters.won_status && filters.won_status.length > 0) {
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

function extractLeadPayload(lead) {
  return {
    id: lead.id,
    name: lead.name,
    stage_id: lead.stage_id,
    active: lead.active,
    won_status: lead.won_status
  };
}

function applySetOperation(actionSheets, setA, setB, mapM, mode) {
  const intersection = new Set([...setA].filter(id => setB.has(id)));
  const difference = new Set([...setA].filter(id => !setB.has(id)));
  
  switch (mode) {
    case 'include':
      return actionSheets.map(as => {
        if (intersection.has(as.id)) {
          return { ...as, leads: mapM.get(as.id) };
        }
        return as;
      });
    
    case 'exclude':
      return actionSheets
        .filter(as => intersection.has(as.id))
        .map(as => ({ ...as, leads: mapM.get(as.id) }));
    
    case 'only_without_lead':
      return actionSheets.filter(as => difference.has(as.id));
    
    default:
      throw new Error(`Invalid lead enrichment mode: ${mode}`);
  }
}
```

### Integration Point: `routes.js`

```javascript
async function runSemanticQuery(context) {
  // Existing primary query logic
  let records = await searchRead(env, {
    model,
    domain,
    fields,
    limit: false
  });
  
  // Apply lead enrichment if requested
  let enrichmentMeta = null;
  if (payload.lead_enrichment && payload.lead_enrichment.enabled) {
    try {
      const enriched = await enrichWithLeads(
        records,
        payload.lead_enrichment,
        env,
        notes
      );
      records = enriched.records;
      enrichmentMeta = enriched.meta;
    } catch (error) {
      if (error.code === 'SECONDARY_QUERY_TRUNCATED') {
        return new Response(JSON.stringify({
          success: false,
          error: {
            message: error.message,
            code: 'SECONDARY_QUERY_TRUNCATED',
            hint: 'Add more specific lead filters to reduce result set',
            mode: payload.lead_enrichment.mode
          }
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      throw error;
    }
  }
  
  // Build final meta
  const meta = {
    model,
    domain,
    fields,
    count: records.length,
    execution_method: enrichmentMeta ? 'two_phase_derived' : 'searchRead',
    ...enrichmentMeta
  };
  
  // Return results
}
```

---

## Part F: Test Plan

### Test 1: Include Mode
- Primary: 100 action sheets
- Secondary: 60 leads → 40 unique action sheet IDs
- Expected: 100 results (40 with `leads`, 60 without)

### Test 2: Exclude Mode
- Primary: 100 action sheets
- Secondary: 60 leads → 40 unique action sheet IDs
- Expected: 40 results (all with `leads`)

### Test 3: Only Without Lead
- Primary: 100 action sheets
- Secondary: 60 leads → 40 unique action sheet IDs
- Expected: 60 results (none with `leads`)

### Test 4: Stage Filter + Exclude
- Lead filter: stage_id IN [2]
- Expected: Only results with leads in stage 2

### Test 5: Multiple Leads per Action Sheet
- Action sheet #123 referenced by leads #1, #2, #3
- Expected: `leads: [{id:1}, {id:2}, {id:3}]` (ordered)

### Test 6: Determinism
- Same query twice
- Expected: Identical output

### Test 7: Secondary Query Limit
- More than 10,000 leads
- Expected: `truncated: true` in meta, warning logged

---

## Part G: Architecture Compliance

### ✅ No Joins
- Two separate queries
- Results combined via set operations

### ✅ No ORM Magic
- Explicit domain filters only
- No implicit relation filtering

### ✅ Deterministic
- Explicit ordering (lead.id ASC)
- Set operations with clear definitions

### ✅ Transparent
- Both queries logged
- Set operation counts in meta

### ✅ Validator as Gatekeeper
- Strict validation for mode and filters
- Schema-driven field validation

---

## Part H: Performance Considerations

### Primary Query
- Standard `search_read` on `x_sales_action_sheet`
- No additional overhead

### Secondary Query
- Single `search_read` on `crm.lead`
- Default limit: 10,000 leads
- Filtered by stage_id, won_status

### Set Operations
- In-memory operations on ID sets
- O(n) complexity for filtering
- Expected: <100ms for typical datasets

### Total Performance Target
- <2s for 1,000 action sheets + 2,000 leads

---

## Part I: Delivery Status

### Completed ✅
- [x] Bug fix: Field format compatibility
- [x] Design document: Two-phase set operations architecture
- [x] Test plan: 7 comprehensive test cases
- [x] CRM stages endpoint
- [x] Data model verified

### Pending ⏳
- [ ] Implementation: `lib/lead-enrichment.js` module
- [ ] UI update: Lead enrichment mode selector
- [ ] UI update: Lead filters
- [ ] Integration: Wire up enrichment in `runSemanticQuery`
- [ ] Validation: Add `validateLeadEnrichment` to validator
- [ ] Error handling: Truncation abort logic
- [ ] Testing: Execute 7 test cases

### Next Steps
1. Implement two-phase enrichment exactly as specified
2. Test thoroughly with all 7 test cases
3. Deploy to production

---

## Part J: Deployment Strategy

**Greenfield Implementation:**
- This is a NEW feature with no legacy system
- Two-phase derived set operations is the canonical architecture
- No migration, no deprecation required

**Deployment Steps:**
1. Implement `lib/lead-enrichment.js`
2. Add UI controls for lead enrichment
3. Integrate into `runSemanticQuery`
4. Deploy to production

---

## Consistency Verification

### ✅ No References to `lead_id`
- [x] Zero mentions of `x_sales_action_sheet.lead_id`
- [x] No invalid field references

### ✅ Single Architecture
- [x] Two-phase set operations ONLY
- [x] No hybrid approaches
- [x] No alternative paths

### ✅ Action Sheets are Leading Dataset
- [x] Primary query always fetches action sheets (set A)
- [x] Secondary query fetches leads for enrichment only
- [x] Leads never used as base model

### ✅ Leads are Enrichment Only
- [x] Leads never filtered in primary query
- [x] Lead filters apply only to secondary query
- [x] Enrichment is additive

### ✅ Truncation Rules Enforced
- [x] `include`: allows truncation with warning
- [x] `exclude`: aborts on truncation
- [x] `only_without_lead`: aborts on truncation

### ✅ Field Naming Canonical
- [x] Always `leads` (plural)
- [x] Key absence for "no leads"
- [x] Allowed fields strictly whitelisted

**VERIFICATION COMPLETE: Document contains ONLY the canonical two-phase architecture.**

---

## Summary

Iteration 9 delivers CRM lead enrichment for Sales Insight Explorer using **two-phase derived set operations** as the ONLY valid architecture.

**Implementation:**
- Primary query: fetch action sheets (set A) using standard filters
- Secondary query: fetch leads, extract `x_studio_opportunity_actionsheet_ids` (set B)
- Set operations: compute A ∩ B, A − B based on mode
- Enrichment: attach `leads` array to qualifying action sheets
- Result: deterministic, transparent, no joins, no ORM magic

**Architectural Compliance:**
- ✅ No SQL joins
- ✅ No ORM magic
- ✅ Full transparency
- ✅ Deterministic results
- ✅ Schema-driven validation
- ✅ Strict truncation rules

**Delivery Status:**
- Design: Complete and canonical
- Implementation: Pending execution per specification
- Test Plan: 7 comprehensive scenarios
- Performance Target: <2s for 1,000 action sheets + 2,000 leads

**Architecture:** Two-phase derived set operations (single path, no alternatives)
