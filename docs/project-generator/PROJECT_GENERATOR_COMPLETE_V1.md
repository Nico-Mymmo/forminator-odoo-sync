# Project Generator - Complete Reference (V1 MVP)

## Document Status

**This is the single source of truth for Project Generator V1.**

All other documents are supporting material. If there's a conflict, this document wins.

**Last Updated:** 2026-01-28  
**Version:** 1.0 (MVP Scope)  
**Status:** Ready for Implementation

---

## What This Module Does (5-Second Summary)

Users can:
1. Design a project structure (task stages, milestones, tasks with subtasks, dependencies)
2. Save it as a template
3. Generate an Odoo project from that template (one-way push)

**After generation:**
- Zero connection to template
- No sync (never)
- No updates (never)
- No reflection back to template (never)
- Odoo project is fully autonomous

**Critical Principles:**
1. The Project Generator adapts to Odoo. Odoo is NEVER modified, extended, or bypassed.
2. Subtasks are MANDATORY (essential for process thinking, not optional)
3. Task Stages (project.task.type) ≠ Project-Level Stages (Odoo-native, untouched)
4. One-way data flow only: Template → Odoo. Then: disconnected.

---

## What This Module Does NOT Do

- ❌ Manage existing Odoo projects
- ❌ Sync with Odoo after creation (one-way push only, then disconnected)
- ❌ Update Odoo projects after creation (no bidirectional sync, ever)
- ❌ Reflect Odoo changes back to templates (no reverse sync, ever)
- ❌ Track project progress
- ❌ Provide analytics
- ❌ Modify Odoo models (no custom fields, no extensions, ever)
- ❌ Touch project-level stages (Odoo-native, globally managed)
- ❌ Version templates (V1)
- ❌ Audit generations (V1)
- ❌ Rollback failed generations (V1)

---

## System Architecture

### Three-Layer Model

```
┌─────────────────────────────────────────────┐
│         LAYER 1: BLUEPRINT                   │
│  Browser memory only (session-scoped)       │
│  Structure: { taskStages[], milestones[],   │
│               tasks[] (with subtasks),       │
│               dependencies[] }               │
│  Validates: errors block, warnings allow     │
│  Undo: Cancel returns to last saved state    │
└─────────────────────────────────────────────┘
                    ↓ Save
┌─────────────────────────────────────────────┐
│         LAYER 2: TEMPLATE                    │
│  Supabase project_templates table           │
│  Persistent storage, user-owned (RLS)       │
│  JSONB blueprint_data column                 │
└─────────────────────────────────────────────┘
                    ↓ Generate
┌─────────────────────────────────────────────┐
│         LAYER 3: INSTANCE                    │
│  Odoo database (project.project)            │
│  100% Odoo-native, no link back             │
│  Created via sequential API calls           │
└─────────────────────────────────────────────┘
```

### Data Flow

**Create Template:**
```
User designs blueprint → Validates → Saves to Supabase → Done
```

**Cancel/Undo Behavior:**
```
Cancel button → Discard all unsaved changes → Restore last persisted blueprint state
```
- This is NOT step-by-step undo
- This is NOT a state history
- This IS a deliberate UX choice for managers learning process thinking
- One "safe reset" to last save, nothing more

**Generate Project:**
```
Load template → Enter project name → Call Odoo API (6 steps) → Done
Then: ZERO connection to template (fully autonomous Odoo project)
```

**What happens in Odoo (6-step sequence):**
1. Create project (project.project)
2. Create task stages (project.task.type) - project-specific, NOT global
3. Create milestones (project.milestone)
4. Create parent tasks (project.task where parent_id = null)
5. Create subtasks (project.task where parent_id != null) - MANDATORY for process thinking
6. Set dependencies (project.task.depend_on_ids)

**After step 6:**
- Template and Odoo project have ZERO connection
- Template changes affect ONLY new generations
- Odoo changes affect ONLY that Odoo project
- No sync (never), no updates (never), no reflection (never)

**No background jobs. No queues. No webhooks. No sync. One-way push only.**

---

## Database Schema

### Single Table

