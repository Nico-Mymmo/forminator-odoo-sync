# Project Generator - Functional Analysis (V1 MVP Scope)

## Executive Summary

The Project Generator V1 is a **minimal, deterministic system** that allows users to:

1. **Design** a project structure (blueprint) in browser
2. **Save** it as a template in Supabase
3. **Generate** an Odoo project from that template via API (one-way push)

**After generation:**
- ZERO connection between template and Odoo project
- NO sync (never)
- NO updates to Odoo project from template (never)
- NO reflection of Odoo changes back to template (never)
- Template changes affect ONLY new generations (never retroactive)

**That's it.** No sync, no live editing, no analytics, no versioning in V1.

**Deterministic Chain:**
```
Blueprint → Template → Odoo Project
(design)    (storage)   (one-time push, then disconnected)
```

Once created in Odoo, projects are **fully autonomous**. Template changes never affect existing projects.

**Critical Architectural Principles:**
1. **Odoo is Leading:** Generator adapts to Odoo. Odoo is NEVER modified, extended, or bypassed.
2. **Subtasks are MANDATORY:** Essential for process thinking (task decomposition), not optional, not V2.
3. **Task Stages ≠ Project Stages:** Generator creates task stages (project.task.type). Project-level stages (Odoo-native) are NEVER touched.
4. **One-Way Data Flow:** Template → Odoo. Then: disconnected forever.

All blueprint fields map directly to existing Odoo model fields (parent_id, project_ids, depend_on_ids, etc.).

---

## Three-Layer Model

### Layer 1: Blueprint (Design-Time)

**What:** JavaScript object in browser memory  
**Lifetime:** Session only (lost on refresh unless saved)  
**Purpose:** Design workspace

**Contains (V1):**
- **Task stages** (name, sequence) → maps to `project.task.type`
- Milestones (name, description) → maps to `project.milestone`
- Tasks (name, milestone assignment, parent_id) → maps to `project.task`
- Subtasks (tasks with parent_id set) → maps to `project.task` with `parent_id`
- Dependencies (task X depends on task Y) → maps to `depend_on_ids`

**Critical Terminology:**
- "Task Stages" = project-specific stages for tasks
- NOT "Project Stages" (those are Odoo-native, out of scope)

**NOT IN V1:**
- ❌ Task stage colors/types
- ❌ Tags
- ❌ Estimated hours
- ❌ Task descriptions
- ❌ Custom metadata
- ❌ Auto-save
- ❌ Step-by-step undo/redo
- ❌ Project-level stage management (Odoo handles this)

**User Actions:**
- Add/remove/edit task stages, milestones, tasks, subtasks
- Define dependencies (including across subtasks)
- Validate structure
- Save as template
- **Cancel/Undo** → Returns editor to last saved state

---

### Layer 2: Template (Storage)

**What:** Row in Supabase `project_templates` table  
**Lifetime:** Persistent  
**Purpose:** Saved blueprint for reuse

