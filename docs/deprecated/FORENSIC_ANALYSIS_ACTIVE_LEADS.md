# FORENSIC ANALYSIS — ACTIVE=false LEADS (QUERY TRACE)

**Date:** January 22, 2026  
**Analysis Type:** Forensic (Evidence-Based, No Speculation)  
**Objective:** Determine if and where active=false leads are excluded

---

## STEP 1 — End-to-End Execution Trace

### 1.1 Semantic Wizard State

**File:** `public/semantic-wizard.js`  
**Lines:** 95-107

```javascript
this.leadEnrichment = {
  enabled: false,
  mode: 'include',
  filters: {
    won_status: [],
    stage_ids: []
  }
};
```

**Analysis:**
- ❌ NO `active` field in wizard state
- ❌ NO `active` filter in UI
- ❌ NO checkbox for active/inactive leads
- **Conclusion:** User CANNOT specify active filtering via UI

---

### 1.2 Generated Payload

**File:** `public/semantic-wizard.js`  
**Lines:** 215-235 (after architectural fix)

```javascript
if (this.leadEnrichment.enabled) {
  payload.lead_enrichment = {
    enabled: true,
    mode: this.leadEnrichment.mode,
    filters: {}
  };

  if (this.leadEnrichment.filters.won_status.length > 0) {
    payload.lead_enrichment.filters.won_status = this.leadEnrichment.filters.won_status;
  }

  if (this.leadEnrichment.filters.stage_ids.length > 0) {
    payload.lead_enrichment.filters.stage_ids = this.leadEnrichment.filters.stage_ids;
  }
}
```

**Analysis:**
- ❌ NO `active` field generated in payload
- Only `won_status` and `stage_ids` are included
- **Conclusion:** Payload NEVER contains active filter

---

### 1.3 Backend Validation

**File:** `src/modules/sales-insight-explorer/lib/semantic-validator.js`  
**Lines:** 318-420

```javascript
export function validateLeadEnrichment(leadEnrichment) {
  // ... validation logic
  
  if (leadEnrichment.filters) {
    const filters = leadEnrichment.filters;

    // Validate stage_ids
    if (filters.stage_ids !== undefined) { /* ... */ }

    // Validate won_status
    if (filters.won_status !== undefined) { /* ... */ }

    // Check for unknown keys
    const allowedKeys = ['stage_ids', 'won_status'];
    const unknownKeys = Object.keys(filters).filter(key => !allowedKeys.includes(key));
    // ...
  }
}
```

**Analysis:**
- ✅ `active` is NOT in `allowedKeys`
- ❌ If user manually added `active` to payload, validation would REJECT it
- **Conclusion:** Backend validation BLOCKS `active` filter

---

### 1.4 Lead Enrichment Orchestration

**File:** `src/modules/sales-insight-explorer/lib/lead-enrichment.js`  
**Lines:** 37-90

```javascript
export async function enrichWithLeads(actionSheets, enrichmentConfig, env, notes) {
  // ...
  
  const secondaryResult = await executeSecondaryLeadQuery(
    enrichmentConfig.filters,  // <- Passed as-is
    enrichmentConfig.mode,
    env,
    notes
  );
  
  // No modification of filters here
}
```

**Analysis:**
- Filters passed directly to secondary query builder
- ❌ NO default injection at this level
- **Conclusion:** Orchestration is transparent (filters passed through)

---

### 1.5 Secondary Lead Query Construction

**File:** `src/modules/sales-insight-explorer/lib/lead-enrichment.js`  
**Lines:** 145-163

**CRITICAL CODE:**

```javascript
async function executeSecondaryLeadQuery(filters, mode, env, notes) {
  const domain = [['active', '=', true]];  // ← HARDCODED
  
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
```

**Analysis:**
- ✅ **SMOKING GUN:** Line 145: `const domain = [['active', '=', true]];`
- This is UNCONDITIONAL
- This is HARDCODED
- This is NOT CONFIGURABLE
- This is NOT DOCUMENTED in wizard UI
- This is NOT EXPOSED in payload structure
- **Conclusion:** `active = false` leads are ALWAYS excluded

---

### 1.6 Odoo searchRead Execution

**Query sent to Odoo:**
```python
model: 'crm.lead'
domain: [
  ['active', '=', true],  # ← ALWAYS PRESENT
  # Optional: ['stage_id', 'in', [...]],
  # Optional: ['won_status', 'in', [...]]
]
fields: ['id', 'name', 'stage_id', 'active', 'won_status', 'x_studio_opportunity_actionsheet_ids']
limit: 10000
```

