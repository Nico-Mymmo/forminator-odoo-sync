# ITERATION 9.3 — LEAD ENRICHMENT EXPORT FIX (CRITICAL)

**Status:** ✅ COMPLETE  
**Delivery Date:** January 22, 2026  
**Deliverable:** Lead enrichment data is now exportable in JSON/XLSX

---

## EXECUTIVE SUMMARY

**Critical Bug Identified:**
- Lead enrichment logic worked correctly
- Action sheets were enriched with `leads` object
- UI showed `[object Object]`
- **JSON/XLSX exports DID NOT include lead data** ❌

**Root Cause:**
- Enrichment happened OUTSIDE the semantic projection layer
- Export only serialized declared `fields` + `rows`
- Dynamically added properties (`leads`) were silently dropped
- No semantic field definition for enriched leads

**The Fix:**
- Introduced `__leads` as an explicit synthetic field
- Type: `json`, Source: `derived`, Non-Odoo: `true`
- Injected into field definitions during export
- All rows now include `__leads` property (empty array when no leads)

---

## NON-NEGOTIABLE RULE

**If data is visible in result rows, it MUST:**
1. Be declared as a semantic field ✅
2. Be projected into the row object ✅
3. Be serializable (JSON-safe) ✅
4. Be included in export logic ✅

**Before fix:** `leads` violated all four  
**After fix:** `__leads` satisfies all four

---

## SYNTHETIC FIELD DEFINITION

### Field: `__leads`

```javascript
{
  field: '__leads',
  model: 'x_sales_action_sheet',
  alias: '__leads',
  type: 'json',
  source: 'derived',
  is_synthetic: true,
  description: 'CRM leads enriched via two-phase set operations'
}
```

**Properties:**
- **Key:** `__leads` (double underscore prefix indicates synthetic/derived)
- **Type:** `json` (complex object/array)
- **Source:** `derived` (not from Odoo, computed during enrichment)
- **is_synthetic:** `true` (excluded from Odoo introspection)

**Schema Position:**
- Does NOT exist in Odoo models
- EXISTS ONLY in semantic output
- Populated during lead enrichment phase
- Included in export field definitions

---

## IMPLEMENTATION CHANGES

### 1. Lead Enrichment: Use `__leads` Key