```sql
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) > 0),
  description TEXT,
  blueprint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_templates_user_id ON project_templates(user_id);

-- RLS: Users can only access their own templates
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own templates"
  ON project_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Blueprint Data Structure (JSONB)

**Critical Terminology:**
- `taskStages`: Project-specific task stages (maps to `project.task.type` in Odoo)
- **NOT** project-level stages (Odoo-native, globally managed, NEVER touched by generator)

**Critical Architecture:**
- **Subtasks are MANDATORY** (not optional, not V2, essential for process thinking)
- Subtasks are real Odoo `project.task` records with `parent_id` field
- Subtasks are created AFTER their parents (ordering requirement)
- Subtasks inherit `project_id` and optionally `milestone_id`
- Subtasks may have dependencies, including cross-parent dependencies

**Odoo Alignment:**
The Project Generator adapts to Odoo. Odoo is NEVER modified, extended, or bypassed.
- No custom fields (never)
- No model extensions (never)
- No workflow overrides (never)
- All blueprint fields map to existing Odoo model fields (parent_id, project_ids, depend_on_ids, etc.)

```json
{
  "taskStages": [
    {
      "id": "stage_1",
      "name": "Backlog",
      "sequence": 1
    },
    {
      "id": "stage_2",
      "name": "In Progress",
      "sequence": 2
    },
    {
      "id": "stage_3",
      "name": "Done",
      "sequence": 3
    }
  ],
  "milestones": [
    {
      "id": "milestone_1",
      "name": "Phase 1",
      "description": "Initial setup and configuration"
    },
    {
      "id": "milestone_2",
      "name": "Phase 2",
      "description": "Development and testing"
    }
  ],
  "tasks": [
    {
      "id": "task_1",
      "name": "Setup Development Environment",
      "milestone_id": "milestone_1",
      "parent_id": null
    },
    {
      "id": "task_1_1",
      "name": "Install IDE",
      "milestone_id": "milestone_1",
      "parent_id": "task_1"
    },
    {
      "id": "task_1_2",
      "name": "Configure Git",
      "milestone_id": "milestone_1",
      "parent_id": "task_1"
    },
    {
      "id": "task_2",
      "name": "Configure CI/CD",
      "milestone_id": "milestone_1",
      "parent_id": null
    },
    {
      "id": "task_3",
      "name": "Implement Features",
      "milestone_id": "milestone_2",
      "parent_id": null
    }
  ],
  "dependencies": [
    {
      "task_id": "task_1_2",
      "depends_on_id": "task_1_1"
    },
    {
      "task_id": "task_2",
      "depends_on_id": "task_1"
    },
    {
      "task_id": "task_3",
      "depends_on_id": "task_2"
    }
  ]
}
```

**Structural Rules (V1):**
- `parent_id` = null → top-level task
- `parent_id` = task ID → subtask of that task
- Subtasks are real Odoo `project.task` records with `parent_id` field set
- Subtasks inherit project and milestone context from parent
- Dependencies can exist:
  - Between top-level tasks
  - Between subtasks
  - Across parent boundaries (subtask can depend on top-level task)
- Circular dependencies across parent boundaries are detected and blocked

**Fields NOT in V1:**
- ❌ `taskStages[].color`
- ❌ `taskStages[].type`
- ❌ `task.description`
- ❌ `task.estimated_hours`
- ❌ `task.assigned_to`
- ❌ `task.tags`

---

## Validation Rules

### Errors (Block Save/Generate)

| Rule | Detection | Message |
|------|-----------|---------|
| Empty Template Name | `name === ''` | "Template name is required" |
| Empty Task Stage Name | `taskStage.name === ''` | "Task stage name is required" |
| Empty Milestone Name | `milestone.name === ''` | "Milestone name is required" |
| Empty Task Name | `task.name === ''` | "Task name is required" |
| Duplicate Task Stage Names | Set comparison | "Duplicate task stage name: '{name}'" |
| Duplicate Milestone Names | Set comparison | "Duplicate milestone name: '{name}'" |
| Circular Dependency | DFS cycle detection | "Circular dependency detected: Task A → Task B → Task A" |
| Invalid Dependency Reference | ID lookup | "Invalid dependency: task not found" |
| Invalid parent_id | Parent task doesn't exist | "Invalid parent_id: task '{id}' not found" |
| Circular Parent Hierarchy | Recursive parent check | "Circular parent hierarchy detected" |
| Empty Project Name | `projectName === ''` | "Project name is required" |

### Warnings (Allow Save/Generate)

| Rule | Detection | Message |
|------|-----------|---------|
| No Task Stages | `taskStages.length === 0` | "No task stages defined" |
| No Milestones | `milestones.length === 0` | "No milestones defined" |
| Task Without Milestone | `task.milestone_id === null` | "{count} task(s) have no milestone" |
| Empty Task Stage | No tasks assigned to stage | "Task stage '{name}' has no tasks" |
| Isolated Task | No dependencies in/out | "{count} task(s) are isolated" |
| Empty Task Stage | No tasks assigned to stage | "Task stage '{name}' has no tasks" |
| Isolated Task | No dependencies in/out | "{count} task(s) are isolated" |

**Implementation:** Pure JavaScript functions in `validation.js`, no external dependencies.

---

## Odoo API Integration

**Fundamental Principle:**
The Project Generator adapts to Odoo. Odoo is not architecturally modified, extended, or bypassed.

### Sequential Call Pattern (6 Steps)

```javascript
async function generateProject(projectName, blueprint) {
  // 1. Create project
  const projectId = await executeKw('project.project', 'create', [{
    name: projectName
  }]);

  // 2. Create task stages (project-specific, maps to project.task.type)
  const stageMap = new Map();
  for (const stage of blueprint.taskStages) {
    const stageId = await executeKw('project.task.type', 'create', [{
      name: stage.name,
      project_ids: [[6, 0, [projectId]]],
      sequence: stage.sequence
    }]);
    stageMap.set(stage.id, stageId);
  }

  // 3. Create milestones
  const milestoneMap = new Map();
  for (const milestone of blueprint.milestones) {
    const milestoneId = await executeKw('project.milestone', 'create', [{
      name: milestone.name,
      project_id: projectId
    }]);
    milestoneMap.set(milestone.id, milestoneId);
  }

  // 4. Create top-level tasks (parent_id === null)
  const taskMap = new Map();
  const topLevelTasks = blueprint.tasks.filter(t => !t.parent_id);
  for (const task of topLevelTasks) {
    const taskData = { name: task.name, project_id: projectId };
    if (task.milestone_id && milestoneMap.has(task.milestone_id)) {
      taskData.milestone_id = milestoneMap.get(task.milestone_id);
    }
    const taskId = await executeKw('project.task', 'create', [taskData]);
    taskMap.set(task.id, taskId);
  }

  // 5. Create subtasks (parent_id !== null), must come after parents
  const subtasks = blueprint.tasks.filter(t => t.parent_id);
  for (const subtask of subtasks) {
    const parentOdooId = taskMap.get(subtask.parent_id);
    const taskData = {
      name: subtask.name,
      project_id: projectId,
      parent_id: parentOdooId
    };
    if (subtask.milestone_id && milestoneMap.has(subtask.milestone_id)) {
      taskData.milestone_id = milestoneMap.get(subtask.milestone_id);
    }
    const taskId = await executeKw('project.task', 'create', [taskData]);
    taskMap.set(subtask.id, taskId);
  }

  // 6. Set dependencies (pass after all tasks exist)
  for (const dep of blueprint.dependencies) {
    const taskId = taskMap.get(dep.task_id);
    const dependsOnId = taskMap.get(dep.depends_on_id);
    if (taskId && dependsOnId) {
      await executeKw('project.task', 'write', [
        [taskId],
        { depend_on_ids: [[4, dependsOnId]] }
      ]);
    }
  }

  return { success: true, projectId };
}
```

**Key Points:**
- Uses existing `src/lib/odoo.js` exclusively
- Sequential (not parallel) for simplicity
- No rollback on error in V1
- Maps blueprint IDs to Odoo IDs at each step
- **Subtasks created after their parents** (critical ordering)
- All tasks (including subtasks) are standard Odoo `project.task` records

---

## File Structure

```
src/modules/project-generator/
├── module.js               # Module registration
├── library.js              # Template list screen + data access
├── editor.js               # Blueprint editor screen
├── generate.js             # Project generation screen
├── validation.js           # Validation logic (pure functions)
└── odoo-creator.js         # Odoo API orchestration
```

**No additional folders. No services/. No models/. No utils/ beyond validation.**

---

## User Interface

### Screen 1: Template Library

**Route:** `/project-generator`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Project Templates                 [New Template]│
├─────────────────────────────────────────────────┤
│  Name                 Created       Actions      │
│  Standard Project     2026-01-15    Edit Delete  │
│  Client Onboarding    2026-01-20    Edit Delete  │
└─────────────────────────────────────────────────┘
```