**Analysis:**
- Odoo receives `active = true` filter in ALL cases
- ❌ NO code path where this filter is absent
- **Conclusion:** Odoo NEVER returns `active = false` leads

---

### 1.7 Result Post-Processing (Set B and Map M)

**File:** `src/modules/sales-insight-explorer/lib/lead-enrichment.js`  
**Lines:** 60-71

```javascript
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
```

**Analysis:**
- Processes ONLY the leads returned by Odoo
- Since Odoo already excluded `active = false`, these leads never reach this code
- **Conclusion:** Set B is built from active leads ONLY

---

## STEP 2 — Secondary Lead Query Reconstruction

### Exact Query Sent to Odoo

#### Scenario A: No User Filters

```python
{
  "model": "crm.lead",
  "domain": [
    ["active", "=", true]
  ],
  "fields": [
    "id",
    "name", 
    "stage_id",
    "active",
    "won_status",
    "x_studio_opportunity_actionsheet_ids"
  ],
  "limit": 10000
}
```

#### Scenario B: With Stage Filter

```python
{
  "model": "crm.lead",
  "domain": [
    ["active", "=", true],
    ["stage_id", "in", [2, 3]]
  ],
  "fields": [
    "id",
    "name",
    "stage_id", 
    "active",
    "won_status",
    "x_studio_opportunity_actionsheet_ids"
  ],
  "limit": 10000
}
```

#### Scenario C: With Won Status Filter

```python
{
  "model": "crm.lead",
  "domain": [
    ["active", "=", true],
    ["won_status", "in", ["won", "lost"]]
  ],
  "fields": [
    "id",
    "name",
    "stage_id",
    "active", 
    "won_status",
    "x_studio_opportunity_actionsheet_ids"
  ],
  "limit": 10000
}
```

#### Scenario D: With Both Filters

```python
{
  "model": "crm.lead",
  "domain": [
    ["active", "=", true],
    ["stage_id", "in", [1, 2]],
    ["won_status", "in", ["pending"]]
  ],
  "fields": [
    "id",
    "name",
    "stage_id",
    "active",
    "won_status", 
    "x_studio_opportunity_actionsheet_ids"
  ],
  "limit": 10000
}
```

**Observation:**
- `["active", "=", true]` appears in ALL scenarios
- It is ALWAYS the first element in the domain
- It is NEVER omitted
- It is NEVER configurable

---

## STEP 3 — Code Evidence

### Location: Secondary Query Builder

**File:** `src/modules/sales-insight-explorer/lib/lead-enrichment.js`  
**Line:** 145  
**Function:** `executeSecondaryLeadQuery()`

```javascript
145: const domain = [['active', '=', true]];
```

**Evidence:**
1. ✅ `['active', '=', true]` is added UNCONDITIONALLY
2. ❌ There is NO conditional logic around this line
3. ❌ There is NO parameter to disable this filter
4. ❌ There is NO code path where `active = false` leads can pass

**Proof:**
- Initialized as first element of domain array
- No `if` statement guards its inclusion
- No configuration option exists to remove it
- Backend validation would reject `active` in user filters

---

## STEP 4 — Design Contract Comparison

### From ITERATION_9_DELIVERY_CLEAN.md

**Line 164-176: Secondary Query Specification**

```javascript
{
  model: 'crm.lead',
  domain: [
    ['active', '=', true],  // ← DOCUMENTED AS REQUIRED
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

**Analysis:**
- ✅ The design document EXPLICITLY specifies `['active', '=', true]`
- ✅ It is NOT marked as "Optional"
- ✅ It appears BEFORE the optional filters
- **Conclusion:** The current implementation is **DESIGN-CONSISTENT**

---

### Design Intent Analysis

**From the spec:**
- `stage_ids` is marked "Optional"
- `won_status` is marked "Optional"
- `active = true` is NOT marked optional
- It is included in the canonical query structure

**Interpretation:**
- Filtering to active leads is BY DESIGN
- It is NOT opt-in
- It is NOT opt-out
- It is MANDATORY

**Status:** ✅ **DESIGN-CONSISTENT**

---

## STEP 5 — Empirical Reproduction Scenario

### Test Case: Inactive Lead Only

**Setup:**
1. Action Sheet ID: 999
2. Lead ID: 888
   - `active = false`
   - `x_studio_opportunity_actionsheet_ids = [999]`
3. No other leads reference action sheet 999

**Payload:**
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    {"model": "x_sales_action_sheet", "field": "id"}
  ],
  "filters": [
    {"field": "id", "operator": "=", "value": 999}
  ],
  "lead_enrichment": {
    "enabled": true,
    "mode": "include",
    "filters": {}
  }
}
```

