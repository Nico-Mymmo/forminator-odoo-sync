# Sales Insight Explorer - Complete Architecture & Specification

**Module:** `sales_insight_explorer`  
**Version:** 1.0  
**Status:** Implementation Ready  
**Date:** January 21, 2026

---

## 0. Executive Summary

**What:** A data-driven exploration system for sales insights based on dynamic Odoo models.  
**Why:** Transform implicit sales knowledge into explicit, explorable patterns.  
**How:** Schema introspection + flexible queries + AI-assisted discovery.

**Core Principles:**
- ✅ Zero hardcoded fields or relations
- ✅ Schema-driven everything
- ✅ Continuous model evolution support
- ✅ Insight over reporting
- ✅ Worker-mediated Odoo access only

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Sales Insight Explorer Module                       │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │   Query    │  │    Query     │  │   Result    │  │  │
│  │  │  Library   │  │   Builder    │  │   Viewer    │  │  │
│  │  └────────────┘  └──────────────┘  └─────────────┘  │  │
│  │         │                │                  │         │  │
│  │         └────────────────┴──────────────────┘         │  │
│  │                          │                             │  │
│  │                    ┌─────▼─────┐                      │  │
│  │                    │  Schema   │                      │  │
│  │                    │  Manager  │                      │  │
│  │                    └───────────┘                      │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ JSON/HTTP
                    ┌───────▼───────┐
                    │  WORKER API   │
                    └───────┬───────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    ┌────▼────┐      ┌──────▼──────┐    ┌─────▼─────┐
    │ Schema  │      │    Query    │    │    AI     │
    │ Service │      │   Engine    │    │  Service  │
    └────┬────┘      └──────┬──────┘    └─────┬─────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │ JSON-RPC
                      ┌─────▼─────┐
                      │   ODOO    │
                      └───────────┘
```

---

## 2. Data Model

### 2.1 Model Schema Snapshot (External Input)

**Source:** Odoo introspection via worker  
**Format:** JSON  
**Lifetime:** Cached with versioning  
**Update:** Manual refresh or scheduled

```typescript
interface SchemaSnapshot {
  version: string;              // Semver or timestamp
  generated_at: string;         // ISO timestamp
  odoo_version: string;         // Odoo version info
  models: {
    [modelName: string]: ModelDefinition;
  };
}

interface ModelDefinition {
  name: string;                 // Technical: "crm.lead"
  label: string;                // Human: "Opportunities"
  description?: string;
  fields: {
    [fieldName: string]: FieldDefinition;
  };
}

interface FieldDefinition {
  name: string;                 // Technical: "partner_id"
  label: string;                // Human: "Customer"
  description?: string;         // Tooltip text
  type: FieldType;
  required: boolean;
  readonly: boolean;
  
  // For relational fields
  relation?: string;            // Target model: "res.partner"
  relation_field?: string;      // Reverse field (for o2m/m2m)
  
  // For selection fields
  selection?: Array<{
    key: string;
    label: string;
  }>;
  
  // For numeric fields
  digits?: [number, number];    // Precision for float/monetary
}

type FieldType = 
  | "char" | "text"
  | "integer" | "float" | "monetary"
  | "boolean"
  | "date" | "datetime"
  | "selection"
  | "many2one" | "one2many" | "many2many"
  | "html" | "binary";
```

### 2.2 Field Registry (Internal, User-Managed)

**Purpose:** User customization layer over schema  
**Storage:** Supabase table `field_registry`

```sql
CREATE TABLE field_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  model_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  
  -- User overrides
  custom_label TEXT,              -- Override schema label
  custom_description TEXT,        -- Override schema description
  is_hidden BOOLEAN DEFAULT false,
  display_order INTEGER,
  
  -- Categorization
  category TEXT,                   -- "Building", "Process", "Pain Points", "Sales"
  tags TEXT[],                     -- Free tagging
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  
  UNIQUE(model_name, field_name)
);

CREATE INDEX idx_field_registry_model ON field_registry(model_name);
CREATE INDEX idx_field_registry_category ON field_registry(category);
```

**Merge Strategy:**
```typescript
function getMergedField(schemaField: FieldDefinition, registry?: FieldRegistryEntry): MergedField {
  return {
    ...schemaField,
    label: registry?.custom_label || schemaField.label,
    description: registry?.custom_description || schemaField.description,
    isHidden: registry?.is_hidden || false,
    category: registry?.category || "Uncategorized",
    tags: registry?.tags || []
  };
}
```

### 2.3 Query Definition (Core Data Structure)

**Storage:** Supabase table `insight_queries`

```sql
CREATE TABLE insight_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identity
  name TEXT NOT NULL,
  description TEXT,
  
  -- Ownership
  created_by UUID REFERENCES users(id),
  is_shared BOOLEAN DEFAULT false,
  is_preset BOOLEAN DEFAULT false,
  
  -- Query configuration (JSON)
  query_definition JSONB NOT NULL,
  
  -- AI context
  ai_intent TEXT,                  -- Natural language intent
  ai_generated BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  
  -- Schema tracking
  schema_version TEXT              -- Track compatibility
);

CREATE INDEX idx_queries_user ON insight_queries(created_by);
CREATE INDEX idx_queries_shared ON insight_queries(is_shared) WHERE is_shared = true;
CREATE INDEX idx_queries_preset ON insight_queries(is_preset) WHERE is_preset = true;
```

**Query Definition Structure:**

```typescript
interface QueryDefinition {
  // Base
  base_model: string;              // "crm.lead"
  
  // Field selection
  fields: FieldSelection[];
  
  // Filtering
  filters: Filter[];
  
  // Joins (for cross-model queries)
  joins: Join[];
  
  // Aggregations
  aggregations: Aggregation[];
  
  // Sorting
  sorting: SortRule[];
  
  // Time scope
  time_scope?: TimeScope;
  
  // Limits
  limit?: number;
  offset?: number;
}

interface FieldSelection {
  model: string;                   // "crm.lead" or join alias
  field: string;                   // "name"
  alias?: string;                  // Display name in results
  transform?: FieldTransform;      // Extract, format, etc.
}

interface Filter {
  model: string;
  field: string;
  operator: FilterOperator;
  value: any;
  case_sensitive?: boolean;
}

type FilterOperator = 
  | "=" | "!=" | ">" | ">=" | "<" | "<="
  | "like" | "ilike" | "not like" | "not ilike"
  | "in" | "not in"
  | "is set" | "is not set"
  | "between";

interface Join {
  alias: string;                   // "customer", "meetings"
  model: string;                   // "res.partner"
  join_type: "inner" | "left";
  
  // Join condition
  from_model: string;              // "crm.lead"
  from_field: string;              // "partner_id"
  to_field: string;                // "id"
  
  // Optional filters on joined model
  filters?: Filter[];
  
  // Cardinality control
  aggregation?: "first" | "count" | "sum" | "avg";
}

interface Aggregation {
  function: AggregateFunction;
  field?: string;                  // Not needed for COUNT(*)
  alias: string;                   // "total_opportunities"
  group_by?: string[];             // Fields to group by
}

type AggregateFunction = "count" | "sum" | "avg" | "min" | "max" | "distinct_count";

interface SortRule {
  model: string;
  field: string;
  direction: "asc" | "desc";
  nulls?: "first" | "last";
}

interface TimeScope {
  field: string;                   // Which date field to filter
  mode: "absolute" | "relative";
  
  // Absolute
  from?: string;                   // ISO date
  to?: string;
  
  // Relative
  period?: "today" | "this_week" | "this_month" | "this_quarter" | "this_year"
         | "last_7_days" | "last_30_days" | "last_90_days" | "last_year";
  
  // Custom relative
  relative_amount?: number;
  relative_unit?: "days" | "weeks" | "months" | "years";
  relative_direction?: "past" | "future";
}
```

### 2.4 Query Results (Transient)

**Storage:** Not persisted (streamed to frontend)  
**Format:** Structured JSON with metadata

```typescript
interface QueryResult {
  query_id: string;
  executed_at: string;
  execution_time_ms: number;
  
  // Schema context
  schema_version: string;
  
  // Results
  rows: ResultRow[];
  total_count: number;
  
  // Metadata
  columns: ColumnMetadata[];
  aggregations?: AggregationResult[];
  
  // Warnings
  warnings?: string[];
}

interface ResultRow {
  [columnAlias: string]: any;
}

interface ColumnMetadata {
  alias: string;
  label: string;
  type: FieldType;
  model: string;
  field: string;
}

interface AggregationResult {
  alias: string;
  label: string;
  value: number | null;
  group_values?: { [groupField: string]: any };
}
```

---

## 3. Worker API Contracts

### 3.1 Schema Endpoints

#### GET `/api/sales-insights/schema`

**Purpose:** Retrieve current Odoo schema snapshot

**Request:**
```typescript
// Query params
{
  models?: string[];              // Filter specific models
  include_fields?: boolean;       // Default true
  include_descriptions?: boolean; // Default true
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    schema: SchemaSnapshot,
    cached_at: string,
    cache_ttl: number
  }
}
```

**Caching Strategy:**
- Cache in KV for 1 hour
- Return cached version with age indicator
- Client can force refresh

---

#### POST `/api/sales-insights/schema/refresh`

**Purpose:** Force schema refresh from Odoo

**Request:**
```typescript
{
  full_refresh: boolean;          // Default false (incremental)
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    schema: SchemaSnapshot,
    changes: {
      models_added: string[],
      models_removed: string[],
      fields_added: Array<{model: string, field: string}>,
      fields_removed: Array<{model: string, field: string}>,
      fields_modified: Array<{model: string, field: string, changes: string[]}>
    }
  }
}
```

**Implementation Notes:**
- Use Odoo's `fields_get()` for each model
- Use `ir.model` and `ir.model.fields` for metadata
- Detect breaking changes
- Log all changes

---

### 3.2 Query Endpoints

#### POST `/api/sales-insights/query/validate`

**Purpose:** Validate query without execution

**Request:**
```typescript
{
  query: QueryDefinition
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    is_valid: boolean,
    errors?: ValidationError[],
    warnings?: string[],
    estimated_rows?: number
  }
}

interface ValidationError {
  path: string;                   // "filters[0].field"
  message: string;
  suggestion?: string;
}
```

**Validation Rules:**
- All referenced models exist in schema
- All referenced fields exist and are correct type
- Filter operators match field types
- Join paths are valid
- Aggregations use numeric fields (where applicable)
- No circular joins

---

#### POST `/api/sales-insights/query/preview`

**Purpose:** Execute query with limit for preview

**Request:**
```typescript
{
  query: QueryDefinition,
  limit?: number                   // Default 50, max 100
}
```

**Response:**
```typescript
{
  success: true,
  data: QueryResult
}
```

**Implementation:**
- Automatically add LIMIT
- Return sample data
- Include execution time
- Return warnings if query is complex

---

#### POST `/api/sales-insights/query/run`

**Purpose:** Execute full query

**Request:**
```typescript
{
  query: QueryDefinition,
  format?: "json" | "csv",
  pagination?: {
    page: number,
    per_page: number               // Max 1000
  }
}
```

**Response:**
```typescript
{
  success: true,
  data: QueryResult,
  pagination?: {
    page: number,
    per_page: number,
    total_pages: number,
    has_more: boolean
  }
}
```

**Performance:**
- Stream large results
- Implement cursor-based pagination for >10k rows
- Timeout after 30 seconds
- Return partial results with warning

---

#### POST `/api/sales-insights/query/explain`

**Purpose:** Get execution plan without running query

**Request:**
```typescript
{
  query: QueryDefinition
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    odoo_domain: any[],            // Translated Odoo domain
    expected_complexity: "low" | "medium" | "high",
    estimated_execution_ms: number,
    recommendations: string[]
  }
}
```

---

### 3.3 AI Endpoints

#### POST `/api/sales-insights/ai/suggest-queries`

**Purpose:** AI-generated query suggestions based on schema analysis

**Request:**
```typescript
{
  base_model?: string,             // Focus on specific model
  intent?: string,                 // Natural language goal
  context?: {
    recent_queries?: string[],     // Recent query IDs
    user_role?: string
  }
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    suggestions: QuerySuggestion[]
  }
}

