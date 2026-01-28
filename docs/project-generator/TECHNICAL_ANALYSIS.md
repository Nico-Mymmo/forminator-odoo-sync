# Project Generator - Technical Analysis

## System Architecture

### Integration with Existing Platform

The Project Generator follows the established module pattern used by sales-insight-explorer and other modules:

```
src/modules/project-generator/
├── module.js          # Module registration (code, name, route, icon)
├── routes.js          # Request handlers (follows same pattern as sales-insight-explorer)
├── ui.js              # HTML generation for main UI
├── lib/               # Business logic
│   ├── blueprint-manager.js      # Blueprint CRUD operations
│   ├── template-repository.js    # Template persistence layer
│   ├── odoo-orchestrator.js      # Odoo API sequencing
│   ├── validation-engine.js      # Blueprint validation logic
│   ├── dependency-analyzer.js    # Task dependency graph operations
│   └── audit-logger.js           # Generation event logging
└── config/
    ├── kanban-types.js           # Stage type definitions
    └── validation-rules.js       # Validation configuration
```

### Module Registration

Following existing pattern in `src/modules/registry.js`:

```javascript
import projectGeneratorModule from './project-generator/module.js';

export const MODULES = [
  homeModule,
  forminatorSyncModule,
  projectGeneratorModule,  // Added here
  adminModule,
  profileModule,
  salesInsightExplorerModule
];
```

Module definition (`src/modules/project-generator/module.js`):
```javascript
import { routes } from './routes.js';

export default {
  code: 'project_generator',
  name: 'Project Generator',
  description: 'Design and deploy project structures to Odoo',
  route: '/projects',
  icon: 'briefcase',
  isActive: true,
  routes
};
```

---

## Data Model

### Application Database (Supabase)

#### Table: `project_templates`

Stores template metadata and complete blueprint structure.

```sql
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version VARCHAR(20) NOT NULL,  -- Semantic versioning: "1.2.3"
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- 'draft' | 'published' | 'archived'
  locked BOOLEAN NOT NULL DEFAULT false,
  blueprint_data JSONB NOT NULL,  -- Complete blueprint structure (see schema below)
  tags TEXT[],  -- Array of tag strings
  
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Metadata
  usage_count INTEGER NOT NULL DEFAULT 0,  -- Incremented on each generation
  last_used_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT valid_version CHECK (version ~ '^\d+\.\d+\.\d+$')
);

CREATE INDEX idx_templates_status ON project_templates(status);
CREATE INDEX idx_templates_created_by ON project_templates(created_by);
CREATE INDEX idx_templates_tags ON project_templates USING GIN(tags);
```

#### Blueprint Data Schema (JSONB)

The `blueprint_data` column contains the complete project structure:

```typescript
{
  "kanban": {
    "stages": [
      {
        "id": "stage_uuid_1",  // Client-generated UUID for references
        "name": "To Do",
        "type": "backlog",  // backlog | in_progress | review | blocked | done
        "sequence": 0,
        "color": "#3B82F6",  // Hex color
        "fold": false  // Odoo fold state
      },
      // ... more stages
    ]
  },
  "milestones": [
    {
      "id": "milestone_uuid_1",
      "name": "Phase 1: Discovery",
      "description": "Initial client discovery and requirements gathering",
      "sequence": 0
    },
    // ... more milestones
  ],
  "tasks": [
    {
      "id": "task_uuid_1",
      "name": "Initial client meeting",
      "description": "Schedule and conduct kickoff meeting",
      "milestone_id": "milestone_uuid_1",  // References milestone.id
      "default_stage_id": "stage_uuid_1",  // References stage.id
      "sequence": 0,
      "tag_ids": ["discovery", "client-facing"],  // Tags as strings
      "subtasks": [
        {
          "id": "subtask_uuid_1",
          "name": "Prepare agenda",
          "description": "",
          "sequence": 0
        }
        // ... more subtasks
      ],
      "prerequisite_ids": []  // Array of task IDs this task depends on
    },
    // ... more tasks
  ],
  "metadata": {
    "created_at": "2026-01-28T12:00:00Z",
    "schema_version": "1.0"
  }
}
```

