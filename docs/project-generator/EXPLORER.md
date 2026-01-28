# Project Generator - System Explorer

## Overview

This document provides a modular, navigable overview of the Project Generator system. It maps entities, relationships, data flows, and system boundaries to enable developers to quickly understand and navigate the codebase.

---

## System Context

### External Systems

```
┌─────────────────────────────────────────────────────────┐
│                    Project Generator                    │
│                    (This System)                        │
└─────────────────────────────────────────────────────────┘
         ↓ reads/writes              ↓ pushes data
         ↓                           ↓
┌──────────────────┐        ┌──────────────────┐
│    Supabase      │        │   Odoo (via API) │
│   (PostgreSQL)   │        │  System of Record│
└──────────────────┘        └──────────────────┘
         ↑                           ↑
         └─ Templates                └─ Projects, Tasks,
            Audit Logs                  Milestones, Stages
```

**Supabase:** Stores template definitions, audit logs  
**Odoo:** Runtime environment for actual projects  
**No Sync:** Changes in Odoo don't flow back to this system

---

## Entity Model

### Core Entities

#### 1. Blueprint (Runtime Only)
**Location:** Browser memory (JavaScript object)  
**Lifetime:** Session-scoped  
**Persistence:** None until saved as Template  

**Structure:**
```typescript
{
  kanban: {
    stages: [
      {
        id: string,           // UUID
        name: string,
        type: string,         // 'backlog' | 'in_progress' | etc.
        sequence: number,
        color: string,        // Hex
        fold: boolean
      }
    ]
  },
  milestones: [
    {
      id: string,             // UUID
      name: string,
      description: string,
      sequence: number
    }
  ],
  tasks: [
    {
      id: string,             // UUID
      name: string,
      description: string,
      milestone_id: string,   // → milestones[].id
      default_stage_id: string, // → stages[].id
      sequence: number,
      tag_ids: string[],      // Tag names
      subtasks: [
        {
          id: string,
          name: string,
          description: string,
          sequence: number
        }
      ],
      prerequisite_ids: string[]  // → tasks[].id
    }
  ],
  metadata: {
    created_at: string,
    schema_version: string
  }
}
```

**Relationships:**
- `task.milestone_id` → `milestone.id` (many-to-one)
- `task.default_stage_id` → `stage.id` (many-to-one)
- `task.prerequisite_ids[]` → `task.id` (many-to-many, DAG)
- `subtask` → `task` (nested, one-to-many)

---

#### 2. Template (Persistent)
**Location:** Supabase `project_templates` table  
**Lifetime:** Persistent until deleted  

**Schema:**
```sql
id                UUID PRIMARY KEY
name              VARCHAR(255) NOT NULL
description       TEXT
version           VARCHAR(20)  -- "1.2.3"
status            VARCHAR(20)  -- 'draft' | 'published' | 'archived'
locked            BOOLEAN
blueprint_data    JSONB        -- Contains Blueprint structure
tags              TEXT[]
created_by        UUID         → auth.users
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
usage_count       INTEGER
last_used_at      TIMESTAMPTZ
```

**Relationships:**
- `created_by` → `auth.users.id` (many-to-one)
- `blueprint_data` contains embedded Blueprint (composition)

**Lifecycle:**
1. Created as `draft`
2. Published → `published`, optionally `locked`
3. Archived → `archived` (soft delete)

---

#### 3. Generation (Audit Log)
**Location:** Supabase `project_generations` table  
**Lifetime:** Permanent (immutable)  

**Schema:**
```sql
id                 UUID PRIMARY KEY
template_id        UUID  → project_templates
template_version   VARCHAR(20)
odoo_project_id    INTEGER       -- Odoo's project ID
odoo_project_name  VARCHAR(255)
odoo_company_id    INTEGER
status             VARCHAR(20)   -- 'started' | 'success' | 'failed' | 'partial'
started_at         TIMESTAMPTZ
completed_at       TIMESTAMPTZ
duration_ms        INTEGER
api_calls_made     INTEGER
error_message      TEXT
error_details      JSONB
created_records    JSONB         -- {stages: [...], milestones: [...], tasks: [...]}
generated_by       UUID  → auth.users
```