**Actions:**
- Click "New Template" → Go to editor (empty blueprint)
- Click "Edit" → Go to editor (loaded blueprint)
- Click "Delete" → Confirm → Delete from database
- Click row → Show detail (read-only preview)

**NOT in V1:**
- ❌ Search bar
- ❌ Filter dropdowns
- ❌ Sort controls
- ❌ Grid view toggle
- ❌ Pagination

---

### Screen 2: Blueprint Editor

**Route:** `/project-generator/edit/:id?`

**Layout (3-column):**
```
┌─────────────────────────────────────────────────────────────┐
│  [Template Name Input]    [Validate] [Save] [Cancel/Undo]   │
├──────────────┬──────────────────┬────────────────────────────┤
│  TASK STAGES │  MILESTONES      │  TASKS & SUBTASKS           │
│              │                  │                             │
│  □ Backlog   │  □ Phase 1       │  □ Setup Project            │
│     [X]      │     Description  │     Milestone: [Phase 1▼]   │
│              │     [X]          │     Subtasks:               │
│  □ In Progress│                 │       • Install IDE [X]     │
│     [X]      │  □ Phase 2       │       • Configure Git [X]   │
│              │     Description  │     [+ Add Subtask]         │
│  □ Done      │     [X]          │     Dependencies:           │
│     [X]      │                  │     - None                  │
│              │  [+ Add          │     [+ Add Dependency]      │
│  [+ Add      │   Milestone]     │     [X]                     │
│   Task Stage]│                  │                             │
│              │                  │  □ Configure Tools          │
│              │                  │     Milestone: [Phase 1▼]   │
│              │                  │     Subtasks: None          │
│              │                  │     Dependencies:           │
│              │                  │     - Setup Project [X]     │
│              │                  │     [+ Add Dependency]      │
│              │                  │     [X]                     │
│              │                  │                             │
│              │                  │  [+ Add Task]               │
└──────────────┴──────────────────┴────────────────────────────┘
```