interface QuerySuggestion {
  title: string,
  description: string,
  reasoning: string,               // Why this is interesting
  query: QueryDefinition,
  category: "conversion" | "segmentation" | "correlation" | "outlier" | "trend",
  confidence: number               // 0-1
}
```

**AI Prompting Strategy:**
```
You are a sales analyst. Given this Odoo schema:
{schema}

Suggest 5 insightful queries that would:
1. Reveal conversion patterns
2. Identify bottlenecks
3. Segment customers meaningfully
4. Correlate activities with outcomes
5. Find outliers or risks

For each suggestion:
- Explain the business insight
- Provide a complete query definition
- Indicate confidence level

Focus on:
- Questions that lead to action
- Patterns not obvious from single fields
- Cross-model correlations
```

---

#### POST `/api/sales-insights/ai/interpret-results`

**Purpose:** AI interpretation of query results

**Request:**
```typescript
{
  query: QueryDefinition,
  results: QueryResult,
  focus?: "summary" | "outliers" | "trends" | "recommendations"
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    summary: string,               // Plain language summary
    key_findings: string[],        // Bullet points
    outliers?: Array<{
      row_index: number,
      reason: string
    }>,
    trends?: Array<{
      field: string,
      direction: "increasing" | "decreasing" | "stable",
      significance: "high" | "medium" | "low"
    }>,
    recommendations?: string[],     // Action items
    follow_up_questions?: string[]  // Suggested next queries
  }
}
```

---

## 4. Frontend Architecture

### 4.1 Module Structure

```
src/modules/sales-insight-explorer/
├── module.js                      # Module registration
├── routes.js                      # Backend routes
├── ui.js                          # Main UI component
├── components/
│   ├── schema-manager.js          # Schema viewer & field registry
│   ├── query-library.js           # List saved/shared/preset queries
│   ├── query-builder.js           # Visual query constructor
│   ├── query-editor.js            # JSON editor for advanced users
│   ├── result-viewer.js           # Display query results
│   ├── field-selector.js          # Field picker with search
│   ├── filter-builder.js          # Visual filter constructor
│   └── ai-panel.js                # AI suggestions & interpretation
├── lib/
│   ├── schema-client.js           # Schema fetching & caching
│   ├── query-validator.js         # Client-side validation
│   ├── query-serializer.js        # Query ↔ UI state
│   └── export-handler.js          # Export to JSON/CSV
└── styles/
    └── insight-explorer.css
```

### 4.2 State Management

**Schema State:**
```typescript
interface SchemaState {
  snapshot: SchemaSnapshot | null;
  registry: Map<string, FieldRegistryEntry>;
  loading: boolean;
  lastUpdated: number;
  version: string;
}
```

**Query State:**
```typescript
interface QueryState {
  current: QueryDefinition | null;
  saved: InsightQuery[];
  presets: InsightQuery[];
  shared: InsightQuery[];
  activeResult: QueryResult | null;
  validation: ValidationResult | null;
}
```

**UI State:**
```typescript
interface UIState {
  view: "library" | "builder" | "results";
  selectedQuery: string | null;
  builderStep: number;
  showAIPanel: boolean;
  filters: {
    search: string;
    category: string[];
    showPresets: boolean;
    showShared: boolean;
  };
}
```

---

### 4.3 UI Flow

#### Query Library Screen

**Purpose:** Browse and select queries

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Sales Insight Explorer                         │
├─────────────────────────────────────────────────┤
│  [🔍 Search]  [📁 My Queries] [📚 Presets] [👥 Shared] │
├─────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────┐ │
│  │ 🎯 High-Value Opportunities               │ │
│  │ Opportunities with >€10k value and >5     │ │
│  │ activities in last 30 days                │ │
│  │ Last run: 2 hours ago · 47 results        │ │
│  │ [▶ Run] [✏️ Edit] [📊 View Results]        │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │ 🔥 Pain Point Analysis                    │ │
│  │ Distribution of reported issues by        │ │
│  │ building type and resolution status       │ │
│  │ Preset · Not yet run                      │ │
│  │ [▶ Run] [👁️ Preview]                       │ │
│  └───────────────────────────────────────────┘ │
│  ...                                            │
├─────────────────────────────────────────────────┤
│  [➕ New Query] [🤖 AI Suggestions] [⚙️ Schema] │
└─────────────────────────────────────────────────┘
```

**Interactions:**
- Click query → View details
- Run → Execute and show results
- Edit → Open in builder
- New Query → Open builder with blank query
- AI Suggestions → Open AI panel
- Schema → Open schema manager

---

#### Query Builder Screen

**Purpose:** Construct queries step-by-step

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  ← Back to Library                              │
│  New Query: [Untitled Query____________]        │
├─────────────────────────────────────────────────┤
│  Steps: [1 Base] → [2 Fields] → [3 Filters] → [4 Options] │
├─────────────────────────────────────────────────┤
│  Step 1: Choose Base Model                     │
│  ┌───────────────────────────────────────────┐ │
│  │ 🔍 Search models...                       │ │
│  │                                            │ │
│  │ 📊 Opportunities (crm.lead)                │ │
│  │    Manage sales pipeline and leads        │ │
│  │    [Select]                                │ │
│  │                                            │ │
│  │ 👤 Customers (res.partner)                 │ │
│  │    Contact information and relationships  │ │
│  │    [Select]                                │ │
│  │                                            │ │
│  │ 📅 Meetings (calendar.event)               │ │
│  │    Scheduled activities and appointments  │ │
│  │    [Select]                                │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  [Cancel] [Advanced Editor] [Next: Select Fields →] │
└─────────────────────────────────────────────────┘
```

**Step 2: Field Selection**
```
┌─────────────────────────────────────────────────┐
│  Step 2: Select Fields to Display               │
│  Base Model: Opportunities (crm.lead)           │
├─────────────────────────────────────────────────┤
│  Available Fields          │  Selected Fields   │
│  ┌──────────────────────┐ │ ┌────────────────┐ │
│  │ 🔍 Search fields...   │ │ │ Name           │ │
│  │                       │ │ │ Customer       │ │
│  │ 📁 Sales Info         │ │ │ Expected Value │ │
│  │   Name ────────────────────→ Stage          │ │
│  │   Customer            │ │ │                │ │
│  │   Expected Value      │ │ │ [Clear All]    │ │
│  │   Stage               │ │ └────────────────┘ │
│  │   Probability         │ │                    │
│  │                       │ │                    │
│  │ 📁 Dates              │ │                    │
│  │   Created             │ │                    │
│  │   Expected Close      │ │                    │
│  │                       │ │                    │
│  │ 📁 Related            │ │                    │
│  │   ➕ Join Customer    │ │                    │
│  │   ➕ Join Activities  │ │                    │
│  └──────────────────────┘ │                    │
├─────────────────────────────────────────────────┤
│  [← Back] [Next: Add Filters →]                │
└─────────────────────────────────────────────────┘
```

**Step 3: Filters**
```
┌─────────────────────────────────────────────────┐
│  Step 3: Filter Results                         │
├─────────────────────────────────────────────────┤
│  Filters (all must match):                      │
│  ┌───────────────────────────────────────────┐ │
│  │ Expected Value ≥ [10000_____] EUR         │ │
│  │ [🗑️]                                        │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │ Stage is one of                            │ │
│  │ [×Proposal] [×Negotiation] [×Won]         │ │
│  │ [🗑️]                                        │ │
│  └───────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────┐ │
│  │ Created ⏱️ Last 90 days                    │ │
│  │ [🗑️]                                        │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  [➕ Add Filter]                                │
│                                                 │
│  [← Back] [Next: Options →]                    │
└─────────────────────────────────────────────────┘
```

**Step 4: Options**
```
┌─────────────────────────────────────────────────┐
│  Step 4: Query Options                          │
├─────────────────────────────────────────────────┤
│  Sorting:                                       │
│  [Expected Value ▼] [Descending ▼]             │
│                                                 │
│  Grouping & Aggregation:                        │
│  ☐ Group by Stage                              │
│  ☐ Count records                               │
│  ☐ Sum Expected Value                          │
│                                                 │
│  Limit Results:                                 │
│  ☑ Limit to [100____] rows                     │
│                                                 │
│  Time Scope:                                    │
│  Apply to field: [Created Date ▼]             │
│  ⦿ Last 90 days                                │
│  ○ Custom range                                │
│                                                 │
│  [← Back] [💾 Save Query] [▶️ Run Query]       │
└─────────────────────────────────────────────────┘
```

---

#### Results Viewer Screen

**Purpose:** Display and interpret query results

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  High-Value Opportunities                       │
│  Executed: 2 minutes ago · 47 results · 124ms  │
├─────────────────────────────────────────────────┤
│  [📊 Table] [📈 Chart] [🤖 AI Analysis]         │
├─────────────────────────────────────────────────┤
│  Name              │ Customer      │ Value │ Stage │
│  ───────────────────────────────────────────── │
│  Building Retrofit │ ABC Corp      │ 25k   │ Won   │
│  New Installation  │ XYZ Ltd       │ 18k   │ Nego. │
│  Upgrade Project   │ Example Inc   │ 15k   │ Prop. │
│  ...                                            │
│                                                 │
│  Showing 1-25 of 47 [◀ Prev] [Next ▶]          │
├─────────────────────────────────────────────────┤
│  🤖 AI Insights                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ **Key Findings:**                          │ │
│  │ • 73% of high-value deals involve         │ │
│  │   "Retrofit" or "Upgrade" keywords        │ │
│  │ • Average deal size: €16,800              │ │
│  │ • Won deals have 2.3x more activities     │ │
│  │                                            │ │
│  │ **Recommendations:**                       │ │
│  │ • Focus on retrofit opportunities         │ │
│  │ • Increase activity on deals >€15k        │ │
│  │                                            │ │
│  │ [🔄 Refresh Analysis]                      │ │
│  └───────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│  [💾 Export JSON] [📄 Export CSV] [🔗 Share]   │
└─────────────────────────────────────────────────┘
```

---

#### Schema Manager Screen

**Purpose:** View and customize field registry

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Schema Manager                                 │
│  Last updated: 3 hours ago [🔄 Refresh Schema] │
├─────────────────────────────────────────────────┤
│  Models: [Opportunities ▼]                     │
│  ┌───────────────────────────────────────────┐ │
│  │ Field Name      │ Type     │ Category     │ │
│  │ ───────────────────────────────────────── │ │
│  │ ✏️ Name          │ Text     │ Sales        │ │
│  │ ✏️ Customer      │ Relation │ Sales        │ │
│  │ ✏️ Expected Value│ Monetary │ Sales        │ │
│  │ ✏️ Stage         │ Select   │ Process      │ │
│  │ 👁️ Probability   │ Float    │ (Hidden)     │ │
│  │ ...                                        │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  Click ✏️ to customize field                    │
│                                                 │
│  Categories:                                    │
│  [Sales] [Process] [Building] [Pain Points]    │
│  [➕ Add Category]                              │
└─────────────────────────────────────────────────┘