**Relationships:**
- `template_id` → `project_templates.id` (many-to-one)
- `generated_by` → `auth.users.id` (many-to-one)
- `odoo_project_id` → External Odoo `project.project.id` (reference only, no FK)

**Purpose:**
- Audit trail
- Debugging failed generations
- Usage analytics

---

#### 4. Odoo Entities (External, Not Owned)

These are created in Odoo, not stored in this system:

**project.project**
- `id`: Odoo-generated
- `name`: From user input
- `company_id`: From user selection
- Created via `executeKw(..., 'create', ...)`

**project.task.type** (Kanban Stages)
- `id`: Odoo-generated
- `name`: From blueprint stage
- `project_ids`: Many2many link to project
- `sequence`, `fold`

**project.milestone**
- `id`: Odoo-generated
- `name`, `description`: From blueprint
- `project_id`: Link to project
- `sequence`, `is_reached`

**project.task**
- `id`: Odoo-generated
- `name`, `description`: From blueprint
- `project_id`, `milestone_id`, `stage_id`
- `parent_id`: For subtasks
- `depend_on_ids`: Task dependencies
- `tag_ids`: Many2many to project.tags

**project.tags**
- `id`: Odoo-generated
- `name`: From blueprint tag strings
- Created if not exists, reused if exists

---

## Data Flow

### Flow 1: Template Creation

```
User → Blueprint Editor → Blueprint (memory)
                          ↓
                       Validation Engine
                          ↓
                       Template Repository
                          ↓
                       Supabase (project_templates)
```

**Steps:**
1. User creates/edits Blueprint in browser
2. Validation engine checks structure (errors/warnings)
3. User saves → Template Repository creates DB record
4. Blueprint serialized to JSON, stored in `blueprint_data`

**Modules Involved:**
- `lib/blueprint-manager.js`: Blueprint manipulation
- `lib/validation-engine.js`: Validation logic
- `lib/template-repository.js`: DB persistence

---

### Flow 2: Project Generation

```
User → Select Template
         ↓
     Template Repository (load from Supabase)
         ↓
     User provides: project name, company
         ↓
     Odoo Orchestrator
         ↓
     ┌─────────────────────────┐
     │ 1. Create Project       │ → Odoo API (project.project.create)
     │ 2. Create Stages        │ → Odoo API (project.task.type.create) × N
     │ 3. Create Milestones    │ → Odoo API (project.milestone.create) × N
     │ 4. Prepare Tags         │ → Odoo API (project.tags search/create)
     │ 5. Create Tasks (Pass 1)│ → Odoo API (project.task.create) × N
     │ 6. Set Dependencies (2) │ → Odoo API (project.task.write) × N
     └─────────────────────────┘
         ↓
     Audit Logger (project_generations record)
         ↓
     Success/Failure response to user
```

**Error Handling:**
- If any step fails → Attempt rollback (delete project)
- Log failure details in `project_generations`
- Return user-friendly error message

**Modules Involved:**
- `lib/template-repository.js`: Load template
- `lib/odoo-orchestrator.js`: Coordinate API calls
- `lib/odoo.js`: Execute API calls
- `lib/audit-logger.js`: Log generation event

---

### Flow 3: Template Versioning

```
User → Edit Template (unlocked)
         ↓
     Blueprint Editor (load existing blueprint_data)
         ↓
     User makes changes
         ↓
     User clicks "Publish as New Version"
         ↓
     Template Repository
         ↓
     Version bump logic (major.minor.patch)
         ↓
     Update template record:
       - version: "2.1.0"
       - blueprint_data: updated
       - updated_at: NOW()
       - previous published → historical
```

**Version Bump Rules:**
- Major (X.0.0): Breaking changes (e.g., remove milestone)
- Minor (x.Y.0): New features (e.g., add milestone)
- Patch (x.y.Z): Small fixes (e.g., fix typo)