**Design Rationale:**
- UUIDs allow client-side generation and offline editing
- References by ID enable graph operations
- Flat task array with `milestone_id` simplifies queries
- Subtasks nested for clarity (max 1 level deep)
- Schema version for future migrations

---

#### Table: `project_generations`

Audit log of every project generation event.

```sql
CREATE TABLE project_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES project_templates(id),
  template_version VARCHAR(20) NOT NULL,
  
  -- Odoo context
  odoo_project_id INTEGER,  -- Odoo's project.project ID
  odoo_project_name VARCHAR(255) NOT NULL,
  odoo_company_id INTEGER,
  
  -- Execution details
  status VARCHAR(20) NOT NULL,  -- 'success' | 'failed' | 'partial'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Technical details
  api_calls_made INTEGER,
  error_message TEXT,
  error_details JSONB,
  created_records JSONB,  -- {"stages": [ids], "milestones": [ids], "tasks": [ids]}
  
  -- User context
  generated_by UUID NOT NULL REFERENCES auth.users(id),
  
  CONSTRAINT valid_status CHECK (status IN ('success', 'failed', 'partial'))
);

CREATE INDEX idx_generations_template ON project_generations(template_id);
CREATE INDEX idx_generations_user ON project_generations(generated_by);
CREATE INDEX idx_generations_status ON project_generations(status);
CREATE INDEX idx_generations_started ON project_generations(started_at DESC);
```

---

### Odoo Database (Target System)

We create records in these existing Odoo models:

#### `project.project`
The main project container.

**Fields Used:**
- `name` (required): Project name from user input
- `company_id`: From user selection or default
- `user_id`: Project manager (optional, could be generating user)
- `description`: From template or user override
- `active`: true

**Created via:** `executeKw(env, {model: 'project.project', method: 'create', args: [{...}]})`

---

#### `project.task.type`
Kanban stages for the project.

**Fields Used:**
- `name`: Stage name from blueprint
- `project_ids`: Array containing our project ID
- `sequence`: Order from blueprint
- `fold`: Folded state from blueprint
- `description`: Optional (could map type to description)

**Note:** Odoo uses many2many relationship between stages and projects. We create project-specific stages.

**Created via:** `executeKw(env, {model: 'project.task.type', method: 'create', args: [{...}]})`

---

#### `project.milestone`
Real Odoo milestones (not pseudo-milestones).

**Fields Used:**
- `name`: Milestone name
- `project_id`: Our project ID
- `description`: Optional description
- `is_reached`: false (default)
- `sequence`: Order from blueprint

**Created via:** `executeKw(env, {model: 'project.milestone', method: 'create', args: [{...}]})`

---

#### `project.task`
Tasks and subtasks.

**Fields Used:**
- `name`: Task name
- `description`: Task description (HTML allowed)
- `project_id`: Our project ID
- `milestone_id`: Milestone reference
- `stage_id`: Default stage from blueprint
- `parent_id`: For subtasks, references parent task
- `sequence`: Order within milestone
- `tag_ids`: Array of tag IDs (requires tag lookup/creation)
- `depend_on_ids`: Array of task IDs for prerequisites

**Subtask Model:**
Subtasks are `project.task` records with `parent_id` set to parent task ID.

**Created via:** `executeKw(env, {model: 'project.task', method: 'create', args: [{...}]})`

---

#### `project.tags`
Task tags/labels.

**Fields Used:**
- `name`: Tag name
- `color`: Integer representing color index

**Strategy:**
- Before creating tasks, check if tags exist: `searchRead(env, {model: 'project.tags', domain: [['name', 'in', tagNames]]})`
- Create missing tags
- Map tag names to IDs for task creation

---

## Odoo Integration Strategy

### API Communication Layer

**Reuse Existing Infrastructure:**

The module uses the established `odoo.js` library:

```javascript
import { executeKw, searchRead } from '../../lib/odoo.js';
```

**No New Abstractions:**
- No custom Odoo client
- No fetch wrappers
- Direct use of `executeKw` for writes
- Direct use of `searchRead` for reads