**Critical UX Elements:**

**Cancel/Undo Button:**
- Returns editor to last saved state (loaded template)
- For new templates: returns to empty state
- This is NOT step-by-step undo
- This is "discard changes since last save"
- No redo capability
- Intentional UX choice to support managers learning process thinking

**Validation Display:**
- Errors shown in red alert at top (blocks save)
- Warnings shown in yellow alert at top (allows save)

**Interactions:**
- Add items: Click "Add [X]" button
- Remove items: Click [X] button
- Edit: Direct input/textarea
- Subtasks: Nested under parent task, shown indented
- Dependencies: Click "Add Dependency" → Prompt with task list (includes subtasks)

**Terminology Note:**
- "Task Stages" column clearly labeled (not "Stages")
- Avoids confusion with project-level stages (Odoo-native, out of scope)

**NOT in V1:**
- ❌ Drag-and-drop
- ❌ Visual dependency graph
- ❌ Auto-save
- ❌ Step-by-step undo/redo
- ❌ Keyboard shortcuts

---

### Screen 3: Project Generation

**Route:** `/project-generator/generate/:id`

**Layout:**
```
┌────────────────────────────────────┐
│  Generate Project                  │
│                                    │
│  Template: Standard Project        │
│                                    │
│  Project Name:                     │
│  [_____________________________]   │
│                                    │
│  [Create Project]  [Cancel]        │
└────────────────────────────────────┘
```

**States:**
1. **Idle:** Input enabled, button enabled
2. **Loading:** Spinner visible, button disabled
3. **Success:** "Project created successfully" message
4. **Error:** Red alert with error details

**NOT in V1:**
- ❌ Template preview
- ❌ Company selection
- ❌ Description override
- ❌ Progress bar with steps
- ❌ Link to Odoo project
- ❌ Confetti animation

---

## Module Registration

**File: `src/modules/project-generator/module.js`**

```javascript
export default {
  id: 'project-generator',
  name: 'Project Generator',
  description: 'Design and deploy project templates to Odoo',
  icon: '📋',
  enabled: true,
  routes: [
    { path: '/project-generator', component: 'TemplateLibrary' },
    { path: '/project-generator/edit/:id?', component: 'BlueprintEditor' },
    { path: '/project-generator/generate/:id', component: 'ProjectGeneration' }
  ]
};
```

**Registration: `src/modules/registry.js`**