**Modules Involved:**
- `lib/template-repository.js`: Version management

---

## Module Breakdown

### Frontend Modules

#### `ui.js`
**Purpose:** Generate HTML for main screens  
**Exports:** `renderTemplateLibrary()`, `renderBlueprintEditor()`, `renderGenerateFlow()`  
**Dependencies:** None (pure HTML generation)  
**Data:** Receives data from route handlers, returns HTML string

---

#### `routes.js`
**Purpose:** HTTP request handlers  
**Exports:** Array of route definitions  
**Pattern:**
```javascript
{
  path: '/projects/api/templates',
  method: 'POST',
  handler: async (request, env, ctx) => {
    // 1. Parse request body
    // 2. Call service layer (lib/template-repository.js)
    // 3. Return JSON response
  },
  auth: true
}
```

**Routes:**
- `GET /projects` → Render template library
- `GET /projects/new` → Render blueprint editor
- `POST /projects/api/templates` → Create template
- `GET /projects/api/templates/:id` → Get template
- `PUT /projects/api/templates/:id` → Update template
- `POST /projects/api/templates/:id/publish` → Publish version
- `POST /projects/api/validate` → Validate blueprint
- `POST /projects/api/generate` → Generate project
- `GET /projects/api/generations` → List generations

**Dependencies:** All `lib/*` modules

---

### Service Layer Modules

#### `lib/blueprint-manager.js`
**Purpose:** Blueprint manipulation and client-side operations  
**Pure Logic:** No I/O, no side effects  

**Functions:**
```javascript
createBlueprint()
  → Returns empty blueprint structure with defaults

addStage(blueprint, stageData)
  → Adds stage to blueprint.kanban.stages, assigns UUID, sequence

removeStage(blueprint, stageId)
  → Removes stage, updates task references

addMilestone(blueprint, milestoneData)
  → Adds milestone, assigns UUID, sequence

addTask(blueprint, milestoneId, taskData)
  → Adds task to blueprint.tasks, links to milestone

setTaskDependency(blueprint, taskId, prerequisiteId)
  → Adds prerequisiteId to task.prerequisite_ids

validateBlueprint(blueprint)
  → Delegates to validation-engine.js
```

**No Database Access**  
**Used By:** Blueprint editor UI, validation flows

---

#### `lib/template-repository.js`
**Purpose:** Template CRUD operations with Supabase  

**Functions:**
```javascript
async createTemplate(userId, {name, description, blueprintData, tags})
  → INSERT into project_templates
  → Returns {templateId, version, status}

async getTemplate(templateId)
  → SELECT from project_templates WHERE id = templateId
  → Returns template object with blueprint_data

async listTemplates({status, createdBy, tags, limit, offset})
  → SELECT with filters, pagination
  → Returns {templates: [...], total, limit, offset}

async updateTemplate(templateId, updates)
  → UPDATE project_templates SET ...
  → Checks: unlocked, owned by user
  → Returns updated template

async publishTemplate(templateId, versionBump)
  → Calculate new version (semantic bump)
  → UPDATE version, status='published'
  → Optionally lock
  → Returns new version

async cloneTemplate(templateId, newName)
  → SELECT blueprint_data
  → INSERT as new template with new UUID
  → Returns new templateId

async incrementUsage(templateId)
  → UPDATE usage_count + 1, last_used_at = NOW()
```

**Database:** Supabase client  
**Authorization:** Checks user permissions, RLS enforced by Supabase  
**Used By:** All route handlers involving templates

---

#### `lib/odoo-orchestrator.js`
**Purpose:** Coordinate multi-step Odoo project creation  

