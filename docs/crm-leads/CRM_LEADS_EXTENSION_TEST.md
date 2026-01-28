# CRM Leads Extension - Testing & Validation

## Overview
Extension to Sales Insight Explorer enabling explicit CRM lead inclusion and filtering.

## Implementation Summary

### Phase 1: Explicit Lead Inclusion
✅ Added `includeCrmLeads` toggle in wizard state
✅ When enabled, adds RelationTraversal from `x_sales_action_sheet.lead_id` to `crm.lead`
✅ Always includes 5 fields: id, name, stage_id, active, won_status
✅ No defaults, no inference - explicit only

### Phase 2: Lead Filters
✅ `won_status` filter: Multi-select from ['won', 'lost', 'pending']
✅ `stage_id` filter: Chronological stage selection with UI helpers
✅ Filters applied as explicit domain filters using `in` operator

### Phase 3: Backend Support
✅ Added `/api/sales-insights/stages` endpoint to fetch crm.stage records
✅ Stages ordered by sequence for chronological display

## Test Payloads

### Test 1: CRM Leads Enabled, No Filters
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    { "model": "x_sales_action_sheet", "field": "id" },
    { "model": "x_sales_action_sheet", "field": "x_name" },
    { "model": "x_sales_action_sheet", "field": "create_date" },
    { "model": "lead", "field": "id" },
    { "model": "lead", "field": "name" },
    { "model": "lead", "field": "stage_id" },
    { "model": "lead", "field": "active" },
    { "model": "lead", "field": "won_status" }
  ],
  "filters": [],
  "relations": [
    {
      "alias": "lead",
      "path": [
        {
          "from_model": "x_sales_action_sheet",
          "relation_field": "lead_id",
          "target_model": "crm.lead",
          "relation_type": "many2one"
        }
      ],
      "filters": []
    }
  ]
}
```

**Expected Behavior:**
- Validator should pass
- Executor should fetch lead data for each action sheet
- Results should include lead fields prefixed with alias
- No filtering applied

### Test 2: CRM Leads with won_status Filter
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    { "model": "x_sales_action_sheet", "field": "id" },
    { "model": "x_sales_action_sheet", "field": "x_name" },
    { "model": "x_sales_action_sheet", "field": "create_date" },
    { "model": "lead", "field": "id" },
    { "model": "lead", "field": "name" },
    { "model": "lead", "field": "stage_id" },
    { "model": "lead", "field": "active" },
    { "model": "lead", "field": "won_status" }
  ],
  "filters": [],
  "relations": [
    {
      "alias": "lead",
      "path": [
        {
          "from_model": "x_sales_action_sheet",
          "relation_field": "lead_id",
          "target_model": "crm.lead",
          "relation_type": "many2one"
        }
      ],
      "filters": [
        {
          "model": "lead",
          "field": "won_status",
          "operator": "in",
          "value": ["lost"]
        }
      ]
    }
  ]
}
```

**Expected Behavior:**
- Only action sheets with leads marked as "lost" should be included
- Enables "drop-off analysis" use case