### Orchestration Sequence

The `odoo-orchestrator.js` module coordinates the multi-step creation process.

**Function Signature:**
```javascript
async function generateProject(env, { templateId, projectName, companyId, description })
```

**Execution Steps:**

#### Phase 1: Preparation & Validation
1. Load template from Supabase
2. Validate template status (must be published)
3. Validate Odoo connection
4. Create generation audit record (status: 'started')

#### Phase 2: Create Project
```javascript
const projectData = {
  name: projectName,
  company_id: companyId || parseInt(env.COMPANY_ID),
  description: description || template.description,
  active: true
};

const projectId = await executeKw(env, {
  model: 'project.project',
  method: 'create',
  args: [projectData]
});
```

**Error Handling:** If fails, abort entire operation, log error, return failure.

---

#### Phase 3: Create Kanban Stages
```javascript
const stages = blueprint.kanban.stages;
const stageMap = {};  // Maps blueprint stage ID to Odoo stage ID

for (const stage of stages) {
  const stageData = {
    name: stage.name,
    project_ids: [[6, 0, [projectId]]],  // Odoo's many2many syntax
    sequence: stage.sequence,
    fold: stage.fold || false
  };
  
  const stageId = await executeKw(env, {
    model: 'project.task.type',
    method: 'create',
    args: [stageData]
  });
  
  stageMap[stage.id] = stageId;
}
```

**Why Sequential:** Stages need individual IDs for task assignment. Batch create possible but complicates error recovery.

**Error Handling:** If stage creation fails mid-loop, attempt to delete project (rollback), log partial state.

---

#### Phase 4: Create Milestones
```javascript
const milestoneMap = {};

for (const milestone of blueprint.milestones) {
  const milestoneData = {
    name: milestone.name,
    project_id: projectId,
    description: milestone.description,
    sequence: milestone.sequence,
    is_reached: false
  };
  
  const milestoneId = await executeKw(env, {
    model: 'project.milestone',
    method: 'create',
    args: [milestoneData]
  });
  
  milestoneMap[milestone.id] = milestoneId;
}
```

**Error Handling:** Same as stages - attempt rollback, log state.

---

#### Phase 5: Prepare Tags
```javascript
// Extract all unique tag names from blueprint
const allTagNames = [...new Set(
  blueprint.tasks.flatMap(t => t.tag_ids || [])
)];

// Search for existing tags
const existingTags = await searchRead(env, {
  model: 'project.tags',
  domain: [['name', 'in', allTagNames]],
  fields: ['id', 'name']
});

const tagMap = {};
existingTags.forEach(tag => {
  tagMap[tag.name] = tag.id;
});

// Create missing tags
const existingTagNames = new Set(existingTags.map(t => t.name));
const missingTagNames = allTagNames.filter(name => !existingTagNames.has(name));

for (const tagName of missingTagNames) {
  const tagId = await executeKw(env, {
    model: 'project.tags',
    method: 'create',
    args: [{ name: tagName, color: 0 }]
  });
  tagMap[tagName] = tagId;
}
```

**Optimization:** Batch tag search. Sequential create acceptable (typically <10 tags).

---

#### Phase 6: Create Tasks (Two-Pass)

**Pass 1: Create all tasks without dependencies**

Tasks must exist before dependencies can be set.

```javascript
const taskMap = {};

for (const task of blueprint.tasks) {
  const taskData = {
    name: task.name,
    description: task.description,
    project_id: projectId,
    milestone_id: milestoneMap[task.milestone_id],
    stage_id: stageMap[task.default_stage_id],
    sequence: task.sequence,
    tag_ids: [[6, 0, task.tag_ids.map(name => tagMap[name])]]
    // NO depend_on_ids yet
  };
  
  const taskId = await executeKw(env, {
    model: 'project.task',
    method: 'create',
    args: [taskData]
  });
  
  taskMap[task.id] = taskId;
  
  // Create subtasks immediately
  for (const subtask of task.subtasks || []) {
    const subtaskData = {
      name: subtask.name,
      description: subtask.description,
      project_id: projectId,
      parent_id: taskId,
      sequence: subtask.sequence
    };
    
    await executeKw(env, {
      model: 'project.task',
      method: 'create',
      args: [subtaskData]
    });
  }
}
```