**Main Function:**
```javascript
async function generateProject(env, {templateId, projectName, companyId, description}) {
  // 1. Load template
  const template = await getTemplate(templateId);
  const blueprint = template.blueprint_data;
  
  // 2. Start generation audit log
  const generationId = await startGeneration({templateId, projectName, userId});
  
  try {
    // 3. Create project
    const projectId = await createOdooProject(env, {name, companyId, description});
    
    // 4. Create stages
    const stageMap = await createStages(env, projectId, blueprint.kanban.stages);
    
    // 5. Create milestones
    const milestoneMap = await createMilestones(env, projectId, blueprint.milestones);
    
    // 6. Prepare tags
    const tagMap = await prepareTags(env, blueprint.tasks);
    
    // 7. Create tasks (no dependencies)
    const taskMap = await createTasks(env, projectId, blueprint.tasks, {
      stageMap, milestoneMap, tagMap
    });
    
    // 8. Set task dependencies
    await setTaskDependencies(env, blueprint.tasks, taskMap);
    
    // 9. Complete audit log
    await completeGeneration(generationId, {
      status: 'success',
      projectId,
      createdRecords: {stageMap, milestoneMap, taskMap}
    });
    
    return {success: true, projectId, odooUrl: `...`};
    
  } catch (error) {
    // Rollback attempt
    await rollbackProject(env, projectId);
    
    // Log failure
    await completeGeneration(generationId, {
      status: 'failed',
      error: error.message
    });
    
    throw error;
  }
}
```

**Dependencies:**
- `lib/odoo.js`: API calls
- `lib/template-repository.js`: Load template
- `lib/audit-logger.js`: Logging

**Complex Logic:**
- Two-pass task creation (tasks first, dependencies second)
- ID mapping (blueprint UUIDs → Odoo IDs)
- Error recovery and rollback

---

#### `lib/validation-engine.js`
**Purpose:** Validate blueprint structure and semantics  

**Functions:**
```javascript
validateBlueprint(blueprint)
  → Returns {errors: [...], warnings: [...], analysis: {...}}

validateKanban(kanban)
  → Check: stages exist, no duplicate names, valid types
  → Errors: empty stages, duplicates
  → Warnings: >15 stages, no 'done' stage

validateMilestones(milestones)
  → Check: names exist
  → Warnings: >50 milestones, unbalanced task distribution

validateTasks(tasks)
  → Check: milestone references valid, stage references valid
  → Errors: orphan tasks, invalid references

validateDependencies(tasks)
  → Build dependency graph
  → Detect cycles (DFS)
  → Errors: circular dependencies
  → Warnings: >5 dependencies per task, isolated tasks
```

**Algorithm Details:**
- **Cycle Detection:** DFS with color marking (white/gray/black)
- **Topological Sort:** Kahn's algorithm for execution order
- **Critical Path:** Longest path in DAG

**No Database Access**  
**Used By:** Blueprint editor, pre-save validation, pre-generation validation

---

#### `lib/dependency-analyzer.js`
**Purpose:** Dependency graph operations  

**Functions:**
```javascript
buildDependencyGraph(tasks)
  → Returns graph: {nodes: [{id, task}], edges: [{from, to}]}

detectCycles(graph)
  → Returns cycle paths or null
  → DFS-based cycle detection

findCriticalPath(graph)
  → Returns array of task IDs representing longest path
  → Topological sort + longest path calculation

findBottlenecks(graph)
  → Returns tasks with highest out-degree (block most tasks)

getVisualizationData(graph)
  → Returns data formatted for Cytoscape.js or D3.js
  → {nodes: [{data: {id, label}}], edges: [{data: {source, target}}]}
```

**Used By:** Validation engine, UI for graph rendering

---

#### `lib/audit-logger.js`
**Purpose:** Generation event logging  

**Functions:**
```javascript
async startGeneration({templateId, templateVersion, projectName, userId})
  → INSERT into project_generations with status='started'
  → Returns generationId

async updateGeneration(generationId, {phase, apiCallCount})
  → UPDATE progress (for real-time tracking)

async completeGeneration(generationId, {status, projectId, records, duration, error})
  → UPDATE status, completed_at, created_records, error_details
  → status: 'success' | 'failed' | 'partial'

async getGenerationHistory({userId, templateId, status, limit})
  → SELECT from project_generations with filters
  → Returns array of generation records
```

**Database:** Supabase `project_generations` table  
**Used By:** Odoo orchestrator, route handlers