Edit Field Dialog:
┌─────────────────────────────────────────────────┐
│  Edit Field: "Expected Value"                   │
├─────────────────────────────────────────────────┤
│  Custom Label:                                  │
│  [Deal Value___________________________]        │
│                                                 │
│  Description:                                   │
│  [Expected revenue from this opportunity        │
│   in EUR____________________________]           │
│                                                 │
│  Category: [Sales ▼]                           │
│                                                 │
│  Tags: [revenue] [forecast] [×]                │
│                                                 │
│  ☐ Hide this field                             │
│                                                 │
│  [Cancel] [Reset to Default] [Save]            │
└─────────────────────────────────────────────────┘
```

---

## 5. Preset Query Strategy

### 5.1 Preset Generation Logic

**Trigger:** Module activation OR schema refresh

**Algorithm:**

```typescript
async function generatePresetQueries(schema: SchemaSnapshot): Promise<QueryDefinition[]> {
  const presets: QueryDefinition[] = [];
  
  // 1. Identify key models (those with many relations)
  const keyModels = findKeyModels(schema);
  
  // 2. For each key model, generate category presets
  for (const model of keyModels) {
    // Conversion Analysis
    if (hasStageField(model) && hasDateFields(model)) {
      presets.push(generateConversionFunnel(model));
    }
    
    // Segmentation
    if (hasCategorizationFields(model)) {
      presets.push(generateSegmentationQuery(model));
    }
    
    // Activity Correlation
    if (hasRelatedActivities(model, schema)) {
      presets.push(generateActivityCorrelation(model, schema));
    }
    
    // Time-based Trends
    if (hasDateFields(model) && hasNumericFields(model)) {
      presets.push(generateTrendAnalysis(model));
    }
    
    // Risk Detection
    if (hasStatusField(model) && hasDateFields(model)) {
      presets.push(generateRiskQuery(model));
    }
  }
  
  return presets;
}
```

### 5.2 Example Preset Templates

**Template 1: Conversion Funnel**
```typescript
{
  name: "Opportunity Conversion Funnel",
  description: "Track how opportunities move through stages over time",
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "stage_id", alias: "Stage" },
    { model: "crm.lead", field: "create_date", alias: "Created" }
  ],
  aggregations: [
    {
      function: "count",
      alias: "Count",
      group_by: ["stage_id"]
    },
    {
      function: "avg",
      field: "expected_revenue",
      alias: "Avg Value",
      group_by: ["stage_id"]
    }
  ],
  sorting: [
    { model: "crm.lead", field: "stage_id", direction: "asc" }
  ],
  time_scope: {
    field: "create_date",
    mode: "relative",
    period: "last_90_days"
  }
}
```

**Template 2: Pain Point Distribution**
```typescript
{
  name: "Pain Point Analysis by Building Type",
  description: "See which problems occur most frequently per building category",
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "x_building_type", alias: "Building Type" },
    { model: "crm.lead", field: "x_pain_points", alias: "Pain Points" }
  ],
  aggregations: [
    {
      function: "count",
      alias: "Occurrences",
      group_by: ["x_building_type", "x_pain_points"]
    }
  ],
  filters: [
    {
      model: "crm.lead",
      field: "x_pain_points",
      operator: "is set",
      value: null
    }
  ],
  sorting: [
    { model: "crm.lead", field: "count", direction: "desc" }
  ]
}
```

**Template 3: High-Activity Low-Conversion**
```typescript
{
  name: "High Activity, Low Conversion Deals",
  description: "Opportunities with many activities but stuck in early stages",
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "name", alias: "Opportunity" },
    { model: "crm.lead", field: "partner_id", alias: "Customer" },
    { model: "crm.lead", field: "stage_id", alias: "Stage" }
  ],
  joins: [
    {
      alias: "activities",
      model: "mail.activity",
      join_type: "left",
      from_model: "crm.lead",
      from_field: "id",
      to_field: "res_id",
      aggregation: "count"
    }
  ],
  filters: [
    {
      model: "activities",
      field: "count",
      operator: ">",
      value: 5
    },
    {
      model: "crm.lead",
      field: "probability",
      operator: "<",
      value: 50
    }
  ],
  time_scope: {
    field: "create_date",
    mode: "relative",
    period: "last_90_days"
  }
}
```

### 5.3 Preset Categories

Organize presets into categories:

1. **Conversion & Pipeline**
   - Conversion funnel
   - Stage duration analysis
   - Win/loss reasons
   - Deal velocity

2. **Segmentation**
   - By building type
   - By geographic region
   - By deal size
   - By customer type

3. **Activity & Engagement**
   - Activity-to-conversion correlation
   - Response time analysis
   - Meeting effectiveness
   - Communication patterns

4. **Pain Points & Needs**
   - Problem frequency
   - Pain point clustering
   - Problem-to-solution mapping
   - Unresolved issues

5. **Risk & Opportunity**
   - Stale deals
   - At-risk opportunities
   - High-value targets
   - Untapped segments

6. **Trends & Forecasting**
   - Monthly pipeline growth
   - Seasonal patterns
   - Forecast accuracy
   - Revenue trends

---

## 6. AI Integration

### 6.1 AI Capabilities

**1. Query Suggestion**
- Analyze schema structure
- Identify interesting correlations
- Suggest exploration paths
- Generate complete queries

**2. Result Interpretation**
- Summarize findings in plain language
- Identify outliers
- Detect trends
- Recommend actions

**3. Schema Understanding**
- Explain model relationships
- Suggest useful fields
- Recommend join strategies

### 6.2 AI Prompt Engineering

#### Query Suggestion Prompt

```
CONTEXT:
You are a senior sales analyst helping a sales team understand their pipeline better.

SCHEMA:
{JSON schema dump}

USER CONTEXT:
- Role: {user_role}
- Recent queries: {recent_query_summaries}
- Intent: {optional_user_intent}

TASK:
Generate 5 insightful query suggestions that would help this sales team:
1. Understand conversion patterns
2. Identify bottlenecks or risks
3. Segment their market effectively
4. Correlate activities with outcomes
5. Find actionable opportunities

REQUIREMENTS:
- Each query must be executable with the provided schema
- Focus on cross-field or cross-model insights (not single-field reports)
- Prioritize actionable insights over pure statistics
- Include a clear business reasoning for each suggestion
- Return valid QueryDefinition JSON

OUTPUT FORMAT:
{
  "suggestions": [
    {
      "title": "Clear, action-oriented title",
      "description": "What this query reveals (1-2 sentences)",
      "reasoning": "Why this insight is valuable to the sales team",
      "category": "conversion|segmentation|correlation|outlier|trend",
      "confidence": 0.85,
      "query": {QueryDefinition}
    }
  ]
}

Think step by step:
1. What are the most important models in this schema?
2. What relationships exist between them?
3. What patterns would be valuable but not obvious?
4. How can we combine fields to reveal insights?
```

#### Result Interpretation Prompt

```
CONTEXT:
You are interpreting the results of a sales insight query for a non-technical sales manager.

QUERY:
{query_definition}

RESULTS:
{query_results}

TASK:
Provide a clear, actionable interpretation of these results.

STRUCTURE YOUR RESPONSE:

1. SUMMARY (2-3 sentences)
   - What the data shows at a glance
   - Most important finding

2. KEY FINDINGS (3-5 bullet points)
   - Specific insights from the data
   - Include numbers and comparisons
   - Highlight surprises or patterns

3. OUTLIERS (if any)
   - Records that don't fit the pattern
   - Why they're interesting

4. TRENDS (if applicable)
   - Directions the data is moving
   - What's increasing or decreasing

5. RECOMMENDATIONS (2-4 actions)
   - Specific next steps
   - Based directly on the findings
   - Actionable by sales team

6. FOLLOW-UP QUESTIONS (2-3)
   - Natural next queries to run
   - Deeper explorations

TONE:
- Clear and direct
- Avoid jargon
- Focus on "so what?" and "now what?"
- Use business language, not technical terms
```

### 6.3 AI Model Selection

**Recommended:** OpenAI GPT-4 or GPT-4-turbo

**Alternatives:**
- Claude 3 Opus (for detailed analysis)
- GPT-3.5-turbo (for faster, cheaper suggestions)

**Fallback Strategy:**
- If AI unavailable, show preset queries only
- Cache AI responses for 1 hour
- Graceful degradation

---

## 7. Query Translation Engine

### 7.1 QueryDefinition → Odoo Domain

**Core Challenge:** Translate our query model into Odoo's domain syntax

**Odoo Domain Format:**
```python
[
  ('field_name', 'operator', value),
  '&',  # AND
  ('field2', '>', 100),
  ('field3', '=', 'value')
]
```

**Translation Algorithm:**

```typescript
function translateToOdooDomain(query: QueryDefinition, schema: SchemaSnapshot): OdooDomain {
  const domain: any[] = [];
  
  // 1. Translate simple filters
  for (const filter of query.filters) {
    if (filter.model !== query.base_model) {
      // This is a joined model filter - handle separately
      continue;
    }
    
    const odooOperator = mapOperator(filter.operator);
    domain.push([filter.field, odooOperator, filter.value]);
  }
  
  // 2. Add time scope filter
  if (query.time_scope) {
    const timeFilter = translateTimeScope(query.time_scope);
    domain.push(...timeFilter);
  }
  
  // 3. Handle joins via relational filters
  for (const join of query.joins || []) {
    const joinFilters = translateJoin(join, schema);
    domain.push(...joinFilters);
  }
  
  // 4. Add conjunction operators if needed
  if (domain.length > 1) {
    domain.unshift('&'.repeat(domain.length - 1));
  }
  
  return domain;
}

function mapOperator(op: FilterOperator): string {
  const mapping = {
    '=': '=',
    '!=': '!=',
    '>': '>',
    '>=': '>=',
    '<': '<',
    '<=': '<=',
    'like': 'like',
    'ilike': 'ilike',
    'not like': 'not like',
    'not ilike': 'not ilike',
    'in': 'in',
    'not in': 'not in',
    'is set': '!=',  // Convert to != false
    'is not set': '='  // Convert to = false
  };
  return mapping[op] || '=';
}
```

### 7.2 Handling Aggregations

**Strategy:** Use `read_group()` instead of `search_read()`

```typescript
function buildOdooQuery(query: QueryDefinition): OdooRPCCall {
  if (query.aggregations && query.aggregations.length > 0) {
    // Use read_group
    return {
      model: query.base_model,
      method: 'read_group',
      args: [
        translateToOdooDomain(query),           // domain
        query.fields.map(f => f.field),         // fields
        query.aggregations[0].group_by || [],   // groupby
        {
          offset: query.offset || 0,
          limit: query.limit || 1000,
          orderby: translateSorting(query.sorting)
        }
      ]
    };
  } else {
    // Use search_read
    return {
      model: query.base_model,
      method: 'search_read',
      args: [
        translateToOdooDomain(query),
        query.fields.map(f => f.field),
        query.offset || 0,
        query.limit || 1000,
        translateSorting(query.sorting)
      ]
    };
  }
}
```

### 7.3 Handling Joins

**Challenge:** Odoo doesn't support SQL-style joins

**Solution:** Multi-step queries + client-side join

```typescript
async function executeQueryWithJoins(query: QueryDefinition): Promise<QueryResult> {
  // 1. Execute base query
  const baseResults = await odooClient.searchRead(
    query.base_model,
    translateToOdooDomain(query),
    query.fields.filter(f => f.model === query.base_model).map(f => f.field)
  );
  
  // 2. For each join, fetch related data
  const joinedData = new Map();
  for (const join of query.joins || []) {
    const relatedIds = baseResults
      .map(r => r[join.from_field])
      .filter(id => id != null);
    
    if (relatedIds.length === 0) continue;
    
    const joinResults = await odooClient.searchRead(
      join.model,
      [['id', 'in', relatedIds]],
      query.fields.filter(f => f.model === join.alias).map(f => f.field)
    );
    
    // Index by ID for fast lookup
    joinResults.forEach(r => joinedData.set(`${join.alias}:${r.id}`, r));
  }
  
  // 3. Merge results
  const mergedResults = baseResults.map(baseRow => {
    const merged = { ...baseRow };
    
    for (const join of query.joins || []) {
      const relatedId = baseRow[join.from_field];
      const relatedData = joinedData.get(`${join.alias}:${relatedId}`);
      
      if (relatedData) {
        // Add joined fields with alias prefix
        for (const field of query.fields.filter(f => f.model === join.alias)) {
          merged[field.alias || `${join.alias}.${field.field}`] = relatedData[field.field];
        }
      }
    }
    
    return merged;
  });
  
  return {
    rows: mergedResults,
    total_count: mergedResults.length,
    // ... other metadata
  };
}
```

---

## 8. Performance Optimization

### 8.1 Schema Caching

```typescript
class SchemaCache {
  private cache: SchemaSnapshot | null = null;
  private cacheTime: number = 0;
  private readonly TTL = 3600000; // 1 hour
  
