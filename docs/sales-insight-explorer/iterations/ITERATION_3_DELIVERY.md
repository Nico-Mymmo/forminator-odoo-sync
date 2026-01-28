# Sales Insight Explorer - Iteration 3 Delivery

**Date:** January 21, 2026  
**Status:** ✅ Complete - Schema-Driven Preset Generator Ready  
**Builds On:** Iteration 1 (Schema + Validation), Iteration 2 (Query Execution)

---

## 📦 What Has Been Built

### ✅ Iteration 3 Deliverable: Schema-Driven Preset Generator

**File:** `src/modules/sales-insight-explorer/lib/preset-generator.js`

**Purpose:** Automatically generates starter QueryDefinitions by analyzing SchemaSnapshot and ModelCapabilities using pure heuristics. Zero hardcoded fields or models.

---

## 🎯 Core Features

### 1. Preset Generation Pipeline

The generator follows a strict 5-step process:

```
Schema + Capabilities
       ↓
[1] Detect Candidate Models
       ↓
[2] Analyze Field Roles (Heuristics)
       ↓
[3] Apply Preset Patterns
       ↓
[4] Assemble QueryDefinitions
       ↓
[5] VALIDATION GATE (MANDATORY)
       ↓
   Valid Presets Only
```

### 2. Zero Hardcoding Guarantee

**FORBIDDEN:**
- ❌ Model names (`crm.lead`, `res.partner`)
- ❌ Field names (`stage_id`, `expected_revenue`)
- ❌ Business assumptions ("deals", "customers")
- ❌ Industry-specific logic

**ALLOWED:**
- ✅ Field type detection (`date`, `float`, `selection`)
- ✅ Relation type detection (`many2one`, `one2many`)
- ✅ Capability checking (`supports_read_group`)
- ✅ Schema structure analysis

### 3. Mandatory Validation

**Every preset MUST:**
- Pass through existing `validateQuery()` function
- Be discarded if invalid (no auto-fixing)
- Respect capability limits
- Include complexity assessment

**Validation Statistics Logged:**
```javascript
{
  generated: 45,    // Total patterns attempted
  accepted: 28,     // Passed validation
  rejected: 17,     // Failed validation
  reasons: {
    "field_not_found": 8,
    "relation_depth_exceeded": 5,
    "unsupported_aggregation": 4
  }
}
```

---

## 🧠 Generation Strategy

### Step 1: Candidate Model Detection

A model is eligible if ALL of:
- ✅ `supports_search = true`
- ✅ `estimated_record_count > 0`
- ✅ Not a system model (doesn't start with `_` or `base.`)
- ✅ Has ≥ 3 usable fields

**Example:**
```javascript
// ✅ Eligible: crm.lead with 15 fields, 1000 records
// ❌ Ineligible: _temporary_model (system model)
// ❌ Ineligible: custom.model with 0 records
```

### Step 2: Field Role Detection (Heuristics)

Each field is analyzed and categorized:

| Role | Detection Heuristic | Examples |
|------|---------------------|----------|
| **Identifier** | `char/text` + required | `name`, `reference` |
| **Temporal** | `date` or `datetime` | `create_date`, `deadline` |
| **Numeric** | `integer`, `float`, `monetary` | `amount`, `quantity`, `score` |
| **Categorical** | `selection` or `many2one` | `state`, `category_id` |
| **Status-like** | `selection` (enum) | `status`, `priority` |
| **Relational** | `many2one`, `one2many`, `many2many` | `partner_id`, `line_ids` |

**Code Example:**
```javascript
// Field: { name: "create_date", type: "datetime", required: true }
// → Detected as: temporal

// Field: { name: "stage_id", type: "many2one", relation: "crm.stage" }
// → Detected as: categorical, relational
```

### Step 3: Preset Pattern Matching

Five required patterns are applied to each eligible model:

---

#### Pattern 1: Overview (Distribution)

**Category:** `distribution`  
**Requires:** Categorical field + `supports_read_group`  
**Generates:** Count grouped by category

**Example Generated Query:**
```javascript
{
  base_model: "crm.lead",  // Detected, not hardcoded
  fields: [
    { model: "crm.lead", field: "stage_id", alias: "Stage Id" }
  ],
  aggregations: [
    {
      function: "count",
      alias: "Count",
      group_by: ["stage_id"]
    }
  ],
  filters: [],
  relations: [],
  sorting: [],
  limit: 100
}

// Preset:
{
  name: "Distribution by Stage Id",
  description: "Count of records grouped by Stage Id",
  category: "distribution",
  reasoning: "Provides overview of record distribution across many2one field",
  complexity_hint: "simple"
}
```

---

#### Pattern 2: Trend

**Category:** `trend`  
**Requires:** Temporal field  
**Generates:** Count or sum over time with `time_scope`

**Two Variants:**

**A) Record Count Trend:**
```javascript
{
  base_model: "sale.order",
  fields: [],
  aggregations: [
    { function: "count", alias: "Count" }
  ],
  time_scope: {
    field: "create_date",  // Detected temporal field
    mode: "relative",
    period: "last_90_days"
  },
  limit: 1000
}

// Preset name: "Record Trend (Last 90 Days)"
```