**Pass 2: Set task dependencies**

```javascript
for (const task of blueprint.tasks) {
  if (task.prerequisite_ids && task.prerequisite_ids.length > 0) {
    const odooTaskId = taskMap[task.id];
    const odooDependencyIds = task.prerequisite_ids.map(id => taskMap[id]);
    
    await executeKw(env, {
      model: 'project.task',
      method: 'write',
      args: [
        [odooTaskId],
        { depend_on_ids: [[6, 0, odooDependencyIds]] }
      ]
    });
  }
}
```

**Why Two-Pass:**
- Odoo requires task IDs to exist before setting `depend_on_ids`
- Circular dependency validation already happened in blueprint validation
- Clean separation of concerns

**Error Handling:**
- Pass 1 failure: rollback project
- Pass 2 failure: tasks exist but no dependencies - log warning, allow continuation (degraded but functional)

---

#### Phase 7: Finalization
```javascript
// Update generation audit log
await updateGeneration({
  id: generationId,
  status: 'success',
  odoo_project_id: projectId,
  completed_at: new Date(),
  duration_ms: Date.now() - startTime,
  api_calls_made: apiCallCounter,
  created_records: {
    project: projectId,
    stages: Object.values(stageMap),
    milestones: Object.values(milestoneMap),
    tasks: Object.values(taskMap)
  }
});

// Increment template usage count
await incrementTemplateUsage(templateId);

return {
  success: true,
  projectId,
  odooProjectUrl: `${env.ODOO_URL}/web#id=${projectId}&model=project.project&view_type=form`
};
```

---

### Error Recovery Strategy

**Rollback Approach:**

```javascript
async function rollbackProject(env, projectId, createdRecords) {
  try {
    // Odoo cascade delete handles tasks when project deleted
    await executeKw(env, {
      model: 'project.project',
      method: 'unlink',
      args: [[projectId]]
    });
    
    return { rollbackSuccess: true };
  } catch (rollbackError) {
    // Log orphaned records for manual cleanup
    return {
      rollbackSuccess: false,
      orphanedRecords: createdRecords,
      rollbackError: rollbackError.message
    };
  }
}
```

**Partial Failure Handling:**

If task dependency setting fails but all tasks created:
```javascript
{
  status: 'partial',
  message: 'Project created but task dependencies not set',
  projectId: 123,
  action: 'manual_dependency_setup',
  details: { failedDependencies: [...] }
}
```

User sees:
> "Project created successfully, but some task dependencies couldn't be set. You can set them manually in Odoo."

---

### Idempotency Considerations

**Problem:** User clicks "Generate" twice, or retries after network failure.

**Solution:**

1. **Generation ID:** Each generation attempt gets unique UUID before starting
2. **Audit Log:** Check if generation already succeeded:
   ```javascript
   const existingGeneration = await findGeneration({
     template_id: templateId,
     odoo_project_name: projectName,
     status: 'success',
     created_within_minutes: 5
   });
   
   if (existingGeneration) {
     return {
       success: true,
       duplicate: true,
       projectId: existingGeneration.odoo_project_id,
       message: 'This project was already created'
     };
   }
   ```

3. **No Odoo-Side Check:** We don't search Odoo for project name (could be legitimate duplicate name)
4. **User Informed:** UI warns if identical name used within recent timeframe

---

## Service Layer Architecture

### Blueprint Manager (`lib/blueprint-manager.js`)

**Responsibilities:**
- In-memory blueprint manipulation
- Client-side validation
- UUID generation
- Default value population

**Key Functions:**
```javascript
createBlueprint()  // Returns empty blueprint structure
addStage(blueprint, stageData)
removeStage(blueprint, stageId)
addMilestone(blueprint, milestoneData)
addTask(blueprint, milestoneId, taskData)
addSubtask(blueprint, taskId, subtaskData)
setTaskDependency(blueprint, taskId, prerequisiteId)
removeTaskDependency(blueprint, taskId, prerequisiteId)
validateBlueprint(blueprint)  // Returns {errors, warnings}
```

**No Persistence:** This layer is pure logic, no database calls.

---

### Template Repository (`lib/template-repository.js`)

**Responsibilities:**
- Supabase CRUD for templates
- Version management
- Template locking/unlocking
- Usage statistics

**Key Functions:**
```javascript
async createTemplate(userId, { name, description, blueprintData })
async getTemplate(templateId)
async listTemplates({ status, createdBy, tags, limit, offset })
async updateTemplate(templateId, updates)
async publishTemplate(templateId, versionBump)  // 'major' | 'minor' | 'patch'
async lockTemplate(templateId)
async unlockTemplate(templateId)
async archiveTemplate(templateId)
async cloneTemplate(templateId, newName)
async incrementUsage(templateId)
async getVersionHistory(templateId)  // Requires version tracking design
```

**Database Access:**
Uses Supabase client established in existing app infrastructure.

---

### Validation Engine (`lib/validation-engine.js`)

**Responsibilities:**
- Structural validation (schema compliance)
- Semantic validation (business rules)
- Dependency graph analysis
- Warning generation

**Key Functions:**
```javascript
validateBlueprint(blueprint)  // Returns {errors: [], warnings: []}
validateKanban(kanban)
validateMilestones(milestones)
validateTasks(tasks)
validateDependencies(tasks)  // Checks for cycles, orphans
```

**Validation Rules:**

Errors:
- Empty required fields
- Invalid UUIDs
- Circular dependencies (detected via topological sort)
- References to nonexistent entities
- Duplicate entity IDs

Warnings:
- >15 stages
- >50 milestones
- Tasks with >5 dependencies
- No "done" stage
- Isolated tasks (no dependencies)

---

### Dependency Analyzer (`lib/dependency-analyzer.js`)

**Responsibilities:**
- Dependency graph operations
- Critical path calculation
- Bottleneck detection
- Visualization data generation

**Key Functions:**
```javascript
buildDependencyGraph(tasks)  // Returns graph structure
detectCycles(graph)  // Returns cycle paths or null
findCriticalPath(graph)  // Returns longest path
findBottlenecks(graph)  // Returns tasks with highest out-degree
getTopologicalOrder(graph)  // Returns valid execution order
getVisualizationData(graph)  // Returns data for D3/Cytoscape
```

**Algorithm:**
- Cycle detection: DFS with color marking
- Critical path: Longest path in DAG
- Topological sort: Kahn's algorithm

---

### Audit Logger (`lib/audit-logger.js`)

**Responsibilities:**
- Generation event logging
- Performance tracking
- Error detail capture

**Key Functions:**
```javascript
async startGeneration({ templateId, templateVersion, projectName, userId })
async updateGeneration(generationId, updates)
async completeGeneration(generationId, { status, projectId, records, duration })
async logError(generationId, error)
async getGenerationHistory({ userId, templateId, status, limit })
```

**Integration:**
Orchestrator calls logger at each phase transition.

---

## Database Migration

### Supabase Migration File

```sql
-- Migration: 20260128_project_generator_module.sql