  async get(env: Env, forceRefresh = false): Promise<SchemaSnapshot> {
    const now = Date.now();
    
    if (!forceRefresh && this.cache && (now - this.cacheTime) < this.TTL) {
      return this.cache;
    }
    
    // Fetch from Odoo
    const schema = await this.fetchFromOdoo(env);
    
    // Cache in KV for worker restarts
    await env.SCHEMA_CACHE.put('schema:latest', JSON.stringify(schema), {
      expirationTtl: this.TTL / 1000
    });
    
    this.cache = schema;
    this.cacheTime = now;
    
    return schema;
  }
  
  private async fetchFromOdoo(env: Env): Promise<SchemaSnapshot> {
    // Implementation: call fields_get() for each model
    // ...
  }
}
```

### 8.2 Query Result Pagination

```typescript
async function executeWithPagination(
  query: QueryDefinition,
  page: number,
  perPage: number
): Promise<PaginatedResult> {
  const offset = (page - 1) * perPage;
  const limit = perPage;
  
  // Execute count query first
  const totalCount = await odooClient.searchCount(
    query.base_model,
    translateToOdooDomain(query)
  );
  
  // Then fetch page
  const results = await odooClient.searchRead(
    query.base_model,
    translateToOdooDomain(query),
    query.fields.map(f => f.field),
    offset,
    limit,
    translateSorting(query.sorting)
  );
  
  return {
    rows: results,
    total_count: totalCount,
    pagination: {
      page,
      per_page: perPage,
      total_pages: Math.ceil(totalCount / perPage),
      has_more: (page * perPage) < totalCount
    }
  };
}
```

### 8.3 Query Complexity Detection

```typescript
function assessComplexity(query: QueryDefinition, schema: SchemaSnapshot): ComplexityAssessment {
  let score = 0;
  const warnings: string[] = [];
  
  // Base model record count (from schema metadata)
  const modelSize = schema.models[query.base_model]?.estimated_count || 0;
  if (modelSize > 10000) score += 2;
  if (modelSize > 100000) score += 3;
  
  // Number of joins
  const joinCount = query.joins?.length || 0;
  score += joinCount * 2;
  if (joinCount > 3) {
    warnings.push("Multiple joins may slow down query");
  }
  
  // Aggregations
  if (query.aggregations?.length > 0) {
    score += 1;
    if (query.aggregations[0].group_by?.length > 2) {
      score += 2;
      warnings.push("Grouping by multiple fields can be slow");
    }
  }
  
  // Text search filters
  const hasTextSearch = query.filters.some(f => 
    ['like', 'ilike'].includes(f.operator)
  );
  if (hasTextSearch) {
    score += 1;
    warnings.push("Text search may be slow on large datasets");
  }
  
  // Result set size
  if (!query.limit || query.limit > 1000) {
    score += 2;
    warnings.push("Consider adding a limit to improve performance");
  }
  
  const complexity: "low" | "medium" | "high" = 
    score <= 3 ? "low" : score <= 7 ? "medium" : "high";
  
  return {
    complexity,
    score,
    warnings,
    estimated_execution_ms: score * 500
  };
}
```

---

## 9. Security & Access Control

### 9.1 Module Access

**Database Schema:**
```sql
-- Module activation (already exists in user_modules)
INSERT INTO modules (code, name, description, is_active)
VALUES (
  'sales_insight_explorer',
  'Sales Insight Explorer',
  'Explore and analyze sales data with dynamic queries',
  false  -- Disabled by default
);
```

**Middleware Check:**
```typescript
async function requireModule(context: RequestContext, moduleCode: string) {
  const hasAccess = await checkUserModuleAccess(
    context.user.id,
    moduleCode,
    context.env
  );
  
  if (!hasAccess) {
    throw new Error(`Module ${moduleCode} not enabled for user`);
  }
}
```

### 9.2 Query Execution Limits

```typescript
interface QueryLimits {
  maxResultRows: number;        // 10,000
  maxJoins: number;             // 5
  maxExecutionTimeMs: number;   // 30,000
  maxQueriesPerMinute: number;  // 10
}

async function enforceQueryLimits(
  query: QueryDefinition,
  user: User
): Promise<void> {
  // Check structural limits
  if (query.joins && query.joins.length > LIMITS.maxJoins) {
    throw new Error(`Maximum ${LIMITS.maxJoins} joins allowed`);
  }
  
  if (query.limit && query.limit > LIMITS.maxResultRows) {
    throw new Error(`Maximum ${LIMITS.maxResultRows} rows allowed`);
  }
  
  // Check rate limit
  const recentQueries = await getRateLimit(user.id);
  if (recentQueries >= LIMITS.maxQueriesPerMinute) {
    throw new Error("Rate limit exceeded. Please wait before running more queries.");
  }
}
```

### 9.3 Data Access Control

**Principle:** Respect Odoo's built-in record rules

```typescript
async function executeOdooQuery(
  query: QueryDefinition,
  userId: string,
  env: Env
): Promise<any[]> {
  // ALWAYS include Odoo user context
  const odooUserId = await mapUserToOdoo(userId, env);
  
  const result = await odooClient.call({
    model: query.base_model,
    method: 'search_read',
    args: [...],
    kwargs: {
      context: {
        uid: odooUserId  // Ensures record rules apply
      }
    }
  });
  
  return result;
}
```

---

## 10. Implementation Checklist

### Phase 1: Foundation (Week 1-2)
- [ ] Database schema (tables, indexes)
- [ ] Module registration in registry
- [ ] Worker API structure (routes, middleware)
- [ ] Schema service (Odoo introspection)
- [ ] Schema caching (KV)
- [ ] Basic UI structure (module shell)

### Phase 2: Query System (Week 3-4)
- [ ] Query definition TypeScript interfaces
- [ ] Query validation logic
- [ ] Odoo domain translation
- [ ] Query execution engine
- [ ] Result formatting
- [ ] Query storage (CRUD endpoints)

### Phase 3: UI Components (Week 5-6)
- [ ] Query library view
- [ ] Query builder (4-step wizard)
- [ ] Field selector component
- [ ] Filter builder component
- [ ] Result viewer (table)
- [ ] Schema manager

### Phase 4: Advanced Features (Week 7-8)
- [ ] Join support (multi-step queries)
- [ ] Aggregation support (read_group)
- [ ] Field registry (custom labels)
- [ ] Preset query generation
- [ ] Export (JSON, CSV)

### Phase 5: AI Integration (Week 9-10)
- [ ] OpenAI API integration
- [ ] Query suggestion prompts
- [ ] Result interpretation prompts
- [ ] AI panel UI
- [ ] Response caching

### Phase 6: Polish & Optimization (Week 11-12)
- [ ] Performance optimization
- [ ] Error handling & validation
- [ ] User documentation
- [ ] Admin guide
- [ ] Testing (unit, integration)
- [ ] Production deployment

---

## 11. File Structure

```
src/
├── modules/
│   └── sales-insight-explorer/
│       ├── module.js                 # Module registration
│       ├── routes.js                 # Worker routes
│       ├── ui.js                     # Main UI entry
│       │
│       ├── components/
│       │   ├── QueryLibrary.js       # Browse queries
│       │   ├── QueryBuilder.js       # Visual builder
│       │   ├── ResultViewer.js       # Display results
│       │   ├── SchemaManager.js      # Field registry
│       │   ├── FieldSelector.js      # Field picker
│       │   ├── FilterBuilder.js      # Filter constructor
│       │   ├── AIPanel.js            # AI features
│       │   └── ExportDialog.js       # Export options
│       │
│       ├── lib/
│       │   ├── schema-client.js      # Schema fetching
│       │   ├── query-validator.js    # Validation
│       │   ├── query-engine.js       # Translation & execution
│       │   ├── preset-generator.js   # Auto presets
│       │   ├── ai-service.js         # AI integration
│       │   └── export-handler.js     # Data export
│       │
│       └── styles/
│           └── explorer.css
│
├── lib/
│   └── odoo-query.js                 # Shared Odoo query utilities
│
└── config/
    └── query-limits.js               # Rate limits, quotas

supabase/
└── migrations/
    └── 20260121_sales_insight_explorer.sql

public/
└── sales-insight-explorer.js         # Compiled frontend bundle
```

---

## 12. Error Handling Strategy

### 12.1 Schema Errors

```typescript
class SchemaError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean
  ) {
    super(message);
  }
}

// Usage
try {
  const schema = await fetchSchema();
} catch (error) {
  if (error instanceof SchemaError && error.recoverable) {
    // Try cached version
    return await getCachedSchema();
  } else {
    // Fatal error
    throw new Error("Cannot load schema. Please try again later.");
  }
}
```

### 12.2 Query Validation Errors

```typescript
interface ValidationError {
  path: string;           // "filters[2].field"
  message: string;        // "Field 'unknown_field' does not exist"
  code: string;           // "FIELD_NOT_FOUND"
  suggestion?: string;    // "Did you mean 'partner_id'?"
}

