# Iteration 9.1 — Lead Enrichment Acceptance Tests

## Test Environment Setup

All tests executed against production Odoo instance with real data.

Base payload template:
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    {"model": "x_sales_action_sheet", "field": "id"},
    {"model": "x_sales_action_sheet", "field": "x_name"}
  ],
  "filters": [],
  "lead_enrichment": {
    "enabled": true,
    "mode": "include",
    "filters": {}
  }
}
```

---

## Test 1: Include Mode (No Lead Filters)

**Purpose:** Verify that all action sheets are returned, with some enriched with leads.

**Payload:**
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    {"model": "x_sales_action_sheet", "field": "id"},
    {"model": "x_sales_action_sheet", "field": "x_name"}
  ],
  "filters": [],
  "lead_enrichment": {
    "enabled": true,
    "mode": "include",
    "filters": {}
  }
}
```

**Expected Results:**
- All action sheets from primary query returned
- Some records have `leads` array
- Some records have NO `leads` key (key absent, not null)
- Records with leads: `leads` is array of lead objects
- Each lead has: id, name, stage_id, active, won_status
- Meta shows execution_method: 'two_phase_derived'
- Meta shows set operation counts

**Execution:** Run via `/api/sales-insights/semantic/run`

---

## Test 2: Exclude Mode (Only With Leads)

**Purpose:** Verify filtering to only action sheets referenced by leads.

**Payload:**
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    {"model": "x_sales_action_sheet", "field": "id"},
    {"model": "x_sales_action_sheet", "field": "x_name"}
  ],
  "filters": [],
  "lead_enrichment": {
    "enabled": true,
    "mode": "exclude",
    "filters": {}
  }
}
```

**Expected Results:**
- Only action sheets in (A ∩ B) returned
- ALL records have `leads` array
- NO records without `leads` key
- Result count = intersection_size from meta
- Meta confirms mode: 'exclude'

---

## Test 3: Only Without Lead Mode

**Purpose:** Verify filtering to only action sheets with zero leads.

**Payload:**
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    {"model": "x_sales_action_sheet", "field": "id"},
    {"model": "x_sales_action_sheet", "field": "x_name"}
  ],
  "filters": [],
  "lead_enrichment": {
    "enabled": true,
    "mode": "only_without_lead",
    "filters": {}
  }
}
```

**Expected Results:**
- Only action sheets in (A − B) returned
- NO records have `leads` key
- Result count = difference_size from meta
- Meta confirms mode: 'only_without_lead'

---

## Test 4: Stage Filter + Exclude Mode

**Purpose:** Verify lead filtering by stage_id.

**Payload:**
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    {"model": "x_sales_action_sheet", "field": "id"},
    {"model": "x_sales_action_sheet", "field": "x_name"}
  ],
  "filters": [],
  "lead_enrichment": {
    "enabled": true,
    "mode": "exclude",
    "filters": {
      "stage_ids": [2]
    }
  }
}
```

**Prerequisites:**
- First fetch stages: `GET /api/sales-insights/stages`
- Identify stage with ID=2 (or any valid stage)

**Expected Results:**
- Secondary query filtered to stage_id IN [2]
- Only action sheets referenced by leads in stage 2
- All returned records have `leads`
- All leads in results have stage_id = [2, "Stage Name"]

---

## Test 5: Multiple Leads per Action Sheet

**Purpose:** Verify deterministic ordering when one action sheet has multiple leads.

**Payload:**
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    {"model": "x_sales_action_sheet", "field": "id"},
    {"model": "x_sales_action_sheet", "field": "x_name"}
  ],
  "filters": [
    {"field": "id", "operator": "=", "value": 123}
  ],
  "lead_enrichment": {
    "enabled": true,
    "mode": "include",
    "filters": {}
  }
}
```

**Prerequisites:**
- Identify an action sheet ID that is referenced by multiple leads
- If none exist, create test data or skip this test

**Expected Results:**
- Action sheet has `leads` array with N > 1 elements
- Leads sorted by lead.id ASC
- leads[0].id < leads[1].id < leads[2].id

---

## Test 6: Determinism (Same Request Twice)

**Purpose:** Verify identical output for identical requests.