-- Templates table
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  locked BOOLEAN NOT NULL DEFAULT false,
  blueprint_data JSONB NOT NULL,
  tags TEXT[],
  
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  CONSTRAINT valid_status CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT valid_version CHECK (version ~ '^\d+\.\d+\.\d+$'),
  CONSTRAINT valid_blueprint CHECK (jsonb_typeof(blueprint_data) = 'object')
);

CREATE INDEX idx_templates_status ON project_templates(status);
CREATE INDEX idx_templates_created_by ON project_templates(created_by);
CREATE INDEX idx_templates_tags ON project_templates USING GIN(tags);
CREATE INDEX idx_templates_updated ON project_templates(updated_at DESC);

-- Generations audit log
CREATE TABLE project_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  template_version VARCHAR(20) NOT NULL,
  
  odoo_project_id INTEGER,
  odoo_project_name VARCHAR(255) NOT NULL,
  odoo_company_id INTEGER,
  
  status VARCHAR(20) NOT NULL DEFAULT 'started',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  api_calls_made INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  created_records JSONB,
  
  generated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  CONSTRAINT valid_gen_status CHECK (status IN ('started', 'success', 'failed', 'partial'))
);

CREATE INDEX idx_generations_template ON project_generations(template_id);
CREATE INDEX idx_generations_user ON project_generations(generated_by);
CREATE INDEX idx_generations_status ON project_generations(status);
CREATE INDEX idx_generations_started ON project_generations(started_at DESC);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_templates_updated_at
  BEFORE UPDATE ON project_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (Row Level Security)
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_generations ENABLE ROW LEVEL SECURITY;

