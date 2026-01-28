# Project Generator - Functional Analysis (V1 MVP Scope)

## Executive Summary

The Project Generator V1 is a **minimal, deterministic system** that allows users to:

1. **Design** a project structure (blueprint) in browser
2. **Save** it as a template in Supabase
3. **Generate** an Odoo project from that template via API

**That's it.** No sync, no live editing, no analytics, no versioning in V1.

**Deterministic Chain:**
```
Blueprint → Template → Odoo Project
(design)    (storage)   (one-time push)
```

Once created in Odoo, projects are **completely independent**. Template changes never affect existing projects.

---

## Three-Layer Model

### Layer 1: Blueprint (Design-Time)

**What:** JavaScript object in browser memory  
**Lifetime:** Session only (lost on refresh)  
**Purpose:** Design workspace

**Contains (V1 Only):**
- Kanban stages (name, sequence)
- Milestones (name, description)
- Tasks (name, milestone assignment)
- Dependencies (task X depends on task Y)

**NOT IN V1:**
- ❌ Subtasks
- ❌ Stage colors/types
- ❌ Tags
- ❌ Estimated hours
- ❌ Task descriptions
- ❌ Custom metadata
- ❌ Auto-save
- ❌ Undo/redo

**User Actions:**
- Add/remove/edit stages, milestones, tasks
- Define dependencies
- Validate structure
- Save as template

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
3. System calls Odoo API sequentially:
   - Create project (`project.project`)
   - Create stages (`project.task.type`)
   - Create milestones (`project.milestone`)
   - Create tasks (`project.task`) — pass 1
   - Set dependencies (`project.task`) — pass 2
4. Done

**Key Characteristics:**
- No reference to template after creation
- 100% Odoo-native records
- Users manage entirely in Odoo
- Template modifications have zero effect

**NOT IN V1:**
- ❌ Generation history/audit trail
- ❌ Viewing list of generated projects
- ❌ Rollback on error (partial creates may occur)
- ❌ Company selection (uses default)
- ❌ Description override
- ❌ Link back to this module

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

**Add Stage:**
- Click "Add Stage"
- Enter name
- Stages numbered 1, 2, 3...

**Add Milestone:**
- Click "Add Milestone"
- Enter name
- Enter description (optional)

**Add Task:**
- Click "Add Task"
- Enter name
- Select milestone (dropdown, optional)

**Add Dependency:**
- Select task
- Click "Add Dependency"
- Select prerequisite task
- Done

**Validation (On Save):**
- **Errors** (block save):
  - Empty template name
  - Empty stage name
  - Empty task name
  - Circular dependency detected
  - Duplicate stage names
  - Duplicate milestone names
- **Warnings** (allow save):
  - Task has no milestone
  - Stage has no tasks
  - Task is isolated (no dependencies)

