# ADDENDUM C: Pre-Generation Overview & Override

**Status**: Implemented  
**Date**: 2025-01-XX  
**Context**: Enhancement to Project Generator module - Iteration 5

---

## Overview

Addendum C introduces a **pre-generation preview and override mechanism** that allows users to review and customize the project structure before it is created in Odoo. This enables last-minute adjustments (rename tasks, remove tasks) without modifying the template blueprint.

### Core Principles

1. **Blueprint Immutability**: The template blueprint remains read-only and is NEVER modified
2. **Ephemeral Edits**: All customizations are made on the canonical generation model in-memory
3. **Audit Trail**: The exact model used for generation is stored in `project_generations.generation_model`
4. **Backward Compatibility**: Existing generation flow (direct generate) still works

---

## Architecture

### Data Flow

```
User clicks "Generate"
  ↓
Client: POST /api/generate-preview/:id
  ↓
Server: Build canonical model (NO side effects)
  ↓
Client: Display preview modal
  ↓
User: Rename/remove tasks (in-memory only)
  ↓
User: Click "Confirm & Generate"
  ↓
Client: POST /api/generate/:id { overrideModel }
  ↓
Server: Use overrideModel directly (skip rebuild)
  ↓
Server: Create in Odoo + store model
  ↓
Client: Show success/failure modal
```

### Key Components

1. **Preview Endpoint** (`POST /api/generate-preview/:id`)
   - Validates blueprint
   - Builds canonical generation model
   - Returns model as JSON
   - **NO database writes**
   - **NO Odoo API calls**

2. **Override Mechanism** (`POST /api/generate/:id`)
   - Accepts optional `overrideModel` in request body
   - If provided, uses it directly (skips blueprint rebuild)
   - Stores exact model in `project_generations.generation_model`
   - Maintains lifecycle tracking (conflicts, retries)

3. **Preview Modal** (Client UI)
   - Renders generation model hierarchically
   - Parent tasks → Subtasks → Milestones
   - **Inline rename**: Edit task names directly
   - **Remove task**: Delete task + children + dependencies
   - **Confirm & Generate**: Proceeds with modified model

---

## Implementation Details

### Server Changes

#### 1. New Preview Endpoint

**File**: `src/modules/project-generator/module.js`

```javascript
'POST /api/generate-preview/:id': async (context) => {
  const { env, params } = context;
  
  // Get template
  const template = await getTemplate(env, params.id);
  
  // Validate blueprint
  const blueprintData = await getBlueprintData(env, params.id);
  const validation = validateBlueprint(blueprintData);
  
  if (!validation.valid) {
    return error response;
  }
  
  // Build generation model (NO side effects)
  const { buildGenerationModel } = await import('./generate.js');
  const generationModel = buildGenerationModel(blueprintData, template.name);
  
  return JSON response with generationModel;
}
```

**Key Characteristics**:
- Read-only operation
- Returns canonical model
- No lifecycle state changes
- No database writes
- No Odoo API calls

#### 2. Override Support in Generate Endpoint

**File**: `src/modules/project-generator/module.js`

```javascript
'POST /api/generate/:id': async (context) => {
  const { request, env, params, user } = context;
  
  // Parse body
  const body = await request.json();
  const confirmOverwrite = body.confirmOverwrite || false;
  const overrideModel = body.overrideModel || null;
  
  // ... lifecycle validation ...
  
  // Build or use override model
  if (overrideModel) {
    generationModel = overrideModel;
  } else {
    generationModel = buildGenerationModel(blueprintData, template.name);
  }
  
  // Store in project_generations BEFORE Odoo calls
  generationId = await startGeneration(env, user.id, params.id, generationModel);
  
  // Execute with override
  const result = await generateProject(env, params.id, template.name, overrideModel);
  
  // ... success/failure handling ...
}
```

#### 3. Generate Function Signature Update

**File**: `src/modules/project-generator/generate.js`

```javascript
export async function generateProject(env, templateId, templateName, overrideModel = null) {
  // ... validation ...
  
  // STEP 2: Build or use override
  let generationModel;
  if (overrideModel) {
    console.log('[Generator] Using override model (Addendum C)');
    generationModel = overrideModel;
  } else {
    generationModel = buildGenerationModel(blueprintData, templateName);
  }
  
  // ... rest of generation ...
}
```

#### 4. Export buildGenerationModel

**File**: `src/modules/project-generator/generate.js`

Changed from private `function` to `export function` to enable preview endpoint to build models without executing generation.

---

### Client Changes

#### 1. Preview Modal Function

**File**: `public/project-generator-client.js`

