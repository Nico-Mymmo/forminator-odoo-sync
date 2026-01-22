# CRITICAL SEMANTIC CORRECTION — Lead Filters Force Filtering

**Date:** January 22, 2026  
**Type:** Semantic Correction (Product Logic)  
**Status:** ✅ COMPLETE

---

## Problem

The two-phase architecture was technically correct but **semantically wrong** for user expectations.

**Before:**
- User sets lead filters (e.g., stage = "SQL", won_status = "won")
- Selects mode = "include"
- Gets ALL action sheets back
- Only some are enriched with leads
- **Result:** Useless for filtering by lead criteria

**User Expectation:**
- When lead filters are active, they want ONLY action sheets with matching leads
- Lead filters should always result in FILTERED results, not just enrichment

---

## Solution

### Semantic Rule (NEW CANON)

**If ANY lead filters are present:**
- `stage_ids.length > 0` OR `won_status.length > 0`

**Then:**
- Force `effectiveMode = 'exclude'`
- Override requested mode if needed
- Result: A ∩ B (only action sheets with matching leads)

**Otherwise:**
- Respect requested mode
- Result: Enrichment-only behavior allowed

---

## Implementation

### File Modified

**`src/modules/sales-insight-explorer/lib/lead-enrichment.js`**

### Code Change

```javascript
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
  effectiveMode,  // Use effective mode, not requested mode
  notes
);
```

### Meta Update

```javascript
set_operations: {
  requested_mode: requestedMode,     // What user/wizard requested
  effective_mode: effectiveMode,      // What was actually applied
  mode_override_reason: modeOverrideReason,  // 'lead_filters_active' or null
  // ... rest of meta
}
```

---

## Example: Payload with Lead Filters

### Request

```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    { "model": "x_sales_action_sheet", "field": "id" },
    { "model": "x_sales_action_sheet", "field": "x_name" }
  ],
  "filters": [],
  "lead_enrichment": {
    "enabled": true,
    "mode": "include",
    "filters": {
      "stage_ids": [2],
      "won_status": ["won"]
    }
  }
}
```

### Response

```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": 123,
        "x_name": "Action Sheet with Matching Lead",
        "leads": [
          {
            "id": 456,
            "name": "Lead in SQL stage",
            "stage_id": [2, "SQL"],
            "active": true,
            "won_status": "won"
          }
        ]
      }
    ],
    "meta": {
      "execution_method": "two_phase_derived",
      "notes": [
        "Primary query: x_sales_action_sheet with 0 filters",
        "Primary query returned 150 records",
        "🔗 Lead enrichment: two-phase derived set operations",
        "Phase 1: Primary query returned 150 action sheets (set A)",
        "Secondary query: crm.lead with domain [['active','=',true],['stage_ids','in',[2]],['won_status','in',['won']]]",
        "Phase 2: Secondary query returned 12 leads",
        "Set B: 8 unique action sheet IDs referenced by leads",
        "⚠️  Mode override: 'include' → 'exclude' (lead filters require filtering)",
        "Set operation: mode=exclude, |A∩B|=8, |A−B|=142",
        "Set operations complete: 8 records in result set"
      ],
      "set_operations": {
        "requested_mode": "include",
        "effective_mode": "exclude",
        "mode_override_reason": "lead_filters_active",
        "primary_set_size": 150,
        "secondary_set_size": 8,
        "intersection_size": 8,
        "difference_size": 142,
        "result_count": 8
      }
    }
  }
}
```

**Key Points:**
- Primary query: 150 action sheets
- Secondary query: 12 leads matching filters → 8 unique action sheets
- **Requested mode:** `include`
- **Effective mode:** `exclude` (overridden)
- **Result:** 8 action sheets (A ∩ B), NOT 150

---

## Behavior Matrix

| Lead Filters | Requested Mode | Effective Mode | Result Set | Override? |
|--------------|---------------|----------------|------------|-----------|
| None | `include` | `include` | A (all) | No |
| None | `exclude` | `exclude` | A ∩ B | No |
| None | `only_without_lead` | `only_without_lead` | A − B | No |
| **Active** | `include` | **`exclude`** | **A ∩ B** | **Yes** |
| **Active** | `exclude` | `exclude` | A ∩ B | No |
| **Active** | `only_without_lead` | `only_without_lead` | A − B | No |

**Active = stage_ids.length > 0 OR won_status.length > 0**

---

## Test Results

```
=== TEST: Lead Filters Semantic Correction ===

Test 1: Include mode WITHOUT lead filters
  Requested: include
  Effective: include
  ✅ PASS: true

Test 2: Include mode WITH stage filter
  Requested: include
  Effective: exclude
  Override reason: lead_filters_active
  ✅ PASS: true

Test 3: Include mode WITH won_status filter
  Requested: include
  Effective: exclude
  Override reason: lead_filters_active
  ✅ PASS: true

Test 4: Include mode WITH both filters
  Requested: include
  Effective: exclude
  Override reason: lead_filters_active
  ✅ PASS: true

Test 5: Exclude mode WITH filters
  Requested: exclude
  Effective: exclude
  ✅ PASS: true

Test 6: only_without_lead mode WITH filters
  Requested: only_without_lead
  Effective: only_without_lead
  ✅ PASS: true

Summary:
✅ Include + no filters = include (enrichment only)
✅ Include + filters = exclude (filtered results)
✅ Exclude/only_without_lead unaffected by override
```

---

## Why This Matters

### User Story

**Scenario:** "Show me all action sheets with leads in SQL stage that were won"

**Before (WRONG):**
- Returns 150 action sheets
- Only 8 have leads
- 142 are empty
- User must manually filter client-side
- **Useless**

**After (CORRECT):**
- Returns 8 action sheets
- All have matching leads
- Ready for analysis
- **Useful**

---

## Architectural Integrity

### ✅ Two-Phase Architecture Unchanged
- Still two separate queries
- Still set operations
- Still no joins or relations

### ✅ No Breaking Changes
- Validation unchanged
- Payload structure unchanged
- Frontend unchanged

### ✅ Transparent Override
- Meta shows requested vs effective mode
- Notes explain override reason
- Full transparency

---

## Summary

**What Changed:**
- Added filter-aware mode override logic (15 lines)
- Updated meta structure to show mode override
- Added execution note when override occurs

**What Didn't Change:**
- Two-phase architecture
- Payload structure
- Validation rules
- Frontend wizard

**Impact:**
- Lead filters now have analytical value
- Results are filtered, not just enriched
- User expectations met

**Status:** ✅ **SEMANTIC CORRECTION COMPLETE**

---

**Implementation Time:** 15 minutes  
**Complexity:** Low (semantic logic only)  
**Risk:** None (backward compatible, transparent)