**Schema (V1):**
```sql
project_templates (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  blueprint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

**NOT IN V1:**
- ❌ `version` column
- ❌ `status` column (draft/published)
- ❌ `locked` boolean
- ❌ `usage_count` tracking
- ❌ `tags` array
- ❌ Version history table
- ❌ Template categories

**User Actions (V1):**
- Create template (save blueprint)
- Load template (into blueprint editor)
- Update template (overwrite)
- Delete template
- Generate project from template

**Impact:** Templates only affect NEW projects created AFTER save. Zero impact on existing Odoo projects.

---

### Layer 3: Instance (Odoo)

**What:** Standard Odoo project record  
**Location:** Odoo database  
**Lifetime:** Managed entirely in Odoo  
**Purpose:** The actual working project

**Creation Flow:**
1. User clicks "Generate Project"
2. User enters project name
3. System calls Odoo API sequentially (6 steps):
   - Create project (`project.project`)
   - Create task stages (`project.task.type`) — project-specific
   - Create milestones (`project.milestone`)
   - Create top-level tasks (`project.task` with `parent_id` = null) — pass 1
   - Create subtasks (`project.task` with `parent_id` set) — pass 2
   - Set dependencies (`project.task` → `depend_on_ids`) — pass 3
4. Done

**Key Characteristics:**
- No reference to template after creation
- 100% Odoo-native records
- Users manage entirely in Odoo
- Template modifications have zero effect
- Subtasks are real `project.task` records with `parent_id` field

**NOT IN V1:**
- ❌ Generation history/audit trail
- ❌ Viewing list of generated projects
- ❌ Rollback on error (partial creates may occur)
- ❌ Company selection (uses default)
- ❌ Description override
- ❌ Link back to this module
- ❌ Modification of project-level stages (Odoo-native)

---

## Core Capabilities (V1 Scope Only)

### 1. Template Management

**Create:**
1. Click "New Template"
2. Design blueprint
3. Click "Save"
4. Enter name + description
5. Done

**Edit:**
1. Select template from list
2. Loads blueprint editor
3. Modify structure
4. Click "Save" (overwrites)

**Delete:**
1. Select template
2. Click "Delete"
3. Confirm
4. Removed from database

**List View:**
- Table with columns: Name, Created Date
- Edit button per row
- Delete button per row

**NOT IN V1:**
- ❌ Clone template
- ❌ Version template
- ❌ Publish workflow
- ❌ Lock/unlock
- ❌ Search/filter
- ❌ Sort options
- ❌ Grid view
- ❌ Template preview on hover
- ❌ Usage statistics
- ❌ Import/export

---

### 2. Blueprint Design

**Add Task Stage:**
- Click "Add Task Stage"
- Enter name
- Task stages numbered 1, 2, 3...

**Terminology Note:**
- "Task Stages" = project-specific task organization (maps to `project.task.type`)
- NOT "Project Stages" (Odoo-native, global stages out of scope)

**Add Milestone:**
- Click "Add Milestone"
- Enter name
- Enter description (optional)

**Add Task:**
- Click "Add Task"
- Enter name
- Select milestone (dropdown, optional)
- Task is top-level (parent_id = null)

**Add Subtask:**
- Select parent task
- Click "Add Subtask"
- Enter name
- Subtask inherits project and milestone context
- Subtask gets parent_id = parent task ID

**Add Dependency:**
- Select task or subtask
- Click "Add Dependency"
- Select prerequisite task/subtask
- Dependencies can cross parent boundaries
- Done

**Validation (On Save):**
- **Errors** (block save):
  - Empty template name
  - Empty task stage name
  - Empty task name
  - Circular dependency detected (including across subtasks)
  - Circular parent hierarchy detected
  - Invalid parent_id (parent task doesn't exist)
  - Duplicate task stage names
  - Duplicate milestone names
- **Warnings** (allow save):
  - Task has no milestone
  - Task stage has no tasks
  - Task is isolated (no dependencies)

**Cancel/Undo:**
- Click "Cancel" button
- Returns editor to last saved state
- For new templates: returns to empty state
- NOT step-by-step undo (intentional UX choice)
- No redo capability
- Browser refresh also discards unsaved changes

**NOT IN V1:**
- ❌ Drag-and-drop reorder
- ❌ Task descriptions
- ❌ Estimated hours
- ❌ Tags
- ❌ Task stage colors/types
- ❌ Visual dependency graph
- ❌ Auto-layout
- ❌ Keyboard shortcuts (beyond Tab/Enter)
- ❌ Bulk operations
- ❌ Copy/paste tasks
- ❌ Templates within templates
- ❌ Step-by-step undo/redo
- ❌ Auto-save

---

### 3. Project Generation

**Flow:**
1. Select template
2. Click "Generate Project"
3. Enter project name (required)
4. Click "Create"
5. Loading indicator shows
6. **Success:** "Project created" message
7. **Error:** Error message displayed

**Odoo API Sequence:**
```javascript
// Sequential, not parallel (6 steps)
1. project_id = createProject(name)
2. stage_ids = createTaskStages(project_id, taskStages[])  // project.task.type
3. milestone_ids = createMilestones(project_id, milestones[])
4. task_ids = createTopLevelTasks(project_id, tasks.filter(t => !t.parent_id))  // pass 1
5. subtask_ids = createSubtasks(project_id, tasks.filter(t => t.parent_id))  // pass 2
6. setDependencies(task_ids + subtask_ids, dependencies[])  // pass 3
```

**Critical Ordering:**
- Subtasks created AFTER their parent tasks
- Dependencies set AFTER all tasks exist
- Maps blueprint IDs to Odoo IDs at each step

**Error Handling (V1):**
- API call fails → show error message
- No automatic rollback
- Partial creates may exist in Odoo
- User must manually clean up

**NOT IN V1:**
- ❌ Generation preview
- ❌ Company selection
- ❌ Description override
- ❌ Rollback on failure
- ❌ Audit log
- ❌ Progress bar with steps
- ❌ Link to Odoo project
- ❌ Batch generation
- ❌ Schedule generation
- ❌ Confetti animation
- ❌ Success email
- ❌ View generation history

---

## User Interface (V1 Minimal)

### Screen 1: Template Library

**Purpose:** List all templates

**Layout:**
- Table with columns:
  - Name
  - Created Date
  - Actions (Edit | Delete)
- "New Template" button (top-right)

**Actions:**
- Click "New Template" → Screen 2 (empty blueprint)
- Click "Edit" → Screen 2 (loaded blueprint)
- Click "Delete" → Confirm dialog → delete
- Click row → Show detail view (read-only preview)

**NOT IN V1:**
- ❌ Search bar
- ❌ Filter dropdowns
- ❌ Sort toggles
- ❌ Grid/list view toggle
- ❌ Pagination
- ❌ Bulk actions
- ❌ Import/export buttons
- ❌ Usage count column
- ❌ Description column

---

### Screen 2: Blueprint Editor

**Purpose:** Design project structure

**Layout (3-column):**

**Column 1: Task Stages**
- Label: "Task Stages" (NOT "Stages")
- List of task stages
- "Add Task Stage" button
- Per task stage: name input, up/down/delete buttons

**Column 2: Milestones**
- List of milestones
- "Add Milestone" button
- Per milestone: name input, description textarea, delete button

**Column 3: Tasks & Subtasks**
- List of tasks (with nested subtasks shown indented)
- "Add Task" button
- Per task:
  - Name input
  - Milestone dropdown
  - "Add Subtask" button
  - List of subtasks (indented)
    - Per subtask: name input, delete button
  - "Add Dependency" button
  - List of dependencies (with remove button)
  - Delete button

**Top Bar:**
- Template name input (if editing)
- "Validate" button
- "Save" button
- **"Cancel" button** → Returns to last saved state

**Validation Display:**
- Errors shown in red alert box (block save)
- Warnings shown in yellow alert box (allow save)

**Cancel/Undo Behavior:**
- Click "Cancel" → Loads last saved template state
- For new templates → Returns to empty state
- This is NOT step-by-step undo
- Intentional UX choice for managers learning process thinking

**NOT IN V1:**
- ❌ Visual dependency graph
- ❌ Drag-and-drop
- ❌ Split panes
- ❌ Preview mode
- ❌ Auto-save indicator
- ❌ Step-by-step undo/redo buttons
- ❌ Keyboard shortcuts (beyond Tab/Enter)
- ❌ Breadcrumbs
- ❌ Progress indicators
- ❌ Tooltips (beyond basic HTML title attributes)
- ❌ Context menus
- ❌ Collapsible sections
- ❌ Search within editor

---

### Screen 3: Project Generation

**Purpose:** Create Odoo project from template

**Layout:**
- Template name (read-only display)
- Project name input (required)
- "Create Project" button
- "Cancel" button

**States:**
1. **Idle:** Input enabled, button enabled
2. **Loading:** Input disabled, button disabled, loading spinner
3. **Success:** "Project created successfully" message, "Create Another" button
4. **Error:** Red alert with error message, "Try Again" button

**NOT IN V1:**
- ❌ Template structure preview
- ❌ Company dropdown
- ❌ Description override
- ❌ Generation options
- ❌ Progress bar with steps
- ❌ Estimated time remaining
- ❌ Link to Odoo project
- ❌ Confetti animation
- ❌ Generation history link

---

## Validation Rules (V1)

### Errors (Block Save/Generate)

| Rule | Check | Message |
|------|-------|---------|
| Empty Template Name | `name === ''` | "Template name is required" |
| Empty Task Stage Name | `taskStage.name === ''` | "Task stage name is required" |
| Empty Task Name | `task.name === ''` | "Task name is required" |
| Circular Dependency | Graph cycle detection | "Circular dependency: Task A → B → A" |
| Circular Parent Hierarchy | Recursive parent check | "Circular parent hierarchy detected" |
| Invalid parent_id | Parent task doesn't exist | "Invalid parent_id: task not found" |
| Duplicate Task Stage Names | `taskStages[].name` duplicates | "Duplicate task stage name: '{name}'" |
| Duplicate Milestone Names | `milestones[].name` duplicates | "Duplicate milestone name: '{name}'" |
| Invalid Dependency | Task depends on non-existent task | "Invalid dependency reference" |
| Empty Project Name | `projectName === ''` | "Project name is required" |

### Warnings (Allow Save/Generate)

| Rule | Check | Message |
|------|-------|---------|
| Orphaned Task | Task has no milestone | "{count} task(s) have no milestone" |
| Empty Task Stage | Task stage has zero tasks | "Task stage '{name}' has no tasks" |
| Isolated Task | Task has no dependencies | "{count} task(s) are isolated" |
| No Task Stages | `taskStages.length === 0` | "No task stages defined" |
| No Milestones | `milestones.length === 0` | "No milestones defined" |

**NOT IN V1:**
- ❌ Complexity warnings
- ❌ Best practice suggestions
- ❌ Auto-fix options
- ❌ Severity levels
- ❌ Dismissable warnings

---

## User Flows (V1 Minimal)

### Flow A: Create First Template

1. User clicks "New Template"
2. Editor loads empty
3. User adds task stage "Backlog"
4. User adds task stage "In Progress"
5. User adds task stage "Done"
6. User adds milestone "Phase 1"
7. User adds task "Setup Project"
8. User assigns "Setup Project" to "Phase 1"
9. User adds subtask "Create Repository" under "Setup Project"
10. User adds task "Configure Tools"
11. User adds dependency: "Configure Tools" depends on "Setup Project"
12. User clicks "Validate" → 1 warning ("1 task has no milestone")
13. User clicks "Save"
14. Dialog: enter "Standard Project" → Save
15. Returns to template library

### Flow B: Generate Project

1. User selects "Standard Project" template
2. User clicks row → detail view shows
3. User clicks "Generate Project" button
4. Modal opens
5. User enters "Q1 Website Redesign"
6. User clicks "Create Project"
7. Loading spinner shows
8. 6 API calls execute (project, task stages, milestones, tasks, subtasks, dependencies)
9. Success message: "Project created successfully"
10. User clicks "Close"
11. Returns to template library

### Flow C: Edit Template

1. User clicks "Edit" on "Standard Project"
2. Blueprint loads in editor
3. User adds new task "Final Review"
4. User assigns to "Phase 1"
5. User adds dependency: "Final Review" depends on "Configure Tools"
6. User clicks "Validate" → no errors/warnings
7. User clicks "Save"
8. Template updated (overwrite)
9. Returns to template library

---

## Technical Integration Points

### Existing App Components to Use

**Module Registration:**
- Use `src/modules/registry.js` pattern
- Register as `project-generator` module
- Define routes: `/project-generator`, `/project-generator/edit/:id`

**Odoo Communication:**
- Use existing `src/lib/odoo.js` exclusively
- Use `executeKw` method for all API calls
- Use `searchRead` for lookups (if needed)
- **Do NOT create new Odoo client library**

**Database:**
- Use existing Supabase connection in `src/lib/database.js`
- Use existing RLS policies pattern
- Add single table: `project_templates`

**Authentication:**
- Use existing auth flow from `src/lib/auth/*`
- RLS enforces `user_id = auth.uid()`

**UI Components:**
- Use DaisyUI exclusively (existing pattern)
- Use existing `src/lib/components/*` if applicable
- Match existing app styling

**NOT IN V1:**
- ❌ New service layer abstractions
- ❌ Alternative Odoo API patterns
- ❌ New database helper libraries
- ❌ Custom validation framework
- ❌ New routing system

---

## Data Model (V1)

### Supabase Table

```sql
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  blueprint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_templates_user ON project_templates(user_id);
```

### Blueprint Data Structure (JSONB)

```json
{
  "taskStages": [
    {
      "id": "taskStage_1",
      "name": "Backlog",
      "sequence": 1
    },
    {
      "id": "taskStage_2",
      "name": "In Progress",
      "sequence": 2
    }
  ],
  "milestones": [
    {
      "id": "milestone_1",
      "name": "Phase 1",
      "description": "Initial setup"
    }
  ],
  "tasks": [
    {
      "id": "task_1",
      "name": "Setup Project",
      "milestone_id": "milestone_1",
      "parent_id": null
    },
    {
      "id": "task_2",
      "name": "Create Repository",
      "milestone_id": "milestone_1",
      "parent_id": "task_1"
    },
    {
      "id": "task_3",
      "name": "Configure Tools",
      "milestone_id": "milestone_1",
      "parent_id": null
    }
  ],
  "dependencies": [
    {
      "task_id": "task_3",
      "depends_on_id": "task_1"
    }
  ]
}
```

**NOT IN V1:**
- ❌ Task `estimated_hours`
- ❌ Task `assigned_to`
- ❌ Task `description`
- ❌ Task `tags`
- ❌ Task stage `color`
- ❌ Task stage `type`
- ❌ Milestone `deadline`

---

## Explicitly Out of Scope (NOT IN V1)

### Features
- ❌ Template versioning
- ❌ Template cloning
- ❌ Template publishing workflow
- ❌ Template locking
- ❌ Step-by-step undo/redo (Cancel/Undo to last saved state IS in V1)
- ❌ Auto-save
- ❌ Generation audit trail
- ❌ Generation history view
- ❌ Rollback on error
- ❌ Batch generation
- ❌ Scheduled generation
- ❌ Company selection
- ❌ Description override
- ❌ Import/export templates
- ❌ Template sharing
- ❌ Template categories
- ❌ Template search
- ❌ Template filters
- ❌ Usage analytics
- ❌ Performance metrics
- ❌ Keyboard shortcuts
- ❌ Confetti animation
- ❌ Email notifications
- ❌ Link to Odoo project after creation
- ❌ View generated projects list
- ❌ Sync with Odoo (one-way only)
- ❌ Edit Odoo projects from module

### Data Elements
- ❌ Task descriptions
- ❌ Task estimated hours
- ❌ Task assignments
- ❌ Task priorities
- ❌ Task tags
- ❌ Task stage colors
- ❌ Task stage types
- ❌ Custom metadata
- ❌ Attachments
- ❌ Comments

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
- ❌ Progress indicators
- ❌ Loading skeletons
- ❌ Animations
- ❌ Dark mode

### Technical Elements
- ❌ New service layer abstractions
- ❌ Alternative Odoo patterns
- ❌ Custom validation framework
- ❌ New routing system
- ❌ GraphQL layer
- ❌ Caching system
- ❌ Queue system
- ❌ Background jobs

---

## Success Criteria (V1 Only)

### Must Work
1. ✅ User can create template with task stages, milestones, tasks, subtasks, dependencies
2. ✅ User can save template to Supabase
3. ✅ User can edit existing template
4. ✅ User can delete template
5. ✅ User can generate Odoo project from template
6. ✅ Generated project appears in Odoo with correct structure (task stages, subtasks with parent_id)
7. ✅ Validation blocks circular dependencies
8. ✅ Validation blocks circular parent hierarchies
9. ✅ Warnings display but don't block save
10. ✅ Cancel/Undo returns to last saved state

### Performance Targets
- Template list loads in <1 second
- Blueprint editor loads in <500ms
- Save template completes in <1 second
- Project generation completes in <10 seconds for 50-task project

### Data Integrity
- Zero silent failures
- No orphaned records
- RLS enforces user_id correctly
- Validation runs on every save
- Subtasks created after parent tasks (correct ordering)

**NOT Success Criteria:**
- ❌ User adoption rates
- ❌ Template reuse metrics
- ❌ Time savings vs manual setup
- ❌ User satisfaction scores
- ❌ Feature usage analytics

---

## Migration from Existing Docs

This document replaces and supersedes:
- Previous FUNCTIONAL_ANALYSIS.md (too broad)
- Any versioning discussions (not in V1)
- Any audit trail features (not in V1)
- Any UX polish features (not in V1)

**This is the source of truth for V1 scope.**
