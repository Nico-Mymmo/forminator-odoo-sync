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
1. Design a project structure (stages, milestones, tasks, dependencies)
2. Save it as a template
3. Generate an Odoo project from that template

Once generated, the Odoo project is completely independent. No sync, no updates.

---

## What This Module Does NOT Do

- ❌ Manage existing Odoo projects
- ❌ Sync with Odoo after creation
- ❌ Track project progress
- ❌ Provide analytics
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
│  Structure: { stages[], milestones[],       │
│               tasks[], dependencies[] }      │
│  Validates: errors block, warnings allow     │
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

**Generate Project:**
```
Load template → Enter project name → Call Odoo API (5 steps) → Done
```

**No background jobs. No queues. No webhooks. No sync.**

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

```json
{
  "stages": [
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
      "milestone_id": "milestone_1"
    },
    {
      "id": "task_2",
      "name": "Configure CI/CD",
      "milestone_id": "milestone_1"
    },
    {
      "id": "task_3",
      "name": "Implement Features",
      "milestone_id": "milestone_2"
    }
  ],
  "dependencies": [
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

**Fields NOT in V1:**
- ❌ `stage.color`
- ❌ `stage.type`
- ❌ `task.description`
- ❌ `task.estimated_hours`
- ❌ `task.assigned_to`
- ❌ `task.tags`
- ❌ `task.subtasks`

---

## Validation Rules

### Errors (Block Save/Generate)

| Rule | Detection | Message |
|------|-----------|---------|
| Empty Template Name | `name === ''` | "Template name is required" |
| Empty Stage Name | `stage.name === ''` | "Stage name is required" |
| Empty Milestone Name | `milestone.name === ''` | "Milestone name is required" |
| Empty Task Name | `task.name === ''` | "Task name is required" |
| Duplicate Stage Names | Set comparison | "Duplicate stage name: '{name}'" |
| Duplicate Milestone Names | Set comparison | "Duplicate milestone name: '{name}'" |
| Circular Dependency | DFS cycle detection | "Circular dependency: Task A → Task B → Task A" |
| Invalid Dependency Reference | ID lookup | "Invalid dependency: task not found" |
| Empty Project Name | `projectName === ''` | "Project name is required" |

### Warnings (Allow Save/Generate)

| Rule | Detection | Message |
|------|-----------|---------|
| No Stages | `stages.length === 0` | "No stages defined" |
| No Milestones | `milestones.length === 0` | "No milestones defined" |
| Task Without Milestone | `task.milestone_id === null` | "{count} task(s) have no milestone" |
| Empty Stage | No tasks in stage | "Stage '{name}' has no tasks" |
| Isolated Task | No dependencies in/out | "{count} task(s) are isolated" |

**Implementation:** Pure JavaScript functions in `validation.js`, no external dependencies.

---

## Odoo API Integration

### Sequential Call Pattern

```javascript
async function generateProject(projectName, blueprint) {
  // 1. Create project
  const projectId = await executeKw('project.project', 'create', [{
    name: projectName
  }]);

  // 2. Create stages
  const stageMap = new Map();
  for (const stage of blueprint.stages) {
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

  // 4. Create tasks (pass 1 - no dependencies yet)
  const taskMap = new Map();
  for (const task of blueprint.tasks) {
    const taskData = { name: task.name, project_id: projectId };
    if (task.milestone_id && milestoneMap.has(task.milestone_id)) {
      taskData.milestone_id = milestoneMap.get(task.milestone_id);
    }
    const taskId = await executeKw('project.task', 'create', [taskData]);
    taskMap.set(task.id, taskId);
  }

  // 5. Set dependencies (pass 2)
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
│  [Template Name Input]         [Validate] [Save] [Cancel]   │
├──────────────┬──────────────────┬────────────────────────────┤
│  STAGES      │  MILESTONES      │  TASKS                      │
│              │                  │                             │
│  □ Backlog   │  □ Phase 1       │  □ Setup Project            │
│     [X]      │     Description  │     Milestone: [Phase 1▼]   │
│              │     [X]          │     Dependencies:           │
│  □ In Progress│                 │     - None                  │
│     [X]      │  □ Phase 2       │     [+ Add Dependency]      │
│              │     Description  │     [X]                     │
│  □ Done      │     [X]          │                             │
│     [X]      │                  │  □ Configure Tools          │
│              │  [+ Add          │     Milestone: [Phase 1▼]   │
│  [+ Add      │   Milestone]     │     Dependencies:           │
│   Stage]     │                  │     - Setup Project [X]     │
│              │                  │     [+ Add Dependency]      │
│              │                  │     [X]                     │
│              │                  │                             │
│              │                  │  [+ Add Task]               │
└──────────────┴──────────────────┴────────────────────────────┘
```

**Validation Display:**
- Errors shown in red alert at top (blocks save)
- Warnings shown in yellow alert at top (allows save)

**Interactions:**
- Add items: Click "Add [X]" button
- Remove items: Click [X] button
- Edit: Direct input/textarea
- Dependencies: Click "Add Dependency" → Prompt with task list

**NOT in V1:**
- ❌ Drag-and-drop
- ❌ Visual dependency graph
- ❌ Auto-save
- ❌ Undo/redo
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
4. **No undo/redo** → Browser refresh loses unsaved work
5. **No auto-save** → User must explicitly save

### Technical Limitations
1. **Sequential API calls** → Slower than parallel (but simpler)
2. **No caching** → Reload template list on every navigation
3. **No optimistic UI** → Wait for API response before updating
4. **No error retry logic** → User must manually retry

### Data Limitations
1. **No subtasks** → Flat task list only
2. **No task descriptions** → Name only
3. **No estimated hours** → Not captured in template
4. **No task assignments** → Odoo users not mapped

**All of these are acceptable tradeoffs for V1 MVP.**

---

## Success Criteria

### Must Work
- [x] User can create template
- [x] User can edit template
- [x] User can delete template
- [x] User can generate Odoo project
- [x] Generated project matches blueprint
- [x] Validation catches circular dependencies
- [x] RLS prevents cross-user access

### Performance Targets
- Template list loads in <1 second
- Blueprint editor loads in <500ms
- Validation runs in <200ms
- Template save completes in <1 second
- Project generation (50 tasks) completes in <10 seconds

### Data Integrity
- No silent failures
- No orphaned records
- RLS enforced correctly
- Validation runs on every save

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
- ❌ Keyboard shortcuts
- ❌ Confetti animation
- ❌ Email notifications
- ❌ Link to Odoo after creation
- ❌ Sync with Odoo

### Data Elements
- ❌ Subtasks
- ❌ Task descriptions
- ❌ Task estimated hours
- ❌ Task assignments
- ❌ Task priorities
- ❌ Task tags
- ❌ Stage colors
- ❌ Stage types
- ❌ Custom metadata

### UX Elements
- ❌ Visual dependency graph
- ❌ Drag-and-drop
- ❌ Auto-layout
- ❌ Preview mode
- ❌ Split view
- ❌ Grid view
- ❌ Bulk operations
- ❌ Context menus
- ❌ Tooltips
- ❌ Breadcrumbs
- ❌ Loading skeletons
- ❌ Animations
- ❌ Dark mode

### Technical Elements
- ❌ Service layer abstractions
- ❌ Alternative Odoo patterns
- ❌ Custom validation framework
- ❌ State management library
- ❌ GraphQL layer
- ❌ Caching system
- ❌ Queue system
- ❌ Background jobs

---

## Future Expansion (V2+ Ideas)

**Only consider IF V1 is successful and users demand it:**

1. **Versioning**
   - Track template versions
   - View version history
   - Revert to previous version

2. **Audit Trail**
   - Log all project generations
   - Show which template version was used
   - Link to Odoo project (if accessible)

3. **Advanced Validation**
   - Complexity score
   - Critical path calculation
   - Best practice suggestions

4. **UX Polish**
   - Visual dependency graph (D3.js/Vis.js)
   - Drag-and-drop (SortableJS)
   - Modal dialogs
   - Keyboard shortcuts

5. **Template Library**
   - Search and filter
   - Categories/tags
   - Usage statistics
   - Preview on hover

6. **Generation Improvements**
   - Rollback on error
   - Progress bar with steps
   - Link to Odoo project
   - Batch generation

7. **Data Enhancements**
   - Subtasks
   - Task descriptions
   - Estimated hours
   - Tags

8. **Collaboration**
   - Share templates
   - Approval workflow
   - Lock/unlock
   - Comments

**None of these are in V1. Validate core workflow first.**

---

## Migration from Old Docs

### Files Superseded
- `FUNCTIONAL_ANALYSIS.md` (too broad, contained V2+ features)
- `TECHNICAL_ANALYSIS.md` (too abstract, over-engineered)
- `UX_STRUCTURE.md` (too detailed, included unnecessary polish)
- `RISKS_AND_MITIGATIONS.md` (risk analysis still valid, but scope changed)
- `EXPLORER.md` (replaced by EXPLORER_V1.md)
- `PROJECT_GENERATOR_COMPLETE.md` (replaced by this document)

### New V1 Docs
- `FUNCTIONAL_ANALYSIS_V1.md` → What user can do
- `TECHNICAL_ANALYSIS_V1.md` → How to implement
- `EXPLORER_V1.md` → Why these choices
- `PROJECT_GENERATOR_COMPLETE_V1.md` → This document (single source of truth)

**Use only V1 docs going forward. Old docs are deprecated.**

---

## Final Statement

This document defines **exactly** what to build for Project Generator V1.

**Scope:** Minimal, functional, proven  
**Timeline:** 3-5 days  
**Goal:** Validate core workflow  
**Future:** Expand only if V1 succeeds

**Build this. Nothing more. Nothing less.**

**This is the source of truth.**