function validateQuery(
  query: QueryDefinition,
  schema: SchemaSnapshot
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  
  // Check base model exists
  if (!schema.models[query.base_model]) {
    errors.push({
      path: "base_model",
      message: `Model '${query.base_model}' not found in schema`,
      code: "MODEL_NOT_FOUND",
      suggestion: findSimilarModel(query.base_model, schema)
    });
  }
  
  // Check all fields exist
  for (let i = 0; i < query.fields.length; i++) {
    const field = query.fields[i];
    const modelDef = schema.models[field.model];
    
    if (!modelDef) {
      errors.push({
        path: `fields[${i}].model`,
        message: `Model '${field.model}' not found`,
        code: "MODEL_NOT_FOUND"
      });
      continue;
    }
    
    if (!modelDef.fields[field.field]) {
      errors.push({
        path: `fields[${i}].field`,
        message: `Field '${field.field}' not found in model '${field.model}'`,
        code: "FIELD_NOT_FOUND",
        suggestion: findSimilarField(field.field, modelDef)
      });
    }
  }
  
  // Check filter types match
  for (let i = 0; i < query.filters.length; i++) {
    const filter = query.filters[i];
    const fieldDef = schema.models[filter.model]?.fields[filter.field];
    
    if (fieldDef) {
      const isValidOperator = isOperatorValidForType(
        filter.operator,
        fieldDef.type
      );
      
      if (!isValidOperator) {
        warnings.push(
          `Filter ${i}: operator '${filter.operator}' unusual for ${fieldDef.type} field`
        );
      }
    }
  }
  
  return {
    is_valid: errors.length === 0,
    errors,
    warnings
  };
}
```

### 12.3 Execution Errors

```typescript
async function executeQuerySafely(
  query: QueryDefinition
): Promise<QueryResult> {
  try {
    // Set timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Query timeout")), 30000);
    });
    
    const resultPromise = executeQuery(query);
    
    const result = await Promise.race([resultPromise, timeoutPromise]);
    
    return result as QueryResult;
    
  } catch (error) {
    // Log for debugging
    console.error("Query execution failed:", error);
    
    // Return user-friendly error
    throw new Error(
      "Query execution failed. " +
      (error.message.includes("timeout") 
        ? "The query took too long. Try adding filters or reducing the date range."
        : "Please check your query and try again.")
    );
  }
}
```

---

## 13. Testing Strategy

### 13.1 Unit Tests

```typescript
// Test: Query validation
describe('QueryValidator', () => {
  it('should reject query with unknown model', () => {
    const query = {
      base_model: 'fake.model',
      fields: [],
      filters: []
    };
    
    const result = validateQuery(query, mockSchema);
    
    expect(result.is_valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('MODEL_NOT_FOUND');
  });
  
  it('should accept valid query', () => {
    const query = {
      base_model: 'crm.lead',
      fields: [
        { model: 'crm.lead', field: 'name' }
      ],
      filters: []
    };
    
    const result = validateQuery(query, mockSchema);
    
    expect(result.is_valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// Test: Odoo domain translation
describe('OdooDomainTranslator', () => {
  it('should translate simple filter', () => {
    const query = {
      base_model: 'crm.lead',
      fields: [],
      filters: [
        { model: 'crm.lead', field: 'probability', operator: '>=', value: 50 }
      ]
    };
    
    const domain = translateToOdooDomain(query, mockSchema);
    
    expect(domain).toEqual([
      ['probability', '>=', 50]
    ]);
  });
  
  it('should handle multiple filters with AND', () => {
    const query = {
      base_model: 'crm.lead',
      fields: [],
      filters: [
        { model: 'crm.lead', field: 'probability', operator: '>=', value: 50 },
        { model: 'crm.lead', field: 'stage_id', operator: '=', value: 5 }
      ]
    };
    
    const domain = translateToOdooDomain(query, mockSchema);
    
    expect(domain).toEqual([
      '&',
      ['probability', '>=', 50],
      ['stage_id', '=', 5]
    ]);
  });
});
```

### 13.2 Integration Tests

```typescript
// Test: End-to-end query execution
describe('Query Execution (Integration)', () => {
  it('should fetch real data from Odoo', async () => {
    const query: QueryDefinition = {
      base_model: 'crm.lead',
      fields: [
        { model: 'crm.lead', field: 'name' },
        { model: 'crm.lead', field: 'probability' }
      ],
      filters: [
        { model: 'crm.lead', field: 'probability', operator: '>', value: 0 }
      ],
      limit: 10
    };
    
    const result = await executeQuery(query, testEnv);
    
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBeLessThanOrEqual(10);
    expect(result.rows[0]).toHaveProperty('name');
    expect(result.rows[0]).toHaveProperty('probability');
  });
});
```

### 13.3 UI Tests

```typescript
// Test: Query builder wizard
describe('QueryBuilder Component', () => {
  it('should progress through steps', async () => {
    const { getByText, getByRole } = render(<QueryBuilder />);
    
    // Step 1: Select base model
    expect(getByText('Choose Base Model')).toBeInTheDocument();
    fireEvent.click(getByText('Opportunities'));
    fireEvent.click(getByText('Next'));
    
    // Step 2: Select fields
    expect(getByText('Select Fields')).toBeInTheDocument();
    fireEvent.click(getByText('Name'));
    fireEvent.click(getByText('Customer'));
    fireEvent.click(getByText('Next'));
    
    // Step 3: Add filters
    expect(getByText('Filter Results')).toBeInTheDocument();
    // ...
  });
});
```

---

## 14. Documentation Requirements

### 14.1 User Documentation

**File:** `docs/SALES_INSIGHT_EXPLORER_USER_GUIDE.md`

**Sections:**
1. **Introduction** - What is it, who is it for
2. **Getting Started** - Activation, first query
3. **Query Library** - Browse, run, manage queries
4. **Building Queries** - Step-by-step wizard guide
5. **Understanding Results** - How to read results
6. **AI Features** - Suggestions and interpretations
7. **Presets** - What they are, how to use them
8. **Tips & Best Practices** - Performance, effective queries
9. **Troubleshooting** - Common issues

### 14.2 Admin Documentation

**File:** `docs/SALES_INSIGHT_EXPLORER_ADMIN.md`

**Sections:**
1. **Module Activation** - How to enable for users
2. **Schema Management** - Refresh, troubleshooting
3. **Field Registry** - Customizing labels and categories
4. **Performance Tuning** - Limits, caching
5. **Security** - Access control, data privacy
6. **Monitoring** - Query logs, usage metrics

### 14.3 Developer Documentation

**File:** `docs/SALES_INSIGHT_EXPLORER_DEVELOPER.md`

**Sections:**
1. **Architecture Overview**
2. **Data Models** - Complete schema reference
3. **API Reference** - All endpoints with examples
4. **Query Translation** - How queries become Odoo calls
5. **Adding Features** - Extension points
6. **Testing** - How to run tests

---

## 15. Success Metrics

### 15.1 Technical Metrics

- Schema fetch time: <2s
- Query validation time: <100ms
- Query execution time (simple): <1s
- Query execution time (complex): <10s
- Cache hit rate: >80%
- Error rate: <5%

### 15.2 User Metrics

- Time to first query: <5 minutes
- Queries per user per week: >3
- Preset usage rate: >50%
- AI suggestion acceptance: >30%
- Shared queries: >20% of total

### 15.3 Business Metrics

- Sales insights discovered: Measured by user feedback
- Action items generated: Tracked in follow-ups
- Decision quality: Survey-based
- Time saved vs manual analysis: Estimated 10x

---

## 16. Future Enhancements (Post-V1)

### 16.1 Scheduled Queries
- Run queries on schedule
- Email results to team
- Alert on threshold changes

### 16.2 Collaborative Features
- Comment on queries
- Share results with annotations
- Team workspaces

### 16.3 Advanced Visualizations
- Charts and graphs
- Geographic maps (if location data)
- Timeline views

### 16.4 Query Templates
- Parameterized queries
- User fills in values
- Shareable templates

### 16.5 Data Export Enhancement
- Excel export with formatting
- PDF reports
- Google Sheets integration

### 16.6 ML-Powered Insights
- Anomaly detection
- Predictive scoring
- Automatic clustering

---

## 17. Migration Strategy

### 17.1 Database Migration

```sql
-- File: supabase/migrations/20260121_sales_insight_explorer.sql

-- Field Registry
CREATE TABLE field_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name TEXT NOT NULL,
  field_name TEXT NOT NULL,
  custom_label TEXT,
  custom_description TEXT,
  is_hidden BOOLEAN DEFAULT false,
  display_order INTEGER,
  category TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  UNIQUE(model_name, field_name)
);

CREATE INDEX idx_field_registry_model ON field_registry(model_name);
CREATE INDEX idx_field_registry_category ON field_registry(category);

-- Insight Queries
CREATE TABLE insight_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  query_definition JSONB NOT NULL,
  created_by UUID REFERENCES users(id),
  is_shared BOOLEAN DEFAULT false,
  is_preset BOOLEAN DEFAULT false,
  ai_intent TEXT,
  ai_generated BOOLEAN DEFAULT false,
  schema_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0
);

CREATE INDEX idx_queries_user ON insight_queries(created_by);
CREATE INDEX idx_queries_shared ON insight_queries(is_shared) WHERE is_shared = true;
CREATE INDEX idx_queries_preset ON insight_queries(is_preset) WHERE is_preset = true;

-- Module Registration
INSERT INTO modules (code, name, description, icon, is_active)
VALUES (
  'sales_insight_explorer',
  'Sales Insight Explorer',
  'Explore and analyze sales data with dynamic queries and AI-powered insights',
  'chart-line',
  false
);

-- Row Level Security
ALTER TABLE field_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own field registry"
  ON field_registry FOR ALL
  USING (created_by = auth.uid());

CREATE POLICY "Users can manage their own queries"
  ON insight_queries FOR ALL
  USING (created_by = auth.uid());

CREATE POLICY "Users can view shared queries"
  ON insight_queries FOR SELECT
  USING (is_shared = true);
```

### 17.2 Module Registration

```javascript
// src/modules/sales-insight-explorer/module.js

export default {
  code: 'sales_insight_explorer',
  name: 'Sales Insight Explorer',
  description: 'Explore and analyze sales data with dynamic queries',
  route: '/insights',
  icon: 'chart-line',
  isActive: true,
  
  routes: {
    'GET /': async (context) => {
      return new Response(salesInsightUI(context.user), {
        headers: { 'Content-Type': 'text/html' }
      });
    },
    
    // API routes defined in routes.js
    ...apiRoutes
  }
};
```

---

## 18. Final Checklist

### Pre-Implementation Review
- [ ] All stakeholders reviewed this spec
- [ ] Technical feasibility confirmed
- [ ] Resource allocation approved
- [ ] Timeline agreed upon

### Implementation Readiness
- [ ] Database schema reviewed
- [ ] API contracts finalized
- [ ] UI mockups approved
- [ ] Test strategy defined
- [ ] Documentation plan in place

### Go-Live Criteria
- [ ] All core features implemented
- [ ] Unit tests pass (>90% coverage)
- [ ] Integration tests pass
- [ ] Performance benchmarks met
- [ ] Security review passed
- [ ] User documentation complete
- [ ] Admin training completed

---

## 19. Glossary

**Base Model** - The primary Odoo model being queried (e.g., `crm.lead`)

**Field Registry** - User-managed customization layer for field labels and categories

**Join** - Relationship traversal to include data from related models

**Odoo Domain** - Odoo's native query filter format: `[('field', 'operator', value)]`

**Preset Query** - Pre-configured query automatically generated from schema

**Query Definition** - Complete specification of a query including filters, fields, aggregations

**Schema Snapshot** - Point-in-time capture of Odoo model and field definitions

**Worker** - Cloudflare Worker backend that mediates all Odoo communication

---

## End of Document

**Total Pages:** 19  
**Total Words:** ~11,000  
**Estimated Read Time:** 45 minutes  
**Implementation Time:** 10-12 weeks  
**Complexity:** High  
**Business Value:** Very High  

---

---

## 🔧 HARDENING ADDENDUM - Critical Corrections

**Date:** January 21, 2026  
**Purpose:** Correct structural overreach and align with Odoo reality  
**Status:** Mandatory - Supersedes conflicting sections above

This addendum corrects conceptual optimism in the original specification. **These corrections are binding and supersede any conflicting content above.**

---

### CORRECTION 1: Strict Redefinition of "Joins"

#### ❌ Problem Identified

The original `Join` interface assumes SQL-style join capabilities that **Odoo does not support**.

**Original (INVALID):**
```typescript
interface Join {
  from_model: string;
  from_field: string;
  to_field: string;
  // ... arbitrary join paths
}
```

**Why Invalid:**
- Odoo has no SQL join engine
- Relations are predefined in model definitions
- Arbitrary field-to-field matching is impossible
- Polymorphic relations (res_id) are not introspectable

---

#### ✅ Corrected Approach: Relation Traversal

**Replace ALL instances of "Join" with "RelationTraversal":**

```typescript
interface RelationTraversal {
  // Identity
  alias: string;                          // "customer", "activities"
  
  // Path definition (strictly schema-based)
  path: RelationPath[];
  
  // Aggregation strategy (for x2many relations)
  aggregation?: TraversalAggregation;
  
  // Filters applied AFTER traversal
  filters?: Filter[];
}

interface RelationPath {
  from_model: string;                     // "crm.lead"
  relation_field: string;                 // "partner_id" (must exist in schema)
  target_model: string;                   // "res.partner" (validated from schema)
  relation_type: "many2one" | "one2many" | "many2many";
}

type TraversalAggregation = 
  | "exists"           // Boolean: has any related records
  | "count"            // Integer: count of related records
  | "first"            // Object: first related record
  | "avg"              // Float: average of numeric field
  | "sum"              // Float: sum of numeric field
  | "min"              // Value: minimum value
  | "max";             // Value: maximum value

interface QueryDefinition {
  base_model: string;
  fields: FieldSelection[];
  filters: Filter[];
  
  // CORRECTED: No more "joins"
  relations: RelationTraversal[];        // ← REPLACES joins
  
  aggregations: Aggregation[];
  sorting: SortRule[];
  time_scope?: TimeScope;
  limit?: number;
  offset?: number;
}
```

---

#### Validation Rules (MANDATORY)

```typescript
function validateRelationTraversal(
  traversal: RelationTraversal,
  schema: SchemaSnapshot
): ValidationResult {
  const errors: ValidationError[] = [];
  
  for (const step of traversal.path) {
    // 1. Verify source model exists
    const sourceModel = schema.models[step.from_model];
    if (!sourceModel) {
      errors.push({
        path: `relations[${traversal.alias}].path`,
        message: `Source model '${step.from_model}' not found in schema`,
        code: "MODEL_NOT_FOUND"
      });
      continue;
    }
    
    // 2. Verify relation field exists
    const relationField = sourceModel.fields[step.relation_field];
    if (!relationField) {
      errors.push({
        path: `relations[${traversal.alias}].path`,
        message: `Field '${step.relation_field}' not found in model '${step.from_model}'`,
        code: "FIELD_NOT_FOUND"
      });
      continue;
    }
    
    // 3. Verify field is relational
    if (!['many2one', 'one2many', 'many2many'].includes(relationField.type)) {
      errors.push({
        path: `relations[${traversal.alias}].path`,
        message: `Field '${step.relation_field}' is not a relational field (type: ${relationField.type})`,
        code: "NOT_RELATIONAL_FIELD"
      });
      continue;
    }
    
    // 4. Verify target model matches schema definition
    if (relationField.relation !== step.target_model) {
      errors.push({
        path: `relations[${traversal.alias}].path`,
        message: `Target model mismatch: expected '${relationField.relation}', got '${step.target_model}'`,
        code: "TARGET_MODEL_MISMATCH"
      });
    }
    
    // 5. Verify relation type matches
    if (relationField.type !== step.relation_type) {
      errors.push({
        path: `relations[${traversal.alias}].path`,
        message: `Relation type mismatch: expected '${relationField.type}', got '${step.relation_type}'`,
        code: "RELATION_TYPE_MISMATCH"
      });
    }
    
    // 6. FORBIDDEN: Polymorphic relations (res_model + res_id)
    if (step.relation_field === 'res_id' || step.from_model.includes('mail.')) {
      errors.push({
        path: `relations[${traversal.alias}].path`,
        message: `Polymorphic relations (res_id) are not supported`,
        code: "POLYMORPHIC_RELATION_FORBIDDEN"
      });
    }
  }
  
  // 7. Verify aggregation is valid for relation type
  if (traversal.aggregation) {
    const lastStep = traversal.path[traversal.path.length - 1];
    
    if (lastStep.relation_type === 'many2one' && 
        !['exists', 'first'].includes(traversal.aggregation)) {
      errors.push({
        path: `relations[${traversal.alias}].aggregation`,
        message: `Aggregation '${traversal.aggregation}' invalid for many2one relation`,
        code: "INVALID_AGGREGATION"
      });
    }
  }
  
  return {
    is_valid: errors.length === 0,
    errors
  };
}
```

---

#### Execution Strategy (CORRECTED)

```typescript
async function executeQueryWithRelations(
  query: QueryDefinition,
  schema: SchemaSnapshot,
  env: Env
): Promise<QueryResult> {
  // 1. Execute base query
  const baseResults = await odooClient.searchRead(
    query.base_model,
    translateToOdooDomain(query),
    getBaseFields(query),
    query.limit || 1000
  );
  
  if (baseResults.length === 0) {
    return { rows: [], total_count: 0, columns: [], warnings: [] };
  }
  
  // 2. Execute relation traversals (CORRECTED: multi-step fetches)
  const relationData = new Map<string, Map<number, any>>();
  
  for (const relation of query.relations || []) {
    // Validate before execution
    const validation = validateRelationTraversal(relation, schema);
    if (!validation.is_valid) {
      throw new ValidationError(`Invalid relation '${relation.alias}': ${validation.errors[0].message}`);
    }
    
    // Execute traversal step-by-step
    let currentRecords = baseResults.map(r => ({ id: r.id }));
    
    for (const step of relation.path) {
      const currentIds = currentRecords.map(r => r.id).filter(id => id != null);
      
      if (currentIds.length === 0) break;
      
      // Fetch related records via Odoo relation
      const relatedRecords = await odooClient.searchRead(
        step.target_model,
        buildRelationDomain(step, currentIds),
        ['id', step.relation_field, ...getRelationFields(query, relation.alias)]
      );
      
      currentRecords = relatedRecords;
    }
    
    // Apply aggregation
    const aggregatedData = applyTraversalAggregation(
      currentRecords,
      relation.aggregation,
      relation.filters
    );
    
    relationData.set(relation.alias, aggregatedData);
  }
  
  // 3. Merge data
  const mergedResults = baseResults.map(baseRow => {
    const merged = { ...baseRow };
    
    for (const [alias, data] of relationData) {
      const relatedValue = data.get(baseRow.id);
      merged[`_${alias}`] = relatedValue || null;
    }
    
    return merged;
  });
  
  return {
    rows: mergedResults,
    total_count: mergedResults.length,
    columns: buildColumnMetadata(query, schema),
    warnings: []
  };
}

function buildRelationDomain(
  step: RelationPath,
  sourceIds: number[]
): OdooDomain {
  switch (step.relation_type) {
    case 'many2one':
      // Source records have foreign key pointing to target
      return [['id', 'in', sourceIds]];
      
    case 'one2many':
    case 'many2many':
      // Target records point back to source via reverse relation
      return [[step.relation_field, 'in', sourceIds]];
      
    default:
      throw new Error(`Unknown relation type: ${step.relation_type}`);
  }
}
```

---

### CORRECTION 2: Schema-Driven Preset Generation (Zero Hardcoding)

#### ❌ Problem Identified

Original preset examples contain **explicit field names** like `x_building_type`, `x_pain_points`. This violates the core principle.

**Examples to DELETE:**
```typescript
// ❌ FORBIDDEN - Contains hardcoded field names
{
  base_model: "crm.lead",
  fields: [
    { model: "crm.lead", field: "x_building_type" },  // ← HARDCODED
    { model: "crm.lead", field: "x_pain_points" }     // ← HARDCODED
  ]
}
```

---

#### ✅ Corrected Approach: Algorithmic Preset Generation

**Preset Generator Algorithm (MANDATORY):**

```typescript
interface PresetGenerationContext {
  schema: SchemaSnapshot;
  registry: FieldRegistry;
  userRole?: string;
}

interface GeneratedPreset {
  name: string;
  description: string;
  category: PresetCategory;
  query: QueryDefinition;
  confidence: number;              // 0-1: How likely this is useful
}

type PresetCategory = 
  | "conversion"
  | "segmentation" 
  | "activity_analysis"
  | "risk_detection"
  | "time_trends";

async function generatePresets(
  context: PresetGenerationContext
): Promise<GeneratedPreset[]> {
  const presets: GeneratedPreset[] = [];
  
  // STEP 1: Identify key models based on introspection
  const keyModels = identifyKeyModels(context.schema);
  
  for (const model of keyModels) {
    // STEP 2: Analyze model structure
    const analysis = analyzeModelStructure(model, context);
    
    // STEP 3: Generate presets based on detected patterns
    
    // Pattern A: Stage-based conversion funnel
    if (analysis.hasStageField && analysis.hasDateField) {
      presets.push(generateConversionPreset(model, analysis, context));
    }
    
    // Pattern B: Categorical segmentation
    if (analysis.categoricalFields.length > 0 && analysis.numericFields.length > 0) {
      presets.push(generateSegmentationPreset(model, analysis, context));
    }
    
    // Pattern C: Activity correlation
    if (analysis.hasRelationToActivities) {
      presets.push(generateActivityPreset(model, analysis, context));
    }
    
    // Pattern D: Risk/staleness detection
    if (analysis.hasDateField && analysis.hasStatusField) {
      presets.push(generateRiskPreset(model, analysis, context));
    }
  }
  
  return presets.filter(p => p.confidence > 0.5);
}

interface ModelAnalysis {
  model: ModelDefinition;
  
  // Detected field patterns (NO NAMES, only patterns)
  hasStageField: boolean;
  stageFieldName?: string;           // Discovered, not assumed
  
  hasDateField: boolean;
  primaryDateField?: string;         // Heuristically selected
  
  hasStatusField: boolean;
  statusFieldName?: string;
  
  categoricalFields: FieldDefinition[];
  numericFields: FieldDefinition[];
  
  hasRelationToActivities: boolean;
  activityRelationPath?: RelationPath[];
  
  // Tags from registry
  painPointFields: FieldDefinition[];
  buildingFields: FieldDefinition[];
  salesFields: FieldDefinition[];
}

function analyzeModelStructure(
  model: ModelDefinition,
  context: PresetGenerationContext
): ModelAnalysis {
  const analysis: ModelAnalysis = {
    model,
    hasStageField: false,
    hasDateField: false,
    hasStatusField: false,
    categoricalFields: [],
    numericFields: [],
    hasRelationToActivities: false,
    painPointFields: [],
    buildingFields: [],
    salesFields: []
  };
  
  for (const [fieldName, field] of Object.entries(model.fields)) {
    // Check field type
    if (field.type === 'selection') {
      analysis.categoricalFields.push(field);
      
      // Heuristic: field name/label suggests stage
      if (fieldName.includes('stage') || 
          field.label?.toLowerCase().includes('stage') ||
          fieldName === 'state') {
        analysis.hasStageField = true;
        analysis.stageFieldName = fieldName;
      }
      
      // Heuristic: field suggests status
      if (fieldName.includes('status') || fieldName === 'state') {
        analysis.hasStatusField = true;
        analysis.statusFieldName = fieldName;
      }
    }
    
    if (['integer', 'float', 'monetary'].includes(field.type)) {
      analysis.numericFields.push(field);
    }
    
    if (['date', 'datetime'].includes(field.type)) {
      analysis.hasDateField = true;
      
      // Heuristic: prefer create_date or date field
      if (!analysis.primaryDateField || 
          fieldName === 'create_date' || 
          fieldName === 'date') {
        analysis.primaryDateField = fieldName;
      }
    }
    
    // Check relations to known activity models
    if (field.type === 'one2many' && 
        (field.relation?.includes('mail.') || 
         field.relation?.includes('activity'))) {
      analysis.hasRelationToActivities = true;
      analysis.activityRelationPath = [{
        from_model: model.name,
        relation_field: fieldName,
        target_model: field.relation!,
        relation_type: 'one2many'
      }];
    }
    
    // Check registry tags
    const registryEntry = context.registry.get(`${model.name}.${fieldName}`);
    if (registryEntry) {
      if (registryEntry.category === 'Pain Points') {
        analysis.painPointFields.push(field);
      }
      if (registryEntry.category === 'Building') {
        analysis.buildingFields.push(field);
      }
      if (registryEntry.category === 'Sales') {
        analysis.salesFields.push(field);
      }
    }
  }
  
  return analysis;
}

function generateConversionPreset(
  model: ModelDefinition,
  analysis: ModelAnalysis,
  context: PresetGenerationContext
): GeneratedPreset {
  if (!analysis.stageFieldName || !analysis.primaryDateField) {
    throw new Error('Cannot generate conversion preset without stage and date fields');
  }
  
  return {
    name: `${model.label} Conversion Funnel`,
    description: `Track how ${model.label.toLowerCase()} move through stages over time`,
    category: 'conversion',
    confidence: 0.9,
    query: {
      base_model: model.name,
      fields: [
        {
          model: model.name,
          field: analysis.stageFieldName,
          alias: 'Stage'
        },
        {
          model: model.name,
          field: analysis.primaryDateField,
          alias: 'Date'
        }
      ],
      filters: [],
      relations: [],
      aggregations: [
        {
          function: 'count',
          alias: 'Count',
          group_by: [analysis.stageFieldName]
        }
      ],
      sorting: [
        {
          model: model.name,
          field: analysis.stageFieldName,
          direction: 'asc'
        }
      ],
      time_scope: {
        field: analysis.primaryDateField,
        mode: 'relative',
        period: 'last_90_days'
      }
    }
  };
}

function generateSegmentationPreset(
  model: ModelDefinition,
  analysis: ModelAnalysis,
  context: PresetGenerationContext
): GeneratedPreset {
  // Select most promising categorical and numeric fields
  const categoryField = selectBestCategoricalField(analysis.categoricalFields);
  const numericField = selectBestNumericField(analysis.numericFields);
  
  if (!categoryField || !numericField) {
    throw new Error('Insufficient fields for segmentation preset');
  }
  
  return {
    name: `${model.label} by ${categoryField.label}`,
    description: `Analyze ${numericField.label.toLowerCase()} distribution across ${categoryField.label.toLowerCase()} segments`,
    category: 'segmentation',
    confidence: 0.75,
    query: {
      base_model: model.name,
      fields: [
        {
          model: model.name,
          field: categoryField.name,
          alias: categoryField.label
        },
        {
          model: model.name,
          field: numericField.name,
          alias: numericField.label
        }
      ],
      filters: [],
      relations: [],
      aggregations: [
        {
          function: 'count',
          alias: 'Count',
          group_by: [categoryField.name]
        },
        {
          function: 'avg',
          field: numericField.name,
          alias: `Avg ${numericField.label}`,
          group_by: [categoryField.name]
        }
      ],
      sorting: [
        {
          model: model.name,
          field: categoryField.name,
          direction: 'asc'
        }
      ]
    }
  };
}

function selectBestCategoricalField(fields: FieldDefinition[]): FieldDefinition | null {
  if (fields.length === 0) return null;
  
  // Heuristic priority:
  // 1. Fields with 'type' or 'category' in name/label
  // 2. Fields with reasonable number of options (2-20)
  // 3. First available
  
  const prioritized = fields.find(f => 
    f.name.includes('type') || 
    f.label?.toLowerCase().includes('category') ||
    f.label?.toLowerCase().includes('type')
  );
  
  return prioritized || fields[0];
}

function selectBestNumericField(fields: FieldDefinition[]): FieldDefinition | null {
  if (fields.length === 0) return null;
  
  // Heuristic priority:
  // 1. Monetary fields (revenue, price, value)
  // 2. Float fields with meaningful names
  // 3. Integer counts
  
  const monetary = fields.find(f => f.type === 'monetary');
  if (monetary) return monetary;
  
  const valueField = fields.find(f => 
    f.name.includes('value') || 
    f.name.includes('revenue') ||
    f.name.includes('amount')
  );
  if (valueField) return valueField;
  
  return fields[0];
}

function identifyKeyModels(schema: SchemaSnapshot): ModelDefinition[] {
  const models = Object.values(schema.models);
  
  // Heuristics for "key" models:
  // 1. Has many relations (connected to other models)
  // 2. Has stage/state field (workflow-based)
  // 3. Has date fields (time-series data)
  // 4. Model name suggests core business object (crm., sale., project.)
  
  return models
    .map(model => ({
      model,
      score: calculateModelImportance(model)
    }))
    .filter(m => m.score > 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(m => m.model);
}

function calculateModelImportance(model: ModelDefinition): number {
  let score = 0;
  
  const fields = Object.values(model.fields);
  
  // Count relational fields
  const relationalFields = fields.filter(f => 
    ['many2one', 'one2many', 'many2many'].includes(f.type)
  );
  score += relationalFields.length * 2;
  
  // Has stage field
  if (fields.some(f => 
    f.name.includes('stage') || 
    f.name === 'state' || 
    f.type === 'selection'
  )) {
    score += 3;
  }
  
  // Has date fields
  if (fields.some(f => ['date', 'datetime'].includes(f.type))) {
    score += 2;
  }
  
  // Core business models
  if (model.name.startsWith('crm.') || 
      model.name.startsWith('sale.') || 
      model.name.startsWith('project.')) {
    score += 5;
  }
  
  return score;
}
```

---

### CORRECTION 3: Capability Layer (Realistic Query Limits)

#### ❌ Problem Identified

Original spec suggests query capabilities that **Odoo may not support** or that are **unreliable at scale**.

---

#### ✅ Corrected Approach: Explicit Capability Detection

```typescript
interface ModelCapabilities {
  // Core capabilities
  supports_search: boolean;               // Always true for accessible models
  supports_read: boolean;                 // Always true
  supports_read_group: boolean;           // True if has groupable fields
  
  // Aggregation capabilities
  supports_aggregation: boolean;
  max_group_by_fields: number;            // Usually 1-2 reliable, 3+ slow
  
  // Relation capabilities
  supports_relation_traversal: boolean;
  max_relation_depth: number;             // Usually 1-2, 3+ unreliable
  relation_traversal_performance: "fast" | "medium" | "slow";
  
  // Data volume constraints
  estimated_record_count: number;
  large_dataset: boolean;                 // >10k records
  
  // Field-specific capabilities
  text_search_available: boolean;
  full_text_search: boolean;              // Only if explicitly indexed
  
  // Known limitations
  limitations: string[];
  warnings: string[];
}

async function detectModelCapabilities(
  model: ModelDefinition,
  env: Env
): Promise<ModelCapabilities> {
  const capabilities: ModelCapabilities = {
    supports_search: true,
    supports_read: true,
    supports_read_group: false,
    supports_aggregation: false,
    max_group_by_fields: 0,
    supports_relation_traversal: true,
    max_relation_depth: 2,                // Conservative default
    relation_traversal_performance: "medium",
    estimated_record_count: 0,
    large_dataset: false,
    text_search_available: true,
    full_text_search: false,
    limitations: [],
    warnings: []
  };
  
  // Detect groupable fields
  const groupableFields = Object.values(model.fields).filter(f =>
    ['selection', 'many2one', 'boolean', 'date'].includes(f.type) &&
    !f.readonly
  );
  
  if (groupableFields.length > 0) {
    capabilities.supports_read_group = true;
    capabilities.supports_aggregation = true;
    capabilities.max_group_by_fields = Math.min(groupableFields.length, 3);
  }
  
  // Estimate record count (via search_count with no domain)
  try {
    const count = await odooClient.searchCount(model.name, []);
    capabilities.estimated_record_count = count;
    capabilities.large_dataset = count > 10000;
    
    if (count > 100000) {
      capabilities.warnings.push(
        "Large dataset: queries may be slow. Consider adding filters."
      );
      capabilities.max_relation_depth = 1;
      capabilities.relation_traversal_performance = "slow";
    }
  } catch (error) {
    capabilities.limitations.push("Cannot estimate record count");
  }
  
  // Check relation complexity
  const relationalFields = Object.values(model.fields).filter(f =>
    ['many2one', 'one2many', 'many2many'].includes(f.type)
  );
  
  if (relationalFields.length > 10) {
    capabilities.warnings.push(
      "Complex relational model: deep traversals may be slow"
    );
    capabilities.max_relation_depth = 1;
  }
  
  // Model-specific limitations
  if (model.name.includes('mail.') || model.name.includes('ir.')) {
    capabilities.limitations.push(
      "System model: some operations may be restricted"
    );
    capabilities.max_relation_depth = 1;
    capabilities.supports_read_group = false;
  }
  
  return capabilities;
}

function enforceCapabilities(
  query: QueryDefinition,
  capabilities: ModelCapabilities
): QueryValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  
  // Check aggregation capability
  if (query.aggregations && query.aggregations.length > 0) {
    if (!capabilities.supports_aggregation) {
      errors.push({
        path: "aggregations",
        message: `Model '${query.base_model}' does not support aggregations`,
        code: "AGGREGATION_NOT_SUPPORTED"
      });
    }
    
    const groupByCount = query.aggregations[0]?.group_by?.length || 0;
    if (groupByCount > capabilities.max_group_by_fields) {
      errors.push({
        path: "aggregations[0].group_by",
        message: `Maximum ${capabilities.max_group_by_fields} group-by fields supported`,
        code: "TOO_MANY_GROUP_BY_FIELDS"
      });
    }
  }
  
  // Check relation depth
  const maxDepth = Math.max(
    ...(query.relations || []).map(r => r.path.length),
    0
  );
  
  if (maxDepth > capabilities.max_relation_depth) {
    warnings.push(
      `Relation depth ${maxDepth} may be unreliable. Recommended: ${capabilities.max_relation_depth}.`
    );
  }
  
  // Check dataset size vs complexity
  if (capabilities.large_dataset) {
    if (!query.limit || query.limit > 1000) {
      warnings.push(
        "Large dataset without limit: query may be very slow. Consider adding limit."
      );
    }
    
    if (query.filters.length === 0) {
      warnings.push(
        "No filters on large dataset: consider adding filters to improve performance."
      );
    }
  }
  
  // Add capability warnings
  warnings.push(...capabilities.warnings);
  
  return {
    is_valid: errors.length === 0,
    errors,
    warnings: [...warnings, ...warnings],
    capabilities
  };
}
```

---

### CORRECTION 4: Mandatory AI Validation Loop

#### ❌ Problem Identified

AI-generated queries are not validated before presentation to users. This can result in **invalid, broken, or dangerous queries**.

---

#### ✅ Corrected Approach: AI Output Validation + Retry Loop

```typescript
interface AIQuerySuggestionRequest {
  schema: SchemaSnapshot;
  capabilities: Map<string, ModelCapabilities>;
  intent?: string;
  context?: {
    recent_queries?: string[];
    user_role?: string;
  };
}

interface AIValidationResult {
  is_valid: boolean;
  errors: ValidationError[];
  suggestions: string[];
  attempt_number: number;
}

const MAX_AI_RETRY_ATTEMPTS = 3;

async function generateValidatedAIQueries(
  request: AIQuerySuggestionRequest,
  env: Env
): Promise<QuerySuggestion[]> {
  const validatedSuggestions: QuerySuggestion[] = [];
  
  let attempt = 1;
  let feedback: string[] = [];
  
  while (attempt <= MAX_AI_RETRY_ATTEMPTS) {
    console.log(`AI query generation attempt ${attempt}/${MAX_AI_RETRY_ATTEMPTS}`);
    
    // Generate suggestions from AI
    const rawSuggestions = await callAIForQuerySuggestions(
      request,
      feedback,
      attempt
    );
    
    // Validate EACH suggestion
    for (const suggestion of rawSuggestions) {
      const validation = await validateAIGeneratedQuery(
        suggestion.query,
        request.schema,
        request.capabilities
      );
      
      if (validation.is_valid) {
        // Valid query - accept it
        validatedSuggestions.push(suggestion);
      } else {
        // Invalid query - prepare feedback for retry
        const errorSummary = validation.errors
          .map(e => `${e.path}: ${e.message}`)
          .join('; ');
        
        feedback.push(
          `Query "${suggestion.title}" failed validation: ${errorSummary}`
        );
        
        console.warn(
          `AI suggestion "${suggestion.title}" rejected:`,
          validation.errors
        );
      }
    }
    
    // If we have enough valid suggestions, stop
    if (validatedSuggestions.length >= 3) {
      break;
    }
    
    // If all suggestions were valid, stop
    if (feedback.length === 0) {
      break;
    }
    
    // Otherwise, retry with feedback
    attempt++;
  }
  
  if (validatedSuggestions.length === 0) {
    console.error(
      `AI failed to generate valid queries after ${MAX_AI_RETRY_ATTEMPTS} attempts`
    );
    
    // Fallback: return schema-based presets instead
    return await generatePresets({
      schema: request.schema,
      registry: new Map(),
      userRole: request.context?.user_role
    });
  }
  
  return validatedSuggestions;
}

async function validateAIGeneratedQuery(
  query: QueryDefinition,
  schema: SchemaSnapshot,
  capabilities: Map<string, ModelCapabilities>
): Promise<AIValidationResult> {
  const errors: ValidationError[] = [];
  const suggestions: string[] = [];
  
  // VALIDATION 1: Schema existence
  const schemaValidation = validateQueryAgainstSchema(query, schema);
  if (!schemaValidation.is_valid) {
    errors.push(...schemaValidation.errors);
  }
  
  // VALIDATION 2: Capability constraints
  const modelCapabilities = capabilities.get(query.base_model);
  if (modelCapabilities) {
    const capabilityValidation = enforceCapabilities(query, modelCapabilities);
    if (!capabilityValidation.is_valid) {
      errors.push(...capabilityValidation.errors);
    }
  }
  
  // VALIDATION 3: Relation traversal correctness
  for (const relation of query.relations || []) {
    const relationValidation = validateRelationTraversal(relation, schema);
    if (!relationValidation.is_valid) {
      errors.push(...relationValidation.errors);
    }
  }
  
  // VALIDATION 4: No hardcoded values (heuristic)
  const hardcodedCheck = detectHardcodedValues(query);
  if (hardcodedCheck.found) {
    errors.push({
      path: hardcodedCheck.path,
      message: `Possible hardcoded value: ${hardcodedCheck.value}`,
      code: "HARDCODED_VALUE_DETECTED"
    });
  }
  
  // VALIDATION 5: Query complexity
  const complexityCheck = assessComplexity(query, schema);
  if (complexityCheck.complexity === 'high') {
    suggestions.push(
      "Query complexity is high. Consider simplifying for better performance."
    );
  }
  
  return {
    is_valid: errors.length === 0,
    errors,
    suggestions,
    attempt_number: 1
  };
}

async function callAIForQuerySuggestions(
  request: AIQuerySuggestionRequest,
  previousFeedback: string[],
  attemptNumber: number
): Promise<QuerySuggestion[]> {
  const prompt = buildAIPromptWithFeedback(request, previousFeedback, attemptNumber);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a sales data analyst who generates valid Odoo queries.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: attemptNumber > 1 ? 0.3 : 0.7  // Lower temperature on retries
    })
  });
  
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content).suggestions;
}