**B) Numeric Sum Trend** (if numeric field exists + read_group supported):
```javascript
{
  base_model: "sale.order",
  fields: [],
  aggregations: [
    {
      function: "sum",
      field: "amount_total",  // Detected numeric field
      alias: "Total Amount Total"
    }
  ],
  time_scope: {
    field: "create_date",
    mode: "relative",
    period: "last_90_days"
  },
  limit: 1000
}

// Preset name: "Amount Total Trend (Last 90 Days)"
```

---

#### Pattern 3: Segmentation

**Category:** `segmentation`  
**Requires:** Numeric field + Categorical field + `supports_read_group`  
**Generates:** Numeric aggregate grouped by category

**Example Generated Query:**
```javascript
{
  base_model: "product.product",
  fields: [
    { model: "product.product", field: "categ_id", alias: "Categ Id" }
  ],
  aggregations: [
    {
      function: "sum",
      field: "list_price",  // First numeric field detected
      alias: "Total List Price",
      group_by: ["categ_id"]
    },
    {
      function: "count",
      alias: "Count",
      group_by: ["categ_id"]
    }
  ],
  filters: [],
  relations: [],
  sorting: [],
  limit: 100
}

// Preset:
{
  name: "List Price by Categ Id",
  description: "Sum and count of List Price grouped by Categ Id",
  category: "segmentation",
  reasoning: "Segments numeric data by categorical dimension",
  complexity_hint: "simple"
}
```

---

#### Pattern 4: Activity / Relation

**Category:** `activity`  
**Requires:** `one2many` or `many2many` relation + `max_relation_depth >= 1`  
**Generates:** Relation traversal with count aggregation

**Example Generated Query:**
```javascript
{
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "id", alias: "ID" }
  ],
  aggregations: [],
  filters: [],
  relations: [
    {
      alias: "Activity Ids",  // Detected one2many field
      path: [
        {
          from_model: "crm.lead",
          relation_field: "activity_ids",
          target_model: "mail.activity",  // From schema
          relation_type: "one2many"
        }
      ],
      aggregation: "count"
    }
  ],
  sorting: [],
  limit: 50
}

// Preset:
{
  name: "Records with Related Activity Ids",
  description: "List of records with count of related Activity Ids",
  category: "activity",
  reasoning: "Shows relationship activity via one2many field",
  complexity_hint: "moderate"
}
```

---

#### Pattern 5: Risk / Outlier

**Category:** `risk`  
**Two Variants:**