---

#### `lib/odoo.js` (Existing, Reused)
**Purpose:** Low-level Odoo API calls  

**Functions:**
```javascript
executeKw(env, {model, method, args, kwargs})
  → POST to Odoo /jsonrpc
  → Returns result or throws error

searchRead(env, {model, domain, fields, limit, offset})
  → Convenience wrapper: search + read
  → Returns array of records
```

**Used By:** Odoo orchestrator for all Odoo interactions  
**No Module-Specific Changes:** Reuse existing infrastructure

---

### Configuration Modules

#### `config/kanban-types.js`
**Purpose:** Define semantic stage types  

```javascript
export const STAGE_TYPES = [
  {
    id: 'backlog',
    label: 'Backlog',
    description: 'Work not yet started',
    suggestedColors: ['#6B7280', '#9CA3AF'],
    icon: '📋'
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    description: 'Active work',
    suggestedColors: ['#3B82F6', '#2563EB'],
    icon: '🏗️'
  },
  // ... more types
];
```

**Used By:** Blueprint editor for stage type dropdown

---

#### `config/validation-rules.js`
**Purpose:** Configurable validation thresholds  

```javascript
export const VALIDATION_CONFIG = {
  maxStages: 20,
  warnStageThreshold: 15,
  maxMilestones: 50,
  warnMilestoneThreshold: 30,
  maxTaskDependencies: 10,
  warnTaskDependencyThreshold: 5,
  allowMultipleDoneStages: true
};
```

**Used By:** Validation engine

---

## Navigation Paths

### User Journey → Code Path

#### "Create New Template"
1. **User:** Clicks "+ New Template"
2. **Route:** `GET /projects/new`
3. **Handler:** `routes.js` → `renderBlueprintEditor()`
4. **UI:** `ui.js` generates editor HTML
5. **Client JS:** User interacts with blueprint editor (browser JS, not shown)
6. **User:** Clicks "Save"
7. **Route:** `POST /projects/api/templates`
8. **Handler:** `routes.js` → parses body
9. **Service:** `template-repository.js` → `createTemplate()`
10. **DB:** INSERT into `project_templates`
11. **Response:** `{success: true, templateId: '...'}`

---

#### "Generate Project from Template"
1. **User:** Clicks "Generate" on template card
2. **Route:** `GET /projects/generate?templateId=...`
3. **Handler:** Renders generation form with template pre-selected
4. **User:** Fills project name, company
5. **User:** Clicks "Generate Project"
6. **Route:** `POST /projects/api/generate`
7. **Handler:** `routes.js` → parses {templateId, projectName, companyId}
8. **Service:** `odoo-orchestrator.js` → `generateProject()`
9. **Orchestrator:**
   - Loads template (`template-repository.js`)
   - Calls Odoo APIs sequentially (`lib/odoo.js`)
   - Logs to audit (`audit-logger.js`)
10. **Response:** `{success: true, projectId: 123, odooUrl: '...'}`
11. **UI:** Success screen with link to Odoo

---

#### "Validate Blueprint"
1. **User:** Editing blueprint in editor
2. **User:** Clicks "Validate" (or auto-validates on blur)
3. **Route:** `POST /projects/api/validate`
4. **Handler:** `routes.js` → parses blueprint JSON
5. **Service:** `validation-engine.js` → `validateBlueprint()`
6. **Validation Engine:**
   - Validates kanban, milestones, tasks
   - Calls `dependency-analyzer.js` → `detectCycles()`
   - Returns {errors, warnings, analysis}
7. **Response:** Validation results JSON
8. **UI:** Displays errors/warnings inline in editor

---

## System Boundaries

### What This System Does
- ✅ Template design and storage
- ✅ Blueprint validation
- ✅ One-time project generation to Odoo
- ✅ Audit logging of generations
- ✅ Template versioning and lifecycle management