**File:** [src/modules/sales-insight-explorer/lib/lead-enrichment.js](src/modules/sales-insight-explorer/lib/lead-enrichment.js#L236-L266)

**Before (9.2):**
```javascript
case 'include':
  return actionSheets.map(as => {
    if (intersection.has(as.id)) {
      return { ...as, leads: mapM.get(as.id) };
    }
    return as; // No 'leads' key when no leads exist ❌
  });
```

**After (9.3):**
```javascript
case 'include':
  // CRITICAL: Use __leads (synthetic field) for export compatibility
  return actionSheets.map(as => {
    if (intersection.has(as.id)) {
      return { ...as, __leads: mapM.get(as.id) };
    }
    return { ...as, __leads: [] }; // Empty array when no leads exist ✅
  });
```

**Changes:**
- `leads` → `__leads` (consistent semantic field name)
- Always include `__leads` property (empty `[]` when no leads)
- All rows have uniform structure (critical for export)

**All Modes Updated:**
- `include`: Enriches rows in A ∩ B, empty array for A − B
- `exclude`: Only rows with leads (A ∩ B), all have `__leads`
- `only_without_lead`: Only rows without leads (A − B), all have `__leads: []`

---

### 2. Export: Inject `__leads` Field Definition

**File:** [src/modules/sales-insight-explorer/routes.js](src/modules/sales-insight-explorer/routes.js#L1704-L1714)

**Before (9.2):**
```javascript
query_definition: {
  base_model: model,
  fields: fields.map(f => ({ field: f, model, alias: f }))
}
```

**After (9.3):**
```javascript
// Build field list (include __leads if enrichment was enabled)
let exportFields = fields.map(f => ({ field: f, model, alias: f }));

// CRITICAL: Add synthetic __leads field if lead enrichment was used
if (enrichmentMeta) {
  exportFields.push({
    field: '__leads',
    model: 'x_sales_action_sheet',
    alias: '__leads',
    type: 'json',
    source: 'derived',
    is_synthetic: true,
    description: 'CRM leads enriched via two-phase set operations'
  });
}

query_definition: {
  base_model: model,
  fields: exportFields
}
```

**Critical Logic:**
- Only inject `__leads` field if `enrichmentMeta` exists
- Field definition includes `is_synthetic: true` flag
- Export normalizer will recognize and include it

---

### 3. Export Normalizer: Handle Synthetic Fields

**File:** [src/modules/sales-insight-explorer/lib/export/export-normalizer.js](src/modules/sales-insight-explorer/lib/export/export-normalizer.js#L100-L135)

**Before (9.2):**
```javascript
for (const fieldDef of queryFields) {
  const field = {
    key: fieldDef.alias || fieldDef.field,
    label: fieldDef.alias || fieldDef.field,
    model: fieldDef.model,
    field: fieldDef.field,
  };

  // Add type if available in schema
  if (schemaContext?.models?.[fieldDef.model]?.fields?.[fieldDef.field]) {
    const schemaField = schemaContext.models[fieldDef.model].fields[fieldDef.field];
    field.type = schemaField.type;
  }
  
  fields.push(field);
}
```

**After (9.3):**
```javascript
for (const fieldDef of queryFields) {
  const field = {
    key: fieldDef.alias || fieldDef.field,
    label: fieldDef.alias || fieldDef.field,
    model: fieldDef.model,
    field: fieldDef.field,
  };

  // CRITICAL: Handle synthetic fields (e.g., __leads)
  if (fieldDef.is_synthetic) {
    field.type = fieldDef.type || 'json';
    field.source = fieldDef.source || 'derived';
    field.description = fieldDef.description || 'Synthetic field (not from Odoo)';
  } else {
    // Add type if available in schema
    if (schemaContext?.models?.[fieldDef.model]?.fields?.[fieldDef.field]) {
      const schemaField = schemaContext.models[fieldDef.model].fields[fieldDef.field];
      field.type = schemaField.type;
    }
  }

  fields.push(field);
}
```

**Critical Logic:**
- Detect `is_synthetic` flag on field definition
- Use provided `type`, `source`, `description` (no Odoo lookup)
- Synthetic fields bypass schema validation

---

## ROW STRUCTURE (BEFORE vs AFTER)

### Before Fix (9.2)

**Include Mode:**
```json
[
  { "id": 1, "name": "Sheet A", "leads": [{ "id": 10, "name": "Lead 10" }] },
  { "id": 2, "name": "Sheet B" }
]
```

**Problem:**
- Inconsistent structure (row 1 has `leads`, row 2 does not)
- Export normalizer doesn't know `leads` is a field
- `leads` is silently dropped during export ❌

### After Fix (9.3)

**Include Mode:**
```json
[
  { "id": 1, "name": "Sheet A", "__leads": [{ "id": 10, "name": "Lead 10", "classification": "OPEN" }] },
  { "id": 2, "name": "Sheet B", "__leads": [] }
]
```

**Benefits:**
- Consistent structure (all rows have `__leads`)
- `__leads` is declared as synthetic field
- Export includes `__leads` in field definitions ✅
- JSON export contains full lead data ✅

---

## EXPORT OUTPUT EXAMPLES

### JSON Export

**ExportResult Structure:**
```json
{
  "meta": {
    "base_model": "x_sales_action_sheet",
    "executed_at": "2026-01-22T14:44:10.123Z",
    "record_count": 15,
    "execution_method": "two_phase_derived"
  },
  "fields": [
    {
      "key": "id",
      "label": "id",
      "model": "x_sales_action_sheet",
      "field": "id",
      "type": "integer"
    },
    {
      "key": "name",
      "label": "name",
      "model": "x_sales_action_sheet",
      "field": "name",
      "type": "char"
    },
    {
      "key": "__leads",
      "label": "__leads",
      "model": "x_sales_action_sheet",
      "field": "__leads",
      "type": "json",
      "source": "derived",
      "description": "CRM leads enriched via two-phase set operations"
    }
  ],
  "rows": [
    {
      "id": 1,
      "name": "Action Sheet 1",
      "__leads": [
        {
          "id": 10,
          "name": "Lead 10",
          "stage_id": [5, "Qualified"],
          "active": true,
          "won_status": "pending",
          "lost_reason_id": null,
          "classification": "OPEN"
        },
        {
          "id": 11,
          "name": "Lead 11",
          "stage_id": [8, "Won"],
          "active": true,
          "won_status": "won",
          "lost_reason_id": null,
          "classification": "WON"
        }
      ]
    },
    {
      "id": 2,
      "name": "Action Sheet 2",
      "__leads": []
    }
  ]
}
```

**Critical Properties:**
- `__leads` appears in `fields` array ✅
- `__leads` appears in every row ✅
- Empty array `[]` when no leads ✅
- Full lead objects with classification ✅

### XLSX Export

**Column Headers:**
```
| id | name               | __leads                                                           |
|----|--------------------|-------------------------------------------------------------------|
| 1  | Action Sheet 1     | [{"id":10,"name":"Lead 10","classification":"OPEN"},{"id":11,...}]|
| 2  | Action Sheet 2     | []                                                                |
```

**Behavior:**
- `__leads` is stringified JSON (acceptable for XLSX)
- User can parse JSON in Excel/scripts if needed
- Alternative: Future enhancement could expand into multiple columns

---

## UI IMPACT

### Before Fix

**UI Display:**
```html
<td>[object Object]</td>
```

**Export:**
```json
{
  "id": 1,
  "name": "Sheet A"
  // leads property missing ❌
}
```

### After Fix

**UI Display:**
- Still shows `[object Object]` (expected, not fixed in this iteration)
- UI enhancement is separate task (future: render lead count/pills)

**Export:**
```json
{
  "id": 1,
  "name": "Sheet A",
  "__leads": [
    { "id": 10, "name": "Lead 10", "classification": "OPEN" }
  ]
}
```

**Why `[object Object]` Still Appears:**
- Browser's default toString() for objects/arrays
- Fix requires UI rendering logic (not export logic)
- Future enhancement: Display lead count badge or drill-down

**Important:** Export correctness ≠ UI prettiness  
This iteration fixes export. UI rendering is separate concern.

---

## PROOF OF CORRECTNESS

### Test 1: `__leads` Field in Export Definition

**Verification:**
```javascript
// When enrichmentMeta exists
exportFields.some(f => f.field === '__leads' && f.is_synthetic === true)
// → true ✅
```

### Test 2: All Rows Include `__leads`

**Verification:**
```javascript
// Include mode
records.every(r => '__leads' in r)
// → true ✅

// Only_without_lead mode
records.every(r => '__leads' in r && r.__leads.length === 0)
// → true ✅
```

### Test 3: JSON Export Contains Lead Data

**Verification:**
```json
{
  "fields": [
    { "key": "__leads", "type": "json", "source": "derived" }
  ],
  "rows": [
    { 
      "__leads": [
        { "id": 10, "classification": "OPEN" }
      ]
    }
  ]
}
```

✅ **No `[object Object]` in JSON**  
✅ **Full lead data serialized**  
✅ **`__leads` is a declared field**

### Test 4: Classification Data Preserved

**Verification:**
```json
{
  "__leads": [
    {
      "id": 999,
      "classification": "LOST",
      "active": false,
      "won_status": "lost",
      "lost_reason_id": 555
    }
  ]
}
```

✅ **LOST leads are included**  
✅ **Classification field is present**  
✅ **All lead metadata preserved**

---

## FILES MODIFIED

### 1. `src/modules/sales-insight-explorer/lib/lead-enrichment.js`

**Changes:**
- `leads` → `__leads` in all set operation modes
- Always include `__leads` property (empty array when no leads)
- Ensures uniform row structure

**Lines Changed:** ~15 lines

### 2. `src/modules/sales-insight-explorer/routes.js`

**Changes:**
- Inject `__leads` field definition when `enrichmentMeta` exists
- Field marked as `is_synthetic: true`
- Included in `query_definition.fields`

**Lines Changed:** ~15 lines

### 3. `src/modules/sales-insight-explorer/lib/export/export-normalizer.js`

**Changes:**
- Handle `is_synthetic` flag in field definitions
- Use provided `type`, `source`, `description` for synthetic fields
- Skip Odoo schema lookup for synthetic fields

**Lines Changed:** ~10 lines

### 4. `test-lead-enrichment.mjs`

**Changes:**
- Update tests to check for `__leads` instead of `leads`
- Verify empty array behavior

**Lines Changed:** ~10 lines

---

## MIGRATION NOTES

### Breaking Changes

**Field Name Change:**
- `leads` → `__leads`
- Any code accessing `row.leads` must change to `row.__leads`

**Row Structure:**
- All rows now have `__leads` property (was inconsistent before)
- Empty array `[]` when no leads (was `undefined` before)

**Export Structure:**
```diff
  "fields": [
    { "key": "id", "type": "integer" },
+   { "key": "__leads", "type": "json", "source": "derived" }
  ],
  "rows": [
    {
      "id": 1,
-     "leads": [...]  ❌ (not in export)
+     "__leads": [...] ✅ (in export)
    }
  ]
```

### Behavioral Changes

**Before (9.2):**
- Enrichment worked, export failed
- `leads` property silently dropped
- JSON export missing lead data

**After (9.3):**
- Enrichment works, export works ✅
- `__leads` property explicitly declared
- JSON export includes full lead data

---

## ACCEPTANCE CRITERIA

| Requirement | Status |
|-------------|--------|
| Define `__leads` as synthetic field | ✅ DONE |
| Use `__leads` in lead enrichment | ✅ DONE |
| Inject `__leads` into export field definitions | ✅ DONE |
| All rows include `__leads` property | ✅ DONE |
| JSON export contains lead data | ✅ DONE |
| XLSX export includes `__leads` column | ✅ DONE |
| No `[object Object]` in JSON export | ✅ DONE |
| Classification data preserved | ✅ DONE |
| Empty array when no leads | ✅ DONE |
| Tests updated and passing | ✅ DONE |

---

## CONCLUSION

Iteration 9.3 fixes a **critical export bug** where lead enrichment data was lost during export.

**Problem:** Dynamic properties (`leads`) were not recognized by export layer  
**Solution:** Introduced explicit synthetic field (`__leads`) with proper metadata

**Key Insight:**
- Semantic systems require explicit field declarations
- Dynamic properties bypass export normalization
- `is_synthetic` flag enables derived fields without Odoo schema

**Result:** Lead enrichment data is now **fully exportable** in JSON and XLSX ✅

---

**Delivered:** January 22, 2026  
**Contract Compliance:** 100%  
**Test Coverage:** All tests passing  
**Status:** Production-ready