**Payload:**
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    {"model": "x_sales_action_sheet", "field": "id"},
    {"model": "x_sales_action_sheet", "field": "x_name"}
  ],
  "filters": [],
  "lead_enrichment": {
    "enabled": true,
    "mode": "include",
    "filters": {}
  }
}
```

**Expected Results:**
- Execute same request twice
- Response 1 = Response 2 (identical JSON)
- Same record count
- Same enrichment patterns
- Same order

---

## Test 7: Truncation Handling

### Test 7a: Include Mode with Truncation (Allowed)

**Purpose:** Verify include mode allows truncation with warning.

**Scenario:** If secondary query hits 10,000 limit

**Expected Results:**
- Query succeeds (HTTP 200)
- Meta shows: `phases.secondary.truncated: true`
- Execution notes contain warning about incomplete enrichment
- Some records enriched, some not
- NO error thrown

### Test 7b: Exclude Mode with Truncation (Abort)

**Purpose:** Verify exclude mode aborts on truncation.

**Scenario:** If secondary query would exceed 10,000 leads

**Expected Results:**
- Query aborts with HTTP 400
- Error code: 'SECONDARY_QUERY_TRUNCATED'
- Error message explains that results would be incorrect
- Hint suggests adding more specific lead filters
- NO partial results returned

### Test 7c: Only Without Lead Mode with Truncation (Abort)

**Purpose:** Verify only_without_lead mode aborts on truncation.

**Scenario:** If secondary query would exceed 10,000 leads

**Expected Results:**
- Query aborts with HTTP 400
- Error code: 'SECONDARY_QUERY_TRUNCATED'
- Error message explains mode incompatibility with truncation
- Hint provided
- NO partial results returned

**Note:** Tests 7b and 7c require data volumes that may not exist in current environment.
May need to reduce SECONDARY_LIMIT temporarily for testing.

---

## Test 8: Validation Tests

### Test 8a: Invalid Mode

**Payload:**
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [...],
  "lead_enrichment": {
    "enabled": true,
    "mode": "invalid_mode",
    "filters": {}
  }
}
```

**Expected:** Validation error before execution

### Test 8b: Invalid stage_ids Type

**Payload:**
```json
{
  "lead_enrichment": {
    "enabled": true,
    "mode": "include",
    "filters": {
      "stage_ids": "not_an_array"
    }
  }
}
```

**Expected:** Validation error: stage_ids must be array

### Test 8c: Invalid won_status Value

**Payload:**
```json
{
  "lead_enrichment": {
    "enabled": true,
    "mode": "include",
    "filters": {
      "won_status": ["invalid_status"]
    }
  }
}
```

**Expected:** Validation error: invalid won_status value

### Test 8d: Unknown Filter Key

**Payload:**
```json
{
  "lead_enrichment": {
    "enabled": true,
    "mode": "include",
    "filters": {
      "unknown_key": "value"
    }
  }
}
```

**Expected:** Validation error: unknown key

---

## Execution Instructions

1. Start local dev server: `npm run dev`
2. Open Sales Insight Explorer
3. Use browser DevTools Network tab to intercept and modify requests
4. Execute each test payload via `/api/sales-insights/semantic/run`
5. Verify response structure and values
6. Document results below

---

## Test Results

### Test 1: Include Mode ✅ / ❌

**Executed:** [Date/Time]
**Result:** 
- Total records: 
- Records with leads: 
- Records without leads: 
- Verification: 

### Test 2: Exclude Mode ✅ / ❌

**Executed:** [Date/Time]
**Result:**
- Total records: 
- All have leads: 
- Verification: 

### Test 3: Only Without Lead ✅ / ❌

**Executed:** [Date/Time]
**Result:**
- Total records: 
- None have leads: 
- Verification: 

### Test 4: Stage Filter ✅ / ❌

**Executed:** [Date/Time]
**Result:**
- Stage ID used: 
- Records returned: 
- All leads in correct stage: 
- Verification: 

### Test 5: Multiple Leads ✅ / ❌

**Executed:** [Date/Time]
**Result:**
- Action sheet ID: 
- Lead count: 
- Lead IDs in order: 
- Verification: 

### Test 6: Determinism ✅ / ❌

**Executed:** [Date/Time]
**Result:**
- First request count: 
- Second request count: 
- Responses identical: 
- Verification: 

### Test 7a: Truncation Include ✅ / ❌ / SKIPPED

**Executed:** [Date/Time]
**Result:**
- Truncated flag: 
- Query succeeded: 
- Warning present: 
- Verification: 

### Test 7b: Truncation Exclude ✅ / ❌ / SKIPPED

**Executed:** [Date/Time]
**Result:**
- HTTP status: 
- Error code: 
- Verification: 

### Test 7c: Truncation Only Without Lead ✅ / ❌ / SKIPPED

**Executed:** [Date/Time]
**Result:**
- HTTP status: 
- Error code: 
- Verification: 

### Test 8: Validation Tests ✅ / ❌

**Executed:** [Date/Time]
**Result:**
- 8a Invalid mode: 
- 8b Invalid stage_ids: 
- 8c Invalid won_status: 
- 8d Unknown key: 
- Verification: 

---

## Summary

**Tests Passed:** ___ / ___
**Tests Failed:** ___
**Tests Skipped:** ___

**Overall Status:** PASS / FAIL / PARTIAL

**Blockers:**

**Notes:**