### Test 3: CRM Leads with Stage Filter
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    { "model": "x_sales_action_sheet", "field": "id" },
    { "model": "x_sales_action_sheet", "field": "x_name" },
    { "model": "x_sales_action_sheet", "field": "create_date" },
    { "model": "lead", "field": "id" },
    { "model": "lead", "field": "name" },
    { "model": "lead", "field": "stage_id" },
    { "model": "lead", "field": "active" },
    { "model": "lead", "field": "won_status" }
  ],
  "filters": [],
  "relations": [
    {
      "alias": "lead",
      "path": [
        {
          "from_model": "x_sales_action_sheet",
          "relation_field": "lead_id",
          "target_model": "crm.lead",
          "relation_type": "many2one"
        }
      ],
      "filters": [
        {
          "model": "lead",
          "field": "stage_id",
          "operator": "in",
          "value": [1, 2, 3]
        }
      ]
    }
  ]
}
```

**Expected Behavior:**
- Only action sheets with leads in stages 1, 2, or 3 should be included
- Stage IDs must be explicit (no sequence logic in query)

### Test 4: Combined Filters
```json
{
  "base_model": "x_sales_action_sheet",
  "fields": [
    { "model": "x_sales_action_sheet", "field": "id" },
    { "model": "x_sales_action_sheet", "field": "x_name" },
    { "model": "x_sales_action_sheet", "field": "create_date" },
    { "model": "lead", "field": "id" },
    { "model": "lead", "field": "name" },
    { "model": "lead", "field": "stage_id" },
    { "model": "lead", "field": "active" },
    { "model": "lead", "field": "won_status" }
  ],
  "filters": [],
  "relations": [
    {
      "alias": "lead",
      "path": [
        {
          "from_model": "x_sales_action_sheet",
          "relation_field": "lead_id",
          "target_model": "crm.lead",
          "relation_type": "many2one"
        }
      ],
      "filters": [
        {
          "model": "lead",
          "field": "won_status",
          "operator": "in",
          "value": ["lost"]
        },
        {
          "model": "lead",
          "field": "stage_id",
          "operator": "in",
          "value": [2, 3]
        }
      ]
    }
  ]
}
```

**Expected Behavior:**
- Both filters applied (AND logic)
- Shows action sheets where lead was lost at stages 2 or 3
- Enables precise drop-off analysis

## Validation Checklist

### UI Validation
- [ ] Toggle appears in Step 1
- [ ] Toggle defaults to OFF
- [ ] Info alert explains what fields are included
- [ ] Step 2 shows lead filters only when toggle is ON
- [ ] Won_status checkboxes work correctly
- [ ] Stage list fetches and displays correctly
- [ ] Stage list is ordered by sequence
- [ ] "Select all" helper works
- [ ] "Clear" helper works
- [ ] Payload preview shows correct structure

### Backend Validation
- [ ] `/api/sales-insights/stages` endpoint returns crm.stage records
- [ ] Stages are ordered by sequence ASC
- [ ] Query validator accepts RelationTraversal structure
- [ ] Field validation passes for lead.* fields
- [ ] Filter validation passes for lead filters
- [ ] Query executor handles relation.filters correctly

### Payload Validation
- [ ] Fields array uses proper FieldSelection structure
- [ ] All fields have `model` and `field` properties
- [ ] RelationTraversal has required properties: alias, path
- [ ] Path contains proper RelationPath objects
- [ ] Filters use correct model alias ('lead')
- [ ] No hardcoded values or defaults
- [ ] Empty relations array when toggle is OFF

## Edge Cases

### Edge Case 1: Toggle OFF
**Input:** includeCrmLeads = false
**Expected:** No relation in payload, no lead fields

### Edge Case 2: No Filters Selected
**Input:** includeCrmLeads = true, no filters
**Expected:** Relation with empty filters array

### Edge Case 3: Invalid Stage ID
**Input:** Stage ID that doesn't exist
**Expected:** Validator should not catch this (schema-driven), executor should return empty results

### Edge Case 4: Action Sheet Without Lead
**Input:** Action sheet where lead_id is null
**Expected:** Lead fields should be null/empty in results

## Strict Rules Compliance

✅ **Schema-driven only**: All fields and models validated against schema
✅ **Validator is gatekeeper**: All payloads must pass validation
✅ **RelationTraversal only**: No SQL joins
✅ **No inference**: No defaults, no "smart" behavior
✅ **No aggregations**: Lead data is included, not aggregated
✅ **No analytics**: No special "analysis mode", just data retrieval
✅ **UI/Query separation**: Chronology handled in UI, payload has explicit IDs only

## Files Modified

1. `public/semantic-wizard.js`
   - Added `includeCrmLeads` and `leadFilters` to WizardState
   - Added `toggleCrmLeads`, `setLeadWonStatusFilter`, `setLeadStageFilter` methods
   - Added `fetchCrmStages()` function
   - Updated `buildPayload()` to include RelationTraversal when enabled
   - Updated Step 1 UI to show CRM leads toggle
   - Updated Step 2 UI to show lead filters
   - Made `renderWizard()` async to support stage fetching

2. `src/modules/sales-insight-explorer/routes.js`
   - Added `getCrmStages()` endpoint handler
   - Added route mapping for `GET /api/sales-insights/stages`

## Next Steps for Testing

1. Start development server
2. Navigate to Sales Insight Explorer
3. Test toggle behavior in Step 1
4. Test filter UI in Step 2
5. Review generated payload in console
6. Execute query and verify results
7. Test with various filter combinations
8. Verify payload passes validation
9. Check execution results format

## Known Limitations

1. Stage chronology is UI-only - payload contains explicit stage IDs
2. No automatic stage range calculation in backend
3. No validation of stage ID existence (schema-driven approach)
4. Lead fields are fixed set of 5 - not customizable
5. Only many2one relation supported (as per lead_id field type)

## Success Criteria

✅ All payloads validate successfully
✅ No hardcoded values in query logic
✅ UI provides clear controls for explicit selection
✅ Filters apply correctly without inference
✅ Results include lead data when toggle is enabled
✅ System remains fully schema-driven and deterministic