**NOT IN V1:**
- ❌ Drag-and-drop reorder
- ❌ Subtasks
- ❌ Task descriptions
- ❌ Estimated hours
- ❌ Tags
- ❌ Stage colors
- ❌ Visual dependency graph
- ❌ Auto-layout
- ❌ Keyboard shortcuts
- ❌ Bulk operations
- ❌ Copy/paste tasks
- ❌ Templates within templates

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
// Sequential, not parallel
1. project_id = createProject(name)
2. stage_ids = createStages(project_id, stages[])
3. milestone_ids = createMilestones(project_id, milestones[])
4. task_ids = createTasks(project_id, tasks[])  // pass 1
5. setDependencies(task_ids, dependencies[])    // pass 2
```

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

**Column 1: Stages**
- List of stages
- "Add Stage" button
- Per stage: name input, up/down/delete buttons

**Column 2: Milestones**
- List of milestones
- "Add Milestone" button
- Per milestone: name input, description textarea, delete button

**Column 3: Tasks**
- List of tasks
- "Add Task" button
- Per task:
  - Name input
  - Milestone dropdown
  - "Add Dependency" button
  - List of dependencies (with remove button)
  - Delete button

**Top Bar:**
- Template name input (if editing)
- "Validate" button
- "Save" button
- "Cancel" button

**Validation Display:**
- Errors shown in red alert box (block save)
- Warnings shown in yellow alert box (allow save)

**NOT IN V1:**
- ❌ Visual dependency graph
- ❌ Drag-and-drop
- ❌ Split panes
- ❌ Preview mode
- ❌ Auto-save indicator
- ❌ Undo/redo buttons
- ❌ Keyboard shortcuts
- ❌ Breadcrumbs
- ❌ Progress indicators
- ❌ Tooltips
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
| Empty Stage Name | `stage.name === ''` | "Stage name is required" |
| Empty Task Name | `task.name === ''` | "Task name is required" |
| Circular Dependency | Graph cycle detection | "Circular dependency: Task A → B → A" |
| Duplicate Stage Names | `stages[].name` duplicates | "Duplicate stage name: '{name}'" |
| Duplicate Milestone Names | `milestones[].name` duplicates | "Duplicate milestone name: '{name}'" |
| Invalid Dependency | Task depends on non-existent task | "Invalid dependency reference" |
| Empty Project Name | `projectName === ''` | "Project name is required" |

### Warnings (Allow Save/Generate)

| Rule | Check | Message |
|------|-------|---------|
| Orphaned Task | Task has no milestone | "{count} task(s) have no milestone" |
| Empty Stage | Stage has zero tasks | "Stage '{name}' has no tasks" |
| Isolated Task | Task has no dependencies | "{count} task(s) are isolated" |
| No Stages | `stages.length === 0` | "No stages defined" |
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
3. User adds stage "Backlog"
4. User adds stage "In Progress"
5. User adds stage "Done"
6. User adds milestone "Phase 1"
7. User adds task "Setup Project"
8. User assigns "Setup Project" to "Phase 1"
9. User adds task "Configure Tools"
10. User adds dependency: "Configure Tools" depends on "Setup Project"
11. User clicks "Validate" → 1 warning ("1 task has no milestone")
12. User clicks "Save"
13. Dialog: enter "Standard Project" → Save
14. Returns to template library

### Flow B: Generate Project

1. User selects "Standard Project" template
2. User clicks row → detail view shows
3. User clicks "Generate Project" button
4. Modal opens
5. User enters "Q1 Website Redesign"
6. User clicks "Create Project"
7. Loading spinner shows
8. 5 API calls execute (project, stages, milestones, tasks, dependencies)
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
      "milestone_id": "milestone_1"
    },
    {
      "id": "task_2",
      "name": "Configure Tools",
      "milestone_id": "milestone_1"
    }
  ],
  "dependencies": [
    {
      "task_id": "task_2",
      "depends_on_id": "task_1"
    }
  ]
}
```

**NOT IN V1:**
- ❌ Subtasks array
- ❌ Task `estimated_hours`
- ❌ Task `assigned_to`
- ❌ Task `description`
- ❌ Task `tags`
- ❌ Stage `color`
- ❌ Stage `type`
- ❌ Milestone `deadline`

---

## Explicitly Out of Scope (NOT IN V1)

### Features
- ❌ Template versioning
- ❌ Template cloning
- ❌ Template publishing workflow
- ❌ Template locking
- ❌ Undo/redo
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
- ❌ Subtasks
- ❌ Task descriptions
- ❌ Task estimated hours
- ❌ Task assignments
- ❌ Task priorities
- ❌ Task tags
- ❌ Stage colors
- ❌ Stage types
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
1. ✅ User can create template with stages, milestones, tasks, dependencies
2. ✅ User can save template to Supabase
3. ✅ User can edit existing template
4. ✅ User can delete template
5. ✅ User can generate Odoo project from template
6. ✅ Generated project appears in Odoo with correct structure
7. ✅ Validation blocks circular dependencies
8. ✅ Warnings display but don't block save

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