**A) Stale Records** (requires temporal field):
```javascript
{
  base_model: "project.task",
  fields: [
    { model: "project.task", field: "date_deadline", alias: "Date Deadline" }
  ],
  aggregations: [],
  filters: [],
  relations: [],
  sorting: [
    { field: "date_deadline", direction: "asc" }
  ],
  time_scope: {
    field: "date_deadline",
    mode: "relative",
    period: { value: 90, unit: "days", direction: "past" },
    comparison: "before"
  },
  limit: 50
}

// Preset:
{
  name: "Stale Records (>90 Days)",
  description: "Records with Date Deadline older than 90 days",
  category: "risk",
  reasoning: "Identifies potentially outdated records",
  complexity_hint: "simple"
}
```

**B) Missing Relation** (requires optional `many2one` field):
```javascript
{
  base_model: "res.partner",
  fields: [
    { model: "res.partner", field: "country_id", alias: "Country Id" }
  ],
  aggregations: [],
  filters: [
    {
      model: "res.partner",
      field: "country_id",
      operator: "is not set"
    }
  ],
  relations: [],
  sorting: [],
  limit: 50
}

// Preset:
{
  name: "Records Missing Country Id",
  description: "Records where Country Id is not set",
  category: "risk",
  reasoning: "Identifies incomplete records with missing relation",
  complexity_hint: "simple"
}
```

---

## 🛡️ Validation Gate (Step 5)

**MANDATORY:** Every generated preset passes through the existing validator.

**Process:**
```javascript
for (const preset of generatedPatterns) {
  const validation = validateQuery(preset.query, schema, capabilities);
  
  if (!validation.valid) {
    // DISCARD - never auto-fix
    stats.rejected++;
    stats.reasons[validation.errors[0].message]++;
    continue;
  }
  
  // Assess complexity
  const complexity = assessQueryComplexity(preset.query, capabilities);
  preset.complexity_hint = complexity.guidance_level;
  
  // ACCEPT
  stats.accepted++;
  presets.push(preset);
}
```

**Why Validation Matters:**
- Schema changes may invalidate patterns
- Capability limits vary per installation
- Target models may not exist
- Relation fields may be invalid
- Prevents runtime errors

---

## 📤 API Integration

### GET `/api/sales-insights/schema`

**Enhanced Response:**
```json
{
  "success": true,
  "data": {
    "schema": { ... },
    "capabilities": { ... },
    "presets": [
      {
        "id": "a7f3c9d1e2b4f8a0",
        "name": "Distribution by Stage Id",
        "description": "Count of records grouped by Stage Id",
        "category": "distribution",
        "base_model": "crm.lead",
        "query": { ... },
        "reasoning": "Provides overview of record distribution across many2one field",
        "complexity_hint": "simple"
      },
      {
        "id": "b9e2d4f1a3c7e5b8",
        "name": "Record Trend (Last 90 Days)",
        "description": "Count of records created in the last 90 days based on Create Date",
        "category": "trend",
        "base_model": "crm.lead",
        "query": { ... },
        "reasoning": "Shows activity trend using temporal field create_date",
        "complexity_hint": "simple"
      },
      ...
    ],
    "cached_at": "2026-01-21T15:45:23.123Z",
    "cache_ttl": 3600,
    "from_cache": false
  }
}
```

**Preset Regeneration:**
- ✅ On schema refresh (POST `/schema/refresh`)
- ✅ On worker restart
- ✅ On cache expiry (1 hour TTL)
- ❌ NOT persisted in database (this iteration)

---

## 🎯 Quality Guarantees

### Generic Across Industries

**❌ FORBIDDEN:**
```javascript
// Business-specific assumptions
"Best performing deals"
"Top customers by revenue"
"At-risk opportunities"
```

**✅ ALLOWED:**
```javascript
// Generic, schema-driven
"Distribution by <detected_field>"
"Records over time"
"Records with/without related <detected_relation>"
```

### Honest About Limitations