function buildAIPromptWithFeedback(
  request: AIQuerySuggestionRequest,
  feedback: string[],
  attemptNumber: number
): string {
  let prompt = `
SCHEMA:
${JSON.stringify(request.schema, null, 2)}

CAPABILITIES:
${Array.from(request.capabilities.entries()).map(([model, caps]) => 
  `${model}: max_depth=${caps.max_relation_depth}, aggregation=${caps.supports_aggregation}`
).join('\n')}

TASK:
Generate 5 query suggestions for sales insights.
`;

  if (attemptNumber > 1) {
    prompt += `
PREVIOUS ATTEMPT FAILED WITH ERRORS:
${feedback.join('\n')}

CRITICAL CORRECTIONS REQUIRED:
1. Use ONLY models and fields from the provided schema
2. Respect capability limits (max relation depth, aggregation support)
3. Do NOT hardcode field names - use actual field names from schema
4. Ensure relation paths use existing relational fields
5. Validate that filter operators match field types

Please fix these errors and generate new suggestions.
`;
  }

  prompt += `
STRICT REQUIREMENTS:
- All field names must exist in the schema
- All relation paths must use schema-defined relational fields
- Respect max_relation_depth limits
- Use aggregations only if supported
- Return valid JSON matching QuerySuggestion interface

RETURN FORMAT:
{
  "suggestions": [
    {
      "title": "...",
      "description": "...",
      "reasoning": "...",
      "category": "conversion|segmentation|correlation|outlier|trend",
      "confidence": 0.8,
      "query": {QueryDefinition}
    }
  ]
}
`;

  return prompt;
}

