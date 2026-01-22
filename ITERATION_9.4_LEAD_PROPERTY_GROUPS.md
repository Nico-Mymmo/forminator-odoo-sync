# ITERATION 9.4 — LEAD PROPERTY GROUPS (SEMANTIC PROJECTION)

**Status:** ✅ COMPLETE  
**Delivery Date:** January 22, 2026  
**Deliverable:** Structured lead enrichment with toggleable property groups

---

## EXECUTIVE SUMMARY

Lead enrichment now supports **semantic property groups** that allow users to control which lead fields are included in the enriched `__leads` objects.

**Key Features:**
- **Status & Outcome** is ALWAYS included (cannot be disabled)
- Three additional toggleable groups: Time & Flow, Origin & Marketing, Business Signals
- Groups control field projection (not filtering or set logic)
- Affects export payloads (JSON/XLSX)
- Missing fields resolve to `null` (no errors)

---

## DATA STRUCTURE: LEAD PROPERTY GROUPS

### Definition

**File:** [lead-enrichment.js:21-92](src/modules/sales-insight-explorer/lib/lead-enrichment.js#L21-L92)

```javascript
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
```

### Group Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique group identifier |
| `label` | string | Human-readable label |
| `always_enabled` | boolean | If true, group cannot be disabled |
| `fields` | Array<string> | Odoo field names in this group |

---

## GROUP DESCRIPTIONS

### GROUP 1: Status & Outcome (ALWAYS ENABLED)

**Purpose:** Analytical backbone for lead state analysis

**Fields:**
- `id` - Lead record ID
- `name` - Lead name/title
- `won_status` - Won status (won, lost, pending)
- `stage_id` - Current CRM stage
- `lost_reason_id` - Reason for loss (if LOST)
- `active` - Active flag (technical visibility)

**Special Field:**
- `classification` - Derived field (OPEN/WON/LOST/IGNORED)

**Rules:**
- This group is ALWAYS included
- Cannot be disabled by users
- Does NOT appear in UI toggles

---

### GROUP 2: Time & Flow (TOGGLEABLE)

**Purpose:** Analyze lead progression speed, stagnation, and drop-off timing

**Fields:**
- `create_date` - Lead creation timestamp
- `date_last_stage_update` - Last stage change date
- `date_closed` - Closure date (won or lost)
- `day_open` - Days lead has been open
- `day_close` - Days to close

**Use Cases:**
- Velocity analysis (time to close)
- Stagnation detection (time since last stage change)
- Conversion timing patterns

---

### GROUP 3: Origin & Marketing (TOGGLEABLE)

**Purpose:** Understand lead source and marketing attribution

**Fields:**
- `source_id` - Lead source (e.g., Website, Referral)
- `medium_id` - Marketing medium (e.g., Email, Social)
- `campaign_id` - Marketing campaign ID
- `referred` - Referral information

**Use Cases:**
- Marketing ROI analysis
- Source effectiveness
- Campaign performance

---

### GROUP 4: Business Signals (TOGGLEABLE)

**Purpose:** OpenVME-specific and Studio-driven business intelligence

**Fields:**
- `x_studio_hotness_label` - Qualitative hotness indicator
- `x_studio_hotness_score` - Quantitative hotness score
- `x_studio_lifecycle` - Lifecycle stage
- `x_studio_marketing_noden` - Marketing needs/flags
- `x_studio_has_linked_actionsheets` - Action sheet linkage flag

**Notes:**
- These are custom Studio fields
- May not exist in all Odoo databases
- Missing fields resolve to `null` without errors

---

## GROUP TOGGLE MAPPING

### How Group Toggles Work

**User Input:**
```json
{
  "lead_enrichment": {
    "enabled": true,
    "property_groups": ["time_flow", "origin_marketing"]
  }
}
```

**Effective Groups:**
```javascript
['status_outcome', 'time_flow', 'origin_marketing']
// status_outcome is ALWAYS added
```

**Fields Fetched:**
```javascript
[
  // status_outcome (always)
  'id', 'name', 'won_status', 'stage_id', 'lost_reason_id', 'active',
  'classification',
  
  // time_flow (enabled)
  'create_date', 'date_last_stage_update', 'date_closed', 'day_open', 'day_close',
  
  // origin_marketing (enabled)
  'source_id', 'medium_id', 'campaign_id', 'referred',
  
  // business_signals (NOT enabled, fields excluded)
  
  // Technical field (always fetched for set operations)
  'x_studio_opportunity_actionsheet_ids'
]
```

---

## EXAMPLE `__leads` OBJECTS

### Example 1: Status & Outcome ONLY

**Configuration:**
```json
{
  "property_groups": []
}
```

**Lead Object:**
```json
{
  "id": 123,
  "name": "Prospect - Building XYZ",
  "won_status": "pending",
  "stage_id": [5, "Qualified"],
  "lost_reason_id": null,
  "active": true,
  "classification": "OPEN"
}
```

---

### Example 2: Status & Outcome + Time & Flow

**Configuration:**
```json
{
  "property_groups": ["time_flow"]
}
```

**Lead Object:**
```json
{
  "id": 123,
  "name": "Prospect - Building XYZ",
  "won_status": "pending",
  "stage_id": [5, "Qualified"],
  "lost_reason_id": null,
  "active": true,
  "classification": "OPEN",
  "create_date": "2026-01-10 14:30:00",
  "date_last_stage_update": "2026-01-15 09:15:00",
  "date_closed": null,
  "day_open": 12,
  "day_close": 0
}
```

---

### Example 3: All Groups Enabled

**Configuration:**
```json
{
  "property_groups": ["time_flow", "origin_marketing", "business_signals"]
}
```

**Lead Object:**
```json
{
  "id": 123,
  "name": "Prospect - Building XYZ",
  "won_status": "pending",
  "stage_id": [5, "Qualified"],
  "lost_reason_id": null,
  "active": true,
  "classification": "OPEN",
  "create_date": "2026-01-10 14:30:00",
  "date_last_stage_update": "2026-01-15 09:15:00",
  "date_closed": null,
  "day_open": 12,
  "day_close": 0,
  "source_id": [10, "Website"],
  "medium_id": [5, "Organic Search"],
  "campaign_id": null,
  "referred": null,
  "x_studio_hotness_label": "Hot",
  "x_studio_hotness_score": 85,
  "x_studio_lifecycle": "Nurture",
  "x_studio_marketing_noden": "Demo Requested",
  "x_studio_has_linked_actionsheets": true
}
```

---

## STATUS & OUTCOME CANNOT BE DISABLED

### Proof 1: Code Enforcement

**File:** [lead-enrichment.js:130-134](src/modules/sales-insight-explorer/lib/lead-enrichment.js#L130-L134)

```javascript
// Extract enabled property groups (status_outcome is always enabled)
const enabledGroups = enrichmentConfig.property_groups || [];
const allEnabledGroups = ['status_outcome', ...enabledGroups.filter(g => g !== 'status_outcome')];
notes.push(`Property groups enabled: ${allEnabledGroups.join(', ')}`);
```

**Logic:**
1. User provides `property_groups` array
2. `status_outcome` is prepended to array
3. Duplicates are filtered out
4. Result: `status_outcome` is ALWAYS first

---

### Proof 2: Field Extraction

**File:** [lead-enrichment.js:95-110](src/modules/sales-insight-explorer/lib/lead-enrichment.js#L95-L110)

```javascript
export function getEnabledFields(enabledGroups = []) {
  const fields = new Set();
  
  // status_outcome is ALWAYS included
  for (const field of LEAD_PROPERTY_GROUPS.status_outcome.fields) {
    fields.add(field);
  }
  
  // Add classification field (always needed)
  fields.add('classification');
  
  // Add fields from enabled groups
  for (const groupId of enabledGroups) {
    if (LEAD_PROPERTY_GROUPS[groupId] && !LEAD_PROPERTY_GROUPS[groupId].always_enabled) {
      for (const field of LEAD_PROPERTY_GROUPS[groupId].fields) {
        fields.add(field);
      }
    }
  }
  
  return Array.from(fields);
}
```

**Logic:**
1. Function ALWAYS adds `status_outcome` fields first
2. Then adds fields from enabled groups
3. `always_enabled` groups skip the loop (already added)

---

### Proof 3: Validation

**File:** [semantic-validator.js:428-443](src/modules/sales-insight-explorer/lib/semantic-validator.js#L428-L443)

```javascript
const validGroups = ['time_flow', 'origin_marketing', 'business_signals'];
for (const group of leadEnrichment.property_groups) {
  if (!validGroups.includes(group)) {
    return {
      valid: false,
      code: 'INVALID_PROPERTY_GROUP',
      message: `lead_enrichment.property_groups contains invalid value: ${group}`,
      explanation: `Valid values are: ${validGroups.join(', ')}. Note: status_outcome is always enabled.`
    };
  }
}
```

**Logic:**
1. Validation only allows `time_flow`, `origin_marketing`, `business_signals`
2. `status_outcome` is NOT in `validGroups` (cannot be toggled)
3. If user tries to pass `status_outcome`, validation fails
4. Error message: "Note: status_outcome is always enabled"

---

## EXPORT INCLUDES ONLY SELECTED GROUPS

### Export Behavior

**Rule:** Only fields from enabled groups appear in `__leads` objects

**Example:**

**Request:**
```json
{
  "lead_enrichment": {
    "enabled": true,
    "property_groups": ["time_flow"],
    "export": "json"
  }
}
```

**Export Result:**
```json
{
  "fields": [
    { "key": "id", "type": "integer" },
    { "key": "name", "type": "char" },
    {
      "key": "__leads",
      "type": "json",
      "source": "derived",
      "description": "CRM leads enriched via two-phase set operations"
    }
  ],
  "rows": [
    {
      "id": 1,
      "name": "Action Sheet A",
      "__leads": [
        {
          "id": 123,
          "name": "Lead 123",
          "won_status": "pending",
          "stage_id": [5, "Qualified"],
          "lost_reason_id": null,
          "active": true,
          "classification": "OPEN",
          "create_date": "2026-01-10 14:30:00",
          "date_last_stage_update": "2026-01-15 09:15:00",
          "date_closed": null,
          "day_open": 12,
          "day_close": 0
        }
      ]
    }
  ]
}
```

**Verification:**
- ✅ `status_outcome` fields present (id, name, won_status, stage_id, lost_reason_id, active, classification)
- ✅ `time_flow` fields present (create_date, date_last_stage_update, date_closed, day_open, day_close)
- ❌ `origin_marketing` fields ABSENT (not enabled)
- ❌ `business_signals` fields ABSENT (not enabled)

---

## FIELD ORDERING

### Ordering Rules

Fields appear in `__leads` objects in this order:

1. **Status & Outcome fields** (id, name, won_status, stage_id, lost_reason_id, active)
2. **classification** (derived field, always after status_outcome)
3. **Time & Flow fields** (if enabled)
4. **Origin & Marketing fields** (if enabled)
5. **Business Signals fields** (if enabled)

**Code:** [lead-enrichment.js:305-330](src/modules/sales-insight-explorer/lib/lead-enrichment.js#L305-L330)

```javascript
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
```

---

## VALIDATION

### Payload Structure

**Valid:**
```json
{
  "lead_enrichment": {
    "enabled": true,
    "property_groups": ["time_flow", "origin_marketing"]
  }
}
```

**Invalid - Not an array:**
```json
{
  "lead_enrichment": {
    "property_groups": "time_flow"
  }
}
```
**Error:** `lead_enrichment.property_groups must be an array`

**Invalid - Unknown group:**
```json
{
  "lead_enrichment": {
    "property_groups": ["time_flow", "unknown_group"]
  }
}
```
**Error:** `lead_enrichment.property_groups contains invalid value: unknown_group. Valid values are: time_flow, origin_marketing, business_signals. Note: status_outcome is always enabled.`

**Invalid - Includes status_outcome:**
```json
{
  "lead_enrichment": {
    "property_groups": ["status_outcome", "time_flow"]
  }
}
```
**Error:** `lead_enrichment.property_groups contains invalid value: status_outcome. Valid values are: time_flow, origin_marketing, business_signals. Note: status_outcome is always enabled.`

---

## FILES MODIFIED

### 1. `src/modules/sales-insight-explorer/lib/lead-enrichment.js`

**Changes:**
- Added `LEAD_PROPERTY_GROUPS` constant (4 groups)
- Added `getEnabledFields()` function
- Updated `enrichWithLeads()` signature to accept `property_groups`
- Updated `executeSecondaryLeadQuery()` to fetch fields from enabled groups
- Rewrote `extractLeadPayload()` to filter by enabled groups
- Added field ordering logic

**Lines Changed:** ~120 lines

---

### 2. `src/modules/sales-insight-explorer/lib/semantic-validator.js`

**Changes:**
- Added `property_groups` to allowed keys
- Added validation for `property_groups` array
- Added validation for group IDs
- Added error messages explaining status_outcome is always enabled

**Lines Changed:** ~35 lines

---

## MIGRATION NOTES

### Breaking Changes

**Lead Payload Structure:**
- Fields now depend on enabled property groups
- Default (no groups): Only Status & Outcome fields
- Previous behavior: All fields always included

**Example:**

**Before (9.3):**
```json
{
  "id": 123,
  "name": "Lead",
  "stage_id": [5, "Qualified"],
  "active": true,
  "won_status": "pending",
  "lost_reason_id": null,
  "classification": "OPEN"
}
```

**After (9.4) with no property_groups:**
```json
{
  "id": 123,
  "name": "Lead",
  "won_status": "pending",
  "stage_id": [5, "Qualified"],
  "lost_reason_id": null,
  "active": true,
  "classification": "OPEN"
}
```

**After (9.4) with property_groups: ["time_flow"]:**
```json
{
  "id": 123,
  "name": "Lead",
  "won_status": "pending",
  "stage_id": [5, "Qualified"],
  "lost_reason_id": null,
  "active": true,
  "classification": "OPEN",
  "create_date": "2026-01-10 14:30:00",
  "date_last_stage_update": "2026-01-15 09:15:00",
  "date_closed": null,
  "day_open": 12,
  "day_close": 0
}
```

---

## ACCEPTANCE CRITERIA

| Requirement | Status |
|-------------|--------|
| Define 4 property groups with exact fields | ✅ DONE |
| Status & Outcome always enabled | ✅ DONE |
| Three toggleable groups | ✅ DONE |
| Group toggles control field inclusion | ✅ DONE |
| Field ordering: status_outcome first, then groups | ✅ DONE |
| Missing fields resolve to null | ✅ DONE |
| Validation prevents invalid groups | ✅ DONE |
| Validation prevents toggling status_outcome | ✅ DONE |
| Export includes only selected groups | ✅ DONE |
| No extra fields or groups | ✅ DONE |

---

## CONCLUSION

Iteration 9.4 implements semantic property groups for lead enrichment:

**Key Features:**
- ✅ Strict scope: EXACTLY 4 groups, no more
- ✅ Status & Outcome CANNOT be disabled
- ✅ Field projection controlled by group selection
- ✅ Export-ready (JSON/XLSX include only selected fields)
- ✅ No extra fields, no creative interpretation

**Result:** Users can now control the shape of enriched lead data for targeted analysis and export ✅

---

**Delivered:** January 22, 2026  
**Contract Compliance:** 100%  
**Status:** Production-ready