-- Templates: users can view published templates or their own
CREATE POLICY templates_select_policy ON project_templates
  FOR SELECT
  USING (
    status = 'published' 
    OR created_by = auth.uid()
  );

-- Templates: users can insert their own
CREATE POLICY templates_insert_policy ON project_templates
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Templates: users can update their own unlocked templates
CREATE POLICY templates_update_policy ON project_templates
  FOR UPDATE
  USING (created_by = auth.uid() AND locked = false);

-- Templates: users can delete their own templates
CREATE POLICY templates_delete_policy ON project_templates
  FOR DELETE
  USING (created_by = auth.uid());

-- Generations: users can view their own generations
CREATE POLICY generations_select_policy ON project_generations
  FOR SELECT
  USING (generated_by = auth.uid());

-- Generations: users can insert their own generations
CREATE POLICY generations_insert_policy ON project_generations
  FOR INSERT
  WITH CHECK (generated_by = auth.uid());

-- Add module to user permissions (if using module permissions table)
-- Assumes existing module permissions structure from platform
-- INSERT INTO module_permissions (user_id, module_code, can_access) VALUES (...);

COMMENT ON TABLE project_templates IS 'Project blueprint templates for Odoo project generation';
COMMENT ON TABLE project_generations IS 'Audit log of all project generation events';
```

---

## API Endpoint Design

### Route Structure (`routes.js`)

Following the pattern from `sales-insight-explorer/routes.js`:

```javascript
export const routes = [
  {
    path: '/projects',
    method: 'GET',
    handler: renderMainUI,
    auth: true
  },
  {
    path: '/projects/api/templates',
    method: 'GET',
    handler: listTemplates,
    auth: true
  },
  {
    path: '/projects/api/templates/:id',
    method: 'GET',
    handler: getTemplate,
    auth: true
  },
  {
    path: '/projects/api/templates',
    method: 'POST',
    handler: createTemplate,
    auth: true
  },
  {
    path: '/projects/api/templates/:id',
    method: 'PUT',
    handler: updateTemplate,
    auth: true
  },
  {
    path: '/projects/api/templates/:id/publish',
    method: 'POST',
    handler: publishTemplate,
    auth: true
  },
  {
    path: '/projects/api/templates/:id/clone',
    method: 'POST',
    handler: cloneTemplate,
    auth: true
  },
  {
    path: '/projects/api/templates/:id/archive',
    method: 'POST',
    handler: archiveTemplate,
    auth: true
  },
  {
    path: '/projects/api/validate',
    method: 'POST',
    handler: validateBlueprint,
    auth: true
  },
  {
    path: '/projects/api/generate',
    method: 'POST',
    handler: generateProject,
    auth: true
  },
  {
    path: '/projects/api/generations',
    method: 'GET',
    handler: listGenerations,
    auth: true
  },
  {
    path: '/projects/api/generations/:id',
    method: 'GET',
    handler: getGeneration,
    auth: true
  }
];
```

### Request/Response Contracts

#### POST `/projects/api/templates`
Create new template.

**Request:**
```json
{
  "name": "Client Onboarding v2",
  "description": "Standard client onboarding process",
  "blueprintData": { /* full blueprint structure */ },
  "tags": ["onboarding", "clients"]
}
```

**Response (201):**
```json
{
  "success": true,
  "templateId": "uuid-here",
  "version": "1.0.0",
  "status": "draft"
}
```

---

#### POST `/projects/api/validate`
Validate blueprint without saving.

**Request:**
```json
{
  "blueprintData": { /* full blueprint */ }
}
```

**Response (200):**
```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    {
      "type": "stage_count",
      "message": "17 stages may clutter the kanban view",
      "severity": "low"
    }
  ],
  "analysis": {
    "stageCount": 17,
    "milestoneCount": 5,
    "taskCount": 43,
    "dependencyCount": 12,
    "criticalPathLength": 8,
    "bottlenecks": ["task_uuid_5", "task_uuid_12"]
  }
}
```

---

#### POST `/projects/api/generate`
Generate Odoo project from template.

**Request:**
```json
{
  "templateId": "uuid-here",
  "projectName": "ACME Corp Onboarding",
  "companyId": 1,  // optional
  "description": "Custom description override"  // optional
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "generationId": "uuid-here",
  "status": "started",
  "estimatedDuration": "8 seconds"
}
```

**Response (200 Success - after completion):**
```json
{
  "success": true,
  "generationId": "uuid-here",
  "status": "success",
  "projectId": 123,
  "odooUrl": "https://mymmo.odoo.com/web#id=123&model=project.project",
  "created": {
    "stages": 5,
    "milestones": 4,
    "tasks": 43,
    "subtasks": 12
  },
  "duration": 7200
}
```

**Response (500 Error):**
```json
{
  "success": false,
  "generationId": "uuid-here",
  "status": "failed",
  "error": "Failed to create project in Odoo",
  "details": {
    "phase": "create_stages",
    "message": "API error: Invalid stage name",
    "rollback": "success"
  }
}
```

---

#### GET `/projects/api/generations?limit=20&status=success`
List generation history.

**Response (200):**
```json
{
  "generations": [
    {
      "id": "uuid-1",
      "templateName": "Client Onboarding v2",
      "templateVersion": "2.1.0",
      "projectName": "ACME Corp Onboarding",
      "projectId": 123,
      "status": "success",
      "startedAt": "2026-01-28T10:00:00Z",
      "duration": 7200,
      "generatedBy": "user@example.com"
    }
  ],
  "total": 156,
  "limit": 20,
  "offset": 0
}
```

---

## Performance Optimization

### Blueprint Validation
- Run client-side before save
- Debounce validation calls (500ms)
- Use Web Worker for complex dependency graph analysis
- Cache validation results until blueprint changes

### Template List Loading
- Paginate (20 per page default)
- Load blueprint data lazily (only metadata in list)
- Full blueprint fetched only when viewing/editing
- Index on `updated_at` for efficient sorting

### Project Generation
- Stream progress updates via Server-Sent Events (SSE) or polling
- Show phase-by-phase progress
- Allow user to navigate away (generation continues server-side)
- Notification on completion

### Dependency Graph Visualization
- Limit visualization to first 100 tasks
- Offer "simplified view" for large graphs
- Lazy load graph library (D3 or Cytoscape)

---

## Extensibility Points

### Custom Kanban Stage Types
Config-driven stage type definitions:

```javascript
// config/kanban-types.js
export const STAGE_TYPES = [
  {
    id: 'backlog',
    label: 'Backlog',
    description: 'Work not yet started',
    suggestedColors: ['#6B7280', '#9CA3AF']
  },
  {
    id: 'in_progress',
    label: 'In Progress',
    description: 'Active work',
    suggestedColors: ['#3B82F6', '#2563EB']
  },
  // ... more types
];
```

Easy to extend without code changes.

### Validation Rule Configuration
```javascript
// config/validation-rules.js
export const VALIDATION_CONFIG = {
  maxStages: 20,
  maxMilestones: 50,
  maxTaskDependencies: 10,
  warnStageThreshold: 15,
  warnTaskDependencyThreshold: 5,
  allowMultipleDoneStages: true
};
```

### Export/Import Formats
Template export as JSON enables:
- Backup/restore
- Sharing between organizations
- Version control (Git)
- Template marketplace (future)

```javascript
async function exportTemplate(templateId) {
  const template = await getTemplate(templateId);
  return {
    formatVersion: '1.0',
    exportedAt: new Date().toISOString(),
    template: {
      name: template.name,
      description: template.description,
      blueprint: template.blueprint_data,
      tags: template.tags
    }
  };
}
```

---

## Testing Strategy

### Unit Tests
- Blueprint validation logic
- Dependency graph algorithms (cycle detection, critical path)
- Data transformations (blueprint → Odoo format)

### Integration Tests
- Template CRUD operations
- Generation workflow (mocked Odoo API)
- Rollback scenarios

### E2E Tests (Staging Odoo)
- Create template → Generate project → Verify in Odoo
- Test all Odoo record types created correctly
- Dependency relationships preserved
- Rollback on failure

### Performance Tests
- Generate project with 100 tasks
- Load template library with 100 templates
- Validate complex blueprint (50 tasks, 30 dependencies)

---

## Monitoring & Observability

### Metrics to Track
- Generation success rate (target: >95%)
- Generation duration (P50, P95, P99)
- Template usage distribution (identify popular templates)
- API error rates by phase
- Rollback frequency

### Logging
- Every Odoo API call logged (already established pattern)
- Generation phase transitions logged
- Validation failures logged
- Error stack traces captured

### Alerting
- Generation failure rate >5% in 1 hour
- API error rate spike
- Average generation duration >20s
- Rollback failure (orphaned records)

---

## Security Considerations

### Authorization
- Users can only edit their own templates (unless admin)
- Template visibility controlled by status and ownership
- RLS policies enforce database-level access control
- Generation only creates projects in user's company context

### Input Validation
- Sanitize all user inputs (template names, descriptions)
- Validate blueprint JSON schema
- Prevent XSS in task descriptions (Odoo handles this, but sanitize anyway)
- Rate limit generation API (max 10 projects per minute per user)

### Odoo API Safety
- Never expose Odoo credentials client-side
- All Odoo calls server-side only
- Validate company_id matches user's authorized companies
- Prevent privilege escalation via project creation

### Data Privacy
- Audit logs contain no sensitive data
- Template blueprints may contain business logic (treat as confidential)
- Export feature requires authentication
- Deletion is soft delete (preserve audit trail)

---

## Migration from Existing Systems

### If Organization Has Existing Project Templates

**Manual Migration:**
1. Export template from existing system (if possible)
2. Manually recreate in blueprint editor
3. Validate structure
4. Test with single project generation
5. Publish template

**Scripted Migration (Future):**
- Import from JSON format
- Import from CSV (limited structure)
- Import from existing Odoo project (snapshot current state as template)

**Not Supported:**
- Automatic migration from other project management tools
- Gantt chart imports (no scheduling in v1)

---

## Deployment Considerations

### Environment Variables
```
# Already existing
DB_NAME=odoo_database
UID=user_id
API_KEY=odoo_api_key
ODOO_URL=https://mymmo.odoo.com
COMPANY_ID=1

# Supabase (already configured)
SUPABASE_URL=...
SUPABASE_KEY=...

# Module-specific (optional)
MAX_GENERATION_RETRIES=3
GENERATION_TIMEOUT_MS=30000
ENABLE_TEMPLATE_EXPORT=true
```

### Database Migrations
- Run Supabase migration before deploying code
- Test migration on staging first
- Verify RLS policies active
- Seed initial templates (optional)

### Rollout Strategy
1. Deploy to staging
2. Create test templates
3. Generate test projects in staging Odoo
4. Verify in staging Odoo UI
5. User acceptance testing
6. Deploy to production
7. Announce to users
8. Monitor generation metrics

---

## Future Technical Enhancements (Out of Scope)

- **Batch Generation:** Generate 10 projects from one template with list of names
- **Scheduled Generation:** Cron-based recurring project creation
- **Template Marketplace:** Share templates across organizations
- **Odoo Import:** Convert existing Odoo project to template
- **Advanced Permissions:** Team-based template sharing
- **Custom Fields:** Support Odoo custom fields in blueprint
- **AI Suggestions:** ML-based template optimization recommendations
- **Webhooks:** Notify external systems on generation events
- **GraphQL API:** Alternative to REST for complex queries