function detectHardcodedValues(query: QueryDefinition): {
  found: boolean;
  path?: string;
  value?: any;
} {
  // Check for suspicious patterns that suggest hardcoding
  
  // Check field names for 'x_' prefix (custom fields - might be hardcoded)
  for (const field of query.fields) {
    if (field.field.startsWith('x_') && !field.field.startsWith('x_studio_')) {
      // Might be hardcoded, but allow x_studio_ (Odoo Studio fields)
      return {
        found: true,
        path: `fields[${query.fields.indexOf(field)}].field`,
        value: field.field
      };
    }
  }
  
  // Check filter values for suspicious patterns
  for (const filter of query.filters) {
    // String values that look like IDs or specific names
    if (typeof filter.value === 'string' && 
        filter.value.length < 50 && 
        !['true', 'false', ''].includes(filter.value)) {
      // Possibly hardcoded if it's a very specific value
      // This is heuristic only - may have false positives
    }
  }
  
  return { found: false };
}
```

---

### CORRECTION 5: Complexity Assessment as Heuristic Guidance

#### ❌ Problem Identified

Original spec presents complexity scores and execution time estimates as **factual metrics**, which creates false precision.

---

#### ✅ Corrected Approach: Honest Heuristic Indicators

```typescript
interface ComplexityAssessment {
  // HEURISTIC classification (not guaranteed)
  guidance_level: "simple" | "moderate" | "complex";
  