### What This System Does NOT Do
- ❌ Bidirectional sync with Odoo
- ❌ Live editing of Odoo projects
- ❌ Odoo data import/export (beyond project creation)
- ❌ User management (delegates to platform auth)
- ❌ Scheduling or time-based features
- ❌ Resource allocation
- ❌ Custom Odoo field management

### Integration Points

**With Platform:**
- Uses platform navigation (`src/modules/registry.js`)
- Uses platform auth (`auth: true` in routes)
- Uses platform Supabase client
- Uses platform Odoo client (`lib/odoo.js`)

**With Odoo:**
- Read: `project.tags` (search existing)
- Write: `project.project`, `project.task.type`, `project.milestone`, `project.task`, `project.tags`
- No read-back after creation

**With Supabase:**
- Read/Write: `project_templates`, `project_generations`
- Uses RLS for authorization

---

## Dependency Map

```
routes.js
├── ui.js (HTML generation)
├── lib/template-repository.js
│   └── Supabase client
├── lib/odoo-orchestrator.js
│   ├── lib/template-repository.js
│   ├── lib/odoo.js
│   │   └── Odoo API (external)
│   └── lib/audit-logger.js
│       └── Supabase client
├── lib/validation-engine.js
│   ├── lib/dependency-analyzer.js
│   └── config/validation-rules.js
└── config/kanban-types.js

lib/blueprint-manager.js
├── lib/validation-engine.js
└── (no external dependencies, pure logic)
```

**No Circular Dependencies**  
**Clean Separation:** UI → Routes → Services → Data

---

## State Management

### Client-Side (Browser)
- Blueprint: In-memory JavaScript object
- User inputs: Form state
- Validation results: Cached until blueprint changes

### Server-Side (Cloudflare Worker)
- Stateless request handlers
- No session state stored server-side
- User context from auth token

### Database (Supabase)
- Templates: Persistent state
- Generations: Append-only audit log

### Odoo
- Projects: Independent state after creation
- No coupling back to this system

---

## Extensibility Points

### Add New Validation Rule
1. Edit `config/validation-rules.js`: Add threshold
2. Edit `lib/validation-engine.js`: Implement rule logic
3. Add test case
4. Deploy

### Add New Stage Type
1. Edit `config/kanban-types.js`: Add type definition
2. UI automatically reflects new option
3. No code changes required

### Add Template Export Format
1. Create `lib/export/export-xml.js` (example)
2. Implement `exportTemplateAsXML(template)` function
3. Add route: `GET /projects/api/templates/:id/export/xml`
4. Wire up in UI: "Export as XML" button

### Add Custom Blueprint Field
1. Update Blueprint schema (add field to structure)
2. Update `lib/blueprint-manager.js`: Add setter/getter
3. Update `lib/validation-engine.js`: Validate new field
4. Update Odoo orchestrator if field maps to Odoo
5. Increment `schema_version`
6. Add migration function

---

## Error Flow

### Validation Error Flow
```
User input → Blueprint change
  → Validation engine (client-side or API)
  → Errors detected
  → Response: {valid: false, errors: [...]}
  → UI highlights errors
  → User cannot save until fixed
```

### Generation Error Flow
```
User generates project
  → Orchestrator starts
  → Phase 3 fails (Odoo API error)
  → Rollback attempt
    → If success: cleanup complete
    → If fail: orphaned records logged
  → Audit log updated (status: 'failed', error_details)
  → Response: {success: false, error: 'User-friendly message'}
  → UI shows error screen with details
```

### Network Error Flow
```
API request
  → Network timeout
  → Retry logic (up to 3 times)
  → Still fails
  → Log error
  → Response: 503 Service Unavailable
  → UI shows: "Network error, please retry"
```

---

## Performance Considerations

### Critical Paths (Must Be Fast)

**Blueprint Validation:** <200ms  
- Client-side validation for instant feedback
- Server-side for authoritative check

**Template List Load:** <1s  
- Paginated (20 per page)
- Metadata-only query (no blueprint_data)
- Indexed on `updated_at`, `status`, `created_by`

**Project Generation:** <10s for typical project  
- Sequential Odoo API calls (unavoidable)
- Log each phase for transparency
- Timeout: 60s max