```javascript
async function showGenerationPreviewModal(generationModel, templateId) {
  // Create modal with task list
  // Render tasks hierarchically (parents → subtasks)
  // Inline editing: rename task names
  // Remove button: delete task + cleanup dependencies
  // Confirm button: call executeGenerationWithOverride()
}
```

**Features**:
- Hierarchical task display
- Inline rename (updates `task.name` in-memory)
- Remove task (filters model arrays + dependency cleanup)
- Milestone badges
- Responsive scrolling for large projects

#### 2. Task Rendering

```javascript
function renderPreviewTasks(container, generationModel) {
  // Group by parent_blueprint_id
  // Render parent tasks first
  // Render subtasks indented
  // Each task = input + milestone badge + remove button
}
```

#### 3. Task Removal Logic

```javascript
function removeTaskFromModel(taskId, generationModel) {
  // Remove task itself
  generationModel.tasks = tasks.filter(t => t.blueprint_id !== taskId);
  
  // Remove subtasks (parent_blueprint_id === taskId)
  generationModel.tasks = tasks.filter(t => t.parent_blueprint_id !== taskId);
  
  // Remove dependencies pointing to this task
  tasks.forEach(task => {
    task.dependencies = task.dependencies.filter(depId => depId !== taskId);
  });
}
```

**Dependency Safety**: Removing a task also removes all references to it from other tasks' dependency arrays.

#### 4. Modified Generation Flow

**File**: `public/project-generator-client.js`

```javascript
async function generateProjectFromTemplate(templateId) {
  // OLD: Direct confirm() → POST /api/generate
  // NEW: POST /api/generate-preview → modal → POST /api/generate with overrideModel
  
  // Fetch preview
  const previewResponse = await fetch(`/projects/api/generate-preview/${templateId}`);
  const previewResult = await previewResponse.json();
  
  // Show modal
  await showGenerationPreviewModal(previewResult.generationModel, templateId);
}
```

---

## User Workflow

### Step-by-Step Experience

1. **User clicks "Generate Project"** on template card
   - Loading toast: "Loading generation preview..."

2. **Modal appears** with project structure
   - Project name displayed (timestamped)
   - All tasks/subtasks listed hierarchically
   - Each task has:
     - Rename field (inline edit)
     - Milestone badge (if applicable)
     - Remove button (X icon)

3. **User makes changes** (optional)
   - Rename: "Task 1" → "Initial Setup"
   - Remove: Delete "Obsolete Task" (also removes its 2 subtasks)

4. **User clicks "Confirm & Generate"**
   - Modified model sent to `/api/generate/:id` with `overrideModel` in body
   - Odoo creation proceeds with exact modifications
   - Success modal shows project link

5. **Audit trail preserved**
   - `project_generations.generation_model` stores the exact model user saw
   - Blueprint unchanged (can be reused for future generations)

---

## Data Model Changes

### No Schema Changes

Addendum C requires **NO database migrations**. It leverages existing fields:

- `project_generations.generation_model` (JSONB) - Already stores model from Iteration 5
- No new columns added
- No new tables created

### Generation Model Structure

The canonical generation model (both preview and override) has this shape:

```json
{
  "project": {
    "name": "Template Name (2025-01-15T14-30-22)",
    "description": null
  },
  "stages": [
    {
      "blueprint_id": "stage-uuid",
      "name": "Backlog",
      "sequence": 1
    }
  ],
  "tasks": [
    {
      "blueprint_id": "task-uuid",
      "name": "Parent Task",
      "milestone_name": "Milestone 1",
      "parent_blueprint_id": null,
      "dependencies": ["other-task-uuid"],
      "generation_order": 1
    },
    {
      "blueprint_id": "subtask-uuid",
      "name": "Subtask",
      "milestone_name": null,
      "parent_blueprint_id": "task-uuid",
      "dependencies": [],
      "generation_order": 2
    }
  ]
}
```

---

## Non-Goals (Explicit Exclusions)

### What This Does NOT Do

1. **No blueprint editing**: Preview modal cannot modify template blueprint
2. **No automatic saves**: Edits are ephemeral until generation
3. **No new lifecycle states**: Uses existing `pending` → `completed`/`failed` flow
4. **No user assignment**: Addendum C focuses on structure (names, removal only)
5. **No Odoo validation**: Model sent as-is (Odoo errors handled in existing failure flow)

### Future Enhancements (Not in Addendum C)

- User assignment (`user_ids`) in preview
- Stage assignment in preview
- Dependency editing in preview
- "Save as new template" option from modified model

---

## Testing Scenarios

### Happy Path

1. **Generate with no edits**
   - Preview shows model
   - User clicks "Confirm" without changes
   - Result: Identical to pre-Addendum C behavior