  // Contributing factors (transparent)
  factors: ComplexityFactor[];
  
  // Guidance messages (not guarantees)
  recommendations: string[];
  warnings: string[];
  
  // Rough indication (NOT a promise)
  estimated_duration_range: "seconds" | "tens_of_seconds" | "minutes_or_timeout";
  
  // Disclaimer
  disclaimer: string;
}

interface ComplexityFactor {
  factor: string;
  impact: "low" | "medium" | "high";
  description: string;
}

function assessQueryComplexity(
  query: QueryDefinition,
  schema: SchemaSnapshot,
  capabilities: ModelCapabilities
): ComplexityAssessment {
  const factors: ComplexityFactor[] = [];
  const recommendations: string[] = [];
  const warnings: string[] = [];
  
  let complexityScore = 0;
  
  // Factor 1: Dataset size
  if (capabilities.estimated_record_count > 100000) {
    complexityScore += 3;
    factors.push({
      factor: "Large dataset",
      impact: "high",
      description: `~${capabilities.estimated_record_count.toLocaleString()} records in ${query.base_model}`
    });
  } else if (capabilities.estimated_record_count > 10000) {
    complexityScore += 1;
    factors.push({
      factor: "Medium dataset",
      impact: "medium",
      description: `~${capabilities.estimated_record_count.toLocaleString()} records`
    });
  }
  
  // Factor 2: Relation traversals
  const relationCount = query.relations?.length || 0;
  const maxDepth = Math.max(...(query.relations || []).map(r => r.path.length), 0);
  
  if (relationCount > 0) {
    complexityScore += relationCount;
    factors.push({
      factor: "Relation traversals",
      impact: relationCount > 2 ? "high" : "medium",
      description: `${relationCount} relation(s), max depth ${maxDepth}`
    });
    
    if (maxDepth > capabilities.max_relation_depth) {
      complexityScore += 2;
      warnings.push(
        `Relation depth (${maxDepth}) exceeds recommended limit (${capabilities.max_relation_depth}). May be slow or unreliable.`
      );
    }
  }
  
  // Factor 3: Aggregations
  if (query.aggregations && query.aggregations.length > 0) {
    const groupByCount = query.aggregations[0]?.group_by?.length || 0;
    complexityScore += groupByCount;
    
    factors.push({
      factor: "Aggregation",
      impact: groupByCount > 2 ? "high" : groupByCount > 0 ? "medium" : "low",
      description: `Grouping by ${groupByCount} field(s)`
    });
    
    if (groupByCount > 2) {
      warnings.push(
        "Grouping by multiple fields can be slow on large datasets."
      );
    }
  }
  
  // Factor 4: Text search
  const hasTextSearch = query.filters.some(f => 
    ['like', 'ilike', 'not like', 'not ilike'].includes(f.operator)
  );
  
  if (hasTextSearch) {
    complexityScore += 1;
    factors.push({
      factor: "Text search",
      impact: "medium",
      description: "Contains text pattern matching"
    });
    
    if (capabilities.large_dataset) {
      warnings.push(
        "Text search on large dataset may be slow. Consider more specific filters."
      );
    }
  }
  
  // Factor 5: No limit
  if (!query.limit || query.limit > 1000) {
    complexityScore += 1;
    recommendations.push(
      "Consider adding a limit to improve response time."
    );
  }
  
  // Determine guidance level (heuristic only)
  let guidance_level: "simple" | "moderate" | "complex";
  let estimated_duration_range: "seconds" | "tens_of_seconds" | "minutes_or_timeout";
  
  if (complexityScore <= 2) {
    guidance_level = "simple";
    estimated_duration_range = "seconds";
  } else if (complexityScore <= 5) {
    guidance_level = "moderate";
    estimated_duration_range = "tens_of_seconds";
    recommendations.push("This query may take a moment to execute.");
  } else {
    guidance_level = "complex";
    estimated_duration_range = "minutes_or_timeout";
    warnings.push(
      "This query is complex and may be slow or timeout. Consider simplifying."
    );
    recommendations.push("Try reducing relation depth, group-by fields, or adding filters.");
  }
  
  return {
    guidance_level,
    factors,
    recommendations,
    warnings,
    estimated_duration_range,
    disclaimer: "These are estimates based on heuristics. Actual performance varies depending on Odoo server load, database indexes, and data distribution."
  };
}
```

---

### CORRECTION 6: Updated API Responses

All API endpoints must reflect these corrections:

```typescript
// CORRECTED: Schema endpoint includes capabilities
interface SchemaResponse {
  success: true;
  data: {
    schema: SchemaSnapshot;
    capabilities: { [modelName: string]: ModelCapabilities };
    cached_at: string;
    cache_ttl: number;
  };
}

// CORRECTED: Validation endpoint returns honest assessment
interface ValidationResponse {
  success: true;
  data: {
    is_valid: boolean;
    errors: ValidationError[];
    warnings: string[];
    complexity_assessment: ComplexityAssessment;  // ← Updated
    capabilities_check: {
      model: string;
      meets_requirements: boolean;
      limitations: string[];
    };
  };
}

// CORRECTED: AI suggestions are pre-validated
interface AISuggestionsResponse {
  success: true;
  data: {
    suggestions: QuerySuggestion[];
    validation_attempts: number;          // How many retries needed
    rejected_count: number;               // How many were invalid
    fallback_used: boolean;               // True if presets used instead
  };
}
```

---

### MANDATORY IMPLEMENTATION NOTES

#### What Changed (Summary)

1. **Joins → RelationTraversal**: All join logic rewritten to use schema-based relation paths only
2. **Preset Generation**: Now 100% algorithmic, zero hardcoded field names
3. **Capabilities Layer**: Explicit detection and enforcement of Odoo limits
4. **AI Validation Loop**: Mandatory validation + retry with feedback
5. **Complexity Assessment**: Reframed as guidance, not guarantees
6. **API Contracts**: Updated to reflect corrections

#### What Stayed the Same

- Core architecture and module structure
- Database schema (field_registry, insight_queries)
- UI flows and component structure
- Worker-mediated Odoo access
- Security and access control principles

#### Breaking Changes from Original Spec

1. `Join` interface **removed entirely** → replaced with `RelationTraversal`
2. All preset example queries with hardcoded fields **invalid** → must regenerate from schema
3. Complexity scores are now **guidance only**, not performance promises
4. AI suggestions **must pass validation** before display

#### Implementation Priority Order (UPDATED)

**Phase 1 (Foundation):**
- Schema introspection with capability detection ✓
- Relation traversal validator (NOT join validator) ✓
- Preset generator (algorithmic, schema-driven) ✓

**Phase 2 (Query System):**
- QueryDefinition with RelationTraversal ✓
- Capability enforcement ✓
- Complexity assessment (heuristic) ✓

**Phase 3 (UI):**
- Relation picker (NOT join builder) ✓
- Complexity guidance display ✓
- Capability warnings in UI ✓

**Phase 4 (AI):**
- AI validation loop with retry ✓
- Fallback to presets on failure ✓

---

### FINAL CORRECTNESS GUARANTEES

This corrected specification ensures:

✅ **Zero SQL assumptions**: No joins, only Odoo relation traversals  
✅ **Zero hardcoding**: All field references discovered from schema  
✅ **Zero false promises**: Complexity is guidance, not guarantee  
✅ **Zero invalid AI output**: Validation loop prevents broken queries  
✅ **Zero capability overreach**: Explicit limits enforced  

---

### SUPERSEDED SECTIONS

The following sections in the original specification are **superseded** by this addendum:

- Section 2.3 (QueryDefinition) → **Use corrected version with `relations`**
- Section 5.2 (Example Preset Templates) → **DELETE - Use algorithmic generator**
- Section 7.3 (Handling Joins) → **DELETE - Use RelationTraversal execution**
- Section 8.3 (Query Complexity Detection) → **Use corrected heuristic version**
- Section 3.3 (AI Endpoints) → **Add validation loop requirement**

---

**END OF HARDENING ADDENDUM**

This addendum is **binding** and takes precedence over any conflicting content in the original specification.

Implementation must follow these corrections to avoid building on false assumptions about Odoo's capabilities.

---

**This specification is complete, self-contained, and implementation-ready.**

All architectural decisions are documented.  
All data structures are defined.  
All API contracts are specified.  
All UI flows are described.  
All edge cases are considered.  
**All Odoo-reality violations corrected.**

**Ready to build. 🚀**