```javascript
import projectGenerator from './project-generator/module.js';

export const modules = [
  // ...existing modules
  projectGenerator
];
```

---

## Implementation Checklist

### Phase 0: Database Setup
- [ ] Create migration file `supabase/migrations/20260128_project_generator.sql`
- [ ] Run migration locally
- [ ] Verify RLS policies
- [ ] Test INSERT/SELECT/UPDATE/DELETE with authenticated user

### Phase 1: Module Structure
- [ ] Create `src/modules/project-generator/` folder
- [ ] Create `module.js` (module definition)
- [ ] Register in `src/modules/registry.js`
- [ ] Verify module appears in app navigation

### Phase 2: Template Library
- [ ] Create `library.js` with data functions:
  - [ ] `listTemplates()`
  - [ ] `getTemplate(id)`
  - [ ] `createTemplate(name, desc, blueprint)`
  - [ ] `updateTemplate(id, name, desc, blueprint)`
  - [ ] `deleteTemplate(id)`
- [ ] Create UI rendering for template list (table view)
- [ ] Test CRUD operations

### Phase 3: Validation
- [ ] Create `validation.js` with pure functions:
  - [ ] `validateBlueprint(blueprint)` → `{ errors[], warnings[] }`
  - [ ] `detectCircularDependencies(tasks, deps)` → `string | null`
  - [ ] `findIsolatedTasks(tasks, deps)` → `string[]`
- [ ] Test with sample blueprints
- [ ] Verify circular dependency detection works

### Phase 4: Blueprint Editor
- [ ] Create `editor.js`
- [ ] Implement 3-column layout (stages, milestones, tasks)
- [ ] Implement add/remove/edit for each column
- [ ] Implement dependency add/remove
- [ ] Implement save flow (prompt for name, validate, save to DB)
- [ ] Test creating and editing blueprints

### Phase 5: Odoo Integration
- [ ] Create `odoo-creator.js`
- [ ] Implement `generateProject(name, blueprint)`:
  - [ ] Create project
  - [ ] Create stages
  - [ ] Create milestones
  - [ ] Create tasks
  - [ ] Set dependencies
- [ ] Test with real Odoo instance
- [ ] Verify project structure in Odoo matches blueprint

### Phase 6: Generation UI
- [ ] Create `generate.js`
- [ ] Implement project name input
- [ ] Implement loading state
- [ ] Implement success/error states
- [ ] Test end-to-end generation flow

### Phase 7: Testing
- [ ] Test with empty blueprint (warnings, no errors)
- [ ] Test with circular dependency (error blocks save)
- [ ] Test with 50 tasks (performance check)
- [ ] Test with duplicate names (error blocks save)
- [ ] Test generation with Odoo offline (error handling)
- [ ] Test generation with partial failure (manual cleanup in Odoo)

### Phase 8: Deployment
- [ ] Push to main branch
- [ ] Deploy migration to production Supabase
- [ ] Deploy app to Cloudflare Workers
- [ ] Smoke test in production
- [ ] Document known limitations

---

## Estimated Effort

**Total:** ~3-5 days for experienced developer

**Breakdown:**
- Phase 0: Database Setup - 1 hour
- Phase 1: Module Structure - 1 hour
- Phase 2: Template Library - 4 hours
- Phase 3: Validation - 3 hours
- Phase 4: Blueprint Editor - 8 hours (most complex)
- Phase 5: Odoo Integration - 4 hours
- Phase 6: Generation UI - 2 hours
- Phase 7: Testing - 4 hours
- Phase 8: Deployment - 2 hours

**Total:** ~29 hours (~4 days)

**Risk buffer:** +1 day for unexpected issues

---

## Known Limitations (V1)

### Functional Limitations
1. **No rollback on generation error** → User must manually clean up Odoo
2. **No audit trail** → Cannot see which template was used for which project
3. **No versioning** → Overwrite on save, no history
4. **No template cloning** → User must manually duplicate
5. **No search/filter** → User must scroll or use browser Ctrl+F

### UX Limitations
1. **Prompt for dependency selection** → Not as nice as modal or dropdown
2. **No drag-and-drop** → Manual reordering via up/down (or recreate)
3. **No visual dependency graph** → Text list only
4. **Cancel/Undo returns to last save** → Not step-by-step undo (intentional for simplicity)
5. **No redo** → Cannot redo undone changes
6. **No auto-save** → User must explicitly save