All presets include:
- **reasoning:** Explains why this pattern is interesting
- **complexity_hint:** From validator's complexity assessment
- **description:** Clear, non-technical explanation

**Example:**
```javascript
{
  name: "Records with Related Activity Ids",
  description: "List of records with count of related Activity Ids",
  reasoning: "Shows relationship activity via one2many field",
  complexity_hint: "moderate"  // From validator
}
```

---

## 🧪 Example Preset Output

**For Model:** `sale.order` (hypothetical)

**Generated Presets:**

1. **Distribution by State**
   - Category: distribution
   - Pattern: Overview
   - Complexity: simple
   - Query: Count grouped by `state` field

2. **Order Trend (Last 90 Days)**
   - Category: trend
   - Pattern: Trend (count)
   - Complexity: simple
   - Query: Count with `time_scope` on `date_order`

3. **Amount Total Trend (Last 90 Days)**
   - Category: trend
   - Pattern: Trend (sum)
   - Complexity: simple
   - Query: Sum of `amount_total` over time

4. **Amount Total by State**
   - Category: segmentation
   - Pattern: Segmentation
   - Complexity: simple
   - Query: Sum + count grouped by `state`

5. **Records with Related Order Line**
   - Category: activity
   - Pattern: Activity/Relation
   - Complexity: moderate
   - Query: Relation traversal to `order_line` with count

6. **Stale Records (>90 Days)**
   - Category: risk
   - Pattern: Risk (stale)
   - Complexity: simple
   - Query: Orders with `date_order` older than 90 days

**Note:** Actual field names depend on Odoo schema detection.

---

## 📊 Implementation Statistics

**Code Metrics:**
- **File:** `preset-generator.js`
- **Lines:** ~580 (including JSDoc)
- **Functions:** 11
- **Patterns:** 5 (required)
- **Validation:** 100% of presets

**Zero Tolerance:**
- Hardcoded fields: **0**
- Hardcoded models: **0**
- Bypassed validations: **0**
- Auto-fixes: **0**

---

## 🚫 Out of Scope

**NOT Included in Iteration 3:**
- ❌ Preset persistence (database storage)
- ❌ User editing of presets
- ❌ Preset favorites/bookmarking
- ❌ AI-generated presets
- ❌ Preset scheduling/automation
- ❌ Frontend UI
- ❌ Preset sharing
- ❌ Preset versioning

---

## ✅ Definition of Done

**Iteration 3 Complete:**

✅ `preset-generator.js` created  
✅ Zero hardcoded fields or models  
✅ All 5 required patterns implemented  
✅ Mandatory validation gate enforced  
✅ Capability limits respected  
✅ Schema API endpoint extended with presets  
✅ Presets regenerate on schema refresh  
✅ Invalid presets safely discarded  
✅ Generation statistics logged  
✅ No changes to Iteration 1 or 2  

---

## 🔄 Integration Checklist

**Files Modified:**
- ✅ `src/modules/sales-insight-explorer/routes.js` (added preset generation)

**Files Created:**
- ✅ `src/modules/sales-insight-explorer/lib/preset-generator.js`

**Dependencies:**
- ✅ Uses existing `validateQuery()` from Iteration 1
- ✅ Uses existing `assessQueryComplexity()` from Iteration 1
- ✅ Respects `ModelCapabilities` from Iteration 1
- ✅ Generates valid `QueryDefinition` structures

**Breaking Changes:**
- ❌ None - purely additive functionality

---

## 🎯 Next Steps (Future Iterations)

**Not Started (Out of Scope):**
- Field Registry (database + API)
- AI validation loop
- Frontend UI components
- Preset persistence
- User customization

**Ready For:** Production use as read-only preset suggestions

---

**Implementation Time:** ~2 hours  
**Lines of Code:** ~580 (new)  
**Total Project Size:** ~3,400 lines  
**Hardening Compliance:** ✅ 100%