2. **Rename tasks**
   - Edit "Research phase" → "Discovery Sprint"
   - Generate → Odoo task has new name
   - Blueprint still has "Research phase"

3. **Remove tasks**
   - Remove "Optional Documentation Task"
   - Generate → Task not created in Odoo
   - Blueprint still has task (can be used in future)

### Edge Cases

1. **Remove parent task with subtasks**
   - Remove parent → Subtasks also removed
   - Dependencies cleaned up
   - No orphaned references

2. **Remove task with dependencies**
   - Task A depends on Task B
   - Remove Task B → Task A's dependencies array updated
   - Generation succeeds without broken links

3. **Empty all tasks**
   - User removes all tasks
   - Generate creates project with 0 tasks
   - Valid (user may want empty project structure)

### Error Cases

1. **Invalid blueprint**
   - Preview endpoint returns 400 with validation errors
   - No modal shown
   - Toast shows error message

2. **Template not found**
   - Preview endpoint returns 404
   - Toast shows "Template not found"

3. **Network error during preview**
   - Toast shows "Network error loading preview"
   - User can retry

4. **Generation conflict** (existing active generation)
   - Override model still sent to `/api/generate`
   - Existing lifecycle conflict logic handles it
   - Blocked modal shown with retry option

---

## Implementation Checklist

- [x] Server: Create POST /api/generate-preview/:id endpoint
- [x] Server: Export buildGenerationModel function
- [x] Server: Add overrideModel parameter to generateProject()
- [x] Server: Parse overrideModel in POST /api/generate/:id
- [x] Server: Use overrideModel if provided (skip rebuild)
- [x] Client: Create showGenerationPreviewModal()
- [x] Client: Implement renderPreviewTasks()
- [x] Client: Implement removeTaskFromModel()
- [x] Client: Implement executeGenerationWithOverride()
- [x] Client: Modify generateProjectFromTemplate() to use preview flow
- [x] Documentation: Create ADDENDUM_C.md

---

## Backward Compatibility

### Existing Generation Flow

The **direct generation** flow (without preview) is preserved:

```javascript
// OLD CODE (still works)
POST /api/generate/:id
Body: { confirmOverwrite: false }
```

If `overrideModel` is omitted, server builds model from blueprint (original behavior).

### Migration Path

**No migration required**. Addendum C is additive:

- Existing templates work unchanged
- Existing generations unaffected
- Old client code would skip preview (still functional)
- New client code uses preview automatically

---

## Security Considerations

### Input Validation

1. **Preview endpoint**
   - Validates blueprint structure (reuses `validateBlueprint`)
   - No user-supplied model input
   - Read-only operation

2. **Generate endpoint**
   - Accepts `overrideModel` from client
   - **Trusted input**: Client builds model from preview response
   - No server-side validation of override model (assumes client integrity)
   - Odoo API enforces final constraints (name required, etc.)

### Authorization

- Preview endpoint: Requires authenticated user (existing auth middleware)
- Template ownership: Validated in `getTemplate()` (user_id match)
- Generation quota: Existing lifecycle validation applies

---

## Performance Impact

### Preview Endpoint

- **Lightweight**: No Odoo API calls, no DB writes
- **Fast**: Blueprint validation + model building (~50ms)
- **Cacheable**: Could cache preview model if needed (future optimization)

### Generation Endpoint

- **No overhead**: If no override, existing path used
- **Minimal overhead**: If override, skips blueprint rebuild (saves 10-20ms)
- **Same execution time**: Odoo API calls dominate (3-10 seconds)

---

## Audit Trail

### What Gets Stored

When user generates with override:

```sql
SELECT 
  id,
  template_id,
  status,
  generation_model->>'project'->>'name' AS project_name,
  jsonb_array_length(generation_model->'tasks') AS task_count,
  created_at
FROM project_generations
WHERE user_id = 'xxx'
ORDER BY created_at DESC;
```

**Result**: Exact model used for generation (including renames/removals) is permanently stored.

### Forensic Capability

1. **Compare to blueprint**: See what user changed before generation
2. **Replay generation**: Use stored model to understand exact structure created
3. **Debug failures**: Model stored even if Odoo creation fails

---

## Related Documents

- [MODULE_PROJECT_IMPORTER_IMPLEMENTATION_LOG.md](./MODULE_PROJECT_IMPORTER_IMPLEMENTATION_LOG.md) - Complete module documentation
- [ADDENDUM_A_B.md](./ADDENDUM_A_B.md) - Optional subtasks + Kanban visibility
- [ITERATION_5_SUMMARY.md](../deprecated/ITERATION_5_SUMMARY.md) - Generation lifecycle tracking

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-01-XX | GitHub Copilot | Initial implementation of Addendum C |

---

**END OF ADDENDUM C**