### Technical Limitations
1. **Sequential API calls** → Slower than parallel (but simpler)
2. **No caching** → Reload template list on every navigation
3. **No optimistic UI** → Wait for API response before updating
4. **No error retry logic** → User must manually retry

### Data Limitations (None - V1 supports essential structure)
1. Task stages ✅ (project-specific task.type)
2. Milestones ✅
3. Tasks ✅
4. Subtasks ✅ (with parent_id)
5. Dependencies ✅ (including across subtasks)
2. **No task descriptions** → Name only
3. **No estimated hours** → Not captured in template
4. **No task assignments** → Odoo users not mapped

**All of these are acceptable tradeoffs for V1 MVP.**

---

### Success Criteria

### Must Work
- [x] User can create template with task stages, milestones, tasks, subtasks
- [x] User can edit template (Cancel returns to last saved state)
- [x] User can delete template
- [x] User can generate Odoo project
- [x] Generated project matches blueprint (including subtask hierarchy)
- [x] Validation catches circular dependencies (in tasks and parent hierarchy)
- [x] RLS prevents cross-user access
- [x] Subtasks created with correct parent_id

### Performance Targets
- Template list loads in <1 second
- Blueprint editor loads in <500ms
- Validation runs in <200ms (including parent hierarchy checks)
- Template save completes in <1 second
- Project generation (50 tasks + 20 subtasks) completes in <15 seconds

### Data Integrity
- No silent failures
- No orphaned records
- RLS enforced correctly
- Validation runs on every save
- Parent-child relationships preserved

**If these criteria are met, V1 is successful.**

---

## Out of Scope (NOT in V1)

### Features
- ❌ Template versioning
- ❌ Template cloning
- ❌ Publish/draft workflow
- ❌ Template locking
- ❌ Audit trail
- ❌ Generation history
- ❌ Rollback on error
- ❌ Batch generation
- ❌ Scheduled generation
- ❌ Company selection
- ❌ Description override
- ❌ Import/export templates
- ❌ Template sharing
- ❌ Template categories
- ❌ Usage analytics
- ❌ Performance metrics
- ❌ Keyboard shortcuts (beyond Tab/Enter)
- ❌ Confetti animation
- ❌ Email notifications
- ❌ Link to Odoo after creation
- ❌ Sync with Odoo
- ❌ Step-by-step undo/redo
- ❌ Modification of project-level stages (Odoo-native)

### Data Elements
- ❌ Task descriptions
- ❌ Task estimated hours
- ❌ Task assignments
- ❌ Task priorities
- ❌ Task tags
- ❌ Task stage colors
- ❌ Task stage types
- ❌ Custom metadata
- ❌ Project-level stage management (Odoo-native, out of generator scope)

### UX Elements
- ❌ Visual dependency graph
- ❌ Drag-and-drop
- ❌ Auto-layout
- ❌ Preview mode
- ❌ Split view
- ❌ Grid view
- ❌ Bulk operations
- ❌ Context menus
- ❌ Tooltips (beyond basic HTML title attributes)
- ❌ Breadcrumbs
- ❌ Loading skeletons
- ❌ Animations
- ❌ Dark mode

### Technical Elements
- ❌ Service layer abstractions
- ❌ Alternative Odoo patterns (uses only existing odoo.js)
- ❌ Custom validation framework
- ❌ State management library
- ❌ GraphQL layer
- ❌ Caching system
- ❌ Queue system
- ❌ Background jobs

---

## Future Expansion Considerations (NOT V1 Scope)

**These features are explicitly EXCLUDED from V1. They represent potential post-MVP expansions, NOT commitments:**

1. **Versioning - NOT in V1**
   - Track template versions, view version history, revert to previous version
   - V1 Reality: Single version only, overwrite on save

2. **Audit Trail - NOT in V1**
   - Log all project generations, show which template version was used, link to Odoo project
   - V1 Reality: No generation history tracking

3. **Advanced Validation - NOT in V1**
   - Complexity score, critical path calculation, best practice suggestions
   - V1 Reality: Basic validation only (errors block, warnings allow)

4. **UX Polish - NOT in V1**
   - Visual dependency graph (D3.js/Vis.js), drag-and-drop (SortableJS), modal dialogs, keyboard shortcuts
   - V1 Reality: Simple forms, prompt/confirm, manual operations