### Non-Critical Paths (Can Be Slower)

**Template Export:** <3s  
- JSON serialization + download
- User expects slight delay

**Version History Load:** <2s  
- Query filters by template_id
- Low volume (typically <10 versions)

**Dependency Graph Rendering:** <1s  
- Client-side graph layout (Cytoscape.js)
- Lazy load library (not in critical path)

---

## Monitoring Queries

### Useful SQL Queries

**Most Used Templates:**
```sql
SELECT name, version, usage_count, last_used_at
FROM project_templates
WHERE status = 'published'
ORDER BY usage_count DESC
LIMIT 10;
```

**Recent Generation Failures:**
```sql
SELECT g.id, g.odoo_project_name, g.error_message, g.started_at, t.name AS template_name
FROM project_generations g
JOIN project_templates t ON g.template_id = t.id
WHERE g.status = 'failed'
ORDER BY g.started_at DESC
LIMIT 20;
```

**Generation Success Rate (Last 24h):**
```sql
SELECT 
  status,
  COUNT(*) AS count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM project_generations
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

**Average Generation Duration:**
```sql
SELECT 
  AVG(duration_ms) AS avg_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms
FROM project_generations
WHERE status = 'success' AND started_at > NOW() - INTERVAL '7 days';
```

**Templates Needing Cleanup (Unused, Old):**
```sql
SELECT id, name, created_at, usage_count
FROM project_templates
WHERE usage_count = 0 
  AND created_at < NOW() - INTERVAL '3 months'
  AND status = 'published';
```

---

## Quick Reference

### Key Files

| File | Purpose | Complexity |
|------|---------|------------|
| `module.js` | Module registration | Low |
| `routes.js` | HTTP handlers | Medium |
| `ui.js` | HTML generation | Medium |
| `lib/blueprint-manager.js` | Blueprint logic | Low |
| `lib/template-repository.js` | Template CRUD | Medium |
| `lib/odoo-orchestrator.js` | Generation coordination | High |
| `lib/validation-engine.js` | Validation logic | Medium |
| `lib/dependency-analyzer.js` | Graph algorithms | High |
| `lib/audit-logger.js` | Logging | Low |
| `lib/odoo.js` | Odoo API (existing) | Medium |

### Key Database Tables

| Table | Purpose | Row Count (Est.) |
|-------|---------|------------------|
| `project_templates` | Templates | 10-100 |
| `project_generations` | Audit log | Grows indefinitely (1000s) |

### Key Odoo Models

| Model | Our Usage | Created Records (per generation) |
|-------|-----------|-----------------------------------|
| `project.project` | Create | 1 |
| `project.task.type` | Create | 5-10 |
| `project.milestone` | Create | 2-10 |
| `project.task` | Create | 10-100 |
| `project.tags` | Search/Create | 5-15 |

---

## Future Expansion Areas

### Planned Enhancements (Not V1)
- Template sharing between teams
- Batch project generation
- Odoo project import as template
- Advanced dependency visualization
- Template analytics dashboard
- Custom field support
- Scheduled recurring generation

### Architecture Considerations for Future
- **Template Marketplace:** New DB table `marketplace_templates`, public/private visibility
- **Team Sharing:** New table `template_permissions`, team-based RLS
- **Custom Fields:** Extend blueprint schema, dynamic Odoo field detection
- **Webhooks:** New table `webhook_subscriptions`, event-based notifications
- **Batch Generation:** Queue system (e.g., Cloudflare Queues), async processing

---

## Summary

The Project Generator is a **design-time orchestration layer** that enables:
- **Designing** project structures as reusable blueprints
- **Storing** templates with version control
- **Generating** complete Odoo projects via API with a single action
- **Auditing** all generation events for transparency

It integrates cleanly with the existing platform, reuses established patterns (module registry, Odoo API client, Supabase), and respects system boundaries (no bidirectional sync, no live editing).

The architecture is **modular, testable, and extensible**, with clear separation between UI, routes, services, and data layers.