### Expected Result (According to Design)

**Per ITERATION_9_DELIVERY_CLEAN.md:**
- Secondary query has `['active', '=', true]`
- Lead 888 has `active = false`
- Lead 888 is excluded from secondary query
- Set B is empty (no action sheets referenced by active leads)
- Result: Action sheet 999 returned WITHOUT `leads` key

**Result:**
```json
{
  "records": [
    {
      "id": 999
      // NO 'leads' key
    }
  ],
  "meta": {
    "set_operations": {
      "primary_set_size": 1,
      "secondary_set_size": 0,  // ← No active leads
      "intersection_size": 0,
      "result_count": 1
    }
  }
}
```

---

### Actual Result (According to Current Implementation)

**Execution trace:**
1. Primary query: Action sheet 999 returned (set A = {999})
2. Secondary query: `domain = [['active', '=', true]]`
3. Odoo returns: 0 leads (lead 888 excluded)
4. Set B = {} (empty)
5. Map M = {} (empty)
6. Set operation (include mode): Return all from A
7. Action sheet 999 has NO leads key

**Result:**
```json
{
  "records": [
    {
      "id": 999
      // NO 'leads' key
    }
  ],
  "meta": {
    "set_operations": {
      "primary_set_size": 1,
      "secondary_set_size": 0,
      "intersection_size": 0,
      "result_count": 1
    }
  }
}
```

---

### Why Results Match

**Expected = Actual**

Because:
1. Design document specifies `active = true` filter
2. Implementation includes `active = true` filter
3. Both exclude inactive leads
4. **Conclusion:** Implementation matches design

---

## STEP 6 — CONCLUSION

### CONCLUSION — ACTIVE=false LEADS

**Statement:** Active=false leads ARE EXCLUDED

**Proof:**
- **Line 145** of `src/modules/sales-insight-explorer/lib/lead-enrichment.js`
- Hardcoded: `const domain = [['active', '=', true]];`
- Unconditional: No if-statement, no configuration, no opt-out

**Exact Cause:**
Hardcoded domain initialization in `executeSecondaryLeadQuery()`

**Exact Code Location:**
- File: `src/modules/sales-insight-explorer/lib/lead-enrichment.js`
- Function: `executeSecondaryLeadQuery(filters, mode, env, notes)`
- Line: 145

**Intent Analysis:**
This exclusion is **INTENTIONAL**, not accidental.

**Evidence:**
1. Design document (`ITERATION_9_DELIVERY_CLEAN.md`, line 164) explicitly includes `['active', '=', true]` in the canonical query
2. It is NOT marked as "Optional" (unlike `stage_ids` and `won_status`)
3. It appears in the primary position in the domain array
4. No configuration exists to disable it

**Design Compliance:**
✅ **DESIGN-CONSISTENT**

The current implementation faithfully executes the design specification. The exclusion of inactive leads is part of the canonical architecture.

---

## EXECUTIVE SUMMARY (FOR DECISION-MAKING)

### Key Findings

1. **Inactive leads are excluded:** YES, always
2. **Where:** Line 145 of `lead-enrichment.js`
3. **How:** Hardcoded `['active', '=', true]` in domain
4. **Why:** Per design specification (not a bug)
5. **User control:** NONE (no UI, no payload option, no opt-out)

### Behavior Matrix

| Lead Active Status | Included in Secondary Query? | Can Enrich Action Sheets? |
|--------------------|------------------------------|---------------------------|
| `active = true` | ✅ YES | ✅ YES |
| `active = false` | ❌ NO | ❌ NO |

### Implications

**Scenario:** Action sheet linked ONLY to inactive leads
- **Result:** No leads enrichment
- **User perception:** "This action sheet has no leads"
- **Reality:** It has leads, but they're inactive

**Scenario:** Action sheet linked to BOTH active and inactive leads
- **Result:** Only active leads shown
- **User perception:** Partial lead list
- **Reality:** Inactive leads silently excluded

### Code Paths Analysis

**Total code paths:** 1  
**Paths that include active=false leads:** 0  
**Paths that exclude active=false leads:** 1

**Conclusion:** There is NO code path where inactive leads can pass through.

---

## MISSING INFORMATION

**None.**

All analysis objectives have been met with concrete evidence.

No speculation was required.

---

**Analysis Complete**  
**Date:** January 22, 2026  
**Confidence Level:** 100% (Evidence-Based)