5. **Template Library Enhancements - NOT in V1**
   - Search and filter, categories/tags, usage statistics, preview on hover
   - V1 Reality: Simple table, browser Ctrl+F for search

6. **Generation Improvements - NOT in V1**
   - Rollback on error, progress bar with steps, link to Odoo project, batch generation
   - V1 Reality: No rollback, simple spinner, one-at-a-time, manual trigger

7. **Data Enhancements - PARTIALLY in V1**
   - ✅ IN V1: Subtasks (MANDATORY via parent_id field)
   - NOT in V1: Task descriptions, estimated hours, tags

8. **Collaboration - NOT in V1**
   - Share templates, approval workflow, lock/unlock, comments
   - V1 Reality: User-owned templates only (Supabase RLS)

**Critical Reminder:**
- Subtasks ARE in V1 (MANDATORY - only item from entire list)
- Everything else explicitly OUT of V1 scope
- These are POSSIBILITIES for post-MVP expansion, NOT commitments
- V1 must prove core workflow value before ANY expansion

---

## Architectural Principles (Must Understand)

### 1. Odoo Is Leading

**Principle:**
The Project Generator adapts to Odoo. Odoo is not architecturally modified, extended, or bypassed.

**Implications:**
- Blueprint structure mirrors Odoo models exactly
- No custom fields beyond what Odoo `project.task` supports
- No domain logic beyond Odoo's native capabilities
- Field names match Odoo field names (`parent_id`, `milestone_id`, `depend_on_ids`)

### 2. Task Stages vs Project Stages

**Critical Distinction:**
- **Project-level stages**: Odoo-native, global, immutable → OUT OF SCOPE
- **Task-level stages** (`project.task.type`): Project-specific, generator creates these → IN SCOPE

**Why This Matters:**
- Prevents architectural confusion
- Avoids attempting to modify Odoo's project stage workflow
- Keeps generator focused on task organization only

### 3. Cancel/Undo Philosophy

**Design Choice:**
- Cancel button returns to last saved state
- NOT step-by-step undo/redo
- Intentional simplification for managers learning process thinking

**Why:**
- Reduces cognitive load
- Clear "safe point" = last save
- Prevents partial-state confusion
- Browser refresh is also a "cancel" (acceptable loss for V1)

### 4. Subtasks Are Essential

**Why In V1:**
- Process thinking requires task decomposition
- Odoo natively supports `parent_id`
- Dependencies can flow across subtask boundaries
- Enables realistic project templates

**Not Optional:**
This is a correction from initial analysis, not scope creep.

---

## Migration from Old Docs

### Files Superseded
- `FUNCTIONAL_ANALYSIS.md` (too broad, contained V2+ features)
- `TECHNICAL_ANALYSIS.md` (too abstract, over-engineered)
- `UX_STRUCTURE.md` (too detailed, included unnecessary polish)
- `RISKS_AND_MITIGATIONS.md` (risk analysis still valid, but scope changed)
- `EXPLORER.md` (replaced by EXPLORER_V1.md)
- `PROJECT_GENERATOR_COMPLETE.md` (replaced by this document)

### New V1 Docs (Corrected)
- `FUNCTIONAL_ANALYSIS_V1.md` → What user can do (WITH subtasks, WITH cancel/undo)
- `TECHNICAL_ANALYSIS_V1.md` → How to implement (task stages, parent_id handling)
- `EXPLORER_V1.md` → Why these choices (Odoo-leading principle)
- `PROJECT_GENERATOR_COMPLETE_V1.md` → This document (single source of truth - CORRECTED)

**Use only V1 docs going forward. Old docs are deprecated.**

**Key Corrections Applied:**
1. ✅ Subtasks added (with `parent_id`)
2. ✅ Task stages vs Project stages distinction clarified
3. ✅ Cancel/Undo added (returns to last saved state)
4. ✅ Odoo-leading principle made explicit

---

## Final Statement

This document defines **exactly** what to build for Project Generator V1.

**Scope:** Minimal, functional, proven  
**Timeline:** 3-5 days  
**Goal:** Validate core workflow  
**Expansion:** Only after V1 proves value

**Critical Principles:**
1. The Project Generator adapts to Odoo (not the other way around)
2. Task stages (project-specific) ≠ Project stages (Odoo-native)
3. Subtasks are essential for process thinking
4. Cancel returns to last saved state (not step-by-step undo)

**Build this. Nothing more. Nothing less.**

**This is the source of truth.**
